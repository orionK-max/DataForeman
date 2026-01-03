/**
 * Admin routes for flow configuration
 * Requires flows.config:update permission
 */

import fs from 'fs/promises';
import path from 'path';
import cleanupFlowLogs from '../../jobs/log-cleanup-job.js';

export default async function adminFlowsRoutes(app, options) {
  const log = app.log.child({ module: 'admin-flows-routes' });

  // Permission check middleware
  app.addHook('preHandler', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Check flows.config:update permission
    const canUpdate = await app.permissions.can(userId, 'flows.config', 'update');
    if (!canUpdate) {
      return reply.code(403).send({ error: 'Forbidden - flows.config:update permission required' });
    }
  });

  /**
   * GET /admin/flows/allowed-paths
   * Returns list of allowed filesystem paths for flow scripts
   */
  app.get('/allowed-paths', async (req, reply) => {
    try {
      const allowedPaths = process.env.FLOW_ALLOWED_PATHS || '';
      const paths = allowedPaths
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      return {
        paths,
        source: 'environment',
        editable: false // Currently env-var based, not editable at runtime
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to get allowed paths');
      return reply.code(500).send({ error: 'Failed to retrieve allowed paths' });
    }
  });

  /**
   * POST /admin/flows/allowed-paths
   * Add a new allowed path (requires restart to take effect)
   * Body: { path: string }
   */
  app.post('/allowed-paths', async (req, reply) => {
    try {
      const { path: newPath } = req.body;

      if (!newPath || typeof newPath !== 'string') {
        return reply.code(400).send({ error: 'path is required and must be a string' });
      }

      // Validate path
      if (newPath.includes('..')) {
        return reply.code(400).send({ error: 'Path cannot contain ..' });
      }

      if (!path.isAbsolute(newPath)) {
        return reply.code(400).send({ error: 'Path must be absolute' });
      }

      // Check if path exists (optional warning)
      let exists = false;
      try {
        const stat = await fs.stat(newPath);
        exists = stat.isDirectory();
      } catch (err) {
        // Path doesn't exist, that's okay
      }

      return reply.code(501).send({
        error: 'Not implemented - FLOW_ALLOWED_PATHS is currently environment-based',
        message: 'To add this path, update FLOW_ALLOWED_PATHS in docker compose.yml or .env file',
        suggestedPath: newPath,
        pathExists: exists,
        note: 'Runtime path management will be implemented in a future version'
      });
    } catch (error) {
      log.error({ err: error }, 'Failed to add allowed path');
      return reply.code(500).send({ error: 'Failed to add allowed path' });
    }
  });

  /**
   * DELETE /admin/flows/allowed-paths/:path
   * Remove an allowed path (requires restart to take effect)
   */
  app.delete('/allowed-paths/:path', async (req, reply) => {
    try {
      const pathToRemove = decodeURIComponent(req.params.path);

      return reply.code(501).send({
        error: 'Not implemented - FLOW_ALLOWED_PATHS is currently environment-based',
        message: 'To remove this path, update FLOW_ALLOWED_PATHS in docker compose.yml or .env file',
        pathToRemove,
        note: 'Runtime path management will be implemented in a future version'
      });
    } catch (error) {
      log.error({ err: error }, 'Failed to remove allowed path');
      return reply.code(500).send({ error: 'Failed to remove allowed path' });
    }
  });

  /**
   * GET /admin/flows/config
   * Returns current flow studio configuration
   */
  app.get('/config', async (req, reply) => {
    try {
      return {
        allowedPaths: (process.env.FLOW_ALLOWED_PATHS || '').split(',').map(p => p.trim()).filter(p => p),
        scriptTimeout: {
          default: 10000,
          max: 60000
        },
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        source: 'environment'
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to get flow config');
      return reply.code(500).send({ error: 'Failed to retrieve flow configuration' });
    }
  });

  /**
   * POST /admin/flows/cleanup-logs
   * Manually trigger flow log cleanup job
   * Deletes logs older than retention period for all flows with logging enabled
   */
  app.post('/cleanup-logs', async (req, reply) => {
    try {
      log.info('Manual flow log cleanup triggered');
      const result = await cleanupFlowLogs(app.db);
      return result;
    } catch (error) {
      log.error({ err: error }, 'Failed to run log cleanup');
      return reply.code(500).send({ error: 'Failed to run log cleanup' });
    }
  });
}
