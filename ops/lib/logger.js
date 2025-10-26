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

function ensureDirSync(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function openOpsStream() {
  const base = resolveBaseLogDir();
  const dir = path.join(base, 'ops');
  ensureDirSync(dir);
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `ops-${today}.log`);
  return fs.createWriteStream(file, { flags: 'a', mode: 0o644 });
}

const stream = openOpsStream();

function write(level, msg, meta) {
  const line = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(meta && typeof meta === 'object' ? meta : {}),
  };
  try {
    stream.write(JSON.stringify(line) + '\n');
  } catch {}
}

export function getLogger() {
  return {
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    debug: (msg, meta) => write('debug', msg, meta),
    log: (msg, meta) => write('info', msg, meta),
  };
}
