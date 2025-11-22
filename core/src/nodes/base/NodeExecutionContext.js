/**
 * Node Execution Context
 * 
 * Provides access to execution environment and helper functions for nodes.
 * This is the primary interface nodes use to interact with the system.
 */
export class NodeExecutionContext {
  /**
   * Create execution context
   * 
   * @param {Object} node - Current node instance
   * @param {Map} nodeOutputs - Map of node ID -> output data
   * @param {Object} executionData - Execution environment data
   * @param {Object} executionData.app - Fastify app instance
   * @param {Object} executionData.flow - Flow definition
   * @param {Object} executionData.execution - Execution record
   */
  constructor(node, nodeOutputs, executionData) {
    this.node = node;
    this.nodeOutputs = nodeOutputs;
    
    const { app, flow, execution } = executionData;
    this.app = app;
    this.flow = flow;
    this.execution = execution;
    
    // Convenient accessors
    this.db = app.db;
    this.tsdb = app.tsdb || app.db;
    this.nats = app.nats;
    this.log = app.log.child({
      flowId: flow.id,
      executionId: execution.id,
      nodeId: node.id,
      nodeType: node.type
    });
  }

  /**
   * Get input value from a connected node
   * 
   * @param {number} [index=0] - Input index (0-based)
   * @returns {Object|null} Input data with value and quality, or null if no input
   * @returns {*} result.value - Input value
   * @returns {number} result.quality - Quality code
   * @returns {Object} [result.metadata] - Optional metadata
   */
  getInputValue(index = 0) {
    const edges = this._getIncomingEdges();
    
    if (edges.length === 0 || index >= edges.length) {
      return null;
    }
    
    const edge = edges[index];
    return this.nodeOutputs.get(edge.source) || null;
  }

  /**
   * Get all input values from all connected nodes
   * 
   * @returns {Array<Object>} Array of input data objects
   */
  getInputValues() {
    const edges = this._getIncomingEdges();
    
    return edges
      .map(edge => this.nodeOutputs.get(edge.source))
      .filter(output => output !== undefined && output !== null);
  }

  /**
   * Get number of inputs connected to this node
   * 
   * @returns {number} Input count
   */
  getInputCount() {
    return this._getIncomingEdges().length;
  }

  /**
   * Check if node has any inputs
   * 
   * @returns {boolean} True if has inputs
   */
  hasInputs() {
    return this.getInputCount() > 0;
  }

  /**
   * Get parameter value from node configuration
   * Convenience wrapper around node.data
   * 
   * @param {string} name - Parameter name
   * @param {*} [defaultValue] - Default value if not set
   * @returns {*} Parameter value or default
   */
  getNodeParameter(name, defaultValue = undefined) {
    if (!this.node.data || typeof this.node.data !== 'object') {
      return defaultValue;
    }
    
    const value = this.node.data[name];
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get all node parameters
   * 
   * @returns {Object} All parameters as key-value pairs
   */
  getNodeParameters() {
    return this.node.data || {};
  }

  /**
   * Publish message to NATS
   * 
   * @param {string} subject - NATS subject
   * @param {Object} payload - Message payload
   * @returns {Promise<void>}
   */
  async publishToNats(subject, payload) {
    if (!this.nats || !this.nats.healthy || !this.nats.healthy()) {
      this.log.warn({ subject }, 'NATS not available for publishing');
      throw new Error('NATS not available');
    }
    
    try {
      await this.nats.publish(subject, payload);
      this.log.debug({ subject, payload }, 'Published to NATS');
    } catch (error) {
      this.log.error({ error, subject }, 'Failed to publish to NATS');
      throw error;
    }
  }

  /**
   * Query database
   * Convenience wrapper with logging
   * 
   * @param {string} sql - SQL query
   * @param {Array} [params] - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(sql, params = []) {
    try {
      const result = await this.db.query(sql, params);
      this.log.debug({ sql, params, rowCount: result.rows?.length }, 'Database query executed');
      return result;
    } catch (error) {
      this.log.error({ error, sql, params }, 'Database query failed');
      throw error;
    }
  }

  /**
   * Query time-series database
   * 
   * @param {string} sql - SQL query
   * @param {Array} [params] - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async queryTimeseries(sql, params = []) {
    try {
      const result = await this.tsdb.query(sql, params);
      this.log.debug({ sql, params, rowCount: result.rows?.length }, 'Timeseries query executed');
      return result;
    } catch (error) {
      this.log.error({ error, sql, params }, 'Timeseries query failed');
      throw error;
    }
  }

  /**
   * Get flow definition
   * 
   * @returns {Object} Flow definition
   */
  getFlow() {
    return this.flow;
  }

  /**
   * Get execution record
   * 
   * @returns {Object} Execution record
   */
  getExecution() {
    return this.execution;
  }

  /**
   * Get current node
   * 
   * @returns {Object} Node instance
   */
  getNode() {
    return this.node;
  }

  /**
   * Log info message
   * 
   * @param {Object|string} data - Log data or message
   * @param {string} [message] - Message if data is object
   */
  logInfo(data, message) {
    if (typeof data === 'string') {
      this.log.info(data);
    } else {
      this.log.info(data, message);
    }
  }

  /**
   * Log warning message
   * 
   * @param {Object|string} data - Log data or message
   * @param {string} [message] - Message if data is object
   */
  logWarn(data, message) {
    if (typeof data === 'string') {
      this.log.warn(data);
    } else {
      this.log.warn(data, message);
    }
  }

  /**
   * Log error message
   * 
   * @param {Object|string} data - Log data or message
   * @param {string} [message] - Message if data is object
   */
  logError(data, message) {
    if (typeof data === 'string') {
      this.log.error(data);
    } else {
      this.log.error(data, message);
    }
  }

  /**
   * Get incoming edges for current node
   * @private
   * @returns {Array<Object>} Array of edges
   */
  _getIncomingEdges() {
    const edges = this.execution.edges || this.execution.definition?.edges || [];
    return edges.filter(edge => edge.target === this.node.id);
  }
}
