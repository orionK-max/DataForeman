import fs from 'fs';
import path from 'path';

function safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  } catch {}
  try {
    fs.chmodSync(dir, 0o755);
  } catch {}
}

export function ensureLoggingDirsSync() {
  const logDir = process.env.LOG_DIR || './logs';
  // Base logs dir
  safeMkdir(logDir);

  // Ensure directory for LOG_FILE, if set
  const filePattern = process.env.LOG_FILE;
  if (filePattern) {
    try {
      const fileDir = path.dirname(filePattern.replace('%DATE%', 'today'));
      safeMkdir(fileDir);
    } catch {}
  }

  // From manifest: create per-component subdirs
  const manifestPath = process.env.LOG_COMPONENTS || path.join(process.cwd(), 'ops', 'logging.components.json');
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    const components = Array.isArray(parsed?.components) ? parsed.components : [];
    for (const c of components) {
      if (!c?.name) continue;
      const dir = path.join(logDir, String(c.name));
      safeMkdir(dir);
    }
  } catch {
    // Manifest optional; ignore if missing or invalid
  }
}
