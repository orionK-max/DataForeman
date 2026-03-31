import api from './api';

/**
 * MQTT Service
 * API client for MQTT/Sparkplug management endpoints
 */

const mqttService = {
  // ==================== Connections ====================
  
  /**
   * Get all MQTT connections
   * @returns {Promise<Array>} List of MQTT connections
   */
  async getConnections() {
    const response = await api.get('/mqtt/connections');
    return response.connections || [];
  },

  /**
   * Get a single MQTT connection by ID
   * @param {string} connectionId - Connection ID
   * @returns {Promise<Object>} Connection object
   */
  async getConnection(connectionId) {
    const response = await api.get(`/mqtt/connections/${connectionId}`);
    return response.connection;
  },

  /**
   * Create a new MQTT connection
   * @param {Object} connectionData - Connection configuration
   * @returns {Promise<Object>} Created connection with ID
   */
  async createConnection(connectionData) {
    return await api.post('/mqtt/connections', connectionData);
  },

  /**
   * Update an existing MQTT connection
   * @param {string} connectionId - Connection ID
   * @param {Object} connectionData - Updated connection configuration
   * @returns {Promise<Object>} Success response
   */
  async updateConnection(connectionId, connectionData) {
    return await api.put(`/mqtt/connections/${connectionId}`, connectionData);
  },

  /**
   * Delete an MQTT connection
   * @param {string} connectionId - Connection ID
   * @returns {Promise<Object>} Success response
   */
  async deleteConnection(connectionId) {
    return await api.delete(`/mqtt/connections/${connectionId}`);
  },

  // ==================== Subscriptions ====================

  /**
   * Get all subscriptions for a connection
   * @param {string} connectionId - Connection ID (optional)
   * @returns {Promise<Array>} List of subscriptions
   */
  async getSubscriptions(connectionId = null) {
    const url = connectionId 
      ? `/mqtt/subscriptions?connection_id=${connectionId}`
      : '/mqtt/subscriptions';
    const response = await api.get(url);
    return response.subscriptions || [];
  },

  /**
   * Get a single subscription by ID
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object>} Subscription object
   */
  async getSubscription(subscriptionId) {
    const response = await api.get(`/mqtt/subscriptions/${subscriptionId}`);
    return response.subscription;
  },

  /**
   * Create a new MQTT subscription
   * @param {Object} subscriptionData - Subscription configuration
   * @returns {Promise<Object>} Created subscription with ID
   */
  async createSubscription(subscriptionData) {
    return await api.post('/mqtt/subscriptions', subscriptionData);
  },

  /**
   * Update an existing subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} subscriptionData - Updated subscription configuration
   * @returns {Promise<Object>} Success response
   */
  async updateSubscription(subscriptionId, subscriptionData) {
    return await api.put(`/mqtt/subscriptions/${subscriptionId}`, subscriptionData);
  },

  /**
   * Delete a subscription
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object>} Success response
   */
  async deleteSubscription(subscriptionId) {
    return await api.delete(`/mqtt/subscriptions/${subscriptionId}`);
  },

  /**
   * Get recent messages for a subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {number} limit - Maximum number of messages to retrieve (default 50, max 500)
   * @returns {Promise<Object>} Object containing subscription info and messages array
   */
  async getSubscriptionMessages(subscriptionId, limit = 50) {
    const response = await api.get(`/mqtt/subscriptions/${subscriptionId}/messages?limit=${limit}`);
    return response;
  },

  // ==================== Publishers ====================

  /**
   * Get all publishers for a connection
   * @param {string} connectionId - Connection ID (optional)
   * @returns {Promise<Array>} List of publishers
   */
  async getPublishers(connectionId = null) {
    const url = connectionId 
      ? `/mqtt/publishers?connection_id=${connectionId}`
      : '/mqtt/publishers';
    const response = await api.get(url);
    return response.publishers || [];
  },

  /**
   * Get a single publisher by ID
   * @param {string} publisherId - Publisher ID
   * @returns {Promise<Object>} Publisher object with mappings
   */
  async getPublisher(publisherId) {
    const response = await api.get(`/mqtt/publishers/${publisherId}`);
    return response;
  },

  /**
   * Create a new MQTT publisher
   * @param {Object} publisherData - Publisher configuration
   * @returns {Promise<Object>} Created publisher with ID
   */
  async createPublisher(publisherData) {
    return await api.post('/mqtt/publishers', publisherData);
  },

  /**
   * Update an existing publisher
   * @param {string} publisherId - Publisher ID
   * @param {Object} publisherData - Updated publisher configuration
   * @returns {Promise<Object>} Success response
   */
  async updatePublisher(publisherId, publisherData) {
    return await api.put(`/mqtt/publishers/${publisherId}`, publisherData);
  },

  /**
   * Delete a publisher
   * @param {string} publisherId - Publisher ID
   * @returns {Promise<Object>} Success response
   */
  async deletePublisher(publisherId) {
    return await api.delete(`/mqtt/publishers/${publisherId}`);
  },

  /**
   * Add a tag mapping to a publisher
   * @param {string} publisherId - Publisher ID
   * @param {Object} mappingData - Mapping configuration
   * @returns {Promise<Object>} Created mapping
   */
  async addPublisherMapping(publisherId, mappingData) {
    return await api.post(`/mqtt/publishers/${publisherId}/mappings`, mappingData);
  },

  /**
   * Delete a publisher tag mapping
   * @param {string} publisherId - Publisher ID
   * @param {string} mappingId - Mapping ID
   * @returns {Promise<Object>} Success response
   */
  async deletePublisherMapping(publisherId, mappingId) {
    return await api.delete(`/mqtt/publishers/${publisherId}/mappings/${mappingId}`);
  },

  // ==================== Sparkplug Discovery ====================

  /**
   * Get discovered Sparkplug devices
   * @param {string} connectionId - Connection ID (optional)
   * @returns {Promise<Array>} List of discovered Sparkplug nodes/devices
   */
  async getSparkplugDiscovery(connectionId = null) {
    const url = connectionId
      ? `/mqtt/discovery/sparkplug?connection_id=${connectionId}`
      : '/mqtt/discovery/sparkplug';
    const response = await api.get(url);
    return response.devices || [];
  },

  // ==================== Broker Status ====================

  /**
   * Get nanoMQ broker status
   * @returns {Promise<Object>} Broker status information
   */
  async getBrokerStatus() {
    return await api.get('/mqtt/status');
  },

  /**
   * Get connected MQTT clients
   * @returns {Promise<Array>} List of connected clients
   */
  async getClients() {
    const response = await api.get('/mqtt/clients');
    return response.data || [];
  },

  /**
   * Disconnect an MQTT client
   * @param {string} clientId - Client ID to disconnect
   * @returns {Promise<Object>} Success response
   */
  async disconnectClient(clientId) {
    return await api.delete(`/mqtt/clients/${encodeURIComponent(clientId)}`);
  },

  /**
   * Get active MQTT topics
   * @returns {Promise<Array>} List of topics with subscriber counts
   */
  async getTopics() {
    const response = await api.get('/mqtt/topics');
    return response.topics || [];
  },

  // ==================== Field Mappings ====================

  /**
   * Analyze fields in subscription messages
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object>} Detected field combinations
   */
  async analyzeFields(subscriptionId) {
    return await api.post(`/mqtt/subscriptions/${subscriptionId}/analyze-fields`);
  },

  /**
   * Get field mappings for a subscription
   * @param {string} subscriptionId - Subscription ID (optional)
   * @returns {Promise<Array>} List of field mappings
   */
  async getFieldMappings(subscriptionId = null) {
    const url = subscriptionId
      ? `/mqtt/field-mappings?subscription_id=${subscriptionId}`
      : '/mqtt/field-mappings';
    const response = await api.get(url);
    return response.mappings || [];
  },

  /**
   * Create a field mapping
   * @param {Object} mappingData - Field mapping configuration
   * @returns {Promise<Object>} Created mapping with ID
   */
  async createFieldMapping(mappingData) {
    return await api.post('/mqtt/field-mappings', mappingData);
  },

  /**
   * Update a field mapping
   * @param {string} mappingId - Mapping ID
   * @param {Object} mappingData - Updated mapping configuration
   * @returns {Promise<Object>} Success response
   */
  async updateFieldMapping(mappingId, mappingData) {
    return await api.put(`/mqtt/field-mappings/${mappingId}`, mappingData);
  },

  /**
   * Delete a field mapping
   * @param {string} mappingId - Mapping ID
   * @returns {Promise<Object>} Success response
   */
  async deleteFieldMapping(mappingId) {
    return await api.delete(`/mqtt/field-mappings/${mappingId}`);
  },

  /**
   * Import field mappings from CSV
   * @param {string} subscriptionId - Subscription ID
   * @param {string} csvData - CSV data string
   * @returns {Promise<Object>} Preview data with valid mappings and errors
   */
  async importFieldMappingsCSV(subscriptionId, csvData) {
    return await api.post('/mqtt/field-mappings/import-csv', {
      subscription_id: subscriptionId,
      csv_data: csvData,
    });
  },

  /**
   * Create tags from field mappings
   * @param {Array<string>} mappingIds - Array of mapping IDs
   * @returns {Promise<Object>} Results with created tags and errors
   */
  async createTagsFromMappings(mappingIds) {
    return await api.post('/mqtt/field-mappings/create-tags', {
      mapping_ids: mappingIds,
    });
  },

  // ==================== Device Credentials ====================

  /**
   * Get all device credentials
   * @returns {Promise<Array>} List of device credentials
   */
  async getDeviceCredentials() {
    const response = await api.get('/mqtt/device-credentials');
    return response.credentials || [];
  },

  /**
   * Create a new device credential
   * @param {Object} credentialData - { device_name, username, password, enabled }
   * @returns {Promise<Object>} Created credential
   */
  async createDeviceCredential(credentialData) {
    return await api.post('/mqtt/device-credentials', credentialData);
  },

  /**
   * Update a device credential
   * @param {string} credentialId - Credential ID
   * @param {Object} updates - { device_name?, password?, enabled? }
   * @returns {Promise<Object>} Updated credential
   */
  async updateDeviceCredential(credentialId, updates) {
    return await api.put(`/mqtt/device-credentials/${credentialId}`, updates);
  },

  /**
   * Delete a device credential
   * @param {string} credentialId - Credential ID
   * @returns {Promise<Object>} Success response
   */
  async deleteDeviceCredential(credentialId) {
    return await api.delete(`/mqtt/device-credentials/${credentialId}`);
  },

  /**
   * Get aggregated device credential statuses
   * @returns {Promise<Array>} List of device statuses with status, lastSeen, etc.
   */
  async getDeviceCredentialStatuses() {
    const response = await api.get('/mqtt/device-credentials/status');
    return response.statuses || [];
  },

  /**
   * Get MQTT authentication setting
   * @returns {Promise<Object>} { mqtt_require_auth: boolean }
   */
  async getAuthSetting() {
    return await api.get('/mqtt/auth-setting');
  },

  /**
   * Update MQTT authentication setting
   * @param {boolean} requireAuth - Whether to require authentication
   * @returns {Promise<Object>} { mqtt_require_auth: boolean }
   */
  async updateAuthSetting(requireAuth) {
    return await api.put('/mqtt/auth-setting', { mqtt_require_auth: requireAuth });
  },
};

export default mqttService;
