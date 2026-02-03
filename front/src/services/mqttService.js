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
    return response.clients || [];
  },

  /**
   * Get active MQTT topics
   * @returns {Promise<Array>} List of topics with subscriber counts
   */
  async getTopics() {
    const response = await api.get('/mqtt/topics');
    return response.topics || [];
  },
};

export default mqttService;
