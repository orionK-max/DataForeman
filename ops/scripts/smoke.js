import { getLogger } from '../lib/logger.js';
const log = getLogger();
const CORE = process.env.CORE_URL || 'http://localhost:3000';

async function main() {
  const health = await fetch(`${CORE}/health`).then((r) => r.json());
  log.info('health', { health });
  const login = await fetch(`${CORE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'password' }),
  }).then((r) => r.json());
  log.info('login', { status: login.role ? 'ok' : 'failed' });
}

main().catch((e) => { log.error('smoke_failed', { error: String(e?.message||e) }); process.exit(1); });
