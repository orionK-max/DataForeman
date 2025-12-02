// Input State Manager
// Tracks latest input values for continuous flow execution
// Each node's inputs are updated continuously and persist between scan cycles
// 
// IMPORTANT: Always stores {value, quality} objects to preserve OPC UA quality codes
// Quality codes (OPC UA): 0 = Good, higher values indicate various statuses (Uncertain, Bad, etc.)

/**
 * Manages input state for continuous flow execution.
 * Maintains a map of nodeId -> portName -> {value, quality}
 * Thread-safe for concurrent updates during scan cycles.
 */
export class InputStateManager {
  constructor() {
    // Map: nodeId -> Map(portName -> {value, quality})
    this.state = new Map();
  }

  /**
   * Update an input value for a node
   * IMPORTANT: Always pass full output object {value, quality} to preserve quality codes
   * @param {string} nodeId - Node ID
   * @param {string} port - Input port name
   * @param {Object} outputData - Output object {value, quality, ...other metadata}
   */
  updateInput(nodeId, port, outputData) {
    if (!this.state.has(nodeId)) {
      this.state.set(nodeId, new Map());
    }
    
    const nodeInputs = this.state.get(nodeId);
    
    // Store the full output object to preserve quality codes
    // If it's not an object or missing quality, default to good quality (0 = Good in OPC UA)
    let storedValue;
    if (outputData && typeof outputData === 'object' && 'value' in outputData) {
      storedValue = {
        value: outputData.value,
        quality: outputData.quality ?? 0
      };
    } else {
      // Legacy support: if raw value passed, wrap it with good quality
      storedValue = {
        value: outputData,
        quality: 0
      };
    }
    
    nodeInputs.set(port, storedValue);
    
    // DEBUG logging for input updates
    console.log(`[InputStateManager] Input updated: nodeId=${nodeId}, port=${port}, value=${JSON.stringify(storedValue.value)}, quality=${storedValue.quality}`);
  }

  /**
   * Get an input value for a node
   * @param {string} nodeId - Node ID
   * @param {string} port - Input port name
   * @returns {Object|undefined} Input object {value, quality} or undefined if not set
   */
  getInput(nodeId, port) {
    const nodeInputs = this.state.get(nodeId);
    if (!nodeInputs) {
      return undefined;
    }
    return nodeInputs.get(port);
  }

  /**
   * Get all inputs for a node
   * @param {string} nodeId - Node ID
   * @returns {Map<string, *>} Map of port name to value
   */
  getAllInputs(nodeId) {
    return this.state.get(nodeId) || new Map();
  }

  /**
   * Check if a node has any inputs set
   * @param {string} nodeId - Node ID
   * @returns {boolean} True if node has at least one input
   */
  hasInputs(nodeId) {
    const nodeInputs = this.state.get(nodeId);
    return nodeInputs && nodeInputs.size > 0;
  }

  /**
   * Get all input values for a node as a plain object
   * @param {string} nodeId - Node ID
   * @returns {Object} Object with port names as keys
   */
  getInputsAsObject(nodeId) {
    const inputs = this.getAllInputs(nodeId);
    const result = {};
    for (const [port, value] of inputs.entries()) {
      result[port] = value;
    }
    return result;
  }

  /**
   * Clear all inputs for a node
   * @param {string} nodeId - Node ID
   */
  clearNode(nodeId) {
    this.state.delete(nodeId);
  }

  /**
   * Clear all input state
   */
  clear() {
    this.state.clear();
  }

  /**
   * Get a snapshot of all input state for debugging
   * @returns {Object} Map of nodeId -> inputs object
   */
  getSnapshot() {
    const snapshot = {};
    for (const [nodeId, inputs] of this.state.entries()) {
      snapshot[nodeId] = this.getInputsAsObject(nodeId);
    }
    return snapshot;
  }

  /**
   * Log current input state (for debugging)
   * @param {string} prefix - Log prefix (e.g., scan cycle number)
   */
  logState(prefix = '') {
    const snapshot = this.getSnapshot();
    const nodeCount = Object.keys(snapshot).length;
    const totalInputs = Object.values(snapshot).reduce((sum, inputs) => sum + Object.keys(inputs).length, 0);
    
    console.log(`[InputStateManager] ${prefix} State: ${nodeCount} nodes, ${totalInputs} total inputs`);
    
    // Log each node's inputs
    for (const [nodeId, inputs] of Object.entries(snapshot)) {
      const inputSummary = Object.entries(inputs)
        .map(([port, value]) => `${port}=${JSON.stringify(value)}`)
        .join(', ');
      console.log(`  Node ${nodeId}: ${inputSummary}`);
    }
  }
}
