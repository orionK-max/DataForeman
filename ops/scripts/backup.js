import { exec } from 'child_process';
import { getLogger } from '../lib/logger.js';
const log = getLogger();

const out = process.argv[2] || 'backup.sql';
const cmd = `pg_dump -h ${process.env.PGHOST||'localhost'} -U ${process.env.PGUSER||'postgres'} -d ${process.env.PGDATABASE||'dataforeman'} > ${out}`;

exec(cmd, { env: process.env, shell: '/bin/sh' }, (err) => {
  if (err) { log.error('backup_failed', { error: String(err?.message||err) }); process.exit(1); }
  log.info('backup_complete', { out });
});
