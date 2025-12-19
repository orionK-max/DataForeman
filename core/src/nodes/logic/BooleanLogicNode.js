import { BaseNode } from '../base/BaseNode.js';

/**
 * Boolean Logic Node - performs logical operations on boolean inputs
 * Supports: AND, OR, XOR, NOT, NAND, NOR
 */
export class BooleanLogicNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Boolean Logic',
    name: 'boolean-logic',
    version: 1,
    description: 'Perform logical operations on boolean inputs (AND, OR, XOR, NOT, NAND, NOR)',
    category: 'LOGIC_MATH',
    section: 'LOGIC',
    icon: '🔀',
    color: '#9C27B0',
    inputs: [
      { type: 'boolean', displayName: 'Input 1', required: true, typeFixed: true }
    ],
    outputs: [{ type: 'boolean', displayName: 'Result' }],
    
    // I/O Rules - parameter-driven dynamic I/O configuration
    // Note: inputConfiguration removed - now using ioRules exclusively
    ioRules: [
      {
        when: { operation: 'not' },
        inputs: {
          count: 1,              // Fixed: exactly 1 input
          type: 'boolean',
          typeFixed: true,
          required: true
        },
        outputs: {
          count: 1,
          type: 'boolean'
        }
      },
      {
        when: { operation: ['and', 'or', 'nand', 'nor'] },
        inputs: {
          min: 2,
          max: 10,
          default: 2,
          canAdd: true,
          canRemove: true,
          type: 'boolean',
          typeFixed: true,
          required: true
        },
        outputs: {
          count: 1,
          type: 'boolean'
        }
      },
      {
        when: { operation: 'xor' },
        inputs: {
          min: 2,
          max: 2,                // XOR only works with exactly 2 inputs
          default: 2,
          canAdd: false,         // Cannot add more than 2
          canRemove: false,      // Cannot have less than 2
          type: 'boolean',
          typeFixed: true,
          required: true
        },
        outputs: {
          count: 1,
          type: 'boolean'
        }
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
          icon: '🔀',
          title: 'Boolean Logic',
          color: '#9C27B0',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{operation}}',
          visible: '{{operation}}'
        }
      ],
      handles: {
        inputs: [],  // Dynamic
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
        displayName: 'Operation',
        name: 'operation',
        type: 'select',
        options: [
          {
            label: 'AND',
            value: 'and'
          },
          {
            label: 'OR',
            value: 'or'
          },
          {
            label: 'XOR',
            value: 'xor'
          },
          {
            label: 'NOT',
            value: 'not'
          },
          {
            label: 'NAND',
            value: 'nand'
          },
          {
            label: 'NOR',
            value: 'nor'
          }
        ],
        default: 'and',
        required: true,
        description: 'Logical operation to perform'
      }
    ],

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

  async execute(context) {
    const { log } = context;
    const operation = this.getParameter(context.node, 'operation', 'and');
    
    // Get all input values and convert to boolean
    const values = [];
    for (let i = 0; i < context.getInputCount(); i++) {
      const inputData = context.getInputValue(i);
      const value = inputData?.value ?? inputData;
      values.push(!!value);
    }

    // Handle case where we have no inputs
    if (values.length === 0) {
      return { value: null, quality: 192 }; // 192 = bad quality
    }

    let result;
    
    switch (operation) {
      case 'and':
        result = values.every(v => v === true);
        break;
        
      case 'or':
        result = values.some(v => v === true);
        break;
        
      case 'xor':
        // XOR: true if odd number of true values (for 2 inputs: A XOR B)
        result = values.filter(v => v === true).length === 1;
        break;
        
      case 'not':
        // NOT: invert first input
        result = !values[0];
        break;
        
      case 'nand':
        // NAND: NOT AND
        result = !values.every(v => v === true);
        break;
        
      case 'nor':
        // NOR: NOT OR
        result = !values.some(v => v === true);
        break;
        
      default:
        return { 
          value: null, 
          quality: 192,
          operation,
          inputs: values,
          error: `Unknown boolean operation: ${operation}`,
          timestamp: new Date().toISOString()
        };
    }

    return { 
      value: result, 
      quality: 0,
      operation,
      inputs: values,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    const operationLabels = {
      'and': 'AND',
      'or': 'OR',
      'xor': 'XOR',
      'not': 'NOT',
      'nand': 'NAND',
      'nor': 'NOR'
    };
    
    return {
      info: (result) => {
        if (result.error) {
          return `Boolean logic failed: ${result.error}`;
        }
        const label = operationLabels[result.operation] || result.operation;
        return `${label}: [${result.inputs.join(', ')}] = ${result.value}`;
      },
      debug: (result) => {
        if (result.error) {
          return `Boolean operation error: ${result.error}, quality: ${result.quality}`;
        }
        return `Boolean ${result.operation}: ${result.value}, quality: ${result.quality}`;
      },
      error: (error) => `Boolean operation failed: ${error.message}`
    };
  }

  static get help() {
    return {
      overview: "Performs logical operations on boolean inputs (AND, OR, XOR, NOT, NAND, NOR). Supports 1-10 inputs depending on operation. Essential for building complex conditional logic from multiple conditions.",
      useCases: [
        "Combine multiple safety conditions - equipment runs only when all conditions are safe (AND)",
        "Create alarm conditions that trigger if any sensor exceeds limits (OR)",
        "Implement mutex logic where only one of two conditions should be true (XOR)",
        "Invert boolean signals for opposite logic (NOT)"
      ],
      examples: [
        {
          title: "Safety Interlock (AND)",
          config: { operation: "and" },
          input: { inputs: [true, true, false] },
          output: { value: false, operation: "and" }
        },
        {
          title: "Multi-Sensor Alarm (OR)",
          config: { operation: "or" },
          input: { inputs: [false, false, true] },
          output: { value: true, operation: "or" }
        },
        {
          title: "Signal Inversion (NOT)",
          config: { operation: "not" },
          input: { inputs: [true] },
          output: { value: false, operation: "not" }
        }
      ],
      tips: [
        "AND operation requires ALL inputs to be true for output to be true",
        "OR operation requires ANY input to be true for output to be true",
        "XOR works with exactly 2 inputs - output true when inputs differ",
        "NOT operation accepts only 1 input and inverts it",
        "NAND and NOR are inverted AND and OR - useful for certain logic patterns",
        "Input count is automatically adjusted based on selected operation"
      ],
      relatedNodes: ["ComparisonNode", "GateNode", "RangeCheckNode"]
    };
  }
}
