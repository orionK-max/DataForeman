/**
 * MQTT Bootstrap Service
 * 
 * Ensures the internal system MQTT connection to NanoMQ exists on startup.
 * This connection cannot be edited or deleted by users (is_system = true).
 */

const INTERNAL_CONNECTION_NAME = 'MQTT - Internal';

/**
 * Ensures the internal "Internal" connection exists.
 * Creates it if missing, skips if already exists.
 * 
 * @param {object} app - Fastify app instance with db plugin registered
 * @returns {Promise<void>}
 */
export async function ensureInternalMqttConnection(app) {
  const { db } = app;
  
  try {
    // Check if internal connection already exists
    // mqtt_connections has is_system flag, but connection name is in connections table
    const existing = await db.query(
      `SELECT c.id FROM connections c
       JOIN mqtt_connections mc ON mc.connection_id = c.id
       WHERE mc.is_system = true AND c.name = $1`,
      [INTERNAL_CONNECTION_NAME]
    );
    
    if (existing.rows.length > 0) {
      app.log.info({ connection_id: existing.rows[0].id }, 'Internal MQTT connection already exists');
      return;
    }
    
    // Create the connection entry first
    const connResult = await db.query(
      `INSERT INTO connections (name, type, enabled, config_data, is_system_connection)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        INTERNAL_CONNECTION_NAME,
        'mqtt',
        true,
        JSON.stringify({}),
        false  // MQTT data goes to tag_values, not system_metrics
      ]
    );
    
    const connectionId = connResult.rows[0].id;
    
    // Create the MQTT-specific configuration
    await db.query(
      `INSERT INTO mqtt_connections (
        connection_id,
        broker_host,
        broker_port,
        protocol,
        use_tls,
        client_id_prefix,
        is_system
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        connectionId,
        'broker',
        1883,
        'mqtt',
        false,
        'dataforeman-internal',
        true
      ]
    );
    
    app.log.info(
      { connection_id: connectionId }, 
      'Created internal MQTT connection'
    );
  } catch (err) {
    app.log.error({ err }, 'Failed to ensure internal MQTT connection');
    throw err;
  }
}
