import { BaseNode } from '../base/BaseNode.js';

/**
 * Gate Node - Conditional Control Flow
 * 
 * Controls data flow based on a boolean condition.
 * When condition is true, passes input value through.
 * When condition is false, outputs either null or previous value (configurable).
 * 
 * This node enables conditional execution patterns like:
 * - "Process A+B only when A > B" (using null mode)
 * - "Hold last good value during brief outages" (using previous mode)
 */
export class GateNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Gate',
    name: 'gate',
    version: 1,
    description: 'Control data flow based on condition',
    category: 'LOGIC_MATH',
    section: 'CONTROL',
    icon: '🚪',
    color: '#00BCD4',
    
    inputs: [
      {
        type: 'boolean',
        displayName: 'Condition',
        required: true,
        skipNodeOnNull: false, // Execute even if condition is null (treat as false)
        description: 'When true, input passes through'
      },
      {
        type: 'main',
        displayName: 'Input',
        required: true,
        skipNodeOnNull: false, // Execute even if input is null (to control output)
        description: 'Data to control'
      }
    ],
    
    outputs: [
      {
        type: 'main',
        displayName: 'Output',
        description: 'Controlled output based on condition'
      }
    ],
    
    visual: {
      iconMap: {
        null: '🚫',
        previous: '💾',
      },
      iconField: 'falseOutputMode',
      subtitle: 'Output {{falseOutputMode}} when false',
    },
    
    properties: [
      {
        name: 'falseOutputMode',
        displayName: 'Output When False',
        type: 'options',
        default: 'null',
        required: true,
        options: [
          {
            name: 'Output Null',
            value: 'null',
            description: 'Output null (downstream nodes skip if configured)'
          },
          {
            name: 'Output Previous Value',
            value: 'previous',
            description: 'Hold last valid value'
          }
        ],
        description: 'What to output when condition is false'
      }
    ],
    
    extensions: {
      // Future: Add timeout for previous mode (revert to null after X seconds)
    }
  };

  constructor() {
    super();
    // Per-node state storage for "previous" mode
    // Map of nodeId -> {value, quality}
    this.nodeStates = new Map();
  }

  /**
   * Get state for a specific node instance
   */
  getNodeState(nodeId) {
    if (!this.nodeStates.has(nodeId)) {
      this.nodeStates.set(nodeId, {
        previousValue: null,
        previousQuality: 0
      });
    }
    return this.nodeStates.get(nodeId);
  }

  /**
   * Validate gate configuration
   */
  validate(node) {
    const errors = [];
    
    const mode = this.getParameter(node, 'falseOutputMode');
    if (mode && !['null', 'previous'].includes(mode)) {
      errors.push('falseOutputMode must be "null" or "previous"');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        if (result.conditionMet) {
          return `Gate OPEN: passed value ${result.value} (quality: ${result.quality})`;
        } else {
          if (result.mode === 'previous') {
            return `Gate CLOSED: holding previous value ${result.value} (quality: ${result.quality})`;
          } else {
            return `Gate CLOSED: output null`;
          }
        }
      },
      debug: (result) => {
        return `Condition: ${result.condition}, Mode: ${result.mode}, Output: ${result.value}`;
      },
      error: (error) => `Gate execution failed: ${error.message}`
    };
  }

  /**
   * Execute gate logic
   */
  async execute(context) {
    const mode = this.getParameter(context.node, 'falseOutputMode', 'null');
    const nodeId = context.node.id;
    const state = this.getNodeState(nodeId);
    
    // Get inputs
    const conditionInput = context.getInputValue(0);
    const dataInput = context.getInputValue(1);
    
    // Extract condition value (default to false if null/undefined)
    let condition = false;
    if (conditionInput && conditionInput.value !== null && conditionInput.value !== undefined) {
      condition = Boolean(conditionInput.value);
    }
    
    // Extract data value and quality
    const inputValue = dataInput?.value ?? null;
    const inputQuality = dataInput?.quality ?? 0;
    
    // Gate logic
    if (condition) {
      // Condition TRUE - pass through input
      // Store as previous value for future use (quality 0 = Good in OPC UA)
      if (inputValue !== null && inputQuality < 192) {
        state.previousValue = inputValue;
        state.previousQuality = inputQuality;
      }
      
      return {
        value: inputValue,
        quality: inputQuality,
        conditionMet: true,
        condition,
        mode,
        timestamp: new Date().toISOString()
      };
    } else {
      // Condition FALSE - apply mode
      if (mode === 'previous') {
        // Output previous value (or null if no previous)
        return {
          value: state.previousValue,
          quality: state.previousQuality,
          conditionMet: false,
          condition,
          mode,
          heldPrevious: true,
          timestamp: new Date().toISOString()
        };
      } else {
        // Output null (downstream nodes will skip if configured)
        return {
          value: null,
          quality: 0,
          conditionMet: false,
          condition,
          mode,
          timestamp: new Date().toISOString()
        };
      }
    }
  }
}
