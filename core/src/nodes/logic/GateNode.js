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
      canvas: {
        minWidth: 160,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '🚪',
          title: 'Gate',
          color: '#00BCD4',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{falseOutputMode}}',
          visible: '{{falseOutputMode}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: '33.33%', color: 'auto', label: null, visible: true },
          { index: 1, position: '66.67%', color: 'auto', label: null, visible: true }
        ],
        outputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff'
      },
      status: {
        execution: {
          enabled: true,
          position: 'top-left',
          offset: { x: -10, y: -10 }
        },
        pinned: {
          enabled: true,
          position: 'top-right',
          offset: { x: -8, y: -8 }
        },
        executionOrder: {
          enabled: true,
          position: 'header'
        }
      },
      runtime: {
        enabled: false
      }
    },
    
    properties: [
      {
        name: 'falseOutputMode',
        displayName: 'Output When False',
        type: 'select',
        default: 'null',
        required: true,
        options: [
          {
            label: 'Output Null',
            value: 'null'
          },
          {
            label: 'Output Previous Value',
            value: 'previous'
          }
        ],
        description: 'What to output when condition is false'
      }
    ],
    
    extensions: {
      // Future: Add timeout for previous mode (revert to null after X seconds)
    },

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

  static get help() {
    return {
      overview: "Controls data flow based on a boolean condition. When condition is true, input passes through unchanged. When false, outputs either null or previous value depending on configuration. Essential for conditional execution and value holding.",
      useCases: [
        "Process sensor data only when quality is good - stop calculations during sensor failures",
        "Hold last good temperature value during brief communication outages",
        "Execute downstream calculations only when temperature exceeds threshold",
        "Implement conditional logging - write values only when specific conditions are met"
      ],
      examples: [
        {
          title: "Quality Filter (null mode)",
          config: { falseOutputMode: "null" },
          input: { condition: false, input: 45.2 },
          output: { value: null, conditionMet: false }
        },
        {
          title: "Value Holder (previous mode)",
          config: { falseOutputMode: "previous" },
          input: { condition: false, input: 30.5, previousOutput: 28.3 },
          output: { value: 28.3, conditionMet: false, heldPrevious: true }
        },
        {
          title: "Pass Through",
          config: { falseOutputMode: "null" },
          input: { condition: true, input: 67.8 },
          output: { value: 67.8, conditionMet: true }
        }
      ],
      tips: [
        "Use 'null' mode to stop downstream execution when condition is false",
        "Use 'previous' mode to hold last good value during brief outages or invalid conditions",
        "Connect Comparison or RangeCheck node output to condition input",
        "Downstream nodes with 'skipNodeOnNull' will not execute when gate outputs null",
        "Previous mode stores last output - first execution with false condition outputs input value"
      ],
      relatedNodes: ["SwitchNode", "ComparisonNode", "BooleanLogicNode"]
    };
  }
}
