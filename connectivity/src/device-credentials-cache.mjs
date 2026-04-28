/**
 * MQTT Device Credentials Cache
 * Maintains in-memory cache of device credentials for fast message filtering
 */

export class DeviceCredentialsCache {
  constructor(log) {
    this.log = log.child({ module: 'device-credentials-cache' });
    this.cache = new Map(); // username -> { id, enabled, timeout_seconds, lastSeen }
    this.cacheById = new Map(); // id -> username (for quick ID lookups)
    this.authFailures = new Map(); // username -> { lastFailedAttempt, failureCount }
  }

  /**
   * Initialize cache from core API
   */
  async loadFromCore(coreUrl) {
    try {
      const response = await fetch(`${coreUrl}/api/mqtt/device-credentials`);
      if (!response.ok) {
        throw new Error(`Failed to fetch credentials: ${response.statusText}`);
      }

      const data = await response.json();
      const credentials = data.credentials || [];

      this.cache.clear();
      this.cacheById.clear();
      for (const cred of credentials) {
        this.cache.set(cred.username, {
          id: cred.id,
          enabled: cred.enabled,
          timeout_seconds: cred.timeout_seconds || 600,
          lastSeen: null // Will be updated when messages arrive
        });
        this.cacheById.set(cred.id, cred.username);
      }

      this.log.info({ credentialCount: credentials.length }, 'Loaded device credentials from core');
      return credentials.length;
    } catch (err) {
      this.log.error({ err }, 'Failed to load device credentials from core');
      throw err;
    }
  }

  /**
   * Handle NATS credential update event
   */
  handleCredentialUpdate(event) {
    const { action, credential } = event;

    switch (action) {
      case 'create':
      case 'update':
        this.cache.set(credential.username, {
          id: credential.id,
          enabled: credential.enabled,
          timeout_seconds: credential.timeout_seconds || 600,
          lastSeen: this.cache.get(credential.username)?.lastSeen || null
        });
        this.cacheById.set(credential.id, credential.username);
        this.log.debug({ username: credential.username, action }, 'Updated credential in cache');
        break;

      case 'delete':
        this.cache.delete(credential.username);
        this.cacheById.delete(credential.id);
        this.authFailures.delete(credential.username);
        this.log.debug({ username: credential.username, action }, 'Removed credential from cache');
        break;

      default:
        this.log.warn({ action }, 'Unknown credential update action');
    }
  }

  /**
   * Check if message should be processed based on credential status
   * Returns { allow: boolean, reason?: string }
   */
  checkMessage(username) {
    const cred = this.cache.get(username);

    if (!cred) {
      // No credential exists - allow if in anonymous mode (handled by auth webhook)
      return { allow: true, reason: 'no_credential' };
    }

    if (!cred.enabled) {
      return { allow: false, reason: 'disabled' };
    }

    return { allow: true };
  }

  /**
   * Update last seen timestamp for a username or ID
   */
  updateLastSeen(usernameOrId) {
    // Check if it's an ID (UUID format)
    let username = usernameOrId;
    if (typeof usernameOrId === 'string' && usernameOrId.includes('-')) {
      username = this.cacheById.get(usernameOrId);
      if (!username) {
        this.log.warn({ id: usernameOrId }, 'Cannot update lastSeen: credential ID not found');
        return;
      }
    }

    const cred = this.cache.get(username);
    if (cred) {
      cred.lastSeen = new Date();
    }
  }

  /**
   * Get status by credential ID
   */
  getStatusById(credentialId) {
    const username = this.cacheById.get(credentialId);
    if (!username) return null;
    return this.getStatus(username);
  }

  /**
   * Record authentication failure
   */
  recordAuthFailure(username) {
    const existing = this.authFailures.get(username);
    this.authFailures.set(username, {
      lastFailedAttempt: new Date(),
      failureCount: (existing?.failureCount || 0) + 1
    });
    this.log.warn({ username }, 'Recorded authentication failure');
  }

  /**
   * Clear authentication failure record
   */
  clearAuthFailure(username) {
    this.authFailures.delete(username);
  }

  /**
   * Get all device statuses for API endpoint
   */
  getAllStatuses() {
    const statuses = [];

    for (const [username, cred] of this.cache.entries()) {
      const authFailure = this.authFailures.get(username);
      statuses.push({
        username,
        enabled: cred.enabled,
        timeout_seconds: cred.timeout_seconds,
        lastSeen: cred.lastSeen,
        authFailure: authFailure ? {
          lastFailedAttempt: authFailure.lastFailedAttempt,
          failureCount: authFailure.failureCount
        } : null
      });
    }

    return statuses;
  }

  /**
   * Get status for a specific username
   */
  getStatus(username) {
    const cred = this.cache.get(username);
    if (!cred) return null;

    const authFailure = this.authFailures.get(username);
    return {
      username,
      enabled: cred.enabled,
      timeout_seconds: cred.timeout_seconds,
      lastSeen: cred.lastSeen,
      authFailure: authFailure ? {
        lastFailedAttempt: authFailure.lastFailedAttempt,
        failureCount: authFailure.failureCount
      } : null
    };
  }
}
