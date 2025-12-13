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
    
    outputs: [
      {
        type: 'main', // Dynamic type - will output as configured type
        displayName: 'Value',
        description: 'Constant value output'
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
        name: 'valueType',
        displayName: 'Value Type',
        type: 'options',
        default: 'number',
        required: true,
        options: [
          {
            name: 'Number',
            value: 'number',
            description: 'Numeric value (integer or decimal)'
          },
          {
            name: 'String',
            value: 'string',
            description: 'Text value'
          },
          {
            name: 'Boolean',
            value: 'boolean',
            description: 'True or false'
          },
          {
            name: 'JSON',
            value: 'json',
            description: 'JSON object or array'
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
    
    extensions: {
      notes: 'Constant nodes execute once per scan cycle and output the configured value'
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
  async execute(node, nodeInputs, context) {
    const valueType = this.getParameter(node, 'valueType') || 'number';
    let value;
    
    try {
      switch (valueType) {
        case 'number':
          value = this.getParameter(node, 'numberValue') ?? 0;
          // Ensure it's a number
          value = Number(value);
          if (isNaN(value)) {
            throw new Error('Invalid number value');
          }
          break;
          
        case 'string':
          value = this.getParameter(node, 'stringValue') ?? '';
          // Ensure it's a string
          value = String(value);
          break;
          
        case 'boolean':
          value = this.getParameter(node, 'booleanValue') ?? false;
          // Ensure it's a boolean
          value = Boolean(value);
          break;
          
        case 'json':
          const jsonStr = this.getParameter(node, 'jsonValue') ?? '{}';
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
      
    } catch (error) {
      context.logger.error({
        nodeId: node.id,
        nodeType: node.type,
        error: error.message
      }, 'Constant node execution failed');
      
      throw error;
    }
  }
}
