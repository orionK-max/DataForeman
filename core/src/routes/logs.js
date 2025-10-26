import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { listLogComponents, resolveHostPathByName, loadComponents, resolveTodayPath } from '../services/log-registry.js';

export async function logsRoutes(app) {
  // admin-only guard
  app.addHook('preHandler', async (req, reply) => {
    if (String(process.env.AUTH_DEV_TOKEN) === '1') return; // dev bypass
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'logs', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.get('/components', async (req, reply) => {
    const list = listLogComponents();
    return { components: list };
  });

  app.get('/read', async (req, reply) => {
    const { component, contains = '', level = '', limit = 500, tail = '', hideInternalPings = '' } = req.query || {};
    if (!component) return reply.code(400).send({ error: 'component required' });
    const hostPath = resolveHostPathByName(String(component));
    if (!hostPath) return reply.code(404).send({ error: 'unknown component' });
    if (!fs.existsSync(hostPath)) return reply.send({ entries: [], truncated: false, bytes: 0 });

    const cap = Number(app.config?.LOG_MAX_RESPONSE_BYTES || 256 * 1024);
    const maxBytes = Number.isFinite(cap) ? cap : 256 * 1024;
    const maxRows = Math.max(1, Math.min(5000, Number(limit) || 500));
    const tailMode = String(tail).toLowerCase() === '1' || String(tail).toLowerCase() === 'true';
    const hidePings = String(hideInternalPings).toLowerCase() === '1' || String(hideInternalPings).toLowerCase() === 'true';

    const lc = String(level || '').trim().toLowerCase();
    const sub = String(contains || '').toLowerCase();

    function stripAnsi(s) { return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, ''); }
    function normalizeLevel(v) {
      if (v == null) return '';
      if (typeof v === 'number') {
        const map = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
        return map[v] || String(v);
      }
      const s = String(v).toLowerCase();
      const mapS = {
        trc: 'trace', trace: 'trace',
        dbg: 'debug', debug: 'debug',
        inf: 'info', info: 'info', notice: 'info',
        wrn: 'warn', warn: 'warn', warning: 'warn',
        err: 'error', error: 'error',
        crit: 'error', alert: 'fatal', emerg: 'fatal', fatal: 'fatal'
      };
      return mapS[s] || s;
    }
    function normalizeTime(t) {
      if (t == null) return null;
      if (typeof t === 'number') return new Date(t).toISOString();
      const d = new Date(t);
      if (!isNaN(d.getTime())) return d.toISOString();
      return null;
    }

    async function readFileToEntries(path, label) {
      if (!path || !fs.existsSync(path)) return { entries: [], bytes: 0, truncated: false };
      const rs = fs.createReadStream(path, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
      const out = [];
      let bytes = 0;
      let truncated = false;
      let lastTs = null;
      for await (const line of rl) {
        if (!tailMode && (bytes >= maxBytes || out.length >= maxRows)) { truncated = true; break; }
        if (!line) continue;
        bytes += Buffer.byteLength(line, 'utf8') + 1;
        let rec;
        const clean = stripAnsi(line);
        // Skip Postgres/Timescale CSV header row
        if ((label === 'postgres' || label === 'tsdb') && /^"?log_time"?,/i.test(clean)) continue;
        // Pre-extract bracketed timestamp
        let tsFromBracket = null;
        const b0 = clean.match(/^\[([^\]]+)]/);
        if (b0) {
          const tsRaw = b0[1];
          const m2b = tsRaw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}) ([+-]\d{4})$/);
          if (m2b) {
            const [__, d2, t2, off] = m2b;
            const offIso = `${off.slice(0, 3)}:${off.slice(3)}`;
            tsFromBracket = `${d2}T${t2}${offIso}`;
          } else {
            const ts = new Date(tsRaw);
            if (!isNaN(ts.getTime())) tsFromBracket = ts.toISOString();
          }
        }
        // Try JSON first
        try {
          rec = JSON.parse(clean);
        } catch {
          rec = { line: clean };
          // pino-pretty
          const p = clean.match(/^\[([^\]]+)]\s+(\w+)\s+\((\d+)\):\s*(.*)$/);
          if (p) {
            const tsRaw = p[1];
            const lvl = p[2];
            const msg = p[4];
            const m2 = tsRaw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}) ([+-]\d{4})$/);
            if (m2) {
              const [_, d, t, off] = m2;
              const offIso = `${off.slice(0, 3)}:${off.slice(3)}`;
              rec.time = `${d}T${t}${offIso}`;
            }
            rec.level = (lvl || '').toLowerCase();
            rec.msg = msg;
          } else {
            // NATS
            const n = clean.match(/^\[\d+]\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[(\w{3})]\s+(.*)$/);
            if (n) {
              const [_, y, mo, d, t, lvl3, msg] = n;
              const dt = new Date(`${y}-${mo}-${d}T${t}`);
              if (!isNaN(dt.getTime())) rec.time = dt.toISOString();
              rec.level = String(lvl3 || '').toLowerCase();
              rec.msg = msg;
            } else {
              // Nginx access log (combined format): IP - - [DD/Mon/YYYY:HH:MM:SS +0000] "METHOD PATH PROTO" STATUS SIZE "REFERER" "UA"
              const nxAccess = clean.match(/^([\d\.]+)\s+-\s+-\s+\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})]\s+"(\S+)\s+(\S+)\s+(\S+)"\s+(\d+)\s+/);
              if (nxAccess) {
                const [__, ip, day, mon, year, time, tz, method, path, proto, status] = nxAccess;
                const monthMap = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
                const monthNum = monthMap[mon] || '01';
                const tzIso = `${tz.slice(0, 3)}:${tz.slice(3)}`;
                const dt = new Date(`${year}-${monthNum}-${day}T${time}${tzIso}`);
                if (!isNaN(dt.getTime())) rec.time = dt.toISOString();
                rec.level = 'info';
                rec.msg = `${method} ${path} ${status}`;
                rec.request = `${method} ${path}`;
                rec.status = status;
                rec.remote_addr = ip;
              } else {
                // Nginx error
                const nx = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\[(\w+)]\s+(.*)$/);
                if (nx) {
                  const [__, y, mo, d, t, lvl, rest] = nx;
                  const dt = new Date(`${y}-${mo}-${d}T${t}`);
                  if (!isNaN(dt.getTime())) rec.time = dt.toISOString();
                  rec.level = String(lvl || '').toLowerCase();
                  rec.msg = rest;
                } else {
                  // Postgres plain text (non-CSV)
                const pgPlain = clean.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?\s+(UTC|GMT|[+\-]\d{2}:?\d{2})\s+\(?.*?\)?\s*\[(\d+)]\s+([A-Z]+):\s*(.*)$/);
                if (pgPlain) {
                  const [__, y, mo, d, t, micro, zone, pid, lvlTxt, rest] = pgPlain;
                  const t0 = micro ? `${t}.${micro.padEnd(3, '0').slice(0,3)}` : t;
                  let iso;
                  if (zone === 'UTC' || zone === 'GMT') iso = `${y}-${mo}-${d}T${t0}Z`;
                  else if (/[+\-]\d{4}/.test(zone)) iso = `${y}-${mo}-${d}T${t0}${zone.slice(0,3)}:${zone.slice(3)}`;
                  else if (/[+\-]\d{2}:\d{2}/.test(zone)) iso = `${y}-${mo}-${d}T${t0}${zone}`;
                  else iso = `${y}-${mo}-${d}T${t0}Z`;
                  const dt = new Date(iso);
                  if (!isNaN(dt.getTime())) rec.time = dt.toISOString();
                  const map = { LOG: 'info', ERROR: 'error', WARNING: 'warn', HINT: 'info', NOTICE: 'info', FATAL: 'fatal', PANIC: 'fatal' };
                  rec.level = map[lvlTxt] || rec.level || 'info';
                  rec.msg = rest || rec.msg;
                } else {
                  // Postgres/Timescale CSV first column timestamp
                  const pg = clean.match(/^"?(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:\s+([A-Z]+|[+\-]\d{2}:?\d{2}))?"?,/);
                  if (pg) {
                    const [___, d0, tWhole, micro, zone] = pg;
                    const t0 = micro ? `${tWhole}.${micro.padEnd(3, '0').slice(0,3)}` : tWhole; // keep ms precision
                    let iso;
                    if (zone === 'UTC' || zone === 'GMT') iso = `${d0}T${t0}Z`;
                    else if (zone && /[+\-]\d{4}/.test(zone)) iso = `${d0}T${t0}${zone.slice(0,3)}:${zone.slice(3)}`;
                    else if (zone && /[+\-]\d{2}:\d{2}/.test(zone)) iso = `${d0}T${t0}${zone}`;
                    else iso = `${d0}T${t0}Z`;
                    const dt = new Date(iso);
                    if (!isNaN(dt.getTime())) rec.time = dt.toISOString();
                    rec.level = rec.level || 'info';
                    rec.msg = rec.msg || 'postgres';
                  } else if (tsFromBracket) {
                    rec.time = tsFromBracket;
                  }
                }
              }
            }
          }
        }
      }
        // Normalize time to ISO and level to standard strings
        if (rec && rec.time) {
          const iso = normalizeTime(rec.time);
          if (iso) rec.time = iso;
        }
        if (rec) rec.level = normalizeLevel(rec.level);
        // Backfill time if still missing
        if (rec && !rec.time && lastTs) rec.time = lastTs;
        if (rec && rec.time) {
          const tsn = Date.parse(rec.time);
          if (!Number.isNaN(tsn)) lastTs = new Date(tsn).toISOString();
        }
        // Filters
        if (!rec) continue;
        const passLevel = !lc || String(rec.level || '').toLowerCase() === lc;
        const passSub = !sub || JSON.stringify(rec).toLowerCase().includes(sub);
        
        // Filter out internal pings and routine background operations if requested
        let isPing = false;
        if (hidePings) {
          const msgStr = String(rec.msg || rec.message || '').toLowerCase();
          const urlStr = String(rec.url || rec.req?.url || '').toLowerCase();
          isPing = msgStr.includes('ping') || 
                   msgStr.includes('health') || 
                   urlStr.includes('/ping') || 
                   urlStr.includes('/health') ||
                   urlStr.includes('/api/health') ||
                   msgStr.includes('telemetry-ingest flush') ||
                   msgStr.includes('dispatcher: heartbeat') ||
                   msgStr.includes('dispatcher: stalled reconcile');
        }
        
        if (!passLevel || !passSub || isPing) continue;
        if (tailMode) {
          out.push(rec);
          if (out.length > maxRows) out.shift();
        } else {
          out.push(rec);
        }
      }
      rl.close(); rs.close();
      return { entries: out, bytes, truncated };
    }

    // Check if component has merge pattern (like frontend with access + error logs)
    const comps = loadComponents();
    const compConfig = comps.find((c) => c.name === String(component));
    const mergePath = compConfig?.mergePattern ? resolveTodayPath(compConfig.mergePattern).hostPath : null;

    // Single component path
    const res = await readFileToEntries(hostPath, String(component));
    
    // If there's a merge path, read and combine entries
    if (mergePath && fs.existsSync(mergePath)) {
      const res2 = await readFileToEntries(mergePath, String(component));
      // Combine and sort by timestamp
      const combined = [...res.entries, ...res2.entries];
      combined.sort((a, b) => {
        const ta = a.time ? new Date(a.time).getTime() : 0;
        const tb = b.time ? new Date(b.time).getTime() : 0;
        // Tail mode: newest first (descending), otherwise oldest first (ascending)
        return tailMode ? (tb - ta) : (ta - tb);
      });
      // Apply limits - take first N entries after sorting
      const finalEntries = combined.slice(0, maxRows);
      return reply.send({
        entries: finalEntries,
        bytes: res.bytes + res2.bytes,
        truncated: res.truncated || res2.truncated || combined.length > finalEntries.length
      });
    }
    
    // For single file, also apply correct sorting
    res.entries.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      // Tail mode: newest first (descending), otherwise oldest first (ascending)
      return tailMode ? (tb - ta) : (ta - tb);
    });
    
    return reply.send(res);
  });
}
