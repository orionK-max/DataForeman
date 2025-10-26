export async function jobsRoutes(app) {
  // Single authz hook for all /jobs* endpoints
  app.addHook('preHandler', async (req, reply) => {
    const url = req.raw?.url || req.url || '';
    // Check for both /jobs and /api/jobs to handle different prefix configurations
    if (!url.startsWith('/jobs') && !url.includes('/jobs')) return; // ignore other routes
    const userId = req.user?.sub;
    
    // Determine required operation based on HTTP method
    const method = req.method;
    let operation = 'read';
    if (method === 'POST') operation = 'create';
    else if (method === 'PUT' || method === 'PATCH') operation = 'update';
    else if (method === 'DELETE') operation = 'delete';
    
    if (!userId || !(await app.permissions.can(userId, 'jobs', operation))) {
      return reply.code(403).send({ error: 'forbidden', feature: 'jobs', operation });
    }
  });

  app.get('/jobs', async (req, reply) => {
    const limit = Number(req.query?.limit || 100);
    app.log.info({ route: 'GET /jobs', limit }, 'jobs route start');
    try {
      const rows = await app.jobs.list({ limit });
      app.log.debug({ route: 'GET /jobs', count: rows.length }, 'jobs route success');
      return { items: rows };
    } catch (e) {
      app.log.error({ err: e, route: 'GET /jobs' }, 'jobs route error');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // Temporary diagnostics (can be removed later)
  app.get('/jobs/_ping', async () => ({ ok: true, ts: new Date().toISOString() }));


  app.post('/jobs', async (req, reply) => {
    const body = req.body || {};
    const type = String(body.type || '').trim();
    app.log.info({ route: 'POST /jobs', type }, 'jobs route start');
    if (!type) return reply.code(400).send({ error: 'missing type' });
    try {
      const params = (body.params && typeof body.params === 'object') ? body.params : {};
      const job = await app.jobs.enqueue(type, params, {});
      app.log.info({ route: 'POST /jobs', job: job.id, type: job.type }, 'jobs route success');
      return job;
    } catch (e) {
      app.log.error({ err: e, route: 'POST /jobs' }, 'jobs route error');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  app.get('/jobs/:id', async (req, reply) => {
    const id = req.params.id;
    app.log.debug({ route: 'GET /jobs/:id', id }, 'jobs route start');
    try {
      const job = await app.jobs.get(id);
      if (!job) return reply.code(404).send({ error: 'not_found' });
      return job;
    } catch (e) {
      app.log.error({ err: e, route: 'GET /jobs/:id', id }, 'jobs route error');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  app.delete('/jobs/:id', async (req, reply) => {
    const id = req.params.id;
    app.log.info({ route: 'DELETE /jobs/:id', id }, 'jobs delete start');
    try {
      const deleted = await app.jobs.remove(id);
      if (!deleted) return reply.code(404).send({ error: 'not_found_or_running' });
      return deleted;
    } catch (e) {
      app.log.error({ err: e, route: 'DELETE /jobs/:id', id }, 'jobs delete error');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  app.post('/jobs/:id/cancel', async (req, reply) => {
    const id = req.params.id;
    app.log.info({ route: 'POST /jobs/:id/cancel', id }, 'jobs route start');
    try {
      const job = await app.jobs.requestCancel(id);
      if (!job) return reply.code(404).send({ error: 'not_found_or_not_cancellable' });
      app.log.info({ route: 'POST /jobs/:id/cancel', id }, 'jobs route success');
      return job;
    } catch (e) {
      app.log.error({ err: e, route: 'POST /jobs/:id/cancel', id }, 'jobs route error');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  app.get('/jobs/metrics', async (req, reply) => {
    app.log.debug({ route: 'GET /jobs/metrics' }, 'jobs metrics start');
    try {
      const m = await app.jobs.metrics();
      return { metrics: m, ts: new Date().toISOString() };
    } catch (e) {
      app.log.error({ err: e, route: 'GET /jobs/metrics' }, 'jobs metrics error');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
}
