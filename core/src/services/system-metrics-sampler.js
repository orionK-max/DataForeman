import fp from 'fastify-plugin';

export const systemMetricsSampler = fp(async function (app) {
  const log = app.log.child({ svc: 'sys-metrics' });
  let lastNet = { ts: 0, map: new Map() }; // iface -> { rx, tx }
  let lastCpu = { ts: 0, usageUs: null }; // track cgroup cpu usage in microseconds
  let lastHost = { ts: 0, times: null }; // fallback: host CPU times snapshot
  let stop = false;

  // Require TSDB for system_metrics storage
  if (!app.tsdb) {
    log.warn('TimescaleDB (tsdb) not configured; system_metrics will be disabled');
  }

  // System metric tag IDs - loaded dynamically from database
  let SYSTEM_TAG_IDS = null;
  
  // Load tag IDs from database
  async function loadSystemTagIds() {
    try {
      const { rows } = await app.db.query(
        `SELECT tag_id, tag_path 
         FROM tag_metadata 
         WHERE connection_id = (SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true)
         ORDER BY tag_path`
      );
      
      const mapping = {};
      for (const row of rows) {
        const key = row.tag_path.toUpperCase();
        mapping[key] = row.tag_id;
      }
      
      log.info({ mapping }, 'Tag path mapping loaded from database');
      
      // Map tag paths to constant names
      SYSTEM_TAG_IDS = {
        CPU_LOAD1: mapping['CPU_LOAD1'],
        CPU_CAP: mapping['CPU_CAP'],
        CPU_PCT: mapping['CPU_PCT'],
        CPU_HOST_PCT: mapping['CPU_HOST_PCT'],
        MEM_USED: mapping['MEM_USED_BYTES'],
        MEM_LIMIT: mapping['MEM_LIMIT_BYTES'],
        MEM_PCT: mapping['MEM_PCT'],
        DISK_USED: mapping['DISK_USED_BYTES'],
        DISK_SIZE: mapping['DISK_SIZE_BYTES'],
        DISK_PCT: mapping['DISK_PCT'],
        NET_RX_BPS: mapping['NET_RX_BPS'],
        NET_TX_BPS: mapping['NET_TX_BPS'],
        FLUSH_COUNT: mapping['LAST_FLUSH_COUNT'],
        FLUSH_MS: mapping['LAST_FLUSH_MS'],
        CONN_GROUPS: mapping['CONNECTIVITY_GROUPS'],
        WORST_EFF_MS: mapping['WORST_EFF_MS'],
        WORST_TGT_MS: mapping['WORST_TARGET_MS'],
        WORST_EFF_RATIO: mapping['WORST_EFF_RATIO'],
        LOCK_WAIT_MS: mapping['TOTAL_LOCK_WAIT_MS'],
      };
      
      log.info({ tagIds: SYSTEM_TAG_IDS }, 'Loaded system metric tag IDs from database');
    } catch (e) {
      log.error({ err: e }, 'Failed to load system tag IDs, using fallback 1-19');
      // Fallback to hardcoded IDs 1-19 if database query fails
      SYSTEM_TAG_IDS = {
        CPU_LOAD1: 1, CPU_CAP: 2, CPU_PCT: 3, CPU_HOST_PCT: 4,
        MEM_USED: 5, MEM_LIMIT: 6, MEM_PCT: 7,
        DISK_USED: 8, DISK_SIZE: 9, DISK_PCT: 10,
        NET_RX_BPS: 11, NET_TX_BPS: 12,
        FLUSH_COUNT: 13, FLUSH_MS: 14, CONN_GROUPS: 15,
        WORST_EFF_MS: 16, WORST_TGT_MS: 17, WORST_EFF_RATIO: 18, LOCK_WAIT_MS: 19,
      };
    }
  }

  // Ensure table exists with unified narrow schema (idempotent)
  async function ensureTable() {
    try {
      if (!app.tsdb) return; // skip when tsdb missing
      const sql = `CREATE TABLE IF NOT EXISTS system_metrics (
        tag_id INTEGER NOT NULL,
        ts TIMESTAMPTZ NOT NULL,
        v_num DOUBLE PRECISION,
        PRIMARY KEY (tag_id, ts)
      );`;
      await app.tsdb.query(sql);
      
      // Create indexes
      await app.tsdb.query(`
        CREATE INDEX IF NOT EXISTS system_metrics_ts_desc ON system_metrics(ts DESC);
        CREATE INDEX IF NOT EXISTS system_metrics_tag_id_ts ON system_metrics(tag_id, ts DESC);
      `);
      
      // Convert to hypertable if TimescaleDB available
      await app.tsdb.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
            PERFORM public.create_hypertable('system_metrics', 'ts', 
              chunk_time_interval => INTERVAL '1 day',
              if_not_exists => TRUE);
          END IF;
        END$$;`);
    } catch (e) {
      log.warn({ err: e }, 'ensureTable failed');
    }
  }

  // Read config values from /config table
  async function getConfigValue(key, defaultVal) {
    try {
      const { rows } = await app.db.query('select value from system_settings where key=$1', [String(key)]);
      if (!rows.length) return defaultVal;
      const raw = rows[0].value;
      let parsed = null;
      if (raw != null) {
        if (typeof raw === 'number') parsed = raw;
        else if (typeof raw === 'string') parsed = Number(raw);
        else if (typeof raw === 'object') { try { parsed = Number(raw); } catch {} }
      }
      const n = Number(parsed);
      return Number.isFinite(n) ? n : defaultVal;
    } catch { return defaultVal; }
  }

  async function readNum(path, fs) {
    try { const s = await fs.readFile(path, 'utf8'); const t = s.trim(); if (t === 'max') return null; const n = Number(t.split(/\s+/)[0]); return Number.isFinite(n) ? n : null; } catch { return null; }
  }

  async function readResources() {
    const os = await import('os');
    const fs = await import('fs/promises');
    const now = Date.now();

    // Memory (prefer cgroup)
    const cgMemUsage = await readNum('/sys/fs/cgroup/memory.current', fs).then(v => v ?? readNum('/sys/fs/cgroup/memory/memory.usage_in_bytes', fs));
    const cgMemLimit = await readNum('/sys/fs/cgroup/memory.max', fs).then(v => v ?? readNum('/sys/fs/cgroup/memory/memory.limit_in_bytes', fs));
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const hostUsedMem = Math.max(0, totalMem - freeMem);
    const usedMem = cgMemUsage ?? hostUsedMem;
    const limitMem = cgMemLimit ?? totalMem;

    // CPU cap via cgroup or cores
    let quota = null, period = null;
    try {
      const cpuMax = await fs.readFile('/sys/fs/cgroup/cpu.max', 'utf8').catch(() => null);
      if (cpuMax) {
        const [q, p] = cpuMax.trim().split(/\s+/);
        quota = q === 'max' ? null : Number(q);
        period = Number(p || 100000);
      } else {
        quota = await readNum('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', fs);
        period = await readNum('/sys/fs/cgroup/cpu/cpu.cfs_period_us', fs);
      }
    } catch {}
    const cores = (os.cpus() || []).length || 1;
    const cpuCap = quota && period ? (quota / period) : cores;
    const load1 = os.loadavg()[0] || 0;

  // Prefer cgroup usage-based CPU percent using deltas
    async function readCpuUsageUs() {
      // cgroup v2: /sys/fs/cgroup/cpu.stat -> usage_usec
      try {
        const s = await fs.readFile('/sys/fs/cgroup/cpu.stat', 'utf8');
        const m = s.match(/usage_usec\s+(\d+)/);
        if (m) return Number(m[1]);
      } catch {}
      // cgroup v1: cpuacct.usage (nanoseconds)
      try {
        const s = await fs.readFile('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8');
        const n = Number(String(s).trim());
        if (Number.isFinite(n)) return Math.floor(n / 1000);
      } catch {}
      return null;
    }
  let cpuPct = null;
    try {
      const usageUs = await readCpuUsageUs();
      if (usageUs != null && cpuCap) {
        const prevUs = Number(lastCpu.usageUs);
        const dtSec = Math.max(0.001, (now - (lastCpu.ts || now)) / 1000);
        if (Number.isFinite(prevUs) && dtSec > 0) {
          const duSec = Math.max(0, (usageUs - prevUs) / 1e6);
          const usedCores = duSec / dtSec; // cores used on average
          cpuPct = Math.max(0, Math.min(100, (usedCores / cpuCap) * 100));
        }
      }
      lastCpu = { ts: now, usageUs: usageUs != null ? usageUs : lastCpu.usageUs };
    } catch {}
    // Fallback 1: derive from host CPU times delta (approx system-wide)
    if (cpuPct == null) {
      try {
        const cpus = os.cpus() || [];
        const nowTimes = cpus.map(c => ({
          user: Number(c.times.user||0), nice: Number(c.times.nice||0), sys: Number(c.times.sys||0), idle: Number(c.times.idle||0), irq: Number(c.times.irq||0)
        }));
        if (Array.isArray(lastHost.times) && lastHost.times.length === nowTimes.length && nowTimes.length > 0) {
          let busy = 0, total = 0;
          for (let i = 0; i < nowTimes.length; i++) {
            const prev = lastHost.times[i];
            const cur = nowTimes[i];
            const du = Math.max(0, cur.user - prev.user);
            const dn = Math.max(0, cur.nice - prev.nice);
            const ds = Math.max(0, cur.sys - prev.sys);
            const di = Math.max(0, cur.idle - prev.idle);
            const dq = Math.max(0, cur.irq - prev.irq);
            const t = du + dn + ds + di + dq;
            const b = du + dn + ds + dq;
            busy += b; total += t;
          }
          if (total > 0) {
            const frac = busy / total; // 0..1 across all cores
            cpuPct = Math.max(0, Math.min(100, frac * 100));
          }
        }
        lastHost = { ts: now, times: nowTimes };
      } catch {}
    }
    // Also compute host-style percent for reference (bpytop-like)
    let cpuHostPct = null;
    try {
      const cpus = os.cpus() || [];
      const nowTimes = cpus.map(c => ({
        user: Number(c.times.user||0), nice: Number(c.times.nice||0), sys: Number(c.times.sys||0), idle: Number(c.times.idle||0), irq: Number(c.times.irq||0)
      }));
      if (Array.isArray(lastHost.times) && lastHost.times.length === nowTimes.length && nowTimes.length > 0) {
        let busy = 0, total = 0;
        for (let i = 0; i < nowTimes.length; i++) {
          const prev = lastHost.times[i];
          const cur = nowTimes[i];
          const du = Math.max(0, cur.user - prev.user);
          const dn = Math.max(0, cur.nice - prev.nice);
          const ds = Math.max(0, cur.sys - prev.sys);
          const di = Math.max(0, cur.idle - prev.idle);
          const dq = Math.max(0, cur.irq - prev.irq);
          const t = du + dn + ds + di + dq;
          const b = du + dn + ds + dq;
          busy += b; total += t;
        }
        if (total > 0) cpuHostPct = Math.max(0, Math.min(100, (busy / total) * 100));
      }
      lastHost = { ts: now, times: nowTimes };
    } catch {}
    // Fallback 2: loadavg heuristic if all else fails
    if (cpuPct == null && cpuCap) cpuPct = Math.min(100, (load1 / cpuCap) * 100);

    // Disk via df for root/app
    let diskUsed = null, diskSize = null;
    try {
      const { execFile } = await import('child_process');
      const execFileAsync = (cmd, args, opts = {}) => new Promise((resolve) => {
        try { const p = execFile(cmd, args, { timeout: 1200, ...opts }, (err, stdout) => resolve(err ? '' : String(stdout||''))); p.on('error', () => resolve('')); } catch { resolve(''); }
      });
      const out = await execFileAsync('df', ['-P', '-k', '/app', '/']);
      const lines = out.trim().split(/\r?\n/).slice(1);
      let primary = null;
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 6) {
          const sizeK = Number(parts[1]);
          const usedK = Number(parts[2]);
          const mount = parts[5];
          const rec = { mount, size: Number.isFinite(sizeK)? sizeK*1024:null, used: Number.isFinite(usedK)? usedK*1024:null };
          if (!primary || mount === '/app' || (mount === '/' && primary.mount !== '/app')) primary = rec;
        }
      }
      if (primary) { diskUsed = primary.used; diskSize = primary.size; }
    } catch {}

    // Network totals from /proc/net/dev
    let rxBps = 0, txBps = 0;
    try {
      const dev = await (await import('fs/promises')).readFile('/proc/net/dev', 'utf8');
      const lines = dev.trim().split(/\r?\n/).slice(2);
      const map = new Map();
      for (const ln of lines) {
        const [ifacePart, rest] = ln.split(':');
        if (!rest) continue; const iface = ifacePart.trim(); if (!iface || iface === 'lo') continue;
        const nums = rest.trim().split(/\s+/).map(Number);
        if (nums.length < 16) continue;
        const rx = Number(nums[0]||0), tx = Number(nums[8]||0);
        map.set(iface, { rx, tx });
      }
      const dt = Math.max(0.001, (now - (lastNet.ts || now)) / 1000);
      for (const [iface, cur] of map) {
        const prev = lastNet.map.get(iface);
        if (prev) {
          const drx = Math.max(0, cur.rx - prev.rx);
          const dtx = Math.max(0, cur.tx - prev.tx);
          rxBps += (drx * 8) / dt;
          txBps += (dtx * 8) / dt;
        }
      }
      lastNet = { ts: now, map };
    } catch {}

  // Ingestor metrics (if available)
    let lastFlushCount = null, lastFlushMs = null;
    try {
      const m = app.telemetryIngest?.metrics;
      if (m) {
        if (Number.isFinite(Number(m.lastFlushCount))) lastFlushCount = Number(m.lastFlushCount);
        if (Number.isFinite(Number(m.lastFlushMs))) lastFlushMs = Number(m.lastFlushMs);
      }
    } catch {}

    // Connectivity bottleneck summary from live status cache (if available)
    let connectivityGroups = null, worstEffMs = null, worstTargetMs = null, worstEffRatio = null, totalLockWaitMs = null;
    try {
      const items = Array.from(app.connectivityStatus?.values?.() || []);
      let groups = 0;
      let worstRatio = -Infinity;
      let worstEff = null, worstTarget = null;
      let lockSum = 0;
      for (const it of items) {
        const polling = it?.stats?.polling;
        if (polling && typeof polling === 'object') {
          for (const [gid, m] of Object.entries(polling)) {
            groups += 1;
            const eff = Number(m?.eff_ms);
            const tgt = Number(m?.target_ms);
            const lw = Number(m?.lock_wait_ms || 0);
            if (Number.isFinite(lw)) lockSum += lw;
            if (Number.isFinite(eff) && Number.isFinite(tgt) && tgt > 0) {
              const ratio = eff / tgt;
              if (ratio > worstRatio) { worstRatio = ratio; worstEff = eff; worstTarget = tgt; }
            }
          }
        }
      }
      connectivityGroups = groups || null;
      worstEffMs = worstEff;
      worstTargetMs = worstTarget;
      worstEffRatio = Number.isFinite(worstRatio) && worstRatio > -Infinity ? worstRatio : null;
      totalLockWaitMs = lockSum || null;
    } catch {}

    return {
      ts: new Date(now).toISOString(),
      cpu_load1: load1,
      cpu_cap: cpuCap,
      cpu_pct: (quota && period && cpuPct != null) ? Number(cpuPct) : (cpuHostPct != null ? Number(cpuHostPct) : null),
  cpu_host_pct: cpuHostPct != null ? Number(cpuHostPct) : null,
      mem_used_bytes: usedMem,
      mem_limit_bytes: limitMem,
      mem_pct: cgMemLimit ? (usedMem/limitMem)*100 : (totalMem ? (hostUsedMem/totalMem)*100 : null),
      mem_host_used_bytes: hostUsedMem,
      mem_host_total_bytes: totalMem,
      mem_host_pct: totalMem ? (hostUsedMem/totalMem)*100 : null,
      disk_used_bytes: diskUsed,
      disk_size_bytes: diskSize,
      disk_pct: (diskUsed!=null && diskSize) ? (diskUsed/diskSize)*100 : null,
      net_rx_bps: rxBps,
      net_tx_bps: txBps,
      last_flush_count: lastFlushCount,
      last_flush_ms: lastFlushMs,
      connectivity_groups: connectivityGroups,
      worst_eff_ms: worstEffMs,
      worst_target_ms: worstTargetMs,
      worst_eff_ratio: worstEffRatio,
      total_lock_wait_ms: totalLockWaitMs,
    };
  }

  async function insertRow(row) {
    try {
      if (!app.tsdb) return; // skip when tsdb missing
      
      const ts = new Date(row.ts);
      const metrics = [
        { tag_id: SYSTEM_TAG_IDS.CPU_LOAD1, value: row.cpu_load1 },
        { tag_id: SYSTEM_TAG_IDS.CPU_CAP, value: row.cpu_cap },
        { tag_id: SYSTEM_TAG_IDS.CPU_PCT, value: row.cpu_pct },
        { tag_id: SYSTEM_TAG_IDS.CPU_HOST_PCT, value: row.cpu_host_pct },
        { tag_id: SYSTEM_TAG_IDS.MEM_USED, value: row.mem_used_bytes },
        { tag_id: SYSTEM_TAG_IDS.MEM_LIMIT, value: row.mem_limit_bytes },
        { tag_id: SYSTEM_TAG_IDS.MEM_PCT, value: row.mem_pct },
        { tag_id: SYSTEM_TAG_IDS.DISK_USED, value: row.disk_used_bytes },
        { tag_id: SYSTEM_TAG_IDS.DISK_SIZE, value: row.disk_size_bytes },
        { tag_id: SYSTEM_TAG_IDS.DISK_PCT, value: row.disk_pct },
        { tag_id: SYSTEM_TAG_IDS.NET_RX_BPS, value: row.net_rx_bps },
        { tag_id: SYSTEM_TAG_IDS.NET_TX_BPS, value: row.net_tx_bps },
        { tag_id: SYSTEM_TAG_IDS.FLUSH_COUNT, value: row.last_flush_count },
        { tag_id: SYSTEM_TAG_IDS.FLUSH_MS, value: row.last_flush_ms },
        { tag_id: SYSTEM_TAG_IDS.CONN_GROUPS, value: row.connectivity_groups },
        { tag_id: SYSTEM_TAG_IDS.WORST_EFF_MS, value: row.worst_eff_ms },
        { tag_id: SYSTEM_TAG_IDS.WORST_TGT_MS, value: row.worst_target_ms },
        { tag_id: SYSTEM_TAG_IDS.WORST_EFF_RATIO, value: row.worst_eff_ratio },
        { tag_id: SYSTEM_TAG_IDS.LOCK_WAIT_MS, value: row.total_lock_wait_ms },
      ];
      
      // Insert each metric as a separate row (narrow table)
      for (const metric of metrics) {
        if (metric.value !== null && metric.value !== undefined) {
          await app.tsdb.query(
            `INSERT INTO system_metrics (tag_id, ts, v_num) 
             VALUES ($1, $2, $3)
             ON CONFLICT (tag_id, ts) DO UPDATE SET v_num = EXCLUDED.v_num`,
            [metric.tag_id, ts, metric.value]
          );
        }
      }
    } catch (e) {
      log.warn({ err: e }, 'insert system_metrics failed');
    }
  }

  async function pruneOld() {
    const days = await getConfigValue('system_metrics.retention_days', 30);
    try {
      if (!app.tsdb) return;
      await app.tsdb.query(`delete from system_metrics where ts < now() - ($1 || ' days')::interval`, [String(days)]);
    } catch (e) {
      log.warn({ err: e }, 'prune system_metrics failed');
    }
  }

  // Main loop with dynamic interval
  async function loop() {
    if (stop) return;
    const pollMs = await getConfigValue('system_metrics.poll_ms', 5000);
    try {
      // ensure table lazily
      await ensureTable();
      if (app.tsdb && SYSTEM_TAG_IDS) {
        const row = await readResources();
        await insertRow(row);
      }
    } catch (e) {
      log.warn({ err: e }, 'sampling failed');
    }
    // occasionally prune (every ~12 cycles)
    try { if (Math.random() < 1/12) await pruneOld(); } catch {}
    setTimeout(loop, Math.max(500, Number(pollMs)||5000));
  }

  // Load tag IDs from database before starting the loop
  await loadSystemTagIds();
  loop();

  app.addHook('onClose', async () => { stop = true; });
});
export default systemMetricsSampler;