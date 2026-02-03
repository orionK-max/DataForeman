/**
 * MQTT Management Routes
 * Handles MQTT broker authentication, management, and monitoring
 */

export default async function mqttRoutes(app) {
  const db = app.db;
  const tsdb = app.tsdb;
  const log = app.log.child({ mod: 'mqtt-routes' });

  /**
   * POST /api/mqtt/auth - Authentication webhook for nanoMQ
   * 
   * nanoMQ calls this endpoint to verify client credentials.
   * No JWT authentication required (webhook from broker).
   * 
   * Request body format (from nanoMQ):
   * {
   *   "clientid": "client123",
   *   "username": "user@example.com",
   *   "password": "userpassword"
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

    // Validate required fields
    if (!username || !password) {
      log.warn({ clientid, username }, 'MQTT auth failed: missing credentials');
      return reply.send({ result: 'deny', reason: 'missing_credentials' });
    }

    try {
      // Query user from database
      const { rows } = await db.query(
        `SELECT u.id, u.email, ai.secret_hash 
         FROM users u
         JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'local'
         WHERE u.email = $1`,
        [username]
      );

      if (rows.length === 0) {
        log.warn({ username }, 'MQTT auth failed: user not found');
        return reply.send({ result: 'deny', reason: 'invalid_credentials' });
      }

      const user = rows[0];

      // Verify password
      const argon2 = await import('argon2');
      const isValid = await argon2.verify(user.secret_hash, password);

      if (!isValid) {
        log.warn({ username }, 'MQTT auth failed: invalid password');
        return reply.send({ result: 'deny', reason: 'invalid_credentials' });
      }

      // Check if user has MQTT permission
      // Allow connection if user has either 'mqtt:connect' or general 'mqtt:read' permission
      const hasMqttPermission = await app.permissions.can(user.id, 'mqtt', 'connect') ||
                                await app.permissions.can(user.id, 'mqtt', 'read');
      
      if (!hasMqttPermission) {
        log.warn({ username }, 'MQTT auth failed: no mqtt permission');
        return reply.send({ result: 'deny', reason: 'insufficient_permissions' });
      }

      log.info({ username, clientid }, 'MQTT auth successful');
      return reply.send({ 
        result: 'allow',
        is_superuser: false
      });

    } catch (err) {
      log.error({ err, username }, 'MQTT auth error');
      return reply.send({ result: 'deny', reason: 'internal_error' });
    }
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
      // Query nanoMQ HTTP API for broker status
      const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://nanomq:8001';
      const response = await fetch(`${nanoMqUrl}/api/v4/brokers`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64')
        }
      });

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
      const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://nanomq:8001';
      const response = await fetch(`${nanoMqUrl}/api/v4/clients`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64')
        }
      });

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
      const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://nanomq:8001';
      const response = await fetch(`${nanoMqUrl}/api/v4/topic-tree`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64')
        }
      });

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
      const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://nanomq:8001';
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
        `SELECT c.*, mc.*
         FROM connections c
         JOIN mqtt_connections mc ON mc.connection_id = c.id
         WHERE c.id = $1 AND c.type = 'mqtt' AND c.deleted_at IS NULL`,
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      // Don't expose password in response
      const connection = { ...rows[0] };
      delete connection.password;

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

    try {
      // Start transaction
      await db.query('BEGIN');

      // Create connection entry
      const connResult = await db.query(
        `INSERT INTO connections (name, type, enabled, config_data)
         VALUES ($1, 'mqtt', $2, '{}'::jsonb)
         RETURNING id`,
        [name, enabled]
      );

      const connectionId = connResult.rows[0].id;

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

      log.info({ connectionId, name, userId }, 'Created MQTT connection');
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
    const {
      name,
      enabled,
      broker_host,
      broker_port,
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
        app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: { id: connection_id, type: 'mqtt' }
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
    const { qos, tag_prefix, value_path, timestamp_path, quality_path, enabled } = req.body;

    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (qos !== undefined) { fields.push(`qos = $${paramCount++}`); values.push(qos); }
      if (tag_prefix !== undefined) { fields.push(`tag_prefix = $${paramCount++}`); values.push(tag_prefix); }
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
      if (app.nats?.healthy?.() === true) {
        app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: { id: result.rows[0].connection_id, type: 'mqtt' }
        });
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
        app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          ts: new Date().toISOString(),
          op: 'upsert',
          conn: { id: result.rows[0].connection_id, type: 'mqtt' }
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
   * Returns recent telemetry data matching the subscription's tag pattern
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
      // Get subscription details to determine tag pattern
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
      // Convert MQTT topic pattern to SQL LIKE pattern
      // e.g., "test/sensors/#" -> "mqtt.test.test.sensors.%"
      let topicPattern = sub.topic.replace(/#/g, '%').replace(/\+/g, '_').replace(/\//g, '.');
      const tagPathPattern = `${sub.tag_prefix}.${topicPattern}`;

      // Query recent telemetry data from TSDB
      const dataQuery = `
        SELECT 
          tag_path,
          value,
          timestamp,
          quality
        FROM tag_values
        WHERE tag_path LIKE $1
        AND connection_id = $2
        ORDER BY timestamp DESC
        LIMIT $3
      `;
      
      const dataResult = await tsdb.query(dataQuery, [tagPathPattern, sub.connection_id, limit]);

      return reply.send({
        subscription: {
          id: sub.id,
          topic: sub.topic,
          tag_prefix: sub.tag_prefix,
          connection_id: sub.connection_id
        },
        messages: dataResult.rows.map(row => ({
          tag_path: row.tag_path,
          value: row.value,
          timestamp: row.timestamp,
          quality: row.quality
        })),
        count: dataResult.rows.length,
        limit
      });
    } catch (err) {
      log.error({ err, subscriptionId: id }, 'Failed to get subscription messages');
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
   * Get a single publisher by ID
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

      // Get mappings for this publisher
      const { rows: mappings } = await app.db.query(
        `SELECT m.*, t.tag_path
         FROM mqtt_publisher_mappings m
         JOIN tag_metadata t ON t.tag_id = m.tag_id
         WHERE m.publisher_id = $1
         ORDER BY t.tag_path`,
        [id]
      );

      return reply.send({ 
        publisher: rows[0],
        mappings: mappings
      });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'Failed to get publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * POST /api/mqtt/publishers
   * Create a new MQTT publisher
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
        payload_format = 'json',
        payload_template,
        enabled = true,
        mappings = []
      } = req.body;

      // Validation
      if (!connection_id || !name || !publish_mode) {
        return reply.code(400).send({ error: 'missing_required_fields' });
      }

      if (!['on_change', 'interval', 'both'].includes(publish_mode)) {
        return reply.code(400).send({ error: 'invalid_publish_mode' });
      }

      if ((publish_mode === 'interval' || publish_mode === 'both') && !interval_ms) {
        return reply.code(400).send({ error: 'interval_required' });
      }

      // Create publisher
      const { rows } = await app.db.query(
        `INSERT INTO mqtt_publishers 
         (connection_id, name, publish_mode, interval_ms, payload_format, payload_template, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [connection_id, name, publish_mode, interval_ms, payload_format, payload_template, enabled]
      );

      const publisher = rows[0];

      // Create mappings if provided
      if (mappings && mappings.length > 0) {
        for (const mapping of mappings) {
          await app.db.query(
            `INSERT INTO mqtt_publisher_mappings
             (publisher_id, tag_id, mqtt_topic, retain, qos, value_transform)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              publisher.id,
              mapping.tag_id,
              mapping.mqtt_topic,
              mapping.retain || false,
              mapping.qos || 0,
              mapping.value_transform
            ]
          );
        }
      }

      // Notify connectivity service via NATS
      if (app.nats?.healthy?.()) {
        await app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          op: 'upsert',
          conn: {
            id: connection_id,
            type: 'mqtt'
          }
        });
      }

      log.info({ publisherId: publisher.id, name }, 'MQTT publisher created');
      return reply.code(201).send({ id: publisher.id });
    } catch (err) {
      log.error({ err }, 'Failed to create publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * PUT /api/mqtt/publishers/:id
   * Update an existing publisher
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
        payload_format,
        payload_template,
        enabled
      } = req.body;

      // Validation
      if (publish_mode && !['on_change', 'interval', 'both'].includes(publish_mode)) {
        return reply.code(400).send({ error: 'invalid_publish_mode' });
      }

      if ((publish_mode === 'interval' || publish_mode === 'both') && !interval_ms) {
        return reply.code(400).send({ error: 'interval_required' });
      }

      // Get connection_id for NATS notification
      const { rows: existing } = await app.db.query(
        'SELECT connection_id FROM mqtt_publishers WHERE id = $1',
        [id]
      );

      if (existing.length === 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const connection_id = existing[0].connection_id;

      // Update publisher
      await app.db.query(
        `UPDATE mqtt_publishers
         SET name = COALESCE($1, name),
             publish_mode = COALESCE($2, publish_mode),
             interval_ms = COALESCE($3, interval_ms),
             payload_format = COALESCE($4, payload_format),
             payload_template = COALESCE($5, payload_template),
             enabled = COALESCE($6, enabled)
         WHERE id = $7`,
        [name, publish_mode, interval_ms, payload_format, payload_template, enabled, id]
      );

      // Notify connectivity service
      if (app.nats?.healthy?.()) {
        await app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          op: 'upsert',
          conn: {
            id: connection_id,
            type: 'mqtt'
          }
        });
      }

      log.info({ publisherId: id }, 'MQTT publisher updated');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'Failed to update publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/publishers/:id
   * Delete a publisher and its mappings
   */
  app.delete('/api/mqtt/publishers/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { id } = req.params;

      // Get connection_id for NATS notification
      const { rows } = await app.db.query(
        'SELECT connection_id FROM mqtt_publishers WHERE id = $1',
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const connection_id = rows[0].connection_id;

      // Delete publisher (cascades to mappings)
      await app.db.query('DELETE FROM mqtt_publishers WHERE id = $1', [id]);

      // Notify connectivity service
      if (app.nats?.healthy?.()) {
        await app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          op: 'upsert',
          conn: {
            id: connection_id,
            type: 'mqtt'
          }
        });
      }

      log.info({ publisherId: id }, 'MQTT publisher deleted');
      return reply.send({ success: true });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'Failed to delete publisher');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  // ==================== Publisher Mappings ====================

  /**
   * POST /api/mqtt/publishers/:id/mappings
   * Add a tag mapping to a publisher
   */
  app.post('/api/mqtt/publishers/:id/mappings', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { id } = req.params;
      const { tag_id, mqtt_topic, retain = false, qos = 0, value_transform } = req.body;

      if (!tag_id || !mqtt_topic) {
        return reply.code(400).send({ error: 'missing_required_fields' });
      }

      const { rows } = await app.db.query(
        `INSERT INTO mqtt_publisher_mappings
         (publisher_id, tag_id, mqtt_topic, retain, qos, value_transform)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, tag_id, mqtt_topic, retain, qos, value_transform]
      );

      // Get connection_id for NATS notification
      const { rows: publisher } = await app.db.query(
        'SELECT connection_id FROM mqtt_publishers WHERE id = $1',
        [id]
      );

      if (publisher.length > 0 && app.nats?.healthy?.()) {
        await app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          op: 'upsert',
          conn: {
            id: publisher[0].connection_id,
            type: 'mqtt'
          }
        });
      }

      return reply.code(201).send({ mapping: rows[0] });
    } catch (err) {
      log.error({ err }, 'Failed to create publisher mapping');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });

  /**
   * DELETE /api/mqtt/publishers/:id/mappings/:mappingId
   * Remove a tag mapping from a publisher
   */
  app.delete('/api/mqtt/publishers/:id/mappings/:mappingId', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'mqtt', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { id, mappingId } = req.params;

      await app.db.query(
        'DELETE FROM mqtt_publisher_mappings WHERE id = $1 AND publisher_id = $2',
        [mappingId, id]
      );

      // Get connection_id for NATS notification
      const { rows: publisher } = await app.db.query(
        'SELECT connection_id FROM mqtt_publishers WHERE id = $1',
        [id]
      );

      if (publisher.length > 0 && app.nats?.healthy?.()) {
        await app.nats.publish('df.connectivity.config.v1', {
          schema: 'connectivity.config@v1',
          op: 'upsert',
          conn: {
            id: publisher[0].connection_id,
            type: 'mqtt'
          }
        });
      }

      return reply.send({ success: true });
    } catch (err) {
      log.error({ err }, 'Failed to delete publisher mapping');
      return reply.code(500).send({ error: 'database_error', message: err.message });
    }
  });
}
