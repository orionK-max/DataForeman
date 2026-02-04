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
                let dataType = 'STRING';
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
      enabled = true
    } = req.body;

    if (!subscription_id || !topic || !field_path || !tag_name || !data_type) {
      return reply.code(400).send({ error: 'missing_required_fields' });
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO mqtt_field_mappings (
          subscription_id, topic, field_path, tag_name, data_type,
          type_strictness, on_failure, default_value, enabled
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [subscription_id, topic, field_path, tag_name, data_type,
         type_strictness, on_failure, default_value, enabled]
      );

      log.info({ mappingId: rows[0].id, subscription_id, topic, field_path }, 'Created field mapping');
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

        // Create (or revive) tag
        try {
          const desc = `MQTT: ${mapping.topic} -> ${mapping.field_path}`;

          const { rows: existingRows } = await db.query(
            `SELECT tag_id, coalesce(status,'active') as status
             FROM tag_metadata
             WHERE connection_id = $1 AND driver_type = 'MQTT' AND tag_path = $2
             LIMIT 1`,
            [mapping.connection_id, tagPath]
          );

          let tagId = null;
          let revived = false;

          if (existingRows.length > 0) {
            const existing = existingRows[0];
            if (existing.status === 'deleted') {
              tagId = existing.tag_id;
              revived = true;

              await db.query(
                `UPDATE tag_metadata
                 SET
                   status = NULL,
                   is_deleted = false,
                   deleted_at = NULL,
                   delete_job_id = NULL,
                   delete_started_at = NULL,
                   original_subscribed = NULL,
                   is_subscribed = true,
                   poll_group_id = 5,
                   tag_name = $1,
                   data_type = $2,
                   description = $3
                 WHERE tag_id = $4`,
                [mapping.tag_name, mapping.data_type, desc, tagId]
              );
            } else {
              errors.push({ mapping_id: mappingId, error: 'Tag path already exists' });
              continue;
            }
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
            revived,
            success: true
          });

        } catch (tagErr) {
          if (tagErr.code === '23505') {
            try {
              const { rows: existingRows } = await db.query(
                `SELECT tag_id, coalesce(status,'active') as status
                 FROM tag_metadata
                 WHERE connection_id = $1 AND driver_type = 'MQTT' AND tag_path = $2
                 LIMIT 1`,
                [mapping.connection_id, tagPath]
              );

              if (existingRows.length > 0 && existingRows[0].status === 'deleted') {
                const tagId = existingRows[0].tag_id;
                const desc = `MQTT: ${mapping.topic} -> ${mapping.field_path}`;

                await db.query(
                  `UPDATE tag_metadata
                   SET
                     status = NULL,
                     is_deleted = false,
                     deleted_at = NULL,
                     delete_job_id = NULL,
                     delete_started_at = NULL,
                     original_subscribed = NULL,
                     is_subscribed = true,
                     poll_group_id = 5,
                     tag_name = $1,
                     data_type = $2,
                     description = $3
                   WHERE tag_id = $4`,
                  [mapping.tag_name, mapping.data_type, desc, tagId]
                );

                await db.query(
                  `UPDATE mqtt_field_mappings SET tag_id = $1 WHERE id = $2`,
                  [tagId, mappingId]
                );

                results.push({
                  mapping_id: mappingId,
                  tag_id: tagId,
                  tag_path: tagPath,
                  revived: true,
                  success: true
                });
                continue;
              }
            } catch {}

            errors.push({ mapping_id: mappingId, error: 'Tag path already exists' });
          } else {
            throw tagErr;
          }
        }
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
