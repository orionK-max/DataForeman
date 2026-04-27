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
function rotateCopyTruncate(dir, baseName) {
  const label = getPeriodLabel();
  const current = path.join(dir, `${baseName}.current`);
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

function signal(container, signal) {
  try { child_process.execSync(`docker compose exec -T ${container} sh -lc 'kill -s ${signal} 1 || true'`, { stdio: 'ignore' }); } catch {}
}

function signalNodeByPattern(container, signal, pattern) {
  const cmd = `docker compose exec -T ${container} sh -lc "(pkill -${signal} -f '${pattern}' || killall -s ${signal} node || true)"`;
  try { child_process.execSync(cmd, { stdio: 'ignore' }); } catch {}
}

function main() {
  const base = resolveBase();
  // Symlink rotation (process reopens file on SIGHUP/USR1):
  const symlinkMap = [
    { dir: path.join(base, 'core'), name: 'core' },
    { dir: path.join(base, 'front'), name: 'access' },
    { dir: path.join(base, 'front'), name: 'error' },
    { dir: path.join(base, 'ops'), name: 'ops' },
    { dir: path.join(base, 'connectivity'), name: 'connectivity' },
    { dir: path.join(base, 'ingestor'), name: 'ingestor' },
  ];
  for (const m of symlinkMap) rotateSymlink(m.dir, m.name);

  // Copy-truncate rotation (process keeps fd open, no restart needed):
  rotateCopyTruncate(path.join(base, 'nats'), 'nats');
  rotateCopyTruncate(path.join(base, 'broker'), 'broker');

  // Signal processes to reopen:
  // Core: signal node process (not PID 1 shell) so pino can reopen
  signalNodeByPattern('core', 'HUP', 'node .*src/server.js');
  // Nginx (web) supports USR1 for reopen
  signal('web', 'USR1');
  // Connectivity: signal node process so pino can reopen
  signalNodeByPattern('connectivity', 'HUP', 'node .*index-.*.mjs');
  // Ingestor: signal node process to reopen
  // Updated to reflect renamed simple-ingestor -> ingestor; keep simple-ingestor for backward compat during transition
  signalNodeByPattern('ingestor', 'HUP', 'node .*src/(index|simple-ingestor|ingestor)\.mjs');
  // Ops logs are appended by short-lived processes; nothing to signal
}

if (import.meta.url === `file://${process.argv[1]}`) main();
