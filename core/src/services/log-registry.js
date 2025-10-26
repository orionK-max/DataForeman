import fs from 'fs';
import path from 'path';

function resolveBaseLogDir() {
  const logDir = process.env.LOG_DIR;
  if (logDir) return path.resolve(process.cwd(), logDir);
  const logFile = process.env.LOG_FILE;
  if (logFile) {
    const compDir = path.dirname(logFile);
    return path.dirname(compDir);
  }
  return path.resolve(process.cwd(), './logs');
}

function getPeriodLabel(d = new Date()) {
  const minutes = Math.max(1, Number(process.env.LOG_ROTATE_PERIOD_MINUTES || 1440));
  if (minutes >= 1440) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const ms = d.getTime();
  const start = ms - (ms % (minutes * 60 * 1000));
  const t = new Date(start);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}_${hh}${mm}`;
}

function dirOf(p) { try { return path.dirname(p); } catch { return null; } }

const CURRENT_SYMLINK = {
  core: 'core.current',
  nats: 'nats.current',
  ops: 'ops.current',
  connectivity: 'connectivity.current',
  ingestor: 'ingestor.current',
};

function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

export function loadComponents() {
  const manifestPath = process.env.LOG_COMPONENTS || path.join(process.cwd(), 'ops', 'logging.components.json');
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.components) ? parsed.components : [];
    return arr.map((c) => ({ 
      name: String(c.name), 
      pattern: String(c.pattern),
      mergePattern: c.mergePattern ? String(c.mergePattern) : null
    })).filter((c) => c.name && c.pattern);
  } catch {
    return [];
  }
}

export function resolveTodayPath(pattern) {
  const base = resolveBaseLogDir();
  const dateStr = getPeriodLabel();
  const replaced = pattern.replace('%DATE%', dateStr);
  if (!path.isAbsolute(replaced)) {
    return { containerPath: replaced, hostPath: path.join(process.cwd(), replaced) };
  }
  // Map container paths to host ./logs based on known volumes
  const mapping = [
    { container: '/var/log/core', host: path.join(process.cwd(), 'logs/core') },
    { container: '/var/log/front', host: path.join(process.cwd(), 'logs/front') },
    { container: '/var/log/postgresql', host: path.join(process.cwd(), 'logs/postgres') },
    { container: '/var/log/nats', host: path.join(process.cwd(), 'logs/nats') },
    { container: '/var/log/ops', host: path.join(process.cwd(), 'logs/ops') },
  { container: '/var/log/connectivity', host: path.join(process.cwd(), 'logs/connectivity') },
  { container: '/var/log/ingestor', host: path.join(process.cwd(), 'logs/ingestor') },
  ];
  for (const m of mapping) {
    if (replaced.startsWith(m.container)) {
      const rel = replaced.slice(m.container.length + (replaced[m.container.length] === '/' ? 1 : 0));
      return { containerPath: replaced, hostPath: path.join(m.host, rel) };
    }
  }
  // Fallback: treat as host-local path
  return { containerPath: replaced, hostPath: replaced };
}

export function listLogComponents() {
  const comps = loadComponents();
  return comps.map((c) => {
    const { containerPath, hostPath } = resolveTodayPath(c.pattern);
    let hp = hostPath;
    let st = safeStat(hp);
    if (!st) {
      if (c.name === 'postgres' || c.name === 'tsdb') {
        // find latest *-*.csv for postgres/tsdb
        const dir = dirOf(hp);
        try {
          const re = c.name === 'tsdb' ? /^tsdb-\d{4}-\d{2}-\d{2}(?:_\d{4})?\.csv$/i : /^postgres-\d{4}-\d{2}-\d{2}(?:_\d{4})?\.csv$/i;
          const files = fs.readdirSync(dir).filter((f) => re.test(f));
          files.sort((a, b) => b.localeCompare(a));
          if (files.length) {
            hp = path.join(dir, files[0]);
            st = safeStat(hp);
          }
        } catch {}
      } else if (CURRENT_SYMLINK[c.name]) {
        const dir = dirOf(hp);
        const cand = path.join(dir || '', CURRENT_SYMLINK[c.name]);
        st = safeStat(cand);
        if (st) {
          hp = cand;
        }
      }
    }
    return {
      name: c.name,
      containerPath,
      hostPath: hp,
      exists: !!st,
      size: st?.size ?? null,
      mtimeMs: st?.mtimeMs ?? null,
    };
  });
}

export function resolveHostPathByName(name) {
  const comps = loadComponents();
  const found = comps.find((c) => c.name === name);
  if (!found) return null;
  const { hostPath } = resolveTodayPath(found.pattern);
  let hp = hostPath;
  if (fs.existsSync(hp)) {
    try {
      const st = fs.statSync(hp);
      if (st.size > 0) return hp;
    } catch {}
  }
  if (name === 'postgres' || name === 'tsdb') {
    // prefer latest CSV if today is missing; then try legacy .log
    try {
      const dir = dirOf(hp);
      const re = name === 'tsdb' ? /^tsdb-\d{4}-\d{2}-\d{2}(?:_\d{4})?\.csv$/i : /^postgres-\d{4}-\d{2}-\d{2}(?:_\d{4})?\.csv$/i;
      const files = fs.readdirSync(dir).filter((f) => re.test(f));
      files.sort((a, b) => b.localeCompare(a));
      if (files.length) {
        const candidate = path.join(dir, files[0]);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {}
    const alt = hp.replace(/\.csv$/i, '.log');
    if (fs.existsSync(alt)) return alt;
  } else if (CURRENT_SYMLINK[name]) {
    const dir = dirOf(hp);
    const cand = path.join(dir || '', CURRENT_SYMLINK[name]);
    if (fs.existsSync(cand)) {
      try {
        const st = fs.statSync(cand);
        if (st.size > 0) return cand;
      } catch {}
      // Symlink exists but may point to an empty file (fresh rotation). Try latest non-empty.
      try {
        const prefixMap = {
          core: 'core-',
          nats: 'nats-',
          ops: 'ops-',
          connectivity: 'connectivity-',
          ingestor: 'ingestor-',
        };
        const prefix = prefixMap[name];
        if (dir && prefix) {
          const files = fs
            .readdirSync(dir)
            .filter((f) => f.startsWith(prefix))
            .sort((a, b) => b.localeCompare(a));
          for (const f of files) {
            const p = path.join(dir, f);
            try {
              const st2 = fs.statSync(p);
              if (st2.size > 0) return p;
            } catch {}
          }
        }
      } catch {}
      // Fall back to symlink even if empty
      return cand;
    }
    // Symlink missing: try latest non-empty file
    try {
      const prefixMap = {
        core: 'core-',
        nats: 'nats-',
        ops: 'ops-',
        connectivity: 'connectivity-',
        ingestor: 'ingestor-',
      };
      const prefix = prefixMap[name];
      if (dir && prefix) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.startsWith(prefix))
          .sort((a, b) => b.localeCompare(a));
        for (const f of files) {
          const p = path.join(dir, f);
          try {
            const st = fs.statSync(p);
            if (st.size > 0) return p;
          } catch {}
        }
      }
    } catch {}
  }
  return hp;
}
