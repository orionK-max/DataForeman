export async function healthRoutes(app) {
  app.get('/', async () => ({ status: 'ok' }));
  app.get('/live', async () => ({ live: true }));
  app.get('/ready', async () => ({ ready: true }));
}
