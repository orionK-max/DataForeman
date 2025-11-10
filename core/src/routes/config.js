export async function configRoutes(app) {
  // Ensure plain key/value system_settings table exists (separate from connection_configs)
  try {
    await app.db.query(`create table if not exists system_settings (
      key   text primary key,
      value jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )`);
  } catch {}
  app.get('/', async () => {
    try {
      const { rows } = await app.db.query('select key, value from system_settings order by key asc');
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      return obj;
    } catch {
      return {};
    }
  });

  app.post('/', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'configuration', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = req.body || {};
    try {
      await app.db.query('create table if not exists system_settings (key text primary key, value jsonb not null default \'{}\'::jsonb, updated_at timestamptz not null default now())');
      const changedKeys = Object.keys(body);
      for (const [k, v] of Object.entries(body)) {
        // Store as JSONB consistently; pass serialized JSON and cast to ::jsonb
        const json = JSON.stringify(v);
        await app.db.query(
          'insert into system_settings(key, value) values ($1, $2::jsonb) on conflict(key) do update set value = excluded.value, updated_at = now()',
          [k, json]
        );
      }
      // Broadcast a config change event so other services can react live (e.g., connectivity tuning)
      try {
        const msg = { schema: 'config.changed@v1', ts: new Date().toISOString(), keys: changedKeys, values: body };
        if (app.nats?.healthy?.() === true) app.nats.publish('df.config.changed.v1', msg);
      } catch {}
      // If historian.* or system_metrics.* keys were updated, re-apply TSDB policies
      try {
        if (Object.keys(body).some((k) => k.startsWith('historian.') || k.startsWith('system_metrics.')) && typeof app.applyTsdbPolicies === 'function') {
          await app.applyTsdbPolicies();
        }
      } catch {}
      return { ok: true };
    } catch (e) {
      app.log.error({ err: e }, 'failed to save config');
      return reply.code(500).send({ error: 'failed to save' });
    }
  });
}
