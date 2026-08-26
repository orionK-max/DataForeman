import fs from 'fs';
import path from 'path';

function resolveBaseLogDir() {
  const logDir = process.env.LOG_DIR;
  if (logDir) return path.resolve(process.cwd(), logDir);
  const logFile = process.env.LOG_FILE;
  if (logFile) {
    // LOG_FILE like /var/log/<component>/core.log -> base should be /var/log
    const compDir = path.dirname(logFile);
    return path.dirname(compDir);
  }
  return path.resolve(process.cwd(), './logs');
}

function loadComponents() {
  const manifestPath = process.env.LOG_COMPONENTS || path.join(process.cwd(), 'ops', 'logging.components.json');
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.components) ? parsed.components : [];
    const safe = /^[a-z0-9\-]+$/; // allow only simple folder names like 'core', 'web-access'
    return arr
      .filter((c) => c && safe.test(String(c.name)) && c.pattern)
      .map((c) => ({ name: String(c.name), pattern: String(c.pattern) }));
  } catch {
    return [];
  }
}

export async function runRetentionOnce({ logger, app } = {}) {
  const log = logger || console;
  const base = path.resolve(resolveBaseLogDir());
  // Configurable via Capacity > Retention Policy (system_settings key 'logs.file_retention_days');
  // falls back to the LOG_RETENTION_DAYS env var, then a hardcoded default, if not set in the DB
  // (e.g. app.db not available yet, or the setting was never saved).
  let days = Number(process.env.LOG_RETENTION_DAYS) || 14;
  if (app?.db) {
    try {
      const { rows } = await app.db.query(
        `SELECT value FROM system_settings WHERE key = $1`,
        ['logs.file_retention_days']
      );
      const configured = Number(rows[0]?.value);
      if (Number.isFinite(configured) && configured > 0) days = configured;
    } catch {}
  }
  days = Math.max(0, days);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const components = loadComponents();
  let removed = 0;
  // Some components share a physical directory (e.g. postgres/tsdb both log to
  // /var/log/postgresql, distinguished only by filename prefix) — dedupe so we
  // don't scan the same directory twice per run.
  const seenDirs = new Set();
  for (const { name, pattern } of components) {
    // Prefer the directory encoded in the component's log pattern (matches the
    // actual container mount path, e.g. postgres -> /var/log/postgresql, not
    // /var/log/postgres) — falling back to base/name only if the pattern isn't
    // an absolute path.
    const patternDir = path.dirname(pattern);
    const dir = path.isAbsolute(patternDir) ? path.resolve(patternDir) : path.resolve(base, name);
    // Bound to LOG_DIR: skip if outside base (defensive)
    const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
    if (!dir.startsWith(baseWithSep)) continue;
    if (seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    let items = [];
    try {
      items = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of items) {
      const full = path.join(dir, f);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      // keep today's active file (e.g., core.log) regardless of mtime; evaluate rotated ones
      const isActive = /\.log$/.test(f) && !/\.\d+$/.test(f) && !/-\d{4}-\d{2}-\d{2}\.log$/.test(f);
      if (isActive) continue;
      if (st.mtimeMs < cutoff) {
        try {
          fs.unlinkSync(full);
          removed++;
        } catch {}
      }
    }
  }
  log.info?.(`log-retention: removed ${removed} files older than ${days}d from ${components.length} components under ${base}`) ||
    log.log?.(`log-retention: removed ${removed} files older than ${days}d from ${components.length} components under ${base}`);
}

export function startRetentionScheduler(logger, app) {
  // Run at startup and then hourly
  runRetentionOnce({ logger, app }).catch(() => {});
  const hourMs = 60 * 60 * 1000;
  setInterval(() => {
    runRetentionOnce({ logger, app }).catch(() => {});
  }, hourMs).unref?.();
}
