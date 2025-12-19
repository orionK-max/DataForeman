import { BaseNode } from '../base/BaseNode.js';

/**
 * Manual Trigger Node
 * 
 * For continuous flows: Outputs false by default, true when button pressed (for one scan)
 * For manual flows: Outputs true when flow is executed
 */
export class ManualTriggerNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Manual Trigger',
    name: 'trigger-manual',
    version: 1,
    description: 'Control downstream execution with a button',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
    icon: '▶️',
    color: '#2196F3',
    
    // No inputs for trigger nodes
    inputs: [],
    
    // Single output (boolean trigger signal)
    outputs: [{ type: 'trigger', displayName: 'Trigger' }],
    
    // No configuration parameters needed
    properties: [],

    // Config UI structure
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        }
      ]
    }
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
      quality: 0, // Good quality (OPC UA standard)
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

  static get help() {
    return {
      overview: "Controls downstream execution with a button trigger. In continuous flows, outputs false by default and true when button pressed (for one scan). In manual flows, always outputs true when flow executes. Use for manual control and testing.",
      useCases: [
        "Manually trigger data writes or calculations on demand in continuous flows",
        "Test downstream logic by controlling when values are processed",
        "Implement manual override buttons for automated processes",
        "Create user-initiated actions in monitoring dashboards"
      ],
      examples: [
        {
          title: "Continuous Mode - Button Not Pressed",
          config: {},
          input: {},
          output: { value: false, triggerType: "manual", mode: "continuous" }
        },
        {
          title: "Continuous Mode - Button Pressed",
          config: {},
          input: {},
          output: { value: true, triggerType: "manual", mode: "continuous" }
        },
        {
          title: "Manual Mode - Flow Executed",
          config: {},
          input: {},
          output: { value: true, triggerType: "manual", mode: "manual" }
        }
      ],
      tips: [
        "In continuous flows: trigger fires only when button pressed, then auto-clears",
        "In manual flows: trigger always outputs true since entire flow is manually executed",
        "Connect to Gate node condition input to enable/disable downstream processing",
        "Use with Boolean Logic (NOT) to create 'stop' buttons",
        "Trigger state is temporary - not saved between flow restarts",
        "No configuration needed - just press the button in the UI"
      ],
      relatedNodes: ["GateNode", "BooleanLogicNode", "SwitchNode"]
    };
  }
}
