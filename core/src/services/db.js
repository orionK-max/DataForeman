import fp from 'fastify-plugin';
import pkg from 'pg';

const { Pool } = pkg;

export const dbPlugin = fp(async (app) => {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool(
    connectionString
      ? { connectionString }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || 'postgres',
          database: process.env.PGDATABASE || 'dataforeman',
        }
  );

  app.decorate('db', pool);
  app.addHook('onClose', async () => {
    await pool.end();
  });
});
