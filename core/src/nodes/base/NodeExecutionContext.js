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
    
    const { app, flow, execution, logBuffer, inputStateManager, runtimeState } = executionData;
    this.app = app;
    this.flow = flow;
    this.execution = execution;
    this.logBuffer = logBuffer; // Optional log buffer for persistent logging
    this.inputStateManager = inputStateManager; // Optional input state manager for continuous execution
    this.runtimeState = runtimeState; // Optional runtime state store for trigger flags and tag caching
    
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
    // If InputStateManager is available (continuous execution), read from it
    if (this.inputStateManager) {
      const edges = this._getIncomingEdges();
      
      if (edges.length === 0 || index >= edges.length) {
        return null;
      }
      
      const edge = edges[index];
      const portName = edge.targetHandle || 'input';
      const inputData = this.inputStateManager.getInput(this.node.id, portName);
      
      // InputStateManager now stores {value, quality} objects, return as-is
      return inputData !== undefined ? inputData : null;
    }
    
    // Fallback to traditional edge-based reading (manual execution)
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
    // If InputStateManager is available (continuous execution), read from it
    if (this.inputStateManager) {
      const edges = this._getIncomingEdges();
      
      return edges
        .map(edge => {
          const portName = edge.targetHandle || 'input';
          const inputData = this.inputStateManager.getInput(this.node.id, portName);
          return inputData !== undefined ? inputData : null;
        })
        .filter(output => output !== null);
    }
    
    // Fallback to traditional edge-based reading (manual execution)
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
      this._bufferLog('info', data);
    } else {
      this.log.info(data, message);
      this._bufferLog('info', message || JSON.stringify(data), data);
    }
  }

  /**
   * Log debug message
   * 
   * @param {Object|string} data - Log data or message
   * @param {string} [message] - Message if data is object
   */
  logDebug(data, message) {
    if (typeof data === 'string') {
      this.log.debug(data);
      this._bufferLog('debug', data);
    } else {
      this.log.debug(data, message);
      this._bufferLog('debug', message || JSON.stringify(data), data);
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
      this._bufferLog('warn', data);
    } else {
      this.log.warn(data, message);
      this._bufferLog('warn', message || JSON.stringify(data), data);
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
      this._bufferLog('error', data);
    } else {
      this.log.error(data, message);
      this._bufferLog('error', message || JSON.stringify(data), data);
    }
  }

  /**
   * Write log to buffer for persistent storage
   * @private
   */
  _bufferLog(level, message, metadata = null) {
    // Only buffer logs if logging is enabled for this flow and we have a buffer
    if (this.logBuffer && this.flow.logs_enabled) {
      this.logBuffer.add({
        execution_id: this.execution.id,
        flow_id: this.flow.id,
        node_id: this.node.id,
        log_level: level,
        message: String(message),
        // Don't pass timestamp - let LogBuffer generate high-resolution timestamp for proper ordering
        metadata: metadata
      });
    }
  }

  /**
   * Automatically log node execution result using declarative log messages
   * Called by the execution engine after successful node execution
   * 
   * @param {Object} nodeInstance - The node instance (with getLogMessages method)
   * @param {Object} result - Execution result from node.execute()
   * @param {string} level - Log level ('info', 'debug', 'warn')
   */
  autoLogResult(nodeInstance, result, level = 'info') {
    // Check if node has logging enabled at this level
    const nodeLogLevel = this.node.data?.logLevel || 'none';
    if (!this._shouldLogLevel(nodeLogLevel, level)) {
      return; // Skip logging if node's log level doesn't include this level
    }
    
    const logMessages = nodeInstance.getLogMessages();
    const logFn = logMessages[level];
    
    if (logFn && typeof logFn === 'function') {
      try {
        const message = logFn(result);
        if (message) {
          // Call the appropriate log method
          switch (level) {
            case 'info':
              this.logInfo(message);
              break;
            case 'debug':
              this.logDebug(message);
              break;
            case 'warn':
              this.logWarn(message);
              break;
          }
        }
      } catch (error) {
        this.log.error({ error }, `Failed to generate ${level} log message for node ${this.node.type}`);
      }
    }
  }

  /**
   * Automatically log node execution error using declarative log messages
   * Called by the execution engine when node execution fails
   * 
   * @param {Object} nodeInstance - The node instance (with getLogMessages method)
   * @param {Error} error - The error that occurred
   */
  autoLogError(nodeInstance, error) {
    // Always log errors if node has any logging enabled (not 'none')
    const nodeLogLevel = this.node.data?.logLevel || 'none';
    if (nodeLogLevel === 'none') {
      return; // Skip error logging if node logging is completely disabled
    }
    
    const logMessages = nodeInstance.getLogMessages();
    const logFn = logMessages.error;
    
    if (logFn && typeof logFn === 'function') {
      try {
        const message = logFn(error);
        if (message) {
          this.logError(message);
        }
      } catch (err) {
        // Fallback to default error logging
        this.logError(`Node execution failed: ${error.message}`);
      }
    } else {
      // Default error logging if no custom message
      this.logError(`Node execution failed: ${error.message}`);
    }
  }

  /**
   * Check if a message should be logged based on node's log level
   * @private
   * @param {string} nodeLogLevel - Node's configured log level
   * @param {string} messageLevel - Level of the message being logged
   * @returns {boolean} True if message should be logged
   */
  _shouldLogLevel(nodeLogLevel, messageLevel) {
    const levels = { none: 0, error: 1, warn: 2, info: 3, debug: 4 };
    const nodeLevelValue = levels[nodeLogLevel] || 0;
    const messageLevelValue = levels[messageLevel] || 0;
    return messageLevelValue <= nodeLevelValue;
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
