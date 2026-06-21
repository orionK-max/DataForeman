#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

function getPeriodLabel(d = new Date()) {
  const minutes = Math.max(1, Number(process.env.LOG_ROTATE_PERIOD_MINUTES || 1440));
  if (minutes >= 1440) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  // Sub-daily bucket label: YYYY-MM-DD_HHMM (start of bucket)
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

function resolveBase() {
  const logDir = process.env.LOG_DIR;
  if (logDir) return path.resolve(process.cwd(), logDir);
  const logFile = process.env.LOG_FILE;
  if (logFile) return path.dirname(path.dirname(path.resolve(process.cwd(), logFile)));
  return path.resolve(process.cwd(), 'logs');
}

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }

function rotateSymlink(dir, baseName) {
  // dir: /var/log/<component>, baseName: e.g., 'core' or 'access' or 'error'
  const label = getPeriodLabel();
  const current = path.join(dir, `${baseName}.current`);
  const dated = path.join(dir, `${baseName}-${label}.log`);
  ensureDir(dir);
  if (!fs.existsSync(dated)) {
    fs.closeSync(fs.openSync(dated, 'a')); // touch
  }
  try { fs.chmodSync(dated, 0o666); } catch {}
  try { fs.unlinkSync(current); } catch {}
  fs.symlinkSync(path.basename(dated), current);
  return { current, dated };
}

function copyTruncate(file) {
  try { fs.truncateSync(file, 0); } catch {}
}

// Rotate by copying current content to a dated file, then truncating the original.
// The process keeps its file descriptor open on the same inode — no restart needed.
// Appends to the dated file in case rotation runs more than once in the same period.
// filename: override the source file name (default: `${baseName}.current`).
function rotateCopyTruncate(dir, baseName, filename) {
  const label = getPeriodLabel();
  const current = path.join(dir, filename || `${baseName}.current`);
  const dated = path.join(dir, `${baseName}-${label}.log`);
  ensureDir(dir);
  if (!fs.existsSync(current)) {
    fs.closeSync(fs.openSync(current, 'a')); // ensure file exists for the process
    return { current, dated: null };
  }
  try {
    const st = fs.statSync(current);
    if (st.size > 0) {
      const content = fs.readFileSync(current);
      fs.appendFileSync(dated, content);
      try { fs.chmodSync(dated, 0o666); } catch {}
    }
    fs.truncateSync(current, 0);
  } catch {}
  return { current, dated };
}

// Uses docker exec with the default compose container naming (dataforeman-{service}-1).
// Requires docker-cli in this container (ops/Dockerfile: apk add docker-cli).
function signal(container, sig) {
  const name = `dataforeman-${container}-1`;
  try { child_process.execSync(`docker exec ${name} sh -c 'kill -s ${sig} 1 || true'`, { stdio: 'ignore' }); } catch {}
}

function signalNodeByPattern(container, sig, pattern) {
  const name = `dataforeman-${container}-1`;
  const cmd = `docker exec ${name} sh -c "(pkill -${sig} -f '${pattern}' || true)"`;
  try { child_process.execSync(cmd, { stdio: 'ignore' }); } catch {}
}

function main() {
  const base = resolveBase();

  // --- Symlink rotation + SIGHUP (process re-opens the symlink path on signal) ---
  // Only for services whose Node process calls fileDest.reopen() on SIGHUP (pino).
  const symlinkMap = [
    { dir: path.join(base, 'core'),      name: 'core' },
    { dir: path.join(base, 'ops'),       name: 'ops' },
    { dir: path.join(base, 'ingestor'),  name: 'ingestor' },
  ];
  for (const m of symlinkMap) rotateSymlink(m.dir, m.name);

  // --- Copy-truncate (process keeps fd open with O_APPEND; truncate-in-place is safe) ---
  // nats/broker: already copy-truncate (no signal possible)
  rotateCopyTruncate(path.join(base, 'nats'),   'nats');
  rotateCopyTruncate(path.join(base, 'broker'), 'broker');

  // front/nginx: writes directly to access.log / error.log (not *.current symlinks).
  // nginx uses O_APPEND so truncating in-place is safe; no signal needed.
  rotateCopyTruncate(path.join(base, 'front'), 'access', 'access.log');
  rotateCopyTruncate(path.join(base, 'front'), 'error',  'error.log');

  // connectivity: logs via `tee -a connectivity.current`.
  // tee opened the symlink target at container start and ignores SIGHUP.
  // Strategy: use docker exec to find tee's actual open FD path inside the
  // container, copy+truncate that real file, then re-point the symlink and
  // restart connectivity so the new tee process opens today's dated file.
  rotateConnectivity(path.join(base, 'connectivity'));

  // --- Signal processes to reopen their log file (symlink now points to new dated file) ---
  // Core: pino listens for SIGHUP and calls fileDest.reopen()
  signalNodeByPattern('core',     'HUP', 'node .*src/server.js');
  // Ingestor: pino SIGHUP reopen
  signalNodeByPattern('ingestor', 'HUP', 'node .*src/(index|simple-ingestor|ingestor)\.mjs');
  // Ops logs are written by short-lived processes; nothing to signal.
}

// Rotate connectivity logs.
// tee opens connectivity.current at container start and holds that FD forever.
// We ask docker exec to read tee's /proc fd symlink to find the real file path,
// copy+truncate it in place, then restart the container so the new tee process
// opens today's dated file via the freshly re-pointed symlink.
function rotateConnectivity(dir) {
  const label = getPeriodLabel();
  const dated = path.join(dir, `connectivity-${label}.log`);
  ensureDir(dir);

  // Step 1 — re-point the symlink so the restarted container opens today's file.
  rotateSymlink(dir, 'connectivity');

  // Step 2 — find the actual file tee has open inside the container.
  let realLogPath = null; // absolute path on the HOST
  try {
    // /proc/$(pgrep tee)/fd/1 inside the container resolves to the log file
    const out = child_process.execSync(
      `docker exec dataforeman-connectivity-1 sh -c ` +
      `'readlink /proc/$(pgrep -x tee | head -1)/fd/1 2>/dev/null'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    // out is a container-internal path like /var/log/connectivity/connectivity-2026-06-01.log
    // Map to host path by stripping the /var/log/connectivity prefix and using our dir.
    if (out) {
      const basename = path.basename(out);
      realLogPath = path.join(dir, basename);
    }
  } catch {}

  // Step 3 — copy current content to dated archive, then truncate in place.
  if (realLogPath && fs.existsSync(realLogPath)) {
    try {
      const st = fs.statSync(realLogPath);
      if (st.size > 0) {
        const content = fs.readFileSync(realLogPath);
        fs.appendFileSync(dated, content);
        try { fs.chmodSync(dated, 0o666); } catch {}
      }
      fs.truncateSync(realLogPath, 0);
    } catch {}
  }

  // Step 4 — restart connectivity so tee re-opens via the new symlink.
  // The service has restart: unless-stopped so it comes back automatically.
  try {
    child_process.execSync('docker restart dataforeman-connectivity-1', { stdio: 'ignore' });
  } catch {}
}

if (import.meta.url === `file://${process.argv[1]}`) main();
