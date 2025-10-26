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

function appendLine(obj) {
  const base = resolveBase();
  const dir = path.join(base, 'ops');
  ensureDir(dir);
  const file = path.join(dir, `ops-${getPeriodLabel()}.log`);
  const rec = { time: new Date().toISOString(), level: 'info', ...obj };
  const line = JSON.stringify(rec) + '\n';
  try { 
    fs.appendFileSync(file, line, { mode: 0o644 });
    // Also write to stdout for docker logs
    process.stdout.write(line);
  } catch {}
}

function appendHeartbeat() {
  appendLine({ msg: 'rotator.heartbeat' });
}

function appendRotateEvent(ok, err) {
  appendLine({ msg: 'rotator.rotate', ok: !!ok, error: err ? String(err) : undefined });
}

function msUntilNextBoundary() {
  const minutes = Math.max(1, Number(process.env.LOG_ROTATE_PERIOD_MINUTES || 1440));
  if (minutes >= 1440) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    return next.getTime() - now.getTime();
  }
  const nowMs = Date.now();
  const periodMs = minutes * 60 * 1000;
  const next = nowMs - (nowMs % periodMs) + periodMs;
  return next - nowMs;
}

function runRotationNow() {
  try {
    child_process.execSync('node /app/ops/rotate-logs.js', { stdio: 'ignore' });
    appendRotateEvent(true);
  } catch (e) {
    appendRotateEvent(false, e?.message || 'error');
  }
}

function schedulePeriodicRotation() {
  const schedule = () => {
    runRotationNow();
    setTimeout(schedule, msUntilNextBoundary());
  };
  setTimeout(schedule, msUntilNextBoundary());
}

function main() {
  // Run a rotation once on start
  runRotationNow();
  // Start heartbeat interval (default: 5 minutes)
  const ms = Number(process.env.ROTATOR_HEARTBEAT_MS || 5 * 60 * 1000);
  appendHeartbeat();
  setInterval(appendHeartbeat, Math.max(15_000, ms));
  // Schedule rotation at the next period boundary
  schedulePeriodicRotation();
  // Keep process alive
  process.stdin.resume();
}

main();
