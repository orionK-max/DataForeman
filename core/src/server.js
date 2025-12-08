import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fp from 'fastify-plugin';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { createWriteStream, readFileSync } from 'fs';
import pino from 'pino';
import { jwtPlugin } from './services/jwt.js';
import { permissionsPlugin } from './services/permissions.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { configRoutes } from './routes/config.js';
import { auditPlugin } from './services/audit.js';
import { diagRoutes } from './routes/diag.js';
import { logsRoutes } from './routes/logs.js';
import { connectivityRoutes } from './routes/connectivity.js';
import { chartComposerRoutes } from './routes/chartComposer.js';
import { jobsRoutes } from './routes/jobs.js';
import { chartsRoutes } from './routes/charts.js';
import { dashboardRoutes } from './routes/dashboards.js';
import { unitsRoutes } from './routes/units.js';
import { folderRoutes } from './routes/folders.js';
import flowRoutes from './routes/flows.js';
import flowLiveDataRoutes from './routes/flow-live-data.js';
import flowResourceRoutes from './routes/flow-resources.js';
import libraryRoutes from './routes/libraries.js';
import adminFlowsRoutes from './routes/admin/flows.js';
import { jobsPlugin } from './services/jobs.js';
import { dbPlugin } from './services/db.js';
import { tsdbPlugin } from './services/tsdb.js';
import { natsPlugin } from './services/nats.js';
import { telemetryIngestPlugin } from './services/telemetry-ingest.js';
import { ensureLoggingDirsSync } from './services/logging-init.js';
import { startRetentionScheduler } from './services/log-retention.js';
import { startFlowLogCleanupScheduler } from './services/flow-log-cleanup.js';
import { ensureAdminPassword } from './services/bootstrap.js';
import { connectivityBootstrap } from './services/connectivity-bootstrap.js';
import { initDemoMode } from './services/demo-mode.js';
import { systemMetricsSampler } from './services/system-metrics-sampler.js';
import { tsdbPoliciesPlugin } from './services/tsdb-policies.js';
import { registerSessionRetention } from './services/session-retention.js';
import { registerAllNodes } from './nodes/index.js';
import { RuntimeStateStore } from './services/runtime-state-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const level = process.env.LOG_LEVEL || 'info';
const consoleEnabled = /^(1|true|yes|on)$/i.test(String(process.env.LOG_CONSOLE || '0'));
const pretty = consoleEnabled
  ? pino.transport({
      target: 'pino-pretty',
      level,
      options: { translateTime: 'SYS:standard', colorize: true },
    })
  : null;
// Write to file and stdout (docker logs)
const filePath = process.env.LOG_FILE || './logs/core/core.current';
const fileDest = pino.destination({ dest: filePath, mkdir: true, sync: false });
process.on('SIGHUP', () => {
  try { fileDest.reopen(); } catch {}
});
const multistreams = [];
if (consoleEnabled && pretty) multistreams.push({ stream: pretty });
multistreams.push({ stream: fileDest });
multistreams.push({ stream: process.stdout }); // Add docker logs
const logger = pino({ level }, pino.multistream(multistreams));
// Confirm log reopen on SIGHUP by emitting a line
process.on('SIGHUP', () => {
  try { logger.info('SIGHUP received: log destination reopened'); } catch {}
});

