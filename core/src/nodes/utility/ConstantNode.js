import { BaseNode } from '../base/BaseNode.js';

/**
 * Constant Node - Output Static Values
 * 
 * Outputs a constant value that can be used as input to other nodes.
 * Supports number, string, boolean, and JSON values.
 * 
 * Use cases:
 * - Comparison thresholds (e.g., "temperature > 75")
 * - String constants for labels
 * - JSON configuration objects
 * - Boolean flags
 */
export class ConstantNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Constant',
    name: 'constant',
    version: 1,
    description: 'Output a constant value (number, string, boolean, or JSON)',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
    icon: '🔢',
    color: '#607D8B',
    
    inputs: [], // No inputs - outputs constant value
    outputs: [], // Outputs defined by ioRules based on valueType
    
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
          icon: '🔢',
          title: 'Constant',
          color: '#607D8B',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{_constantValue}}',
          visible: '{{_constantValue}}'
        }
      ],
      handles: {
        inputs: [],
        outputs: [], // Dynamic - defined by ioRules based on valueType
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
        name: 'valueType',
        displayName: 'Value Type',
        type: 'select',
        default: 'number',
        required: true,
        options: [
          {
            label: 'Number',
            value: 'number'
          },
          {
            label: 'String',
            value: 'string'
          },
          {
            label: 'Boolean',
            value: 'boolean'
          },
          {
            label: 'JSON',
            value: 'json'
          }
        ],
        description: 'Type of constant value'
      },
      {
        name: 'numberValue',
        displayName: 'Value',
        type: 'number',
        default: 0,
        userExposable: true,
        displayOptions: {
          show: {
            valueType: ['number']
          }
        },
        description: 'Numeric value'
      },
      {
        name: 'stringValue',
        displayName: 'Value',
        type: 'string',
        default: '',
        userExposable: true,
        displayOptions: {
          show: {
            valueType: ['string']
          }
        },
        description: 'Text value'
      },
      {
        name: 'booleanValue',
        displayName: 'Boolean Value',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            valueType: ['boolean']
          }
        },
        description: 'True or false value'
      },
      {
        name: 'jsonValue',
        displayName: 'JSON Value',
        type: 'code',
        default: '{}',
        displayOptions: {
          show: {
            valueType: ['json']
          }
        },
        description: 'JSON object or array (must be valid JSON)'
      }
    ],
    
    ioRules: [
      {
        when: { valueType: 'number' },
        inputs: { count: 0 },
        outputs: {
          count: 1,
          types: ['number']
        }
      },
      {
        when: { valueType: 'string' },
        inputs: { count: 0 },
        outputs: {
          count: 1,
          types: ['string']
        }
      },
      {
        when: { valueType: 'boolean' },
        inputs: { count: 0 },
        outputs: {
          count: 1,
          types: ['boolean']
        }
      },
      {
        when: { valueType: 'json' },
        inputs: { count: 0 },
        outputs: {
          count: 1,
          types: ['json']
        }
      }
    ],
    
    extensions: {
      notes: 'Constant nodes execute once per scan cycle and output the configured value'
    },
    
    // Config UI structure
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration',
          properties: ['valueType', 'numberValue', 'stringValue', 'booleanValue', 'jsonValue']
        }
      ]
    }
  };

  /**
   * Validate constant configuration
   */
  validate(node) {
    const errors = [];
    
    const valueType = this.getParameter(node, 'valueType');
    if (!valueType || !['number', 'string', 'boolean', 'json'].includes(valueType)) {
      errors.push('valueType must be one of: number, string, boolean, json');
    }
    
    // Validate JSON if type is json
    if (valueType === 'json') {
      const jsonValue = this.getParameter(node, 'jsonValue');
      if (jsonValue) {
        try {
          JSON.parse(jsonValue);
        } catch (e) {
          errors.push(`Invalid JSON: ${e.message}`);
        }
      }
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
      info: (result) => `Constant output: ${JSON.stringify(result.value)} (${result.valueType})`,
      debug: (result) => `Type: ${result.valueType}, Value: ${result.value}`,
      error: (error) => `Constant execution failed: ${error.message}`
    };
  }

  /**
   * Execute constant node
   * Outputs the configured constant value with good quality
   */
  async execute(context) {
    const valueType = this.getParameter(context.node, 'valueType') || 'number';
    let value;
    
    switch (valueType) {
      case 'number':
        value = this.getParameter(context.node, 'numberValue') ?? 0;
        // Ensure it's a number
        value = Number(value);
        if (isNaN(value)) {
          throw new Error('Invalid number value');
        }
        break;
        
      case 'string':
        value = this.getParameter(context.node, 'stringValue') ?? '';
        // Ensure it's a string
        value = String(value);
        break;
        
      case 'boolean':
        value = this.getParameter(context.node, 'booleanValue') ?? false;
        // The value is already stored as boolean in the database
        // No need to convert - just ensure it's truly boolean
        if (typeof value !== 'boolean') {
          // Handle string representations if somehow stored as string
          if (typeof value === 'string') {
            value = value.toLowerCase() === 'true';
          } else {
            value = Boolean(value);
          }
        }
        break;
        
      case 'json':
        const jsonStr = this.getParameter(context.node, 'jsonValue') ?? '{}';
        value = JSON.parse(jsonStr);
        break;
        
      default:
        throw new Error(`Unknown value type: ${valueType}`);
    }
    
    // Output constant value with good quality
    return {
      value,
      quality: 0, // Good quality
      valueType
    };
  }

  static get help() {
    return {
      overview: "Outputs a constant value that remains unchanged during flow execution. Supports number, string, boolean, and JSON object types. Essential for providing fixed values as inputs to other nodes.",
      useCases: [
        "Supply threshold values for comparison operations (e.g., temperature limit of 75°C)",
        "Provide default values or fallback constants for calculations",
        "Define configuration objects as JSON for use across the flow",
        "Generate boolean flags for conditional logic and testing"
      ],
      examples: [
        {
          title: "Temperature Threshold",
          config: { valueType: "number", numberValue: 75 },
          input: {},
          output: { value: 75, valueType: "number" }
        },
        {
          title: "Device Name",
          config: { valueType: "string", stringValue: "MOTOR-001" },
          input: {},
          output: { value: "MOTOR-001", valueType: "string" }
        },
        {
          title: "Configuration Object",
          config: { valueType: "json", jsonValue: '{"min":20,"max":80}' },
          input: {},
          output: { value: { min: 20, max: 80 }, valueType: "json" }
        }
      ],
      tips: [
        "Use Constant nodes instead of hardcoding values - easier to update and test",
        "JSON constants can store complex configuration objects for scripts",
        "Boolean constants useful for enabling/disabling parts of flows during testing",
        "Number values support decimals for precise thresholds and coefficients",
        "Constant nodes have no inputs - they always output the same value"
      ],
      relatedNodes: ["ComparisonNode", "MathNode", "GateNode"]
    };
  }
}
