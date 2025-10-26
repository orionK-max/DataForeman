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
      .map((c) => String(c.name))
      .filter((n) => Boolean(n) && safe.test(n));
  } catch {
    return [];
  }
}

export function runRetentionOnce({ logger } = {}) {
  const log = logger || console;
  const base = path.resolve(resolveBaseLogDir());
  const days = Math.max(0, Number(process.env.LOG_RETENTION_DAYS || 14));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const components = loadComponents();
  let removed = 0;
  for (const name of components) {
    const dir = path.resolve(base, name);
    // Bound to LOG_DIR: skip if outside base (defensive)
    const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
    if (!dir.startsWith(baseWithSep)) continue;
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

export function startRetentionScheduler(logger) {
  // Run at startup and then hourly
  try { runRetentionOnce({ logger }); } catch {}
  const hourMs = 60 * 60 * 1000;
  setInterval(() => {
    try { runRetentionOnce({ logger }); } catch {}
  }, hourMs).unref?.();
}
