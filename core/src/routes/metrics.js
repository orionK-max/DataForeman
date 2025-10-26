import fastifyMetrics from 'fastify-metrics';

export async function metricsRoutes(app) {
  await app.register(fastifyMetrics, { endpoint: '/' });
}
