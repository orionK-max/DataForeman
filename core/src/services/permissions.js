/**
 * Permission Service
 * Manages user-based feature permissions with CRUD operations
 */

import fp from 'fastify-plugin';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const permissionsPlugin = fp(async (app, opts) => {
  // In-memory cache: userId -> { permissions: Map<feature, operations>, timestamp }
  const cache = new Map();

  /**
   * Load user permissions from database
   * @param {number} userId - User ID
   * @returns {Promise<Map<string, Set<string>>>} Map of feature -> Set of operations
   */
  async function loadUserPermissions(userId) {
    const { rows } = await app.db.query(
      `SELECT feature, can_create, can_read, can_update, can_delete
       FROM user_permissions
       WHERE user_id = $1`,
      [userId]
    );

    const permissions = new Map();
    for (const row of rows) {
      const operations = new Set();
      if (row.can_create) operations.add('create');
      if (row.can_read) operations.add('read');
      if (row.can_update) operations.add('update');
      if (row.can_delete) operations.add('delete');
      permissions.set(row.feature, operations);
    }

    return permissions;
  }

  /**
   * Get user permissions (with caching)
   * @param {number} userId - User ID
   * @returns {Promise<Map<string, Set<string>>>} Map of feature -> Set of operations
   */
  async function getUserPermissions(userId) {
    const cached = cache.get(userId);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return cached.permissions;
    }

    const permissions = await loadUserPermissions(userId);
    cache.set(userId, { permissions, timestamp: now });
    return permissions;
  }

  /**
   * Check if user has permission for a specific feature and operation
   * @param {number} userId - User ID
   * @param {string} feature - Feature name (e.g., 'dashboards', 'connectivity.devices')
   * @param {string} operation - Operation name ('create', 'read', 'update', 'delete')
   * @returns {Promise<boolean>} True if user has permission
   */
  async function can(userId, feature, operation) {
    if (!userId || !feature || !operation) {
      return false;
    }

    const permissions = await getUserPermissions(userId);
    const ops = permissions.get(feature);
    return ops ? ops.has(operation) : false;
  }

  /**
   * Check if user has permission for multiple features/operations
   * @param {number} userId - User ID
   * @param {Array<{feature: string, operation: string}>} checks - Array of permission checks
   * @returns {Promise<boolean>} True if user has ALL permissions
   */
  async function canAll(userId, checks) {
    for (const { feature, operation } of checks) {
      if (!await can(userId, feature, operation)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if user has permission for ANY of the features/operations
   * @param {number} userId - User ID
   * @param {Array<{feature: string, operation: string}>} checks - Array of permission checks
   * @returns {Promise<boolean>} True if user has ANY permission
   */
  async function canAny(userId, checks) {
    for (const { feature, operation } of checks) {
      if (await can(userId, feature, operation)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all features user has access to (with any operation)
   * @param {number} userId - User ID
   * @returns {Promise<Array<string>>} Array of feature names
   */
  async function getUserFeatures(userId) {
    const permissions = await getUserPermissions(userId);
    return Array.from(permissions.keys());
  }

  /**
   * Get all operations user can perform on a feature
   * @param {number} userId - User ID
   * @param {string} feature - Feature name
   * @returns {Promise<Array<string>>} Array of operation names
   */
  async function getFeatureOperations(userId, feature) {
    const permissions = await getUserPermissions(userId);
    const ops = permissions.get(feature);
    return ops ? Array.from(ops) : [];
  }

  /**
   * Invalidate cache for a specific user or all users
   * @param {number} [userId] - User ID to invalidate, or undefined to clear all
   */
  function invalidateCache(userId) {
    if (userId !== undefined) {
      cache.delete(userId);
    } else {
      cache.clear();
    }
  }

  /**
   * Create Fastify preHandler middleware for permission check
   * @param {string} feature - Feature name
   * @param {string} operation - Operation name
   * @returns {Function} Fastify preHandler function
   */
  function requirePermission(feature, operation) {
    return async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const hasPermission = await can(userId, feature, operation);
      if (!hasPermission) {
        return reply.code(403).send({ 
          error: 'Forbidden', 
          message: `Permission denied: ${feature}.${operation}` 
        });
      }
    };
  }

  // Decorate Fastify instance with permissions API
  app.decorate('permissions', {
    can,
    canAll,
    canAny,
    getUserFeatures,
    getFeatureOperations,
    invalidateCache,
    requirePermission,
  });

  app.log.info('permissions: plugin registered');
});
