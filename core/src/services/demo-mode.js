/**
 * Demo Mode Service
 * 
 * Automatically creates and manages unique demo users for public demonstrations.
 * 
 * Features:
 * - Creates unique demo user for each visitor (demo_XXXXX format)
 * - Provides granular permissions: can create dashboards/charts, but read-only for connections
 * - Auto-cleanup based on inactivity (deletes user and all their data)
 * - Generates random credentials displayed on login page
 * 
 * Environment Variables:
 * - DEMO_MODE: Enable demo mode (1 or true)
 * - DEMO_INACTIVE_MINUTES: Minutes before cleanup (default: 60)
 * - DEMO_PASSWORD_PREFIX: Optional prefix for demo passwords (default: Demo)
 */

import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { FEATURES } from '../constants/features.js';

const DEMO_MODE_ENABLED = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';
const DEMO_INACTIVE_MINUTES = parseInt(process.env.DEMO_INACTIVE_MINUTES || '60', 10);
const DEMO_PASSWORD_PREFIX = process.env.DEMO_PASSWORD_PREFIX || 'Demo';

// Demo user permissions: can create/manage their own dashboards, charts, and flows
// but only read access to connections
const DEMO_PERMISSIONS = {
  [FEATURES.DASHBOARDS]: { create: true, read: true, update: true, delete: true },
  [FEATURES.CHART_COMPOSER]: { create: true, read: true, update: true, delete: true },
  [FEATURES.FLOWS]: { create: true, read: true, update: true, delete: true },
  [FEATURES.CONNECTIVITY_DEVICES]: { create: false, read: true, update: false, delete: false },
  [FEATURES.CONNECTIVITY_TAGS]: { create: false, read: true, update: false, delete: false },
  [FEATURES.CONNECTIVITY_POLL_GROUPS]: { create: false, read: true, update: false, delete: false },
  [FEATURES.CONNECTIVITY_UNITS]: { create: false, read: true, update: false, delete: false },
  [FEATURES.DIAGNOSTIC_SYSTEM]: { create: false, read: true, update: false, delete: false },
  [FEATURES.DIAGNOSTIC_CAPACITY]: { create: false, read: true, update: false, delete: false },
  [FEATURES.DIAGNOSTIC_LOGS]: { create: false, read: false, update: false, delete: false },
  [FEATURES.DIAGNOSTIC_NETWORK]: { create: false, read: true, update: false, delete: false },
};

/**
 * Generate random demo username
 */
function generateDemoUsername() {
  const randomId = randomBytes(4).toString('hex').toUpperCase();
  return `demo_${randomId}`;
}

/**
 * Generate random password
 */
function generateDemoPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const randomPart = Array.from(randomBytes(8))
    .map(b => chars[b % chars.length])
    .join('');
  return `${DEMO_PASSWORD_PREFIX}${randomPart}`;
}

/**
 * Create a new demo user with unique credentials
 */
async function createDemoUser(app) {
  const username = generateDemoUsername();
  const password = generateDemoPassword();
  const email = `${username}@demo.local`;
  const displayName = `Demo User ${username.split('_')[1]}`;

  app.log.info({ username, email }, 'demo-mode: creating new demo user');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // Create user
  const { rows: userRows } = await app.db.query(
    'INSERT INTO users (email, display_name, is_active) VALUES ($1, $2, true) RETURNING id',
    [email, displayName]
  );
  const userId = userRows[0].id;

  // Create auth identity
  await app.db.query(
    'INSERT INTO auth_identities (user_id, provider, provider_user_id, secret_hash) VALUES ($1, $2, $3, $4)',
    [userId, 'local', email, passwordHash]
  );

  // Assign viewer role (for JWT token compatibility)
  const { rows: roleRows } = await app.db.query(
    'SELECT id FROM roles WHERE name = $1',
    ['viewer']
  );
  if (roleRows.length > 0) {
    await app.db.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, roleRows[0].id]
    );
  }

  // Grant demo-specific permissions
  for (const [feature, perms] of Object.entries(DEMO_PERMISSIONS)) {
    await app.db.query(
      `INSERT INTO user_permissions (user_id, feature, can_create, can_read, can_update, can_delete)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, feature) DO UPDATE SET
         can_create = EXCLUDED.can_create,
         can_read = EXCLUDED.can_read,
         can_update = EXCLUDED.can_update,
         can_delete = EXCLUDED.can_delete`,
      [userId, feature, perms.create, perms.read, perms.update, perms.delete]
    );
  }

  // Update last activity
  await app.db.query(
    'UPDATE auth_identities SET last_login_at = now() WHERE user_id = $1',
    [userId]
  );

  app.log.info({ userId, username, email }, 'demo-mode: created demo user successfully');

  return {
    userId,
    username,
    email,
    password,
    displayName,
  };
}

