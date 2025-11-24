import { BaseNode } from '../base/BaseNode.js';

/**
 * Manual Trigger Node
 * 
 * For continuous flows: Outputs false by default, true when button pressed (for one scan)
 * For manual flows: Outputs true when flow is executed
 */
export class ManualTriggerNode extends BaseNode {
  description = {
    displayName: 'Manual Trigger',
    name: 'trigger-manual',
    version: 1,
    description: 'Control downstream execution with a button',
    category: 'TRIGGERS',
    
    // No inputs for trigger nodes
    inputs: [],
    
    // Single output (boolean trigger signal)
    outputs: [{ type: 'trigger', displayName: 'Trigger' }],
    
    // No configuration parameters needed
    properties: []
  };

  /**
   * Manual trigger always validates (no parameters to validate)
   */
  validate(node) {
    return { valid: true, errors: [] };
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => result.value === true ? 'Manual trigger fired' : null,
      debug: (result) => result.value === true ? `Manual trigger fired (mode: ${result.metadata?.mode})` : null,
      error: (error) => `Manual trigger error: ${error.message}`
    };
  }

  /**
   * Execute manual trigger
   * 
   * In continuous mode (scan-based):
   * - Default output: false (don't trigger downstream)
   * - When triggerFired flag set: output true for this scan only
   * - Flag automatically cleared after scan
   * 
   * In manual mode (one-shot):
   * - Always output: true (trigger entire flow)
   */
  async execute(context) {
    const startTime = Date.now();
    const isContinuousMode = context.execution?.scan_cycle !== undefined;
    
    // Use RuntimeStateStore for trigger flags (runtime state, not persisted configuration)
    const triggerFired = context.runtimeState?.getTriggerFlag(context.flow.id, context.node.id) || false;
    
    // In continuous mode: output true only when button pressed, false otherwise
    // In manual mode: always output true
    const outputValue = isContinuousMode ? triggerFired : true;
    
    const result = {
      value: outputValue,
      quality: 192, // Good quality
      metadata: {
        triggeredAt: new Date().toISOString(),
        triggerType: 'manual',
        mode: isContinuousMode ? 'continuous' : 'manual',
        scanCycle: context.execution?.scan_cycle
      }
    };
    
    // Clear trigger flag after this scan (if in continuous mode)
    if (isContinuousMode && triggerFired && context.runtimeState) {
      context.runtimeState.clearTriggerFlag(context.flow.id, context.node.id);
    }
    
    return result;
  }
}
