import { exec } from 'child_process';
import { getLogger } from '../lib/logger.js';
const log = getLogger();
const file = process.argv[2] || 'backup.sql';
const cmd = `psql -h ${process.env.PGHOST||'localhost'} -U ${process.env.PGUSER||'postgres'} -d ${process.env.PGDATABASE||'dataforeman'} < ${file}`;
exec(cmd, { env: process.env, shell: '/bin/sh' }, (err) => {
  if (err) { log.error('restore_failed', { error: String(err?.message||err) }); process.exit(1); }
  log.info('restore_complete', { file });
});
