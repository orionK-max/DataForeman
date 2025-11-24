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
    // Structure: flowId -> { triggers: Map<nodeId, boolean>, tags: Map<tagId, value> }
    this.flows = new Map();
  }

  /**
   * Initialize state for a flow (called when flow is deployed)
   * @param {string} flowId - Flow UUID
   */
  initFlow(flowId) {
    if (!this.flows.has(flowId)) {
      this.flows.set(flowId, {
        triggers: new Map(),
        tags: new Map() // For Phase 2
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
  // TAG VALUE CACHE (Phase 2 - Placeholder)
  // ============================================================

  /**
   * Set cached tag value (from NATS→Ingestor flow)
   * @param {string} tagId - Tag identifier
   * @param {*} value - Tag value
   * @param {number} timestamp - Timestamp of the value
   * 
   * TODO: Implement in Phase 2
   * - Called by ingestor when receiving tag updates from NATS
   * - Provides zero-latency tag reads for flows
   * - Eliminates DB queries for tag values during flow execution
   */
  setTagValue(tagId, value, timestamp) {
    // Phase 2 implementation
    // For now, this is a no-op stub
  }

  /**
   * Get cached tag value
   * @param {string} tagId - Tag identifier
   * @returns {*} - Cached value or undefined if not in cache
   * 
   * TODO: Implement in Phase 2
   */
  getTagValue(tagId) {
    // Phase 2 implementation
    return undefined;
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
      flows: []
    };

    for (const [flowId, state] of this.flows.entries()) {
      stats.totalTriggers += state.triggers.size;
      stats.totalTags += state.tags.size;
      stats.flows.push({
        flowId,
        triggerCount: state.triggers.size,
        tagCount: state.tags.size
      });
    }

    return stats;
  }
}
