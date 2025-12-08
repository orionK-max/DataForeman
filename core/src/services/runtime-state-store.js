/**
 * RuntimeStateStore - In-memory storage for flow runtime state
 * 
 * Manages transient runtime state that should NOT be persisted in flow definitions.
 * Examples: trigger flags, cached tag values (future), node outputs (future).
 * 
 * State is organized by flow ID and cleared when flow is undeployed.
 * State does NOT persist across container restarts (in-memory only).
 * 
 * Phase 1: Trigger flags for manual trigger nodes
 * Phase 2: Tag value caching (tap into NATS→Ingestor flow)
 * Phase 3: Node outputs, execution context, other runtime data
 */
export class RuntimeStateStore {
  constructor() {
    // Flow runtime state: flowId -> { triggers: Map<nodeId, boolean>, tags: Map<tagId, any>, outputs: Map<nodeId, any> }
    this.flows = new Map();
    
    // Tag value cache: tagId -> { value, quality, timestamp, connectionId }
    // Provides zero-latency reads for flows
    this.tagCache = new Map();
  }

  /**
   * Initialize state for a flow (called when flow is deployed)
   * @param {string} flowId - Flow UUID
   */
  initFlow(flowId) {
    if (!this.flows.has(flowId)) {
      this.flows.set(flowId, {
        triggers: new Map(),
        tags: new Map(), // For Phase 2
        outputs: new Map() // Node execution outputs
      });
    }
  }

  /**
   * Clear all state for a flow (called when flow is undeployed)
   * @param {string} flowId - Flow UUID
   */
  clearFlow(flowId) {
    this.flows.delete(flowId);
  }

  /**
   * Clear all state (useful for testing or full reset)
   */
  clearAll() {
    this.flows.clear();
  }

  // ============================================================
  // TRIGGER FLAGS (Phase 1 - Active)
  // ============================================================

  /**
   * Set trigger flag for a manual trigger node
   * @param {string} flowId - Flow UUID
   * @param {string} nodeId - Node ID
   * @param {boolean} value - Trigger state (true = fired, false = cleared)
   */
  setTriggerFlag(flowId, nodeId, value) {
    this.initFlow(flowId);
    const flowState = this.flows.get(flowId);
    flowState.triggers.set(nodeId, value);
  }

  /**
   * Get trigger flag for a manual trigger node
   * @param {string} flowId - Flow UUID
   * @param {string} nodeId - Node ID
   * @returns {boolean} - True if trigger was fired, false otherwise
   */
  getTriggerFlag(flowId, nodeId) {
    const flowState = this.flows.get(flowId);
    if (!flowState) return false;
    return flowState.triggers.get(nodeId) || false;
  }

  /**
   * Clear trigger flag for a manual trigger node
   * @param {string} flowId - Flow UUID
   * @param {string} nodeId - Node ID
   */
  clearTriggerFlag(flowId, nodeId) {
    const flowState = this.flows.get(flowId);
    if (flowState) {
      flowState.triggers.delete(nodeId);
    }
  }

  /**
   * Get all trigger flags for a flow (useful for debugging)
   * @param {string} flowId - Flow UUID
   * @returns {Map<string, boolean>} - Map of nodeId -> trigger state
   */
  getTriggerFlags(flowId) {
    const flowState = this.flows.get(flowId);
    return flowState ? flowState.triggers : new Map();
  }

  // ============================================================
  // TAG VALUE CACHE
  // ============================================================

  /**
   * Set cached tag value (from NATS→Ingestor flow)
   * @param {number} tagId - Tag identifier
   * @param {*} value - Tag value (v_num, v_text, or v_json)
   * @param {number} quality - Quality code
   * @param {number} timestamp - Timestamp in milliseconds
   * @param {string} connectionId - Connection UUID
   * @param {string} [tagPath] - Optional tag path (for display purposes)
   * 
   * Called by ingestor when receiving tag updates from NATS
   * Provides zero-latency tag reads for flows
   */
  setTagValue(tagId, value, quality, timestamp, connectionId, tagPath) {
    this.tagCache.set(Number(tagId), {
      value,
      quality: quality != null ? Number(quality) : null,
      timestamp: new Date(timestamp).toISOString(),
      connectionId,
      tagPath: tagPath || null,
      cachedAt: Date.now()
    });
  }

  /**
   * Get cached tag value
   * @param {number} tagId - Tag identifier
   * @returns {Object|undefined} - Cached value object or undefined if not in cache
   * @returns {*} result.value - Tag value
   * @returns {number} result.quality - Quality code
   * @returns {string} result.timestamp - ISO timestamp
   * @returns {string} result.connectionId - Connection UUID
   */
  getTagValue(tagId) {
    return this.tagCache.get(Number(tagId));
  }

  /**
   * Clear cached value for a tag (useful when tag is deleted)
   * @param {number} tagId - Tag identifier
   */
  clearTagValue(tagId) {
    this.tagCache.delete(Number(tagId));
  }

  /**
   * Clear all cached tag values
   */
  clearAllTagValues() {
    this.tagCache.clear();
  }

  /**
   * Get statistics about the runtime state (useful for monitoring)
   * @returns {object} - Statistics object
   */
  getStats() {
    const stats = {
      flowCount: this.flows.size,
      totalTriggers: 0,
      totalTags: 0,
      totalOutputs: 0,
      cachedTagValues: this.tagCache.size,
      flows: []
    };

    for (const [flowId, state] of this.flows.entries()) {
      stats.totalTriggers += state.triggers.size;
      stats.totalTags += state.tags.size;
      stats.totalOutputs += state.outputs?.size || 0;
      stats.flows.push({
        flowId,
        triggerCount: state.triggers.size,
        tagCount: state.tags.size,
        outputCount: state.outputs?.size || 0
      });
    }

    return stats;
  }

  // ============================================================
  // NODE OUTPUTS (Phase 3 - Active)
  // ============================================================

  /**
   * Set node execution output (runtime data)
   * @param {string} flowId - Flow UUID
   * @param {string} nodeId - Node ID
   * @param {object} runtimeData - Runtime data from node execute() return
   */
  setNodeOutput(flowId, nodeId, runtimeData) {
    this.initFlow(flowId);
    const flowState = this.flows.get(flowId);
    flowState.outputs.set(nodeId, {
      ...runtimeData,
      timestamp: Date.now()
    });
  }

  /**
   * Get node execution output
   * @param {string} flowId - Flow UUID
   * @param {string} nodeId - Node ID
   * @returns {object|undefined} - Runtime data or undefined
   */
  getNodeOutput(flowId, nodeId) {
    const flowState = this.flows.get(flowId);
    if (!flowState) return undefined;
    return flowState.outputs.get(nodeId);
  }

  /**
   * Get all node outputs for a flow
   * @param {string} flowId - Flow UUID
   * @returns {Map<string, object>} - Map of nodeId -> runtime data
   */
  getNodeOutputs(flowId) {
    const flowState = this.flows.get(flowId);
    return flowState ? flowState.outputs : new Map();
  }

  /**
   * Clear node output (when node is removed or flow is cleared)
   * @param {string} flowId - Flow UUID
   * @param {string} nodeId - Node ID
   */
  clearNodeOutput(flowId, nodeId) {
    const flowState = this.flows.get(flowId);
    if (flowState) {
      flowState.outputs.delete(nodeId);
    }
  }
}
