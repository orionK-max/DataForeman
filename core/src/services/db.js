import fp from 'fastify-plugin';
import pkg from 'pg';

const { Pool } = pkg;

export const dbPlugin = fp(async (app) => {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool(
    connectionString
      ? { connectionString, statement_timeout: 5000 } // 5s timeout for main DB queries
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || 'postgres',
          database: process.env.PGDATABASE || 'dataforeman',
          statement_timeout: 5000, // 5s timeout for main DB queries
        }
  );

  app.decorate('db', pool);
  app.addHook('onClose', async () => {
    await pool.end();
  });
});
