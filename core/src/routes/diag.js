import net from 'net';
import { listLogComponents } from '../services/log-registry.js';

function parseNatsUrl(url) {
  try {
    const u = new URL(url || 'nats://localhost:4222');
    return { host: u.hostname, port: Number(u.port || 4222) };
  } catch {
    return { host: 'localhost', port: 4222 };
  }
}

async function testTcp({ host, port, timeout = 1000 }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, error) => {
      if (done) return; done = true; try { socket.destroy(); } catch {}
      resolve({ ok, error });
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (e) => finish(false, e?.message || 'error'));
    socket.connect(port, host);
  });
}

export async function diagRoutes(app) {
  // admin-only guard - check diagnostic.system permission for all diagnostic routes
  app.addHook('preHandler', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'diagnostic.system', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });
  // Persist CPU usage snapshot across requests for stable usage percent
  let lastCpuSnap = { ts: 0, usageUs: null };
  // Persist host CPU times across requests to compute host_pct similar to bpytop
  let lastHostSnap = { ts: 0, times: null };

  app.get('/summary', async (req, reply) => {
    // core
    const health = { status: 'unknown' };
    const ready = { ready: false };
    try { Object.assign(health, { status: 'ok' }); } catch {}
    try { Object.assign(ready, { ready: true }); } catch {}

    // metrics uptime
    let uptime = null;
    try {
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const text = res.body || '';
      const match = text.match(/process_uptime_seconds(?:_total)?\s+(\d+\.?\d*)/);
      if (match) uptime = Number(match[1]);
    } catch {}

    // db
    let db = 'down';
    try {
      await app.db.query('select 1');
      db = 'up';
    } catch {}

    // nats
    const { host, port } = parseNatsUrl(process.env.NATS_URL || 'nats://nats:4222');
    const nats = await testTcp({ host, port, timeout: 800 });

    // tsdb (Timescale/Postgres for telemetry)
    let tsdb = 'down';
    try { await app.tsdb?.query('select 1'); tsdb = 'up'; } catch {}

    // connectivity service health via HTTP JSON endpoint
    // Try multiple URLs to support both Linux (host network) and Windows (bridge network)
    let connectivity = { ok: null };
    const connectivityUrls = [
      'http://host-gateway:3100/health',  // Linux/host network (core bridge -> connectivity host mode via gateway)
      'http://connectivity:3100/health',  // Windows/bridge network
      'http://host.docker.internal:3100/health' // Fallback for some Docker configs
    ];
    
    for (const url of connectivityUrls) {
      try {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 2000);
        const res = await fetch(url, { signal: ac.signal });
        clearTimeout(to);
        if (res.ok) {
          let data = null; try { data = await res.json(); } catch {}
          app.log.info({ connectivityHealthData: data, url }, 'connectivity health response');
          connectivity = { ok: true, nats: !!data?.nats, connections: Number(data?.connections ?? 0) };
          break; // Success - stop trying other URLs
        } else {
          connectivity = { ok: false, status: res.status };
        }
      } catch (e) {
        // Continue to next URL if this one fails
        connectivity = { ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'error') };
      }
    }
    
    if (!connectivity.ok) {
      app.log.warn({ connectivity, triedUrls: connectivityUrls }, 'connectivity health check failed on all URLs');
    }

    // simple TCP reachability for frontend and caddy (TLS proxy when profile enabled)
    const frontTcp = await testTcp({ host: 'front', port: 80, timeout: 800 });
    const caddyTcp = await testTcp({ host: 'caddy', port: 80, timeout: 800 });

    // NOTE: Standalone ingestor service has been deprecated (2025-10-24)
    // Core service now handles all telemetry ingestion via telemetry-ingest.js
    // Keeping this check temporarily to monitor core's ingestion activity
    let coreIngestion = { activeRecently: null, lastTs: null };
    try {
      const q = `select max(ts) as last from tag_values where ts > now() - interval '10 minutes'`;
      const { rows } = await (app.tsdb || app.db).query(q);
      const last = rows[0]?.last;
      coreIngestion.lastTs = last || null;
      coreIngestion.activeRecently = last != null;
    } catch {}

    // rotator activity heuristic: ops log presence and recent mtime
    let rotator = { recentActivity: null, mtimeMs: null };
    try {
      const comps = listLogComponents();
      const ops = comps.find((c) => c.name === 'ops');
      if (ops) {
        rotator.mtimeMs = ops.mtimeMs ?? null;
        if (ops.mtimeMs) {
          const ageMs = Date.now() - Number(ops.mtimeMs);
          // consider active if touched within last 26 hours
          rotator.recentActivity = ageMs < 26 * 60 * 60 * 1000;
        } else {
          rotator.recentActivity = false;
        }
      }
    } catch {}

    const response = {
      core: { health, ready, uptime },
      db,
      nats,
      tsdb,
      connectivity,
      front: { ok: !!frontTcp.ok },
      caddy: { ok: !!caddyTcp.ok },
      coreIngestion,
      rotator,
    };
    app.log.info({ diagnosticSummary: response }, 'diag summary response');
    return response;
  });

  // Timeseries for system_metrics to power Capacity charts (supports window_ms or limit)
  app.get('/system-metrics', async (req, reply) => {
    try {
      const db = app.tsdb || app.db;
      const limit = Number(req.query?.limit || 0);
      const windowMs = Math.max(1000, Number(req.query?.window_ms || 0));
      
      // Get System tag mappings from main DB
      const tagRes = await app.db.query(
        `SELECT tag_id, tag_path FROM tag_metadata WHERE connection_id = 'System'`
      );
      const tagMap = {};
      for (const row of tagRes.rows) {
        tagMap[row.tag_id] = row.tag_path;
      }
      
      let rows = [];
      if (limit > 0) {
        const lim = Math.min(limit, 2000);
        const q = `
          SELECT extract(epoch from ts)*1000 as t, tag_id, v_num
          FROM system_metrics
          ORDER BY ts DESC
          LIMIT $1`;
        const res = await db.query(q, [lim]);
        rows = (res.rows || []).reverse();
      } else {
        const cutoffMs = Date.now() - windowMs;
        const q = `
          SELECT extract(epoch from ts)*1000 as t, tag_id, v_num
          FROM system_metrics
          WHERE ts >= to_timestamp($1::double precision/1000.0)
          ORDER BY ts ASC`;
        const res = await db.query(q, [cutoffMs]);
        rows = res.rows || [];
      }
      
      // Pivot narrow rows to wide format
      const timeMap = new Map();
      for (const row of rows) {
        const t = Number(row.t);
        if (!timeMap.has(t)) {
          timeMap.set(t, { t });
        }
        const record = timeMap.get(t);
        const tagPath = tagMap[row.tag_id];
        if (tagPath) {
          record[tagPath] = row.v_num != null ? Number(row.v_num) : null;
        }
      }
      
      const items = Array.from(timeMap.values()).map(r => ({
        t: r.t,
        cpu_pct: r.cpu_pct ?? null,
        cpu_host_pct: r.cpu_host_pct ?? null,
        mem_pct: r.mem_pct ?? null,
        disk_pct: r.disk_pct ?? null,
        net_rx_bps: r.net_rx_bps ?? null,
        net_tx_bps: r.net_tx_bps ?? null,
        last_flush_count: r.last_flush_count ?? null,
        last_flush_ms: r.last_flush_ms ?? null,
        connectivity_groups: r.connectivity_groups ?? null,
        worst_eff_ms: r.worst_eff_ms ?? null,
        worst_target_ms: r.worst_target_ms ?? null,
        worst_eff_ratio: r.worst_eff_ratio ?? null,
        total_lock_wait_ms: r.total_lock_wait_ms ?? null,
      }));
      // Poll interval hint
      let pollMs = 5000;
      try {
        const { rows: prow } = await app.db.query('select value from system_settings where key=$1', ['system_metrics.poll_ms']);
        const raw = prow?.[0]?.value;
        const n = Number(typeof raw === 'object' ? Number(raw) : raw);
        if (Number.isFinite(n) && n > 0) pollMs = Math.max(500, Math.floor(n));
      } catch {}
      return { items, now: Date.now(), window_ms: windowMs || null, poll_ms: pollMs };
    } catch (e) {
      req.log.warn({ err: e }, 'failed to query system_metrics');
      return { items: [], now: Date.now(), window_ms: Number(req.query?.window_ms || 3600000), poll_ms: 5000 };
    }
  });

  // Emit test log entries across services to validate log targets
  app.post('/logs/emit-test', async (req, reply) => {
    const result = { core: false, front: false, connectivity: false };
    try {
      app.log.info({ source: 'diag' }, 'diagnostic: manual log entry');
      result.core = true;
    } catch {}
    try {
      // Hit front root to generate an access log entry
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 1500);
      const res = await fetch('http://front/', { signal: ac.signal });
      clearTimeout(to);
      result.front = res.ok;
    } catch {}
    try {
      // Ask connectivity to write a debug line
      // Try both URLs to support Linux (host) and Windows (bridge) networking
      const urls = ['http://host-gateway:3100/debug/log', 'http://connectivity:3100/debug/log', 'http://host.docker.internal:3100/debug/log'];
      for (const url of urls) {
        try {
          const ac = new AbortController();
          const to = setTimeout(() => ac.abort(), 1500);
          const res = await fetch(url, { signal: ac.signal });
          clearTimeout(to);
          if (res.ok) {
            result.connectivity = true;
            break;
          }
        } catch {}
      }
    } catch {}
    return { ok: true, result };
  });

  app.get('/audit', async (req, reply) => {
    const { event, limit } = req.query || {};
    const lim = Math.min(Number(limit || 100), 500);
    let where = '';
    const params = [];
    if (event) {
      where = 'where event = any($1)';
      params.push(String(event).split(',').map((s) => s.trim()).filter(Boolean));
    }
    const { rows } = await app.db.query(
      `select id, ts, event, actor, meta from audit_log ${where} order by ts desc limit ${lim}`,
      params
    );
    return rows;
  });

  // System resources (container-scoped) for Capacity visuals
  app.get('/resources', async (req, reply) => {
    const os = await import('os');
    const { readFile, access } = await import('fs/promises');
    const { constants } = await import('fs');
    const { execFile } = await import('child_process');
    const execFileAsync = (cmd, args, opts = {}) => new Promise((resolve) => {
      try {
        const p = execFile(cmd, args, { timeout: 1200, ...opts }, (err, stdout) => {
          if (err) return resolve(null);
          resolve(String(stdout || ''));
        });
        p.on('error', () => resolve(null));
      } catch { resolve(null); }
    });

    const now = Date.now();
    const proc = process.memoryUsage();
    const processInfo = {
      rss_bytes: proc.rss,
      heap_used_bytes: proc.heapUsed,
      uptime_s: Math.floor(process.uptime()),
      pid: process.pid,
      ts: new Date(now).toISOString(),
    };

    async function readNum(path) {
      try { const s = await readFile(path, 'utf8'); const t = s.trim(); if (t === 'max') return null; const n = Number(t.split(/\s+/)[0]); return Number.isFinite(n) ? n : null; } catch { return null; }
    }

    // cgroup v2 paths (fallback to v1)
    const cg = { memory: { usage_bytes: null, limit_bytes: null }, cpu: { quota_us: null, period_us: null } };
    // memory
    cg.memory.usage_bytes = await readNum('/sys/fs/cgroup/memory.current')
      ?? await readNum('/sys/fs/cgroup/memory/memory.usage_in_bytes');
    cg.memory.limit_bytes = await readNum('/sys/fs/cgroup/memory.max')
      ?? await readNum('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    // cpu
    try {
      const cpuMax = await readFile('/sys/fs/cgroup/cpu.max', 'utf8').catch(() => null);
      if (cpuMax) {
        const [quota, period] = cpuMax.trim().split(/\s+/);
        cg.cpu.quota_us = quota === 'max' ? null : Number(quota);
        cg.cpu.period_us = Number(period || 100000);
      } else {
        const quota = await readNum('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
        const period = await readNum('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
        cg.cpu.quota_us = quota; cg.cpu.period_us = period;
      }
    } catch {}

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const memory = {
      total_bytes: totalMem,
      free_bytes: freeMem,
      used_bytes: usedMem,
      cgroup: cg.memory,
    };

    // CPU percent via cgroup usage deltas (persistent between requests)
    async function readCpuUsageUs(fs) {
      try {
        const s = await fs.readFile('/sys/fs/cgroup/cpu.stat', 'utf8');
        const m = s.match(/usage_usec\s+(\d+)/);
        if (m) return Number(m[1]);
      } catch {}
      try {
        const s = await fs.readFile('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8');
        const n = Number(String(s).trim());
        if (Number.isFinite(n)) return Math.floor(n / 1000);
      } catch {}
      return null;
    }
    let cpuPct = null;
    try {
      const fs = await import('fs/promises');
      const usageUs = await readCpuUsageUs(fs);
      const prevUs = Number(lastCpuSnap.usageUs);
      const prevTs = Number(lastCpuSnap.ts);
      const nowMs = Date.now();
      const vcores = cg.cpu.quota_us && cg.cpu.period_us ? (cg.cpu.quota_us / cg.cpu.period_us) : ((os.cpus() || []).length || 1);
      if (usageUs != null && Number.isFinite(prevUs) && prevTs > 0 && vcores) {
        const duSec = Math.max(0, (usageUs - prevUs) / 1e6);
        const dtSec = Math.max(0.001, (nowMs - prevTs) / 1000);
        const usedCores = duSec / dtSec; // cores used on average
        cpuPct = Math.max(0, Math.min(100, (usedCores / vcores) * 100));
      }
      // update snapshot for next call
      lastCpuSnap = { ts: nowMs, usageUs: usageUs != null ? usageUs : lastCpuSnap.usageUs };
    } catch {}
    // Host-style CPU percent using /proc/stat via os.cpus() deltas
    let hostPct = null;
    try {
      const cpus = os.cpus() || [];
      const nowTimes = cpus.map(c => ({
        user: Number(c.times.user||0), nice: Number(c.times.nice||0), sys: Number(c.times.sys||0), idle: Number(c.times.idle||0), irq: Number(c.times.irq||0)
      }));
      if (Array.isArray(lastHostSnap.times) && lastHostSnap.times.length === nowTimes.length && nowTimes.length > 0) {
        let busy = 0, total = 0;
        for (let i = 0; i < nowTimes.length; i++) {
          const prev = lastHostSnap.times[i];
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
        if (total > 0) hostPct = Math.max(0, Math.min(100, (busy / total) * 100));
      }
      lastHostSnap = { ts: Date.now(), times: nowTimes };
    } catch {}

    const cpu = {
      loadavg1: os.loadavg()[0] || 0,
      loadavg5: os.loadavg()[1] || 0,
      loadavg15: os.loadavg()[2] || 0,
      cores: (os.cpus() || []).length || null,
      usage_pct: cpuPct,
      host_pct: hostPct,
      cgroup: cg.cpu,
    };

  // Disk via `df -P -k` for portable parse; include root and app logs dir
    const wantPaths = ['/', '/app', '/app/logs', '/var/log'];
    const existing = [];
    for (const p of wantPaths) {
      try { await access(p, constants.R_OK); existing.push(p); } catch {}
    }
    const out = await execFileAsync('df', ['-P', '-k', ...existing]);
    const disks = [];
    if (out) {
      const lines = out.trim().split(/\r?\n/);
      for (const line of lines.slice(1)) {
        // Filesystem 1024-blocks Used Available Capacity Mounted on
        const parts = line.split(/\s+/);
        if (parts.length >= 6) {
          const fsName = parts[0];
          const sizeK = Number(parts[1]);
          const usedK = Number(parts[2]);
          const availK = Number(parts[3]);
          const mount = parts[5];
          if (Number.isFinite(sizeK) && Number.isFinite(usedK)) {
            disks.push({
              mount,
              filesystem: fsName,
              size_bytes: sizeK * 1024,
              used_bytes: usedK * 1024,
              avail_bytes: Number.isFinite(availK) ? availK * 1024 : null,
            });
          }
        }
      }
    }
    // Consolidate: pick a single primary disk to display
    // 1) Deduplicate by mount path (keep the largest size for that mount)
    const byMount = new Map();
    for (const d of disks) {
      const cur = byMount.get(d.mount);
      if (!cur || (Number(d.size_bytes || 0) > Number(cur.size_bytes || 0))) {
        byMount.set(d.mount, d);
      }
    }
    const uniqueMounts = Array.from(byMount.values());
    // 2) Prefer '/app' (application data), else root '/', else fallback to the largest filesystem
    let primary = uniqueMounts.find((d) => d.mount === '/app')
      || uniqueMounts.find((d) => d.mount === '/');
    if (!primary && uniqueMounts.length) {
      primary = uniqueMounts.reduce((a, b) => (Number(a.size_bytes || 0) >= Number(b.size_bytes || 0) ? a : b));
    }
    const disksOut = primary ? [primary] : [];

    // Network interfaces via /proc/net/dev (+ link speed when available)
    async function readIfSpeed(name) {
      try {
        const s = await readFile(`/sys/class/net/${name}/speed`, 'utf8');
        const n = Number(String(s).trim());
        return Number.isFinite(n) ? n : null; // Mbps
      } catch { return null; }
    }
    const net = [];
    try {
      const dev = await readFile('/proc/net/dev', 'utf8');
      const lines = dev.trim().split(/\r?\n/).slice(2); // skip headers
      for (const ln of lines) {
        const [ifacePart, rest] = ln.split(':');
        if (!rest) continue;
        const iface = ifacePart.trim();
        if (!iface || iface === 'lo') continue; // skip loopback
        const nums = rest.trim().split(/\s+/).map((x) => Number(x));
        // Expect at least 16 fields
        if (nums.length < 16) continue;
        const rx_bytes = nums[0];
        const rx_packets = nums[1];
        const rx_errs = nums[2];
        const rx_drop = nums[3];
        const tx_bytes = nums[8];
        const tx_packets = nums[9];
        const tx_errs = nums[10];
        const tx_drop = nums[11];
        const speed_mbps = await readIfSpeed(iface);
        net.push({
          iface,
          rx_bytes: Number(rx_bytes || 0),
          tx_bytes: Number(tx_bytes || 0),
          rx_packets: Number(rx_packets || 0),
          tx_packets: Number(tx_packets || 0),
          rx_errs: Number(rx_errs || 0),
          tx_errs: Number(tx_errs || 0),
          rx_drop: Number(rx_drop || 0),
          tx_drop: Number(tx_drop || 0),
          speed_mbps: speed_mbps,
        });
      }
    } catch {}

    // Disk capacity estimation based on telemetry ingestion rate
    // Now fetched from cached calculation (background job runs every 15 minutes)
    let capacityEstimate = null;
    try {
      const cachedResult = await app.db.query(`
        SELECT value FROM system_settings WHERE key = $1
      `, ['capacity.last_calculation']);
      
      if (cachedResult.rows.length > 0) {
        capacityEstimate = cachedResult.rows[0].value;
      }
    } catch (err) {
      app.log.warn({ err }, 'Failed to fetch cached capacity estimate');
    }

    return { process: processInfo, memory, cpu, disks: disksOut, net, capacity: capacityEstimate };
  });

  // Get detailed service status (connectivity only - ingestor deprecated)
  app.get('/services/status', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'diagnostic.system', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const services = {};

    // Check connectivity container via Docker socket (if available)
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get connectivity container status
      try {
        const { stdout } = await execAsync('docker ps -a --filter "name=connectivity" --format "{{.Status}}"');
        const status = stdout.trim();
        
        services.connectivity = {
          available: true,
          running: status.startsWith('Up'),
          status: status
        };
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to check connectivity container status');
        services.connectivity = { available: false, error: e.message };
      }
    } catch (importErr) {
      app.log.warn({ err: importErr }, 'Failed to import child_process for service checks');
    }

    return { services };
  });

  // Restart a service (requires diagnostic.system update permission)
  app.post('/services/:serviceName/restart', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'diagnostic.system', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { serviceName } = req.params;
    const allowedServices = ['ingestor', 'connectivity'];
    
    if (!allowedServices.includes(serviceName)) {
      return reply.code(400).send({ error: 'invalid_service', message: `Service must be one of: ${allowedServices.join(', ')}` });
    }

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Restart the service using docker-compose
      const containerName = `dataforeman-${serviceName}-1`;
      app.log.info({ serviceName, containerName, userId }, 'Restarting service');

      const { stdout, stderr } = await execAsync(`docker restart ${containerName}`);
      
      // Log the action for audit
      try {
        await app.audit('diagnostic.service.restart', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { service: serviceName, container: containerName }
        });
      } catch {}

      return {
        success: true,
        service: serviceName,
        container: containerName,
        message: `Service ${serviceName} restarted successfully`
      };
    } catch (err) {
      app.log.error({ err, serviceName, userId }, 'Failed to restart service');
      
      try {
        await app.audit('diagnostic.service.restart', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { service: serviceName, error: err.message }
        });
      } catch {}

      return reply.code(500).send({
        error: 'restart_failed',
        message: err.message
      });
    }
  });

  // Manual capacity recalculation
  app.post('/recalculate-capacity', async (req, reply) => {
    const userId = req.user?.sub;
    
    // Require update permission for triggering capacity calculation
    if (!userId || !(await app.permissions.can(userId, 'diagnostic.system', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    
    try {
      // Check if a capacity calculation job is already running or queued recently
      const { rows } = await app.db.query(`
        SELECT id, status, created_at 
        FROM jobs 
        WHERE type = 'capacity_calculation' 
          AND status IN ('queued', 'running')
          AND created_at > NOW() - INTERVAL '1 minute'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (rows.length > 0) {
        return {
          job_id: rows[0].id,
          status: rows[0].status,
          message: 'Capacity calculation is already in progress',
          already_running: true
        };
      }
      
      // Enqueue new capacity calculation job
      const job = await app.jobs.enqueue('capacity_calculation', {}, {});
      
      app.log.info({ jobId: job.id, userId }, 'Manual capacity recalculation triggered');
      
      // Audit log
      try {
        await app.audit('diagnostic.capacity.recalculate', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { job_id: job.id }
        });
      } catch {}
      
      return {
        job_id: job.id,
        status: 'queued',
        message: 'Capacity recalculation started',
        already_running: false
      };
    } catch (err) {
      app.log.error({ err, userId }, 'Failed to trigger capacity recalculation');
      
      try {
        await app.audit('diagnostic.capacity.recalculate', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { error: err.message }
        });
      } catch {}
      
      return reply.code(500).send({
        error: 'recalculation_failed',
        message: err.message
      });
    }
  });

  // (removed duplicate legacy '/system-metrics' route)
}