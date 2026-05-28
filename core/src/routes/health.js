export async function healthRoutes(app) {
  app.get('/', async () => ({ status: 'ok' }));
  app.get('/live', async () => ({ live: true }));
  app.get('/ready', async () => ({ ready: true }));
}

export async function versionRoute(app) {
  // Public endpoint — no auth required
  app.get('/api/version', async () => ({
    version: app.appVersion,
    name: 'DataForeman',
  }));
}
