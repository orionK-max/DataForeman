import fp from 'fastify-plugin';

// Periodically republish saved connectivity connections to NATS so drivers can recover after restarts
export const connectivityBootstrap = fp(async (app, opts = {}) => {
  const intervalMs = Math.max(10_000, Math.min(10 * 60_000, Number(process.env.CONNECTIVITY_REPUBLISH_MS || 60_000)));

  async function loadSaved() {
    try {
      const { rows } = await app.db.query(
        `select id, name, type, enabled, config_data
         from connections
         where deleted_at is null
         order by name asc`
      );
      return rows.map((r) => ({ 
        id: r.id, 
        name: r.name, 
        type: r.type,
        enabled: r.enabled !== false,
        ...(r.config_data || {}) 
      })).filter((c) => c && c.id);
    } catch (e) {
      app.log.error({ err: e }, 'connectivity: failed to load saved connections');
      return [];
    }
  }

  async function republishAll(reason = 'startup') {
    if (!app.nats?.healthy()) {
      app.log.warn({ reason }, 'connectivity: NATS not healthy; skip republish');
      return;
    }
    const items = await loadSaved();
    for (const conn of items) {
      // Do not republish disabled connections
      if (conn.enabled === false) continue;
      try {
        app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn,
        });
      } catch (e) {
        app.log.warn({ err: e, id: conn.id }, 'connectivity: failed to republish saved connection');
      }
    }
    app.log.info({ count: items.length, reason }, 'connectivity: republished saved connections');
  }

  // Expose helper for other modules/routes
  app.decorate('connectivityRepublishAll', republishAll);

  // Kick off once on ready (after nats/db plugins)
  app.addHook('onReady', async () => {
    try { await republishAll('onReady'); } catch {}
  });

  // Periodic reconcile to heal restarted connectivity workers
  const timer = setInterval(() => {
    republishAll('interval').catch(() => {});
  }, intervalMs);
  timer.unref?.();

  // Allow external trigger via SIGHUP
  process.on('SIGHUP', () => { republishAll('sighup').catch(() => {}); });

  app.addHook('onClose', async () => { try { clearInterval(timer); } catch {} });
});

export default connectivityBootstrap;
