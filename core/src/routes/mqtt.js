/**
 * MQTT Management Routes
 * Handles MQTT broker authentication, management, and monitoring
 */

/**
 * Parse {{tag_id:N}} tokens from a resolved template and upsert entries
 * into mqtt_publisher_tag_refs for the given publisher.
 */
async function _saveTagRefs(db, publisherId, template) {
  await db.query('DELETE FROM mqtt_publisher_tag_refs WHERE publisher_id = $1', [publisherId]);
  if (!template) return;

  const TOKEN_RE = /\{\{tag_id:(\d+)\}\}/g;
  const seen = new Set();
  let m;
  while ((m = TOKEN_RE.exec(template)) !== null) {
    const tag_id = parseInt(m[1], 10);
    const token_key = `tag_id:${tag_id}`;
    if (seen.has(token_key)) continue;
    seen.add(token_key);

    await db.query(
      `INSERT INTO mqtt_publisher_tag_refs (publisher_id, token_key, tag_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (publisher_id, token_key) DO UPDATE SET tag_id = EXCLUDED.tag_id`,
      [publisherId, token_key, tag_id]
    );
  }
}

export default async function mqttRoutes(app) {
  const db = app.db;
  const tsdb = app.tsdb;
  const log = app.log.child({ mod: 'mqtt-routes' });

  /**
   * Restart the NanoMQ broker, forcing all clients to reconnect and re-authenticate.
   * The broker container must have restart: on-failure set in docker-compose.yml.
   */
  async function restartBroker() {
    const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
    const authHeader = 'Basic ' + Buffer.from('admin:public').toString('base64');
    try {
      await fetch(`${nanoMqUrl}/api/v4/ctrl/restart`, { method: 'POST', headers: { 'Authorization': authHeader } });
      log.info('Broker restart requested to force client re-authentication');
    } catch (e) {
      // Expected — the broker shuts down mid-request
      log.info({ err: e.message }, 'Broker restart in progress (connection drop expected)');
    }
  }

  /**
   * Fetch from NanoMQ HTTP API with a hard timeout so a stuck broker
   * never hangs core indefinitely.
   */
  async function brokerFetch(path, options = {}) {
    const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s hard limit
    try {
      return await fetch(`${nanoMqUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64'),
          ...(options.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // Auth failure tracking cache: username -> { lastFailedAttempt, failureCount }
  const authFailures = new Map();

  // Debounce caches for webhook last_seen updates.
  // Without these, every MQTT message triggers a DB write on the same device row,
  // causing severe row-level lock contention under any meaningful message rate.
  const DEVICE_LAST_SEEN_TTL = 5_000;   // ms — update device last_seen at most once per 5s
  const TOPIC_SEEN_TTL       = 30_000;  // ms — re-upsert a device+topic pair at most once per 30s
  const webhookDeviceTs = new Map();    // clientId   -> last DB-write timestamp (ms)
  const webhookTopicTs  = new Map();    // "cid\0topic" -> last DB-write timestamp (ms)

  // Prune stale debounce entries every minute to prevent unbounded Map growth
  const _webhookDebounceTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, ts] of webhookDeviceTs) if (now - ts > DEVICE_LAST_SEEN_TTL * 4) webhookDeviceTs.delete(k);
    for (const [k, ts] of webhookTopicTs)  if (now - ts > TOPIC_SEEN_TTL * 4)       webhookTopicTs.delete(k);
  }, 60_000);
  if (_webhookDebounceTimer.unref) _webhookDebounceTimer.unref(); // don't block process exit

  /**
   * POST /api/mqtt/auth - Authentication webhook for nanoMQ
   * 
   * nanoMQ calls this endpoint to verify client credentials.
   * No JWT authentication required (webhook from broker).
   * 
   * Authentication flow:
   * 1. Check mqtt_require_auth setting
   * 2. If false (anonymous mode): allow all connections
   * 3. If true (authenticated mode): check device credentials first, then user credentials
   * 
   * Request body format (from nanoMQ):
   * {
   *   "clientid": "client123",
   *   "username": "device_name or user@example.com",
   *   "password": "device_password or user_password"
   * }
   * 
   * Response:
   * - 200: { "result": "allow" } - Authentication successful
   * - 200: { "result": "deny" } - Authentication failed
   */
  app.post('/api/mqtt/auth', {
    config: {
      skipAuth: true // Webhook endpoint - no JWT required
    }
  }, async (req, reply) => {
    const { clientid, username, password } = req.body;

    log.debug({ clientid, username }, 'MQTT auth request');

    try {
      // Always allow the internal DataForeman service (connects from within Docker, no credentials)
      // Client ID pattern: dataforeman-internal-{connection-uuid}-{timestamp}
      if (clientid && clientid.startsWith('dataforeman-internal-')) {
        log.info({ clientid }, 'MQTT auth allowed (internal service)');
        return reply.send({ result: 'allow', is_superuser: true });
      }

      // Check global authentication setting
      const settingResult = await db.query(
        `SELECT value FROM system_settings WHERE key = 'mqtt_require_auth'`
      );
      
      const requireAuth = settingResult.rows.length > 0 
        ? settingResult.rows[0].value === 'true' || settingResult.rows[0].value === true
        : false;

      // Anonymous mode - allow all connections
      if (!requireAuth) {
        log.info({ clientid, username, mode: 'anonymous' }, 'MQTT auth allowed (anonymous mode)');
        return reply.send({ 
          result: 'allow',
          is_superuser: false
        });
      }

      // Authenticated mode - require credentials
      if (!username || !password) {
        log.warn({ clientid, username }, 'MQTT auth failed: missing credentials');
        return reply.code(400).send({ result: 'deny', reason: 'missing_credentials' });
      }

      // Try credential groups first — devices are auto-registered by client_id on success
      const groupResult = await db.query(
        `SELECT id, name, credential_hash, enabled 
         FROM mqtt_credential_groups 
         WHERE username = $1`,
        [username]
      );

      if (groupResult.rows.length > 0) {
        const group = groupResult.rows[0];
        
        if (!group.enabled) {
          log.warn({ username, group_name: group.name }, 'MQTT auth failed: credential group disabled');
          return reply.code(400).send({ result: 'deny', reason: 'device_disabled' });
        }

        // Verify password
        const argon2 = await import('argon2');
        const isValid = await argon2.verify(group.credential_hash, password);

        if (isValid) {
          log.info({ username, group_name: group.name, clientid }, 'MQTT auth successful (device)');
          authFailures.delete(clientid);

          // Auto-register (or update last_seen for) the device by client_id
          if (clientid) {
            try {
              await db.query(
                `INSERT INTO mqtt_devices (client_id, credential_group_id, first_seen, last_seen)
                 VALUES ($1, $2, NOW(), NOW())
                 ON CONFLICT (client_id) DO UPDATE SET
                   credential_group_id = EXCLUDED.credential_group_id,
                   last_seen = NOW(),
                   updated_at = NOW()`,
                [clientid, group.id]
              );
            } catch (regErr) {
              log.warn({ err: regErr, clientid }, 'Failed to auto-register device - continuing');
            }
          }

          return reply.send({ 
            result: 'allow',
            is_superuser: false
          });
        } else {
          log.warn({ username, group_name: group.name, clientid }, 'MQTT auth failed: invalid password');
          authFailures.set(clientid, {
            lastFailedAttempt: new Date(),
            failureCount: (authFailures.get(clientid)?.failureCount || 0) + 1,
            reason: 'invalid_password'
          });
          return reply.code(400).send({ result: 'deny', reason: 'invalid_credentials' });
        }
      }

      // Fallback to user credentials (for DataForeman users connecting via MQTT)
      const userResult = await db.query(
        `SELECT u.id, u.email, ai.secret_hash 
         FROM users u
         JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'local'
         WHERE u.email = $1`,
        [username]
      );

      if (userResult.rows.length === 0) {
        log.warn({ username, clientid }, 'MQTT auth failed: no matching credential group or user');
        authFailures.set(clientid, {
          lastFailedAttempt: new Date(),
          failureCount: (authFailures.get(clientid)?.failureCount || 0) + 1,
          reason: 'not_found'
        });
        return reply.code(400).send({ result: 'deny', reason: 'invalid_credentials' });
      }

      const user = userResult.rows[0];

      // Verify user password
      const argon2 = await import('argon2');
      const isValid = await argon2.verify(user.secret_hash, password);

      if (!isValid) {
        log.warn({ username, clientid }, 'MQTT auth failed: invalid user password');
        authFailures.set(clientid, {
          lastFailedAttempt: new Date(),
          failureCount: (authFailures.get(clientid)?.failureCount || 0) + 1,
          reason: 'invalid_password'
        });
        return reply.code(400).send({ result: 'deny', reason: 'invalid_credentials' });
      }

      // Check if user has MQTT permission
      const hasMqttPermission = await app.permissions.can(user.id, 'mqtt', 'connect') ||
                                await app.permissions.can(user.id, 'mqtt', 'read');
      
      if (!hasMqttPermission) {
        log.warn({ username, clientid }, 'MQTT auth failed: no mqtt permission');
        authFailures.set(clientid, {
          lastFailedAttempt: new Date(),
          failureCount: (authFailures.get(clientid)?.failureCount || 0) + 1,
          reason: 'insufficient_permissions'
        });
        return reply.code(400).send({ result: 'deny', reason: 'insufficient_permissions' });
      }

      log.info({ username, clientid, type: 'user' }, 'MQTT auth successful (user)');
      authFailures.delete(clientid);
      return reply.send({ 
        result: 'allow',
        is_superuser: false
      });

    } catch (err) {
      log.error({ err, username }, 'MQTT auth error');
      return reply.code(500).send({ result: 'deny', reason: 'internal_error' });
    }
  });

  /**
   * POST /api/mqtt/webhook - NanoMQ async webhook (on_message_publish, on_client_connected)
   * No authentication — called by broker internally from Docker network.
   * Unlike acl_req, NanoMQ does NOT block waiting for this response — it is fire-and-forget
   * from the broker side, so core latency/restarts cannot stall NanoMQ's thread pool.
   *
   * on_message_publish payload: { action, from_client_id, from_username, topic, qos, retain, payload, ts }
   * on_client_connected payload: { action, clientid, username, keepalive, proto_ver, ts }
   */
  app.post('/api/mqtt/webhook', { config: { skipAuth: true } }, async (req, reply) => {
    // Reply immediately — DB work below is fire-and-forget
    reply.send({ result: 'ok' });

    const { action, from_client_id, clientid, topic } = req.body || {};

    if (action === 'message_publish') {
      const client = from_client_id;
      if (!client || client.startsWith('dataforeman-internal-') ||
          !topic || topic.startsWith('$SYS/')) return;

      const now = Date.now();
      const topicKey = `${client}\0${topic}`;
      const deviceNeedsUpdate = (now - (webhookDeviceTs.get(client) || 0)) >= DEVICE_LAST_SEEN_TTL;
      const topicNeedsUpdate  = (now - (webhookTopicTs.get(topicKey) || 0)) >= TOPIC_SEEN_TTL;

      if (deviceNeedsUpdate || topicNeedsUpdate) {
        webhookDeviceTs.set(client, now);
        if (topicNeedsUpdate) webhookTopicTs.set(topicKey, now);

        const query = topicNeedsUpdate
          ? `WITH upsert_topic AS (
               INSERT INTO mqtt_device_topics (device_id, topic, first_seen, last_seen)
               SELECT d.id, $2, NOW(), NOW()
               FROM mqtt_devices d
               WHERE d.client_id = $1
               ON CONFLICT (device_id, topic) DO UPDATE SET last_seen = NOW()
             )
             UPDATE mqtt_devices SET last_seen = NOW() WHERE client_id = $1`
          : 'UPDATE mqtt_devices SET last_seen = NOW() WHERE client_id = $1';

        const params = topicNeedsUpdate ? [client, topic] : [client];
        db.query(query, params)
          .catch(err => log.warn({ err, client, topic }, 'webhook: failed to record device topic'));
      }

    } else if (action === 'client_connected') {
      const client = clientid;
      if (!client || client.startsWith('dataforeman-internal-')) return;

      db.query(
        'UPDATE mqtt_devices SET last_seen = NOW() WHERE client_id = $1',
        [client]
      ).catch(err => log.warn({ err, client }, 'webhook: failed to update device last_seen on connect'));
    }
  });

  /**
   * POST /api/mqtt/acl - Legacy ACL endpoint (broker internal, no user auth required)
   * No authentication — called by the broker from Docker network only.
   * Intentionally open: permission checking is handled upstream in /api/mqtt/auth.
   * Kept for backwards compatibility; always returns allow.
   */
  // NOAUTH: broker-internal endpoint — permission enforcement is in /api/mqtt/auth
  app.post('/api/mqtt/acl', { config: { skipAuth: true } }, async (req, reply) => {
    reply.send({ result: 'allow' });
  });

  /**
   * GET /api/mqtt/status - Get broker status
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/status', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const response = await brokerFetch('/api/v4/brokers');

      if (!response.ok) {
        throw new Error(`nanoMQ API returned ${response.status}`);
      }

      const data = await response.json();
      return reply.send(data);

    } catch (err) {
      log.error({ err }, 'Failed to query nanoMQ status');
      return reply.code(503).send({ error: 'broker_unavailable', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/clients - Get connected MQTT clients
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/clients', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const response = await brokerFetch('/api/v4/clients');

      if (!response.ok) {
        throw new Error(`nanoMQ API returned ${response.status}`);
      }

      const data = await response.json();
      return reply.send(data);

    } catch (err) {
      log.error({ err }, 'Failed to query nanoMQ clients');
      return reply.code(503).send({ error: 'broker_unavailable', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/topics - Get active topics
   * Requires 'mqtt:read' permission
   * 
   * Returns topic tree with subscriber information:
   * {
   *   "code": 0,
   *   "data": [
   *     {
   *       "topic": "sensors/temperature",
   *       "clientid": ["client1", "client2"],
   *       "subscriber_count": 2
   *     }
   *   ]
   * }
   */
  app.get('/api/mqtt/topics', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const response = await brokerFetch('/api/v4/topic-tree');

      if (!response.ok) {
        throw new Error(`nanoMQ API returned ${response.status}`);
      }

      const result = await response.json();
      
      // Transform the topic-tree response for easier frontend consumption
      // nanoMQ returns nested arrays, flatten and format them
      if (result.code === 0 && result.data) {
        const topics = [];
        
        // Topic tree is an array of arrays, each sub-array is a level
        for (const level of result.data) {
          for (const node of level) {
            // Skip root node (empty topic)
            if (node.topic === '') continue;
            
            topics.push({
              topic: node.topic,
              clientid: node.clientid || [],
              subscriber_count: (node.clientid || []).length,
              child_count: node.cld_cnt || 0
            });
          }
        }
        
        return reply.send({
          code: 0,
          data: topics
        });
      }
      
      return reply.send(result);

    } catch (err) {
      log.error({ err }, 'Failed to query MQTT topics');
      return reply.code(503).send({ error: 'broker_unavailable', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/clients/:clientId - Disconnect a client
   * Requires 'mqtt:update' permission
   */
  app.delete('/api/mqtt/clients/:clientId', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { clientId } = req.params;

    try {
      const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
      const response = await fetch(`${nanoMqUrl}/api/v4/clients/${clientId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64')
        }
      });

      if (!response.ok) {
        throw new Error(`nanoMQ API returned ${response.status}`);
      }

      log.info({ clientId, userId }, 'MQTT client disconnected');
      return reply.send({ success: true });

    } catch (err) {
      log.error({ err, clientId }, 'Failed to disconnect MQTT client');
      return reply.code(503).send({ error: 'broker_unavailable', message: err.message });
    }
  });

  // =====================================================
  // MQTT Connections Management
  // =====================================================

  /**
   * GET /api/mqtt/connections - List all MQTT connections
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/connections', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.type, c.enabled, c.created_at, c.updated_at,
                mc.broker_host, mc.broker_port, mc.protocol, mc.use_tls
         FROM connections c
         JOIN mqtt_connections mc ON mc.connection_id = c.id
         WHERE c.type = 'mqtt' AND c.deleted_at IS NULL
         ORDER BY c.name`
      );
      
      return reply.send({ connections: rows });
    } catch (err) {
      log.error({ err }, 'Failed to list MQTT connections');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/connections/:id - Get single MQTT connection with details
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/connections/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.type, c.enabled, c.created_at, c.updated_at,
                mc.broker_host, mc.broker_port, mc.protocol, mc.use_tls, mc.tls_verify_cert,
                mc.tls_ca_cert, mc.tls_client_cert, mc.tls_client_key,
                mc.username, mc.client_id_prefix, mc.keep_alive, mc.clean_session,
                mc.reconnect_period, mc.connect_timeout, mc.is_system
         FROM connections c
         JOIN mqtt_connections mc ON mc.connection_id = c.id
         WHERE c.id = $1 AND c.type = 'mqtt' AND c.deleted_at IS NULL`,
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      // Password intentionally excluded from response
      const connection = { ...rows[0] };

      return reply.send({ connection });
    } catch (err) {
      log.error({ err, connectionId: id }, 'Failed to get MQTT connection');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/connections - Create new MQTT connection
   * Requires 'mqtt:create' permission
   */
  app.post('/api/mqtt/connections', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const {
      name,
      enabled = true,
      broker_host,
      broker_port,
      protocol = 'mqtt',
      use_tls = false,
      tls_verify_cert = true,
      tls_ca_cert,
      tls_client_cert,
      tls_client_key,
      username,
      password,
      client_id_prefix = 'dataforeman',
      keep_alive = 60,
      clean_session = true,
      reconnect_period = 5000,
      connect_timeout = 30000
    } = req.body;

    // Validation
    if (!name || !protocol || !broker_host || !broker_port) {
      return reply.code(400).send({ error: 'missing_required_fields' });
    }

    // Prevent using reserved name
    if (name.trim().toLowerCase() === 'mqtt - internal') {
      return reply.code(400).send({ error: 'reserved_name', message: '"MQTT - Internal" is a reserved connection name' });
    }

    try {
      // Start transaction
      await db.query('BEGIN');

      // If a connection with the same name was previously soft-deleted, revive it.
      // The connections table enforces UNIQUE(name) and uses deleted_at for soft deletes,
      // so without this, users cannot recreate a connection after deleting it.
      const reviveResult = await db.query(
        `SELECT id
         FROM connections
         WHERE name = $1 AND type = 'mqtt' AND deleted_at IS NOT NULL
         LIMIT 1`,
        [name]
      );

      let connectionId;
      let revived = false;

      if (reviveResult.rows.length > 0) {
        connectionId = reviveResult.rows[0].id;
        revived = true;

        await db.query(
          `UPDATE connections
           SET enabled = $2, deleted_at = NULL, updated_at = now()
           WHERE id = $1`,
          [connectionId, enabled]
        );

        // Upsert MQTT connection config
        await db.query(
          `INSERT INTO mqtt_connections (
            connection_id, broker_host, broker_port, protocol,
            use_tls, tls_ca_cert, tls_client_cert, tls_client_key, tls_verify_cert,
            username, password, client_id_prefix, keep_alive, clean_session,
            reconnect_period, connect_timeout
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (connection_id)
           DO UPDATE SET
             broker_host = EXCLUDED.broker_host,
             broker_port = EXCLUDED.broker_port,
             protocol = EXCLUDED.protocol,
             use_tls = EXCLUDED.use_tls,
             tls_ca_cert = EXCLUDED.tls_ca_cert,
             tls_client_cert = EXCLUDED.tls_client_cert,
             tls_client_key = EXCLUDED.tls_client_key,
             tls_verify_cert = EXCLUDED.tls_verify_cert,
             username = EXCLUDED.username,
             password = EXCLUDED.password,
             client_id_prefix = EXCLUDED.client_id_prefix,
             keep_alive = EXCLUDED.keep_alive,
             clean_session = EXCLUDED.clean_session,
             reconnect_period = EXCLUDED.reconnect_period,
             connect_timeout = EXCLUDED.connect_timeout,
             updated_at = now()`,
          [
            connectionId, broker_host, broker_port, protocol,
            use_tls, tls_ca_cert, tls_client_cert, tls_client_key, tls_verify_cert,
            username, password, client_id_prefix, keep_alive, clean_session,
            reconnect_period, connect_timeout
          ]
        );
      } else {
        // Create connection entry
        const connResult = await db.query(
          `INSERT INTO connections (name, type, enabled, config_data)
           VALUES ($1, 'mqtt', $2, '{}'::jsonb)
           RETURNING id`,
          [name, enabled]
        );

        connectionId = connResult.rows[0].id;

        // Create MQTT connection config
        await db.query(
          `INSERT INTO mqtt_connections (
            connection_id, broker_host, broker_port, protocol,
            use_tls, tls_ca_cert, tls_client_cert, tls_client_key, tls_verify_cert,
            username, password, client_id_prefix, keep_alive, clean_session,
            reconnect_period, connect_timeout
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            connectionId, broker_host, broker_port, protocol,
            use_tls, tls_ca_cert, tls_client_cert, tls_client_key, tls_verify_cert,
            username, password, client_id_prefix, keep_alive, clean_session,
            reconnect_period, connect_timeout
          ]
        );
      }

      await db.query('COMMIT');

      // Publish config update via NATS
      if (app.nats?.healthy?.() === true) {
        const configData = {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: {
            id: connectionId,
            name,
            type: 'mqtt',
            enabled
          }
        };
        app.nats.publish('df.connectivity.config.v1', configData);
        log.info({ connectionId }, 'Published MQTT connection config to connectivity service');
      }

      log.info({ connectionId, name, userId, revived }, revived ? 'Revived MQTT connection' : 'Created MQTT connection');
      return reply.code(201).send({ id: connectionId });

    } catch (err) {
      await db.query('ROLLBACK');
      log.error({ err, name }, 'Failed to create MQTT connection');
      
      if (err.code === '23505') { // Unique violation
        return reply.code(409).send({ error: 'connection_name_exists' });
      }
      
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/connections/:id - Update MQTT connection
   * Requires 'mqtt:update' permission
   */
  app.put('/api/mqtt/connections/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    
    // Prevent editing the system Internal broker
    const checkResult = await db.query(
      'SELECT name FROM connections WHERE id = $1',
      [id]
    );
    if (checkResult.rows.length > 0 && checkResult.rows[0].name === 'MQTT - Internal') {
      return reply.code(403).send({ error: 'forbidden', message: 'Cannot modify the system Internal broker' });
    }

    const {
      name,
      enabled,
      broker_host,
      broker_port,
      protocol,
      use_tls,
      tls_verify_cert,
      tls_ca_cert,
      tls_client_cert,
      tls_client_key,
      username,
      password,
      client_id_prefix,
      keep_alive,
      clean_session,
      reconnect_period,
      connect_timeout
    } = req.body;

    try {
      // Prevent using reserved name
      if (name !== undefined && name.trim().toLowerCase() === 'mqtt - internal') {
        return reply.code(400).send({ error: 'reserved_name', message: '"MQTT - Internal" is a reserved connection name' });
      }

      await db.query('BEGIN');

      // Update connections table
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        fields.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (enabled !== undefined) {
        fields.push(`enabled = $${paramCount++}`);
        values.push(enabled);
      }

      if (fields.length > 0) {
        values.push(id);
        await db.query(
          `UPDATE connections SET ${fields.join(', ')}, updated_at = now() WHERE id = $${paramCount}`,
          values
        );
      }

      // Update mqtt_connections table
      const mqttFields = [];
      const mqttValues = [];
      paramCount = 1;

      if (broker_host !== undefined) { mqttFields.push(`broker_host = $${paramCount++}`); mqttValues.push(broker_host); }
      if (broker_port !== undefined) { mqttFields.push(`broker_port = $${paramCount++}`); mqttValues.push(broker_port); }
      if (protocol !== undefined) { mqttFields.push(`protocol = $${paramCount++}`); mqttValues.push(protocol); }
      if (use_tls !== undefined) { mqttFields.push(`use_tls = $${paramCount++}`); mqttValues.push(use_tls); }
      if (tls_verify_cert !== undefined) { mqttFields.push(`tls_verify_cert = $${paramCount++}`); mqttValues.push(tls_verify_cert); }
      if (tls_ca_cert !== undefined) { mqttFields.push(`tls_ca_cert = $${paramCount++}`); mqttValues.push(tls_ca_cert); }
      if (tls_client_cert !== undefined) { mqttFields.push(`tls_client_cert = $${paramCount++}`); mqttValues.push(tls_client_cert); }
      if (tls_client_key !== undefined) { mqttFields.push(`tls_client_key = $${paramCount++}`); mqttValues.push(tls_client_key); }
      if (username !== undefined) { mqttFields.push(`username = $${paramCount++}`); mqttValues.push(username); }
      if (password !== undefined) { mqttFields.push(`password = $${paramCount++}`); mqttValues.push(password); }
      if (client_id_prefix !== undefined) { mqttFields.push(`client_id_prefix = $${paramCount++}`); mqttValues.push(client_id_prefix); }
      if (keep_alive !== undefined) { mqttFields.push(`keep_alive = $${paramCount++}`); mqttValues.push(keep_alive); }
      if (clean_session !== undefined) { mqttFields.push(`clean_session = $${paramCount++}`); mqttValues.push(clean_session); }
      if (reconnect_period !== undefined) { mqttFields.push(`reconnect_period = $${paramCount++}`); mqttValues.push(reconnect_period); }
      if (connect_timeout !== undefined) { mqttFields.push(`connect_timeout = $${paramCount++}`); mqttValues.push(connect_timeout); }

      if (mqttFields.length > 0) {
        mqttValues.push(id);
        await db.query(
          `UPDATE mqtt_connections SET ${mqttFields.join(', ')}, updated_at = now() WHERE connection_id = $${paramCount}`,
          mqttValues
        );
      }

      await db.query('COMMIT');

      // Publish config update via NATS
      if (app.nats?.healthy?.() === true) {
        const connData = await db.query('SELECT name, type, enabled FROM connections WHERE id = $1', [id]);
        const configData = {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: {
            id,
            ...connData.rows[0]
          }
        };
        app.nats.publish('df.connectivity.config.v1', configData);
        log.info({ connectionId: id }, 'Published MQTT connection config update to connectivity service');
      }

      log.info({ connectionId: id, userId }, 'Updated MQTT connection');
      return reply.send({ success: true });

    } catch (err) {
      await db.query('ROLLBACK');
      log.error({ err, connectionId: id }, 'Failed to update MQTT connection');
      
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'connection_name_exists' });
      }
      
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/connections/:id - Delete MQTT connection
   * Requires 'mqtt:delete' permission
   */
  app.delete('/api/mqtt/connections/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    // Prevent deleting the system Internal broker
    const checkResult = await db.query(
      'SELECT name FROM connections WHERE id = $1',
      [id]
    );
    if (checkResult.rows.length > 0 && checkResult.rows[0].name === 'MQTT - Internal') {
      return reply.code(403).send({ error: 'forbidden', message: 'Cannot delete the system Internal broker' });
    }

    try {
      // Soft delete
      await db.query(
        `UPDATE connections SET deleted_at = now(), updated_at = now() WHERE id = $1`,
        [id]
      );

      // Publish deletion via NATS
      if (app.nats?.healthy?.() === true) {
        const configData = {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'delete',
          id
        };
        app.nats.publish('df.connectivity.config.v1', configData);
        log.info({ connectionId: id }, 'Published MQTT connection deletion to connectivity service');
      }

      log.info({ connectionId: id, userId }, 'Deleted MQTT connection');
      return reply.send({ success: true });

    } catch (err) {
      log.error({ err, connectionId: id }, 'Failed to delete MQTT connection');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // =====================================================
  // MQTT Subscriptions Management
  // =====================================================

  /**
   * GET /api/mqtt/subscriptions - List subscriptions
   * Query param: connection_id (optional - filters by connection)
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/subscriptions', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { connection_id } = req.query;

    try {
      let query = `
        SELECT s.*, c.name as connection_name, c.type as connection_type
        FROM mqtt_subscriptions s
        JOIN connections c ON c.id = s.connection_id
        WHERE c.deleted_at IS NULL
      `;
      const params = [];

      if (connection_id) {
        query += ` AND s.connection_id = $1`;
        params.push(connection_id);
      }

      query += ` ORDER BY s.topic`;

      const { rows } = await db.query(query, params);
      return reply.send({ subscriptions: rows });
    } catch (err) {
      log.error({ err, connection_id }, 'Failed to list subscriptions');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/subscriptions - Create subscription
   * Requires 'mqtt:create' permission
   */
  app.post('/api/mqtt/subscriptions', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const {
      connection_id,
      topic,
      qos = 0,
      tag_prefix,
      payload_format = 'json',
      value_path,
      timestamp_path,
      quality_path,
      enabled = true
    } = req.body;

    if (!connection_id || !topic) {
      return reply.code(400).send({ error: 'missing_required_fields' });
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO mqtt_subscriptions (
          connection_id, topic, qos, tag_prefix, payload_format,
          value_path, timestamp_path, quality_path, enabled
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [connection_id, topic, qos, tag_prefix, payload_format,
         value_path, timestamp_path, quality_path, enabled]
      );

      const subscriptionId = rows[0].id;

      // Notify connectivity service
      if (app.nats?.healthy?.() === true) {
        const connData = await db.query('SELECT name, type, enabled FROM connections WHERE id = $1', [connection_id]);
        app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: { id: connection_id, ...connData.rows[0] }
        });
      }

      log.info({ subscriptionId, connection_id, topic, userId }, 'Created MQTT subscription');
      return reply.code(201).send({ id: subscriptionId });

    } catch (err) {
      log.error({ err, connection_id, topic }, 'Failed to create subscription');
      
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'subscription_already_exists' });
      }
      
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/subscriptions/:id - Update subscription
   * Requires 'mqtt:update' permission
   */
  app.put('/api/mqtt/subscriptions/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    const { topic, qos, tag_prefix, payload_format, message_buffer_size, value_path, timestamp_path, quality_path, enabled } = req.body;

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (topic !== undefined) { fields.push(`topic = $${paramCount++}`); values.push(topic); }
      if (qos !== undefined) { fields.push(`qos = $${paramCount++}`); values.push(qos); }
      if (tag_prefix !== undefined) { fields.push(`tag_prefix = $${paramCount++}`); values.push(tag_prefix); }
      if (payload_format !== undefined) { fields.push(`payload_format = $${paramCount++}`); values.push(payload_format); }
      if (message_buffer_size !== undefined) { fields.push(`message_buffer_size = $${paramCount++}`); values.push(message_buffer_size); }
      if (value_path !== undefined) { fields.push(`value_path = $${paramCount++}`); values.push(value_path); }
      if (timestamp_path !== undefined) { fields.push(`timestamp_path = $${paramCount++}`); values.push(timestamp_path); }
      if (quality_path !== undefined) { fields.push(`quality_path = $${paramCount++}`); values.push(quality_path); }
      if (enabled !== undefined) { fields.push(`enabled = $${paramCount++}`); values.push(enabled); }

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'no_fields_to_update' });
      }

      values.push(id);
      const result = await db.query(
        `UPDATE mqtt_subscriptions 
         SET ${fields.join(', ')}, updated_at = now() 
         WHERE id = $${paramCount}
         RETURNING connection_id`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'subscription_not_found' });
      }

      // Notify connectivity service
      const connectionId = result.rows[0].connection_id;
      if (app.nats?.healthy?.() === true) {
        // Fetch full connection data to trigger immediate reload
        const connData = await db.query('SELECT name, type, enabled FROM connections WHERE id = $1', [connectionId]);
        const configData = {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: {
            id: connectionId,
            ...connData.rows[0]
          }
        };
        app.nats.publish('df.connectivity.config.v1', configData);
        log.info({ subscriptionId: id, connectionId, configData }, 'Published MQTT subscription update to connectivity service');
      } else {
        log.warn({ subscriptionId: id, natsHealthy: app.nats?.healthy?.() }, 'NATS not healthy, config update not published');
      }

      log.info({ subscriptionId: id, userId }, 'Updated MQTT subscription');
      return reply.send({ success: true });

    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to update subscription');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/subscriptions/:id - Delete subscription
   * Requires 'mqtt:delete' permission
   */
  app.delete('/api/mqtt/subscriptions/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      const result = await db.query(
        `DELETE FROM mqtt_subscriptions WHERE id = $1 RETURNING connection_id`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'subscription_not_found' });
      }

      // Notify connectivity service
      if (app.nats?.healthy?.() === true) {
        const connectionId = result.rows[0].connection_id;
        const connData = await db.query('SELECT name, type, enabled FROM connections WHERE id = $1', [connectionId]);
        app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: { id: connectionId, ...connData.rows[0] }
        });
      }

      log.info({ subscriptionId: id, userId }, 'Deleted MQTT subscription');
      return reply.send({ success: true });

    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to delete subscription');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/subscriptions/:id/messages - Get recent messages for a subscription
   * Returns recent messages from the message buffer
   * Query params: limit (default 50, max 500)
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/subscriptions/:id/messages', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    try {
      // Get subscription details
      const subQuery = `
        SELECT s.id, s.connection_id, s.topic, s.tag_prefix, s.message_buffer_size
        FROM mqtt_subscriptions s
        WHERE s.id = $1
      `;
      const subResult = await db.query(subQuery, [id]);
      
      if (subResult.rows.length === 0) {
        return reply.code(404).send({ error: 'not_found', message: 'Subscription not found' });
      }

      const sub = subResult.rows[0];

      // Query recent messages from buffer
      const dataQuery = `
        SELECT 
          topic,
          payload,
          qos,
          retained,
          received_at
        FROM mqtt_message_buffer
        WHERE subscription_id = $1
        ORDER BY received_at DESC
        LIMIT $2
      `;
      
      const dataResult = await db.query(dataQuery, [id, limit]);

      return reply.send({
        subscription: {
          id: sub.id,
          topic: sub.topic,
          tag_prefix: sub.tag_prefix,
          connection_id: sub.connection_id,
          buffer_size: sub.message_buffer_size
        },
        messages: dataResult.rows.map(row => ({
          topic: row.topic,
          payload: row.payload,
          qos: row.qos,
          retained: row.retained,
          timestamp: row.received_at
        })),
        count: dataResult.rows.length,
        limit
      });
    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to get subscription messages');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/subscriptions/:id/messages - Clear the message buffer for a subscription
   * Requires 'mqtt:update' permission
   */
  app.delete('/api/mqtt/subscriptions/:id/messages', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      await db.query('DELETE FROM mqtt_message_buffer WHERE subscription_id = $1', [id]);
      log.info({ subscriptionId: id, userId }, 'Cleared MQTT message buffer');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to clear message buffer');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/subscriptions/:id/analyze-fields - Analyze messages to detect field paths
   * Examines messages in buffer and returns unique topic+field combinations
   * Requires 'mqtt:read' permission
   */
  app.post('/api/mqtt/subscriptions/:id/analyze-fields', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      // Get subscription details
      const subQuery = `
        SELECT s.id, s.connection_id, s.topic, s.tag_prefix
        FROM mqtt_subscriptions s
        WHERE s.id = $1
      `;
      const subResult = await db.query(subQuery, [id]);
      
      if (subResult.rows.length === 0) {
        return reply.code(404).send({ error: 'not_found', message: 'Subscription not found' });
      }

      const sub = subResult.rows[0];

      // Get all messages from buffer
      const messagesQuery = `
        SELECT topic, payload
        FROM mqtt_message_buffer
        WHERE subscription_id = $1
        ORDER BY received_at DESC
      `;
      const messagesResult = await db.query(messagesQuery, [id]);

      if (messagesResult.rows.length === 0) {
        return reply.send({ 
          subscription: sub,
          combinations: [],
          message: 'No messages in buffer. Wait for messages to arrive or publish test messages.'
        });
      }

      // Analyze messages to extract unique topic+field combinations
      const combinationsMap = new Map();
      
      for (const row of messagesResult.rows) {
        const topic = row.topic;
        const payload = row.payload;

        // Only analyze JSON payloads
        if (typeof payload !== 'object' || payload === null) {
          continue;
        }

        // Extract all field paths from the payload
        const extractFieldPaths = (obj, prefix = '') => {
          for (const [key, value] of Object.entries(obj)) {
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
              // Recurse into nested objects
              extractFieldPaths(value, fieldPath);
            } else {
              // Leaf node - this is a field we can map
              const comboKey = `${topic}|${fieldPath}`;
              if (!combinationsMap.has(comboKey)) {
                // Infer data type from value
                let dataType = 'TEXT';
                if (typeof value === 'boolean') {
                  dataType = 'BOOL';
                } else if (typeof value === 'number') {
                  dataType = Number.isInteger(value) ? 'INT' : 'REAL';
                }

                combinationsMap.set(comboKey, {
                  topic,
                  field_path: fieldPath,
                  data_type: dataType,
                  sample_value: value
                });
              }
            }
          }
        };

        extractFieldPaths(payload);
      }

      const combinations = Array.from(combinationsMap.values());

      return reply.send({
        subscription: sub,
        combinations,
        count: combinations.length,
        messages_analyzed: messagesResult.rows.length
      });

    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to analyze fields');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // =====================================================
  // MQTT Field Mappings
  // =====================================================

  /**
   * POST /api/mqtt/subscriptions/:id/preview-expression - Test a JS expression against the latest buffered message
   * Returns the raw payload and the result of evaluating the expression against it.
   * Requires 'mqtt:read' permission
   */
  app.post('/api/mqtt/subscriptions/:id/preview-expression', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    const { expression, topic } = req.body;

    if (!expression) {
      return reply.code(400).send({ error: 'missing_expression' });
    }

    try {
      // Get the most recent buffered message for this subscription (optionally filtered by topic)
      const params = [id];
      let topicFilter = '';
      if (topic) {
        topicFilter = 'AND topic = $2';
        params.push(topic);
      }

      const { rows } = await db.query(
        `SELECT topic, payload, received_at
         FROM mqtt_message_buffer
         WHERE subscription_id = $1 ${topicFilter}
         ORDER BY received_at DESC
         LIMIT 1`,
        params
      );

      if (rows.length === 0) {
        return reply.send({ error: 'no_messages', message: 'No buffered messages found. Wait for a message to arrive.' });
      }

      // Extract raw payload — driver wraps non-JSON messages as {"_raw": "..."}
      const bufferPayload = rows[0].payload;
      const rawPayload = bufferPayload && typeof bufferPayload === 'object' && '_raw' in bufferPayload
        ? bufferPayload._raw
        : JSON.stringify(bufferPayload);

      // Evaluate expression in a sandboxed Function context
      let result, evalError;
      try {
        // Validate expression is a string and doesn't exceed reasonable length
        if (typeof expression !== 'string' || expression.length > 2000) {
          return reply.code(400).send({ error: 'invalid_expression' });
        }
        // eslint-disable-next-line no-new-func
        result = new Function('payload', `"use strict"; return (${expression});`)(rawPayload);
      } catch (err) {
        evalError = err.message;
      }

      return reply.send({
        input_payload: rawPayload,
        received_at: rows[0].received_at,
        topic: rows[0].topic,
        result: result !== undefined ? String(result) : undefined,
        error: evalError
      });

    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to preview expression');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/field-mappings - List all field mappings
   * Query params: subscription_id (optional - filters by subscription)
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/field-mappings', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { subscription_id } = req.query;

    try {
      let query = `
        SELECT fm.*, s.topic as subscription_topic, c.name as connection_name
        FROM mqtt_field_mappings fm
        JOIN mqtt_subscriptions s ON s.id = fm.subscription_id
        JOIN connections c ON c.id = s.connection_id
        WHERE c.deleted_at IS NULL
      `;
      const params = [];

      if (subscription_id) {
        query += ` AND fm.subscription_id = $1`;
        params.push(subscription_id);
      }

      query += ` ORDER BY fm.created_at DESC`;

      const { rows } = await db.query(query, params);
      return reply.send({ mappings: rows });
    } catch (err) {
      log.error({ err }, 'Failed to list field mappings');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/field-mappings - Create a field mapping
   * Requires 'mqtt:create' permission
   */
  app.post('/api/mqtt/field-mappings', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const {
      subscription_id,
      topic,
      field_path,
      tag_name,
      data_type,
      type_strictness = 'coerce',
      on_failure = 'skip',
      default_value,
      enabled = true,
      value_expression
    } = req.body;

    // field_path is optional for raw mappings (they use value_expression instead)
    if (!subscription_id || !topic || !tag_name || !data_type) {
      return reply.code(400).send({ error: 'missing_required_fields' });
    }
    if (!field_path && !value_expression) {
      return reply.code(400).send({ error: 'missing_required_fields', message: 'Either field_path or value_expression is required' });
    }

    // Raw field mappings use '_raw' as the sentinel field_path
    const resolvedFieldPath = field_path || '_raw';

    try {
      const { rows } = await db.query(
        `INSERT INTO mqtt_field_mappings (
          subscription_id, topic, field_path, tag_name, data_type,
          type_strictness, on_failure, default_value, enabled, value_expression
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [subscription_id, topic, resolvedFieldPath, tag_name, data_type,
         type_strictness, on_failure, default_value, enabled, value_expression || null]
      );

      log.info({ mappingId: rows[0].id, subscription_id, topic, field_path: resolvedFieldPath }, 'Created field mapping');
      return reply.code(201).send({ id: rows[0].id });

    } catch (err) {
      log.error({ err, subscription_id, topic, field_path }, 'Failed to create field mapping');
      
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'mapping_already_exists' });
      }
      
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/field-mappings/:id - Update a field mapping
   * Requires 'mqtt:update' permission
   */
  app.put('/api/mqtt/field-mappings/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    const { data_type, type_strictness, on_failure, default_value, enabled } = req.body;

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (data_type !== undefined) { fields.push(`data_type = $${paramCount++}`); values.push(data_type); }
      if (type_strictness !== undefined) { fields.push(`type_strictness = $${paramCount++}`); values.push(type_strictness); }
      if (on_failure !== undefined) { fields.push(`on_failure = $${paramCount++}`); values.push(on_failure); }
      if (default_value !== undefined) { fields.push(`default_value = $${paramCount++}`); values.push(default_value); }
      if (enabled !== undefined) { fields.push(`enabled = $${paramCount++}`); values.push(enabled); }

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'no_fields_to_update' });
      }

      values.push(id);
      const result = await db.query(
        `UPDATE mqtt_field_mappings 
         SET ${fields.join(', ')}, updated_at = now() 
         WHERE id = $${paramCount}
         RETURNING subscription_id`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'mapping_not_found' });
      }

      // Notify connectivity service to reload mappings
      if (app.nats?.healthy?.() === true) {
        app.nats.publish('df.connectivity.reload-field-mappings.v1', {
          subscription_id: result.rows[0].subscription_id,
          timestamp: new Date().toISOString()
        });
      }

      log.info({ mappingId: id }, 'Updated field mapping');
      return reply.send({ success: true });

    } catch (err) {
      log.error({ err, mappingId: id }, 'Failed to update field mapping');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/field-mappings/:id - Delete a field mapping
   * Requires 'mqtt:delete' permission
   */
  app.delete('/api/mqtt/field-mappings/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      const result = await db.query(
        `DELETE FROM mqtt_field_mappings WHERE id = $1 RETURNING subscription_id`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'mapping_not_found' });
      }

      // Notify connectivity service to reload mappings
      if (app.nats?.healthy?.() === true) {
        app.nats.publish('df.connectivity.reload-field-mappings.v1', {
          subscription_id: result.rows[0].subscription_id,
          timestamp: new Date().toISOString()
        });
      }

      log.info({ mappingId: id }, 'Deleted field mapping');
      return reply.send({ success: true });

    } catch (err) {
      log.error({ err, mappingId: id }, 'Failed to delete field mapping');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/field-mappings/import-csv - Import field mappings from CSV
   * Returns preview data for user to review before creating
   * Requires 'mqtt:create' permission
   */
  app.post('/api/mqtt/field-mappings/import-csv', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { subscription_id, csv_data } = req.body;

    if (!subscription_id || !csv_data) {
      return reply.code(400).send({ error: 'missing_required_fields' });
    }

    try {
      // Parse CSV (simple implementation - assumes comma-separated with header row)
      const lines = csv_data.trim().split('\n');
      if (lines.length < 2) {
        return reply.code(400).send({ error: 'invalid_csv', message: 'CSV must have header and at least one data row' });
      }

      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredFields = ['topic', 'field_path', 'tag_name'];
      const missingFields = requiredFields.filter(f => !header.includes(f));
      
      if (missingFields.length > 0) {
        return reply.code(400).send({ 
          error: 'invalid_csv_header', 
          message: `Missing required columns: ${missingFields.join(', ')}` 
        });
      }

      // Parse rows
      const mappings = [];
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length !== header.length) {
          errors.push({ row: i + 1, error: 'Column count mismatch' });
          continue;
        }

        const mapping = {};
        header.forEach((col, idx) => {
          mapping[col] = values[idx];
        });

        // Validate required fields
        if (!mapping.topic || !mapping.field_path || !mapping.tag_name) {
          errors.push({ row: i + 1, error: 'Missing required field' });
          continue;
        }

        mappings.push({
          subscription_id,
          topic: mapping.topic,
          field_path: mapping.field_path,
          tag_name: mapping.tag_name,
          data_type: mapping.data_type || 'REAL',
          type_strictness: mapping.type_strictness || 'convert',
          on_failure: mapping.on_failure || 'skip',
          default_value: mapping.default_value || null,
          enabled: mapping.enabled !== 'false'
        });
      }

      return reply.send({
        subscription_id,
        mappings,
        total_rows: lines.length - 1,
        valid_rows: mappings.length,
        errors
      });

    } catch (err) {
      log.error({ err, subscription_id }, 'Failed to parse CSV');
      return reply.code(400).send({ error: 'invalid_csv', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/field-mappings/create-tags - Create tags for field mappings
   * Creates tags in tag_metadata and updates mappings with tag_id
   * Requires 'mqtt:create' permission
   */
  app.post('/api/mqtt/field-mappings/create-tags', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { mapping_ids } = req.body;

    if (!mapping_ids || !Array.isArray(mapping_ids) || mapping_ids.length === 0) {
      return reply.code(400).send({ error: 'missing_mapping_ids' });
    }

    try {
      await db.query('BEGIN');

      const results = [];
      const errors = [];

      for (const mappingId of mapping_ids) {
        // Get mapping details
        const { rows: mappingRows } = await db.query(
          `SELECT fm.*, s.connection_id, s.tag_prefix
           FROM mqtt_field_mappings fm
           JOIN mqtt_subscriptions s ON s.id = fm.subscription_id
           WHERE fm.id = $1 AND fm.tag_id IS NULL`,
          [mappingId]
        );

        if (mappingRows.length === 0) {
          errors.push({ mapping_id: mappingId, error: 'Mapping not found or already has tag' });
          continue;
        }

        const mapping = mappingRows[0];

        // Generate tag path: tag_prefix + sanitized_topic + field_path
        const sanitizeTopic = (topic) => {
          return topic.replace(/\./g, '__').replace(/\//g, '.');
        };
        const tagPath = `${mapping.tag_prefix}.${sanitizeTopic(mapping.topic)}.${mapping.field_path}`;

        // Pre-check: reject duplicate tag_name before INSERT (avoid aborting the transaction)
        const { rows: nameRows } = await db.query(
          `SELECT 1 FROM tag_metadata
           WHERE connection_id = $1 AND tag_name = $2
           LIMIT 1`,
          [mapping.connection_id, mapping.tag_name]
        );
        if (nameRows.length > 0) {
          await db.query('DELETE FROM mqtt_field_mappings WHERE id = $1 AND tag_id IS NULL', [mappingId]);
          errors.push({ mapping_id: mappingId,
            error: `Tag name "${mapping.tag_name}" already exists in this connection — choose a different name` });
          continue;
        }

        // Create (or revive) tag
        const desc = `MQTT: ${mapping.topic} -> ${mapping.field_path}`;

        const { rows: existingRows } = await db.query(
          `SELECT tag_id, coalesce(status,'active') as status
           FROM tag_metadata
           WHERE connection_id = $1 AND driver_type = 'MQTT' AND tag_path = $2
           LIMIT 1`,
          [mapping.connection_id, tagPath]
        );

        let tagId = null;

        if (existingRows.length > 0) {
          // Tag path already active — delete orphaned mapping and skip
          await db.query('DELETE FROM mqtt_field_mappings WHERE id = $1 AND tag_id IS NULL', [mappingId]);
          errors.push({ mapping_id: mappingId, error: 'Tag path already exists' });
          continue;
        } else {
          const { rows: tagRows } = await db.query(
            `INSERT INTO tag_metadata (
               connection_id, driver_type, tag_path, tag_name, data_type, 
               is_subscribed, poll_group_id, description
             )
             VALUES ($1, $2, $3, $4, $5, true, 5, $6)
             RETURNING tag_id`,
            [
              mapping.connection_id,
              'MQTT',
              tagPath,
              mapping.tag_name,
              mapping.data_type,
              desc
            ]
          );

          tagId = tagRows[0].tag_id;
        }

        // Update mapping with tag_id
        await db.query(
          `UPDATE mqtt_field_mappings SET tag_id = $1 WHERE id = $2`,
          [tagId, mappingId]
        );

        results.push({
          mapping_id: mappingId,
          tag_id: tagId,
          tag_path: tagPath,
          success: true
        });
      }

      await db.query('COMMIT');

      // Notify connectivity service to reload mappings if any succeeded
      if (results.length > 0 && app.nats?.healthy?.() === true) {
        // Get unique subscription IDs
        const subscriptionIds = await db.query(
          `SELECT DISTINCT subscription_id FROM mqtt_field_mappings WHERE id = ANY($1)`,
          [mapping_ids]
        );
        
        for (const row of subscriptionIds.rows) {
          app.nats.publish('df.connectivity.reload-field-mappings.v1', {
            subscription_id: row.subscription_id,
            timestamp: new Date().toISOString()
          });
        }
      }

      log.info({ created: results.length, errors: errors.length }, 'Created tags for field mappings');
      return reply.send({ results, errors, created: results.length, failed: errors.length });

    } catch (err) {
      await db.query('ROLLBACK');
      log.error({ err, mapping_ids }, 'Failed to create tags');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // =====================================================
  // MQTT Discovery
  // =====================================================

  /**
   * GET /api/mqtt/discovery/sparkplug - List discovered Sparkplug nodes/devices
   * Query param: connection_id (optional)
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/discovery/sparkplug', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { connection_id } = req.query;

    try {
      const query = connection_id
        ? `SELECT * FROM sparkplug_discovery WHERE connection_id = $1 ORDER BY group_id, edge_node_id, device_id`
        : `SELECT * FROM sparkplug_discovery ORDER BY group_id, edge_node_id, device_id`;
      
      const params = connection_id ? [connection_id] : [];
      const { rows } = await db.query(query, params);

      return reply.send({ discoveries: rows });
    } catch (err) {
      log.error({ err }, 'Failed to list Sparkplug discoveries');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // ==================== Publishers ====================

  /**
   * GET /api/mqtt/available-tags
   * Return subscribed tags available for use in publisher template token lookup.
   * Optionally filtered by connection_id.
   */
  app.get('/api/mqtt/available-tags', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { connection_id } = req.query;

    try {
      let query = `
        SELECT tm.tag_id, tm.tag_path, tm.tag_name, tm.data_type, tm.connection_id,
               c.name as connection_name
        FROM tag_metadata tm
        JOIN connections c ON c.id = tm.connection_id
        WHERE tm.is_subscribed = true
          AND c.deleted_at IS NULL
      `;
      const params = [];

      if (connection_id) {
        query += ` AND tm.connection_id = $1`;
        params.push(connection_id);
      }

      query += ` ORDER BY tm.tag_path`;

      const { rows } = await db.query(query, params);
      return reply.send({ tags: rows });
    } catch (err) {
      log.error({ err }, 'Failed to list available tags');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/publishers
   * List all MQTT publishers, optionally filtered by connection
   */
  app.get('/api/mqtt/publishers', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { connection_id } = req.query;

      let query = `
        SELECT p.*, c.name as connection_name, c.type as connection_type
        FROM mqtt_publishers p
        JOIN connections c ON c.id = p.connection_id
        WHERE c.deleted_at IS NULL
      `;
      const params = [];

      if (connection_id) {
        query += ` AND p.connection_id = $1`;
        params.push(connection_id);
      }

      query += ` ORDER BY p.created_at DESC`;

      const { rows } = await app.db.query(query, params);
      return reply.send({ publishers: rows });
    } catch (err) {
      log.error({ err }, 'Failed to list publishers');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/publishers/:id
   * Get a single publisher with its resolved tag refs.
   */
  app.get('/api/mqtt/publishers/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { id } = req.params;

      const { rows } = await app.db.query(
        `SELECT p.*, c.name as connection_name, c.type as connection_type
         FROM mqtt_publishers p
         JOIN connections c ON c.id = p.connection_id
         WHERE p.id = $1 AND c.deleted_at IS NULL`,
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      // Tag refs: resolved {{tag_id:N}} → tag metadata for display decoding
      const { rows: tagRefs } = await app.db.query(
        `SELECT tr.token_key, tr.tag_id, tm.tag_name, tm.tag_path, c.name as connection_name
         FROM mqtt_publisher_tag_refs tr
         LEFT JOIN tag_metadata tm ON tm.tag_id = tr.tag_id
         LEFT JOIN connections c ON c.id = tm.connection_id
         WHERE tr.publisher_id = $1
         ORDER BY tr.token_key`,
        [id]
      );

      // Build display template: replace {{tag_id:N}} → {{ConnName|TagName}} for UI
      let payload_template_display = rows[0].payload_template || '';
      for (const ref of tagRefs) {
        if (ref.tag_id && ref.connection_name) {
          const displayName = ref.tag_name || ref.tag_path || `tag_id:${ref.tag_id}`;
          payload_template_display = payload_template_display.replace(
            new RegExp(`\\{\\{tag_id:${ref.tag_id}\\}\\}`, 'g'),
            `{{${ref.connection_name}|${displayName}}}`
          );
        }
      }

      return reply.send({ publisher: rows[0], payload_template_display, tag_refs: tagRefs });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'Failed to get publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/publishers/resolve-tokens
   * Resolve {{ConnectionName|TagName}} display tokens → {{tag_id:N}} stored tokens.
   * Called by the UI Validate button before saving a publisher.
   *
   * Body: { template: "...{{ConnName|TagName}}..." }
   * Returns: { resolved_template, errors: [{token, error, message}] }
   */
  app.post('/api/mqtt/publishers/resolve-tokens', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { template } = req.body;
    if (!template) return reply.send({ resolved_template: '', errors: [] });

    const DISPLAY_TOKEN_RE = /\{\{([^|{}]+)\|([^|{}]+)\}\}/g;
    const replacements = new Map(); // display key → "{{tag_id:N}}"
    const errors = [];
    const seen = new Set();

    let m;
    DISPLAY_TOKEN_RE.lastIndex = 0;
    while ((m = DISPLAY_TOKEN_RE.exec(template)) !== null) {
      const conn_name = m[1].trim();
      const tag_name = m[2].trim();
      const key = `${conn_name}|${tag_name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 'Internal Tags' is a pseudo-connection (injected client-side, no real DB row).
      // INTERNAL tags are identified by driver_type, not by a connections row.
      let rows;
      if (conn_name === 'Internal Tags') {
        ({ rows } = await db.query(
          `SELECT tm.tag_id
           FROM tag_metadata tm
           WHERE tm.driver_type = 'INTERNAL' AND tm.tag_name = $1`,
          [tag_name]
        ));
      } else {
        ({ rows } = await db.query(
          `SELECT tm.tag_id
           FROM tag_metadata tm
           JOIN connections c ON c.id = tm.connection_id
           WHERE c.name = $1 AND tm.tag_name = $2`,
          [conn_name, tag_name]
        ));
      }

      if (rows.length === 0) {
        errors.push({ token: key, error: 'not_found',
          message: `Tag "${tag_name}" not found in connection "${conn_name}"` });
      } else if (rows.length > 1) {
        errors.push({ token: key, error: 'ambiguous',
          message: `Tag "${tag_name}" in "${conn_name}" matches ${rows.length} tags — rename one to make it unique` });
      } else {
        replacements.set(key, `{{tag_id:${rows[0].tag_id}}}`);
      }
    }

    if (errors.length > 0) {
      return reply.send({ resolved_template: null, errors });
    }

    // Replace all display tokens with ID tokens
    DISPLAY_TOKEN_RE.lastIndex = 0;
    const resolved_template = template.replace(DISPLAY_TOKEN_RE, (match, connName, tagName) => {
      const key = `${connName.trim()}|${tagName.trim()}`;
      return replacements.get(key) || match;
    });

    return reply.send({ resolved_template, errors: [] });
  });

  /**
   * POST /api/mqtt/publishers
   * Create a new MQTT publisher.
   *
   * Body: { connection_id, name, publish_mode, interval_ms, min_interval_ms,
   *         payload_format, payload_template, mqtt_topic, qos, retain, enabled }
   *
   * The route parses payload_template for {{ConnectionName|tag_path}} tokens,
   * resolves each to a tag_id, and stores them in mqtt_publisher_tag_refs.
   */
  app.post('/api/mqtt/publishers', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const {
        connection_id,
        name,
        publish_mode,
        interval_ms,
        min_interval_ms = 500,
        payload_format = 'json',
        payload_template = '',
        mqtt_topic,
        qos = 0,
        retain = false,
        enabled = true,
      } = req.body;

      if (!connection_id || !name || !publish_mode) {
        return reply.code(400).send({ error: 'missing_required_fields' });
      }
      if (!['on_change', 'interval', 'both'].includes(publish_mode)) {
        return reply.code(400).send({ error: 'invalid_publish_mode' });
      }
      if ((publish_mode === 'interval' || publish_mode === 'both') && !interval_ms) {
        return reply.code(400).send({ error: 'interval_required' });
      }

      const { rows } = await app.db.query(
        `INSERT INTO mqtt_publishers
         (connection_id, name, publish_mode, interval_ms, min_interval_ms,
          payload_format, payload_template, mqtt_topic, qos, retain, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [connection_id, name, publish_mode, interval_ms || null, min_interval_ms,
         payload_format, payload_template, mqtt_topic || null, qos, retain, enabled]
      );

      const publisher = rows[0];
      await _saveTagRefs(app.db, publisher.id, payload_template);

      await app.mqttPublisherService?.reload();
      log.info({ publisherId: publisher.id, name }, 'MQTT publisher created');
      return reply.code(201).send({ id: publisher.id });
    } catch (err) {
      log.error({ err }, 'Failed to create publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/publishers/:id
   * Update an existing publisher and re-resolve tag refs from the new template.
   */
  app.put('/api/mqtt/publishers/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { id } = req.params;
      const {
        name,
        publish_mode,
        interval_ms,
        min_interval_ms,
        payload_format,
        payload_template,
        mqtt_topic,
        qos,
        retain,
        enabled,
      } = req.body;

      if (publish_mode && !['on_change', 'interval', 'both'].includes(publish_mode)) {
        return reply.code(400).send({ error: 'invalid_publish_mode' });
      }

      const { rows: existing } = await app.db.query(
        'SELECT id FROM mqtt_publishers WHERE id = $1',
        [id]
      );
      if (existing.length === 0) return reply.code(404).send({ error: 'not_found' });

      await app.db.query(
        `UPDATE mqtt_publishers
         SET name             = COALESCE($1,  name),
             publish_mode     = COALESCE($2,  publish_mode),
             interval_ms      = COALESCE($3,  interval_ms),
             min_interval_ms  = COALESCE($4,  min_interval_ms),
             payload_format   = COALESCE($5,  payload_format),
             payload_template = COALESCE($6,  payload_template),
             mqtt_topic       = COALESCE($7,  mqtt_topic),
             qos              = COALESCE($8,  qos),
             retain           = COALESCE($9,  retain),
             enabled          = COALESCE($10, enabled)
         WHERE id = $11`,
        [name, publish_mode, interval_ms, min_interval_ms, payload_format, payload_template,
         mqtt_topic, qos, retain, enabled, id]
      );

      // Re-resolve tag refs from the (possibly new) template
      if (payload_template !== undefined) {
        await _saveTagRefs(app.db, id, payload_template);
      }

      await app.mqttPublisherService?.reload();
      log.info({ publisherId: id }, 'MQTT publisher updated');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'Failed to update publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/publishers/:id
   */
  app.delete('/api/mqtt/publishers/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { id } = req.params;

      const { rows } = await app.db.query(
        'SELECT id FROM mqtt_publishers WHERE id = $1',
        [id]
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });

      await app.db.query('DELETE FROM mqtt_publishers WHERE id = $1', [id]);

      await app.mqttPublisherService?.reload();
      log.info({ publisherId: id }, 'MQTT publisher deleted');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'Failed to delete publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // =====================================================
  // MQTT Credential Groups (shared username/password; many devices per group)
  // =====================================================

  /**
   * GET /api/mqtt/device-credentials - List credential groups
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/device-credentials', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { rows } = await db.query(
        `SELECT g.id, g.name, g.username, g.enabled, g.timeout_seconds, g.created_at, g.updated_at,
                COUNT(d.id)::int AS device_count
         FROM mqtt_credential_groups g
         LEFT JOIN mqtt_devices d ON d.credential_group_id = g.id
         GROUP BY g.id, g.name, g.username, g.enabled, g.timeout_seconds, g.created_at, g.updated_at
         ORDER BY g.created_at DESC`
      );
      
      return reply.send({ credentials: rows });
    } catch (err) {
      log.error({ err }, 'Failed to list device credentials');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });



  /**
   * POST /api/mqtt/device-credentials - Create credential group
   * Requires 'mqtt:create' permission
   */
  app.post('/api/mqtt/device-credentials', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'create'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { name, username, password, enabled = true, timeout_seconds = 600 } = req.body;

    if (!name || !username) {
      return reply.code(400).send({ error: 'missing_required_fields' });
    }

    if (timeout_seconds <= 0 || timeout_seconds > 86400) {
      return reply.code(400).send({ error: 'invalid_timeout', message: 'timeout_seconds must be between 1 and 86400' });
    }

    try {
      const argon2 = await import('argon2');
      const credential_hash = password ? await argon2.hash(password) : '';

      const { rows } = await db.query(
        `INSERT INTO mqtt_credential_groups (name, username, credential_hash, enabled, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, username, enabled, timeout_seconds, created_at, updated_at`,
        [name, username, credential_hash, enabled, timeout_seconds]
      );

      const credential = rows[0];

      if (app.nats?.healthy?.() === true) {
        app.nats.publish('df.mqtt.credential.updated.v1', {
          schema: 'mqtt.credential.updated@v1',
          ts: new Date().toISOString(),
          action: 'create',
          credential: { id: credential.id, username: credential.username, enabled: credential.enabled }
        });
      }

      log.info({ name, username }, 'Created credential group');
      return reply.code(201).send({ credential });
    } catch (err) {
      log.error({ err, name, username }, 'Failed to create credential group');
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'credential_already_exists' });
      }
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/device-credentials/:id - Update credential group
   * Requires 'mqtt:update' permission
   */
  app.put('/api/mqtt/device-credentials/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    const { name, password, enabled, timeout_seconds } = req.body;

    if (timeout_seconds !== undefined && (timeout_seconds <= 0 || timeout_seconds > 86400)) {
      return reply.code(400).send({ error: 'invalid_timeout', message: 'timeout_seconds must be between 1 and 86400' });
    }

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        fields.push(`name = $${paramCount++}`);
        values.push(name);
      }

      if (password !== undefined) {
        const argon2 = await import('argon2');
        const credential_hash = await argon2.hash(password);
        fields.push(`credential_hash = $${paramCount++}`);
        values.push(credential_hash);
      }

      if (enabled !== undefined) {
        fields.push(`enabled = $${paramCount++}`);
        values.push(enabled);
      }

      if (timeout_seconds !== undefined) {
        fields.push(`timeout_seconds = $${paramCount++}`);
        values.push(timeout_seconds);
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'no_fields_to_update' });
      }

      values.push(id);
      const result = await db.query(
        `UPDATE mqtt_credential_groups
         SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${paramCount}
         RETURNING id, name, username, enabled, timeout_seconds, created_at, updated_at`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'credential_not_found' });
      }

      const credential = result.rows[0];

      // Kick connected devices when the group is disabled OR password changes
      if (enabled === false || password !== undefined) {
        restartBroker().catch(e => log.warn({ err: e }, 'Failed to restart broker after credential change'));
      }

      if (app.nats?.healthy?.() === true) {
        app.nats.publish('df.mqtt.credential.updated.v1', {
          schema: 'mqtt.credential.updated@v1',
          ts: new Date().toISOString(),
          action: 'update',
          credential: { id: credential.id, username: credential.username, enabled: credential.enabled }
        });
      }

      log.info({ credential_id: id, enabled: credential.enabled }, 'Updated credential group');
      return reply.send({ credential });
    } catch (err) {
      log.error({ err, credential_id: id }, 'Failed to update credential group');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/device-credentials/:id - Delete credential group
   * Cascades: disconnects all registered devices, then deletes group + devices.
   * Requires 'mqtt:delete' permission
   */
  app.delete('/api/mqtt/device-credentials/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      // Collect devices registered under this group before deletion
      const { rows: devices } = await db.query(
        'SELECT client_id FROM mqtt_devices WHERE credential_group_id = $1',
        [id]
      );

      const result = await db.query(
        'DELETE FROM mqtt_credential_groups WHERE id = $1 RETURNING name, username',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'credential_not_found' });
      }

      const { name, username } = result.rows[0];

      // Disconnect all registered devices from broker
      try {
        const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
        for (const device of devices) {
          try {
            await fetch(`${nanoMqUrl}/api/v4/clients/${device.client_id}`, {
              method: 'DELETE',
              headers: { 'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64') }
            });
            log.info({ clientid: device.client_id }, 'Disconnected device after group deletion');
          } catch (disconnectErr) {
            log.warn({ err: disconnectErr, clientid: device.client_id }, 'Failed to disconnect device');
          }
        }
      } catch (brokerErr) {
        log.warn({ err: brokerErr }, 'Failed to disconnect devices - broker may be unavailable');
      }

      if (app.nats?.healthy?.() === true) {
        app.nats.publish('df.mqtt.credential.updated.v1', {
          schema: 'mqtt.credential.updated@v1',
          ts: new Date().toISOString(),
          action: 'delete',
          credential: { id, username }
        });
      }

      log.info({ credential_id: id, name, username }, 'Deleted credential group');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, credential_id: id }, 'Failed to delete credential group');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // =====================================================
  // MQTT Devices (auto-registered by client_id on first successful auth)
  // =====================================================

  /**
   * GET /api/mqtt/devices - List all auto-registered devices with status
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/devices', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { rows } = await db.query(
        `SELECT d.id, d.client_id, d.display_name, d.credential_group_id, d.enabled,
                d.first_seen, d.last_seen, d.created_at, d.updated_at,
                g.name AS group_name, g.username, g.timeout_seconds, g.enabled AS group_enabled,
                COALESCE(
                  json_agg(
                    json_build_object('topic', t.topic, 'last_seen', t.last_seen)
                    ORDER BY t.last_seen DESC
                  ) FILTER (WHERE t.topic IS NOT NULL),
                  '[]'
                ) AS topics
         FROM mqtt_devices d
         JOIN mqtt_credential_groups g ON g.id = d.credential_group_id
         LEFT JOIN mqtt_device_topics t ON t.device_id = d.id
         GROUP BY d.id, d.client_id, d.display_name, d.credential_group_id, d.enabled,
                  d.first_seen, d.last_seen, d.created_at, d.updated_at,
                  g.name, g.username, g.timeout_seconds, g.enabled
         ORDER BY g.name, d.client_id`
      );

      const now = new Date();
      const devices = rows.map(d => {
        const authFailure = authFailures.get(d.client_id);
        let status, lastSeenAgo = null;

        if (!d.enabled || !d.group_enabled) {
          status = 'disabled';
        } else if (authFailure && (now - authFailure.lastFailedAttempt) < 5 * 60 * 1000) {
          status = 'auth_failed';
        } else if (!d.last_seen) {
          status = 'ready';
        } else {
          const lastSeenMs = now - new Date(d.last_seen);
          lastSeenAgo = Math.floor(lastSeenMs / 1000);
          status = lastSeenAgo > d.timeout_seconds ? 'not_active' : 'connected';
        }

        return {
          id: d.id,
          client_id: d.client_id,
          display_name: d.display_name,
          credential_group_id: d.credential_group_id,
          group_name: d.group_name,
          username: d.username,
          enabled: d.enabled,
          first_seen: d.first_seen,
          last_seen: d.last_seen,
          status,
          lastSeenAgo,
          topics: d.topics || [],
          authFailure: authFailure ? {
            lastFailedAttempt: authFailure.lastFailedAttempt,
            failureCount: authFailure.failureCount,
            reason: authFailure.reason
          } : null
        };
      });

      return reply.send({ devices });
    } catch (err) {
      log.error({ err }, 'Failed to list devices');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/devices/:id - Update device (display_name, enabled)
   * Requires 'mqtt:update' permission
   */
  app.put('/api/mqtt/devices/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    const { display_name, enabled } = req.body;

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (display_name !== undefined) {
        fields.push(`display_name = $${paramCount++}`);
        values.push(display_name);
      }
      if (enabled !== undefined) {
        fields.push(`enabled = $${paramCount++}`);
        values.push(enabled);
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'no_fields_to_update' });
      }

      values.push(id);
      const result = await db.query(
        `UPDATE mqtt_devices SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${paramCount}
         RETURNING id, client_id, display_name, enabled`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'device_not_found' });
      }

      const device = result.rows[0];

      // If disabling, disconnect device from broker
      if (enabled === false) {
        try {
          const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
          await fetch(`${nanoMqUrl}/api/v4/clients/${device.client_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64') }
          });
          log.info({ clientid: device.client_id }, 'Disconnected device after disable');
        } catch (brokerErr) {
          log.warn({ err: brokerErr, clientid: device.client_id }, 'Failed to disconnect device - broker may be unavailable');
        }
      }

      log.info({ device_id: id, enabled: device.enabled }, 'Updated device');
      return reply.send({ device });
    } catch (err) {
      log.error({ err, device_id: id }, 'Failed to update device');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/devices/:id - Remove a registered device
   * Disconnects from broker and removes registration.
   * Requires 'mqtt:delete' permission
   */
  app.delete('/api/mqtt/devices/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;

    try {
      const result = await db.query(
        'DELETE FROM mqtt_devices WHERE id = $1 RETURNING client_id',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'device_not_found' });
      }

      const { client_id } = result.rows[0];

      // Disconnect from broker
      try {
        const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
        await fetch(`${nanoMqUrl}/api/v4/clients/${client_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64') }
        });
        log.info({ client_id }, 'Disconnected device after deletion');
      } catch (brokerErr) {
        log.warn({ err: brokerErr, client_id }, 'Failed to disconnect device - broker may be unavailable');
      }

      // Clear auth failure tracking
      authFailures.delete(client_id);

      log.info({ device_id: id, client_id }, 'Deleted device');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, device_id: id }, 'Failed to delete device');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * GET /api/mqtt/auth-setting - Get MQTT authentication setting
   * Requires 'mqtt:read' permission
   */
  app.get('/api/mqtt/auth-setting', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { rows } = await db.query(
        `SELECT value FROM system_settings WHERE key = 'mqtt_require_auth'`
      );
      
      const requireAuth = rows.length > 0 
        ? rows[0].value === 'true' || rows[0].value === true
        : false;

      return reply.send({ mqtt_require_auth: requireAuth });
    } catch (err) {
      log.error({ err }, 'Failed to get auth setting');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/auth-setting - Update MQTT authentication setting
   * Requires 'mqtt:update' permission
   */
  app.put('/api/mqtt/auth-setting', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { mqtt_require_auth } = req.body;

    if (mqtt_require_auth === undefined) {
      return reply.code(400).send({ error: 'missing_required_field' });
    }

    try {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('mqtt_require_auth', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
        [mqtt_require_auth ? 'true' : 'false']
      );

      log.info({ mqtt_require_auth }, 'Updated MQTT auth setting');

      // When auth is switched ON, restart the broker so all clients must re-authenticate
      if (mqtt_require_auth) {
        restartBroker().catch(e => log.warn({ err: e }, 'Failed to restart broker after enabling auth'));
      }

      return reply.send({ mqtt_require_auth });
    } catch (err) {
      log.error({ err }, 'Failed to update auth setting');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });
}
