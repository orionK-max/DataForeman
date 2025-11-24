import fp from 'fastify-plugin';
import { Pool } from 'pg';

export const tsdbPlugin = fp(async function (app) {
  const host = process.env.TSDB_HOST || 'tsdb';
  const port = Number(process.env.TSDB_PORT || 5432);
  const user = process.env.TSDB_USER || 'tsdb';
  const password = process.env.TSDB_PASSWORD || 'tsdb';
  const database = process.env.TSDB_DATABASE || 'telemetry';

  const pool = new Pool({ 
    host, 
    port, 
    user, 
    password, 
    database,
    statement_timeout: 30000, // 30s timeout for TSDB queries (historical data can be slow)
  });
  
  app.decorate('tsdb', {
    query: (text, params) => pool.query(text, params),
    pool,
  });

  app.addHook('onClose', async () => {
    try { await pool.end(); } catch {}
  });
});
