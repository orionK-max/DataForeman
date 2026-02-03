/**
 * MQTT Driver for DataForeman
 * Handles both raw MQTT and Sparkplug B protocols
 */
import mqtt from 'mqtt';
import sparkplugPayload from 'sparkplug-payload';
const { spPayload } = sparkplugPayload;

export class MQTTDriver {
  constructor(log, dbHelper) {
    this.log = log.child({ driver: 'mqtt' });
    this.dbHelper = dbHelper;
    this.client = null;
    this.config = null;
    this.connectionId = null;
    this.subscriptions = new Map(); // topic -> { qos, handler }
    this.publishers = new Map(); // publisherId -> config
    this.sparkplugStates = new Map(); // configId -> { seqNum, lastBirth, ... }
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.isClosing = false;
    this.messageCount = 0;
    this.errorCount = 0;
  }

  /**
   * Initialize and connect to MQTT broker
   */
  async connect(connectionId, mqttConfig) {
    this.connectionId = connectionId;
    this.config = mqttConfig;

    const brokerUrl = `mqtt${this.config.use_tls ? 's' : ''}://${this.config.broker_host}:${this.config.broker_port}`;

    const options = {
      clientId: `${this.config.client_id_prefix || 'dataforeman'}-${connectionId}-${Date.now()}`,
      clean: this.config.clean_session !== false,
      keepalive: this.config.keep_alive || 60,
      reconnectPeriod: this.config.reconnect_period || 5000,
      connectTimeout: this.config.connect_timeout || 30000,
    };

    // Add authentication if provided
    if (this.config.username) {
      options.username = this.config.username;
      options.password = this.config.password;
    }

    // Add TLS options if enabled
    if (this.config.use_tls) {
      options.rejectUnauthorized = this.config.tls_verify_cert !== false;
      if (this.config.tls_ca_cert) {
        options.ca = Buffer.from(this.config.tls_ca_cert);
      }
      if (this.config.tls_client_cert) {
        options.cert = Buffer.from(this.config.tls_client_cert);
      }
      if (this.config.tls_client_key) {
        options.key = Buffer.from(this.config.tls_client_key);
      }
    }

    this.log.info({ connectionId, brokerUrl, clientId: options.clientId }, 'Connecting to MQTT broker');
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.client = mqtt.connect(brokerUrl, options);

        this.client.on('connect', () => {
          this.isConnecting = false;
          this.log.info({ connectionId, clientId: options.clientId }, 'Connected to MQTT broker');
          this.setupEventHandlers();
          resolve();
        });

        this.client.on('error', (err) => {
          this.errorCount++;
          this.log.error({ err, connectionId }, 'MQTT connection error');
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(err);
          }
        });

      } catch (err) {
        this.isConnecting = false;
        this.log.error({ err, connectionId }, 'Failed to create MQTT client');
        reject(err);
      }
    });
  }

  /**
   * Set up event handlers for the MQTT client
   */
  setupEventHandlers() {
    this.client.on('message', (topic, message, packet) => {
      this.handleMessage(topic, message, packet);
    });

    this.client.on('reconnect', () => {
      this.log.info({ connectionId: this.connectionId }, 'MQTT client reconnecting');
    });

    this.client.on('close', () => {
      if (!this.isClosing) {
        this.log.warn({ connectionId: this.connectionId }, 'MQTT connection closed');
      }
    });

    this.client.on('offline', () => {
      this.log.warn({ connectionId: this.connectionId }, 'MQTT client offline');
    });

    this.client.on('disconnect', (packet) => {
      this.log.info({ connectionId: this.connectionId, packet }, 'MQTT client disconnected');
    });
  }

  /**
   * Handle incoming MQTT message
   */
  handleMessage(topic, message, packet) {
    this.messageCount++;
    
    this.log.info({ topic, size: message.length, connectionId: this.connectionId }, 'Received MQTT message');
    
    try {
      // Check if this is a Sparkplug message
      if (this.config.protocol === 'sparkplug' && topic.startsWith('spBv1.0/')) {
        this.handleSparkplugMessage(topic, message);
      } else {
        this.handleRawMqttMessage(topic, message);
      }
    } catch (err) {
      this.errorCount++;
      this.log.error({ err, topic, connectionId: this.connectionId }, 'Error handling MQTT message');
    }
  }

  /**
   * Handle raw MQTT message
   */
  handleRawMqttMessage(topic, message) {
    const sub = this.subscriptions.get(topic) || 
                Array.from(this.subscriptions.entries())
                  .find(([pattern]) => this.matchTopic(topic, pattern))?.[1];

    if (!sub) {
      return; // No subscription handler for this topic
    }

    let payload;
    try {
      if (sub.payload_format === 'json') {
        payload = JSON.parse(message.toString());
      } else {
        payload = message.toString();
      }
    } catch (err) {
      this.log.warn({ err, topic, connectionId: this.connectionId }, 'Failed to parse MQTT message');
      return;
    }

    // Extract value using JSON path if specified
    let value = payload;
    if (sub.value_path && typeof payload === 'object') {
      value = this.extractJsonPath(payload, sub.value_path);
    }

    // Extract timestamp if path specified
    let timestamp = new Date().toISOString();
    if (sub.timestamp_path && typeof payload === 'object') {
      const ts = this.extractJsonPath(payload, sub.timestamp_path);
      if (ts) timestamp = new Date(ts).toISOString();
    }

    // Extract quality if path specified
    let quality = 'GOOD';
    if (sub.quality_path && typeof payload === 'object') {
      quality = this.extractJsonPath(payload, sub.quality_path) || 'GOOD';
    }

    // Generate tag name from topic and prefix
    const tagPath = sub.tag_prefix ? `${sub.tag_prefix}.${topic.replace(/\//g, '.')}` : topic.replace(/\//g, '.');

    // Emit to handler (will be set by index.mjs)
    if (sub.handler) {
      sub.handler({
        tagPath,
        value,
        timestamp,
        quality,
        topic,
        raw: message
      });
    }
  }

  /**
   * Handle Sparkplug B message
   */
  handleSparkplugMessage(topic, message) {
    try {
      const decoded = spPayload.decodePayload(message);
      const parts = topic.split('/');
      
      if (parts.length < 4) {
        this.log.warn({ topic }, 'Invalid Sparkplug topic structure');
        return;
      }

      const [, groupId, messageType, edgeNodeId, deviceId] = parts;

      switch (messageType) {
        case 'NBIRTH':
          this.handleSparkplugBirth(groupId, edgeNodeId, null, decoded);
          break;
        case 'DBIRTH':
          this.handleSparkplugBirth(groupId, edgeNodeId, deviceId, decoded);
          break;
        case 'NDATA':
          this.handleSparkplugData(groupId, edgeNodeId, null, decoded);
          break;
        case 'DDATA':
          this.handleSparkplugData(groupId, edgeNodeId, deviceId, decoded);
          break;
        case 'NDEATH':
          this.handleSparkplugDeath(groupId, edgeNodeId, null, decoded);
          break;
        case 'DDEATH':
          this.handleSparkplugDeath(groupId, edgeNodeId, deviceId, decoded);
          break;
        default:
          this.log.debug({ topic, messageType }, 'Ignoring Sparkplug message type');
      }
    } catch (err) {
      this.errorCount++;
      this.log.error({ err, topic }, 'Failed to decode Sparkplug message');
    }
  }

  /**
   * Handle Sparkplug Birth certificate
   */
  handleSparkplugBirth(groupId, edgeNodeId, deviceId, payload) {
    const identifier = deviceId ? `${groupId}/${edgeNodeId}/${deviceId}` : `${groupId}/${edgeNodeId}`;
    this.log.info({ groupId, edgeNodeId, deviceId, metrics: payload.metrics?.length }, 'Received Sparkplug Birth');

    // Store birth certificate for discovery
    if (this.birthHandler) {
      this.birthHandler({
        groupId,
        edgeNodeId,
        deviceId,
        payload,
        timestamp: new Date(Number(payload.timestamp || Date.now())).toISOString()
      });
    }

    // Process metrics
    if (payload.metrics && this.dataHandler) {
      for (const metric of payload.metrics) {
        const tagPath = `sparkplug.${groupId}.${edgeNodeId}${deviceId ? '.' + deviceId : ''}.${metric.name}`;
        this.dataHandler({
          tagPath,
          value: metric.value,
          timestamp: new Date(Number(payload.timestamp || Date.now())).toISOString(),
          quality: 'GOOD',
          dataType: metric.dataType,
          metric
        });
      }
    }
  }

  /**
   * Handle Sparkplug Data message
   */
  handleSparkplugData(groupId, edgeNodeId, deviceId, payload) {
    if (!payload.metrics || !this.dataHandler) return;

    const timestamp = new Date(Number(payload.timestamp || Date.now())).toISOString();
    
    for (const metric of payload.metrics) {
      const tagPath = `sparkplug.${groupId}.${edgeNodeId}${deviceId ? '.' + deviceId : ''}.${metric.name}`;
      this.dataHandler({
        tagPath,
        value: metric.value,
        timestamp,
        quality: 'GOOD',
        dataType: metric.dataType,
        metric
      });
    }
  }

  /**
   * Handle Sparkplug Death certificate
   */
  handleSparkplugDeath(groupId, edgeNodeId, deviceId, payload) {
    const identifier = deviceId ? `${groupId}/${edgeNodeId}/${deviceId}` : `${groupId}/${edgeNodeId}`;
    this.log.warn({ groupId, edgeNodeId, deviceId }, 'Received Sparkplug Death');

    if (this.deathHandler) {
      this.deathHandler({
        groupId,
        edgeNodeId,
        deviceId,
        timestamp: new Date(Number(payload.timestamp || Date.now())).toISOString()
      });
    }
  }

  /**
   * Subscribe to MQTT topic
   */
  async subscribe(topic, subscription) {
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, { qos: subscription.qos || 0 }, (err) => {
        if (err) {
          this.log.error({ err, topic, connectionId: this.connectionId }, 'Failed to subscribe to topic');
          reject(err);
        } else {
          this.subscriptions.set(topic, subscription);
          this.log.info({ topic, qos: subscription.qos, connectionId: this.connectionId }, 'Subscribed to MQTT topic');
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from MQTT topic
   */
  async unsubscribe(topic) {
    return new Promise((resolve, reject) => {
      this.client.unsubscribe(topic, (err) => {
        if (err) {
          this.log.error({ err, topic, connectionId: this.connectionId }, 'Failed to unsubscribe from topic');
          reject(err);
        } else {
          this.subscriptions.delete(topic);
          this.log.info({ topic, connectionId: this.connectionId }, 'Unsubscribed from MQTT topic');
          resolve();
        }
      });
    });
  }

  /**
   * Publish message to MQTT topic
   */
  async publish(topic, payload, options = {}) {
    return new Promise((resolve, reject) => {
      const publishOptions = {
        qos: options.qos || 0,
        retain: options.retain || false
      };

      let message;
      if (typeof payload === 'object' && !(payload instanceof Buffer)) {
        message = JSON.stringify(payload);
      } else {
        message = payload;
      }

      this.client.publish(topic, message, publishOptions, (err) => {
        if (err) {
          this.errorCount++;
          this.log.error({ err, topic, connectionId: this.connectionId }, 'Failed to publish MQTT message');
          reject(err);
        } else {
          this.log.debug({ topic, qos: publishOptions.qos, retain: publishOptions.retain }, 'Published MQTT message');
          resolve();
        }
      });
    });
  }

  /**
   * Publish Sparkplug Birth certificate
   */
  async publishSparkplugBirth(config, metrics) {
    const { group_id, edge_node_id, device_id } = config;
    const topic = device_id 
      ? `spBv1.0/${group_id}/DBIRTH/${edge_node_id}/${device_id}`
      : `spBv1.0/${group_id}/NBIRTH/${edge_node_id}`;

    let state = this.sparkplugStates.get(config.id);
    if (!state) {
      state = { seqNum: 0, lastBirth: null };
      this.sparkplugStates.set(config.id, state);
    }

    const payload = {
      timestamp: Date.now(),
      metrics: metrics.map((m, idx) => ({
        name: m.metric_name,
        value: m.value !== undefined ? m.value : null,
        type: m.data_type || 'String',
        timestamp: Date.now()
      })),
      seq: state.seqNum++
    };

    const encoded = spPayload.encodePayload(payload);
    await this.publish(topic, encoded, { qos: 0, retain: false });
    
    state.lastBirth = Date.now();
    this.log.info({ topic, metricsCount: metrics.length }, 'Published Sparkplug Birth');
  }

  /**
   * Publish Sparkplug Data message
   */
  async publishSparkplugData(config, metrics) {
    const { group_id, edge_node_id, device_id } = config;
    const topic = device_id 
      ? `spBv1.0/${group_id}/DDATA/${edge_node_id}/${device_id}`
      : `spBv1.0/${group_id}/NDATA/${edge_node_id}`;

    const state = this.sparkplugStates.get(config.id);
    if (!state || !state.lastBirth) {
      // Must send Birth before Data
      this.log.warn({ configId: config.id }, 'Attempting to send Data before Birth, sending Birth first');
      await this.publishSparkplugBirth(config, metrics);
      return;
    }

    const payload = {
      timestamp: Date.now(),
      metrics: metrics.map(m => ({
        name: m.metric_name,
        value: m.value,
        type: m.data_type || 'String',
        timestamp: Date.now()
      })),
      seq: state.seqNum++
    };

    const encoded = spPayload.encodePayload(payload);
    await this.publish(topic, encoded, { qos: 0, retain: false });
  }

  /**
   * Match MQTT topic with wildcard pattern
   */
  matchTopic(topic, pattern) {
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');

    if (patternParts[patternParts.length - 1] === '#') {
      // Multi-level wildcard
      return topicParts.slice(0, patternParts.length - 1).every((part, i) => 
        patternParts[i] === '+' || patternParts[i] === part
      );
    }

    if (topicParts.length !== patternParts.length) {
      return false;
    }

    return topicParts.every((part, i) => 
      patternParts[i] === '+' || patternParts[i] === part
    );
  }

  /**
   * Extract value from JSON using simple path notation (e.g., "$.temperature" or "data.value")
   */
  extractJsonPath(obj, path) {
    const parts = path.replace(/^\$\.?/, '').split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) return null;
      current = current[part];
    }
    
    return current;
  }

  /**
   * Load subscriptions from database and subscribe to topics
   */
  async loadSubscriptions() {
    try {
      const result = await this.dbHelper.query(
        `SELECT * FROM mqtt_subscriptions WHERE connection_id = $1 AND enabled = true`,
        [this.connectionId]
      );

      for (const sub of result.rows) {
        await this.subscribe(sub.topic, {
          qos: sub.qos,
          payload_format: sub.payload_format,
          value_path: sub.value_path,
          timestamp_path: sub.timestamp_path,
          quality_path: sub.quality_path,
          tag_prefix: sub.tag_prefix,
          handler: this.dataHandler
        });
      }

      this.log.info({ count: result.rows.length, connectionId: this.connectionId }, 'Loaded MQTT subscriptions');
    } catch (err) {
      this.log.error({ err, connectionId: this.connectionId }, 'Failed to load MQTT subscriptions');
    }
  }

  /**
   * Load publishers from database for this connection
   */
  async loadPublishers() {
    try {
      const result = await this.dbHelper.queryDb(
        `SELECT p.*, 
                array_agg(
                  json_build_object(
                    'mapping_id', m.id,
                    'tag_id', m.tag_id,
                    'tag_path', t.tag_path,
                    'mqtt_topic', m.mqtt_topic,
                    'retain', m.retain,
                    'qos', m.qos,
                    'value_transform', m.value_transform
                  ) ORDER BY t.tag_path
                ) FILTER (WHERE m.id IS NOT NULL) as mappings
         FROM mqtt_publishers p
         LEFT JOIN mqtt_publisher_mappings m ON m.publisher_id = p.id
         LEFT JOIN tag_metadata t ON t.tag_id = m.tag_id
         WHERE p.connection_id = $1 AND p.enabled = true
         GROUP BY p.id
         ORDER BY p.name`,
        [this.connectionId]
      );

      // Clear existing publishers
      this.publishers.clear();

      // Store publishers
      for (const pub of result.rows) {
        this.publishers.set(pub.id, {
          id: pub.id,
          name: pub.name,
          publish_mode: pub.publish_mode,
          interval_ms: pub.interval_ms,
          payload_format: pub.payload_format,
          payload_template: pub.payload_template,
          mappings: pub.mappings || [],
          intervalTimer: null,
          lastValues: new Map() // tag_id -> last published value
        });
      }

      this.log.info({ count: result.rows.length, connectionId: this.connectionId }, 'Loaded MQTT publishers');
      return result.rows;
    } catch (err) {
      this.log.error({ err, connectionId: this.connectionId }, 'Failed to load MQTT publishers');
      return [];
    }
  }

  /**
   * Publish value for a tag mapping
   */
  async publishTagValue(publisherId, mapping, value, timestamp) {
    try {
      const publisher = this.publishers.get(publisherId);
      if (!publisher) return;

      // Apply value transform if specified
      let transformedValue = value;
      if (mapping.value_transform) {
        try {
          // Simple eval-based transform (could be enhanced)
          const transform = new Function('value', `return ${mapping.value_transform};`);
          transformedValue = transform(value);
        } catch (err) {
          this.log.warn({ err, transform: mapping.value_transform }, 'Failed to apply value transform');
        }
      }

      // Build payload based on format
      let payload;
      if (publisher.payload_format === 'json') {
        payload = {
          value: transformedValue,
          timestamp: timestamp || Date.now(),
          tagPath: mapping.tag_path
        };
        
        // Apply custom template if provided
        if (publisher.payload_template) {
          try {
            const template = JSON.parse(publisher.payload_template);
            payload = { ...template, ...payload };
          } catch (err) {
            this.log.warn({ err, template: publisher.payload_template }, 'Invalid payload template');
          }
        }
      } else if (publisher.payload_format === 'raw') {
        payload = transformedValue?.toString() || '';
      } else if (publisher.payload_format === 'sparkplug') {
        // Sparkplug format - will be handled separately
        return;
      }

      // Publish to MQTT
      await this.publish(mapping.mqtt_topic, payload, {
        qos: mapping.qos || 0,
        retain: mapping.retain || false
      });

      this.log.debug({ 
        publisherId, 
        topic: mapping.mqtt_topic, 
        tagPath: mapping.tag_path 
      }, 'Published tag value to MQTT');

    } catch (err) {
      this.log.error({ err, publisherId, mapping }, 'Failed to publish tag value');
    }
  }

  /**
   * Start interval-based publishing for a publisher
   */
  startIntervalPublishing(publisherId) {
    const publisher = this.publishers.get(publisherId);
    if (!publisher || !publisher.interval_ms) return;

    // Clear existing timer
    if (publisher.intervalTimer) {
      clearInterval(publisher.intervalTimer);
    }

    // Set up new timer
    publisher.intervalTimer = setInterval(async () => {
      try {
        // Get current values for all mapped tags
        if (!publisher.mappings || publisher.mappings.length === 0) return;

        const tagIds = publisher.mappings.map(m => m.tag_id);
        const result = await this.dbHelper.queryDb(
          `SELECT tag_id, value, timestamp 
           FROM tag_values 
           WHERE tag_id = ANY($1)`,
          [tagIds]
        );

        const values = new Map(result.rows.map(r => [r.tag_id, r]));

        // Publish each mapping
        for (const mapping of publisher.mappings) {
          const tagValue = values.get(mapping.tag_id);
          if (tagValue) {
            await this.publishTagValue(publisherId, mapping, tagValue.value, tagValue.timestamp);
          }
        }
      } catch (err) {
        this.log.error({ err, publisherId }, 'Error in interval publishing');
      }
    }, publisher.interval_ms);

    this.log.info({ publisherId, interval_ms: publisher.interval_ms }, 'Started interval publishing');
  }

  /**
   * Stop interval publishing for a publisher
   */
  stopIntervalPublishing(publisherId) {
    const publisher = this.publishers.get(publisherId);
    if (publisher && publisher.intervalTimer) {
      clearInterval(publisher.intervalTimer);
      publisher.intervalTimer = null;
      this.log.info({ publisherId }, 'Stopped interval publishing');
    }
  }

  /**
   * Handle tag value change for on_change publishing
   */
  async onTagValueChange(tagId, value, timestamp) {
    // Find all publishers that have this tag mapped with on_change mode
    for (const [publisherId, publisher] of this.publishers) {
      if (publisher.publish_mode === 'on_change' || publisher.publish_mode === 'both') {
        const mapping = publisher.mappings.find(m => m.tag_id === tagId);
        if (mapping) {
          // Check if value actually changed
          const lastValue = publisher.lastValues.get(tagId);
          if (lastValue !== value) {
            publisher.lastValues.set(tagId, value);
            await this.publishTagValue(publisherId, mapping, value, timestamp);
          }
        }
      }
    }
  }

  /**
   * Set data handler for incoming messages
   */
  setDataHandler(handler) {
    this.dataHandler = handler;
  }

  /**
   * Set birth handler for Sparkplug Birth certificates
   */
  setBirthHandler(handler) {
    this.birthHandler = handler;
  }

  /**
   * Set death handler for Sparkplug Death certificates
   */
  setDeathHandler(handler) {
    this.deathHandler = handler;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      connected: this.client?.connected || false,
      messageCount: this.messageCount,
      errorCount: this.errorCount,
      subscriptions: this.subscriptions.size,
      publishers: this.publishers.size
    };
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect() {
    if (!this.client) return;

    this.isClosing = true;
    this.log.info({ connectionId: this.connectionId }, 'Disconnecting from MQTT broker');

    return new Promise((resolve) => {
      this.client.end(false, {}, () => {
        this.client = null;
        this.isClosing = false;
        this.log.info({ connectionId: this.connectionId }, 'Disconnected from MQTT broker');
        resolve();
      });
    });
  }
}
