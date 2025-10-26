import fp from 'fastify-plugin';

export const auditPlugin = fp(async (app) => {
  app.decorate('audit', async (event, { actor, meta } = {}) => {
    app.log.info({ event, actor, meta }, 'audit');
    try {
      if (app.db) {
        await app.db.query('insert into audit_log(event, actor, meta) values ($1,$2,$3)', [
          String(event),
          actor || null,
          meta ? JSON.stringify(meta) : null,
        ]);
      }
    } catch (e) {
      app.log.debug({ err: e }, 'failed to persist audit');
    }
  });

  app.addHook('onResponse', async (req, reply) => {
    const actor = req.user?.sub || 'anonymous';
    const meta = {
      method: req.method,
      url: req.url,
      status: reply.statusCode,
      ip: req.ip,
    };
    await app.audit('http_request', { actor, meta });
  });
});