/**
 * Clean up inactive demo users and all their data
 */
async function cleanupInactiveDemoUsers(app) {
  if (!DEMO_MODE_ENABLED) return;

  try {
    const inactiveThreshold = new Date(Date.now() - DEMO_INACTIVE_MINUTES * 60 * 1000);

    // Find inactive demo users
    const { rows: inactiveUsers } = await app.db.query(
      `SELECT u.id, u.email, ai.last_login_at
       FROM users u
       JOIN auth_identities ai ON u.id = ai.user_id
       WHERE u.email LIKE 'demo_%@demo.local'
         AND (ai.last_login_at IS NULL OR ai.last_login_at < $1)`,
      [inactiveThreshold]
    );

    if (inactiveUsers.length === 0) {
      return;
    }

    app.log.info(
      { count: inactiveUsers.length, inactiveMinutes: DEMO_INACTIVE_MINUTES },
      'demo-mode: cleaning up inactive demo users'
    );

    for (const user of inactiveUsers) {
      const { id: demoUserId, email } = user;

      app.log.info({ userId: demoUserId, email }, 'demo-mode: deleting inactive demo user');

      // Delete user (cascade will handle auth_identities, user_roles, user_permissions, sessions)
      // Also need to delete user-created content (dashboards, charts, folders)
      await app.db.query('BEGIN');
      
      try {
        // Delete user's dashboard folders
        await app.db.query('DELETE FROM dashboard_folders WHERE user_id = $1', [demoUserId]);

        // Delete user's dashboards
        await app.db.query('DELETE FROM dashboard_configs WHERE user_id = $1', [demoUserId]);

        // Delete user's chart folders
        await app.db.query('DELETE FROM chart_folders WHERE user_id = $1', [demoUserId]);

        // Delete user's charts
        await app.db.query('DELETE FROM chart_configs WHERE user_id = $1', [demoUserId]);

        // Delete user record (cascade handles auth_identities, user_roles, user_permissions, sessions)
        await app.db.query('DELETE FROM users WHERE id = $1', [demoUserId]);

        await app.db.query('COMMIT');
        
        app.log.info({ userId: demoUserId, email }, 'demo-mode: deleted inactive demo user and all data');
      } catch (err) {
        await app.db.query('ROLLBACK');
        throw err;
      }
    }
  } catch (err) {
    app.log.error({ err }, 'demo-mode: failed to cleanup inactive demo users');
  }
}

/**
 * Initialize demo mode system
 */
export async function initDemoMode(app) {
  if (!DEMO_MODE_ENABLED) {
    app.log.info('demo-mode: disabled');
    return;
  }

  app.log.info(
    {
      inactiveMinutes: DEMO_INACTIVE_MINUTES,
      passwordPrefix: DEMO_PASSWORD_PREFIX,
    },
    'demo-mode: enabled - unique users will be created per visitor'
  );

  // Start cleanup interval (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    cleanupInactiveDemoUsers(app).catch((err) => {
      app.log.error({ err }, 'demo-mode: cleanup interval error');
    });
  }, 5 * 60 * 1000);

  // Clean up on shutdown
  const shutdown = () => {
    clearInterval(cleanupInterval);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/**
 * Create a new demo user and return credentials
 * Called by the /api/auth/demo-credentials endpoint
 */
export async function createNewDemoUser(app) {
  if (!DEMO_MODE_ENABLED) {
    throw new Error('Demo mode is not enabled');
  }

  return await createDemoUser(app);
}

/**
 * Get demo mode status
 */
export async function getDemoInfo() {
  return {
    enabled: DEMO_MODE_ENABLED,
  };
}

/**
 * Check if demo mode is enabled
 */
export function isDemoModeEnabled() {
  return DEMO_MODE_ENABLED;
}