export async function buildServer() {
  // Ensure log directories exist with open permissions
  ensureLoggingDirsSync();
  const app = Fastify({ logger });
  // App version from core/package.json
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    app.decorate('appVersion', String(pkg.version || '0.0.0'));
  } catch {
    app.decorate('appVersion', String(process.env.APP_VERSION || '0.0.0'));
  }
  // Tolerate empty JSON bodies: if Content-Type is application/json but body is empty, parse as {}
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '' || body === undefined || body === null) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err);
    }
  });
  // Global config for future /logs endpoints: clamp maximum response bytes
  const MAX_BYTES_DEFAULT = 256 * 1024; // 256KB
  const MAX_BYTES_CAP = 5 * 1024 * 1024; // 5MB hard cap
  app.decorate('config', {
    LOG_MAX_RESPONSE_BYTES: Math.min(
      Math.max(0, Number(process.env.LOG_MAX_RESPONSE_BYTES || MAX_BYTES_DEFAULT)),
      MAX_BYTES_CAP
    ),
  });
  // Start log retention cleaner (hourly)
  startRetentionScheduler(app.log);
  
  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet, { global: true });
  await app.register(multipart, { 
    limits: { 
      fileSize: Number(process.env.MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024) // Default: 10MB
    } 
  });

  await app.register(jwtPlugin);
  await app.register(auditPlugin);
  
  // Register RuntimeStateStore for in-memory runtime state (trigger flags, tag cache)
  await app.register(fp(async (app) => {
    const store = new RuntimeStateStore();
    app.decorate('runtimeState', store);
    app.log.info('RuntimeStateStore initialized');
  }));
  
  await app.register(natsPlugin);
  await app.register(dbPlugin);
  await app.register(tsdbPlugin);
  await app.register(permissionsPlugin);
  
  // Register all flow node types (including external libraries)
  // Must be after dbPlugin so we can query enabled libraries
  await registerAllNodes({ db: app.db });
  
  // Start flow log cleanup scheduler after db is available (daily at 2 AM)
  startFlowLogCleanupScheduler(app.log, app.db);
  // Ensure hypertable is created before applying policies
  await app.register(telemetryIngestPlugin);
  await app.register(tsdbPoliciesPlugin);
  await app.register(connectivityBootstrap);
  await app.register(systemMetricsSampler);
  await ensureAdminPassword(app);
  // Initialize demo mode (creates read-only demo user if DEMO_MODE=1)
  await initDemoMode(app);
  // Start session retention purge (purges revoked or expired older than retention window)
  registerSessionRetention(app);

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(metricsRoutes, { prefix: '/metrics' });
  // unified auth routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(configRoutes, { prefix: '/api/config' });
  await app.register(diagRoutes, { prefix: '/api/diag' });
  await app.register(logsRoutes, { prefix: '/api/logs' });
  await app.register(connectivityRoutes, { prefix: '/api/connectivity' });
  await app.register(unitsRoutes, { prefix: '/api/units' });
  await app.register(chartComposerRoutes, { prefix: '/api/historian' }); // API endpoint kept as /historian for backward compatibility
  await app.register(chartsRoutes, { prefix: '/api/charts' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboards' });
  await app.register(folderRoutes, { prefix: '/api' }); // Handles /api/dashboard/folders and /api/chart/folders
  await app.register(flowRoutes); // Flow studio routes
  await app.register(flowLiveDataRoutes); // Flow live data (cached tag values) - no prefix, routes define their own paths
  await app.register(flowResourceRoutes); // Flow resource monitoring - no prefix, routes define their own paths
  await app.register(libraryRoutes); // Node library management - no prefix, routes define their own paths
  await app.register(adminFlowsRoutes, { prefix: '/api/admin/flows' }); // Admin flow configuration
  // Jobs plugin + routes (admin only) – register once then start dispatcher
  await app.register(jobsPlugin); // services.jobs
  await app.register(jobsRoutes, { prefix: '/api' }); // /api/jobs endpoints (admin)
  try { app.jobs.start(); } catch (e) { app.log.error({ err: e }, 'failed to start jobs dispatcher'); }

  // TEMP debug route to list routes
  app.get('/__routes', async () => ({ routes: app.printRoutes() }));

  // Global error handler to surface stack for diagnostics (omit in production)
  app.setErrorHandler((err, req, reply) => {
    app.log.error({ err, url: req.url }, 'unhandled error');
    if (reply.sent) return;
    const expose = process.env.NODE_ENV === 'development';
    reply.code(err.statusCode || 500).send(expose ? { error: err.message, stack: (err.stack||'').split('\n').slice(0,6) } : { error: 'internal_error' });
  });

  app.get('/', async () => ({ ok: true, service: 'dataforeman-core' }));

  return app;
}

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  buildServer()
    .then(async (app) => {
      // Stop orphaned flow sessions on startup
      // (sessions that were active when container stopped/restarted)
      try {
        const { FlowSession } = await import('./services/flow-session.js');
        await FlowSession.stopAllActiveSessions(app);
      } catch (err) {
        app.log.warn({ err }, 'Failed to stop orphaned sessions on startup');
      }
      
      return app.listen({ port, host });
    })
    .catch((err) => {
      logger.error(err, 'Failed to start server');
      process.exit(1);
    });
}
