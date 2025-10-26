#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { getLogger } from './lib/logger.js';

const logDir = process.env.LOG_DIR || './logs';
const manifest = process.env.LOG_COMPONENTS || './ops/logging.components.json';

function modeStr(mode) {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

const base = statSafe(logDir);
console.log('base:', logDir, base ? modeStr(base.mode) : 'missing');

// Ensure ops log exists with a heartbeat entry
try {
  const ops = getLogger();
  ops.info('ops.check-logs-dirs:run', { base: logDir });
} catch {}

try {
  const raw = fs.readFileSync(manifest, 'utf8');
  const parsed = JSON.parse(raw);
  const components = Array.isArray(parsed?.components) ? parsed.components : [];
  for (const c of components) {
    const dir = path.join(logDir, c.name);
    const st = statSafe(dir);
    console.log('component:', c.name, st ? modeStr(st.mode) : 'missing');
  }
} catch (e) {
  console.log('manifest not readable:', manifest);
}
