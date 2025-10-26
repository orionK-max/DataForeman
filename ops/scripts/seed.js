import pkg from 'pg';
import { getLogger } from '../lib/logger.js';
const { Client } = pkg;
const log = getLogger();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.PGUSER||'postgres'}:${process.env.PGPASSWORD||'postgres'}@${process.env.PGHOST||'localhost'}:${process.env.PGPORT||5432}/${process.env.PGDATABASE||'dataforeman'}`,
  });
  await client.connect();
  await client.query('create table if not exists seeds(id serial primary key, name text)');
  await client.query("insert into seeds(name) values('ok')");
  await client.end();
  log.info('seed_complete');
}

main().catch((e) => { log.error('seed_failed', { error: String(e?.message||e) }); process.exit(1); });
