import { BaseNode } from '../base/BaseNode.js';

/**
 * Type Convert Node - converts values between types
 * Handles number ↔ string ↔ boolean conversions
 */
export class TypeConvertNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Type Convert',
    name: 'type-convert',
    version: 1,
    description: 'Convert values between types (number, string, boolean)',
    category: 'DATA_TRANSFORM',
    section: 'CONVERSION',
    icon: '🔄',
    color: '#00BCD4',
    inputs: [
      { type: 'main', displayName: 'Value', required: true }
    ],
    outputs: [
      { type: 'main', displayName: 'Result' }
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
          icon: '🔄',
          title: 'Type Convert',
          color: '#00BCD4',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '→ {{targetType}}',
          visible: '{{targetType}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
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
        displayName: 'Target Type',
        name: 'targetType',
        type: 'select',
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
          }
        ],
        default: 'string',
        required: true,
        description: 'Type to convert the value to'
      },
      {
        displayName: 'On Error',
        name: 'onError',
        type: 'select',
        options: [
          {
            label: 'Return Null',
            value: 'null'
          },
          {
            label: 'Return Original',
            value: 'original'
          },
          {
            label: 'Use Default',
            value: 'default'
          }
        ],
        default: 'null',
        required: true,
        description: 'What to do if conversion fails'
      },
      {
        displayName: 'Default Value',
        name: 'defaultValue',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            onError: ['default']
          }
        },
        description: 'Default value to use when conversion fails'
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
    const targetType = this.getParameter(context.node, 'targetType', 'string');
    const onError = this.getParameter(context.node, 'onError', 'null');
    const defaultValue = this.getParameter(context.node, 'defaultValue', '');
    
    // Get input value
    const inputData = context.getInputValue(0);
    const inputValue = inputData?.value ?? inputData;

    // Handle null/undefined
    if (inputValue === null || inputValue === undefined) {
      return { value: null, quality: 192 };
    }

    try {
      let result;

      switch (targetType) {
        case 'number':
          result = this._toNumber(inputValue);
          if (isNaN(result)) throw new Error('Conversion to number failed');
          break;

        case 'string':
          result = this._toString(inputValue);
          break;

        case 'boolean':
          result = this._toBoolean(inputValue);
          break;

        default:
          throw new Error(`Unknown target type: ${targetType}`);
      }

      return { 
        value: result, 
        quality: 0,
        targetType,
        originalType: typeof inputValue,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // Handle conversion error based on onError setting
      let fallbackValue;
      
      switch (onError) {
        case 'null':
          fallbackValue = null;
          break;
        case 'original':
          fallbackValue = inputValue;
          break;
        case 'default':
          // Convert default value to target type
          try {
            if (targetType === 'number') fallbackValue = Number(defaultValue);
            else if (targetType === 'boolean') fallbackValue = this._toBoolean(defaultValue);
            else fallbackValue = String(defaultValue);
          } catch {
            fallbackValue = defaultValue;
          }
          break;
        default:
          fallbackValue = null;
      }

      return { 
        value: fallbackValue, 
        quality: 1, // Bad quality - conversion failed
        targetType,
        originalType: typeof inputValue,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        if (result.error) {
          return `Type conversion failed: ${result.error}, using fallback`;
        }
        return `Convert ${result.originalType} to ${result.targetType}: ${result.value}`;
      },
      debug: (result) => {
        if (result.error) {
          return `Conversion error: ${result.error}, quality: ${result.quality}`;
        }
        return `Type: ${result.originalType} → ${result.targetType}, quality: ${result.quality}`;
      },
      error: (error) => `Type conversion failed: ${error.message}`
    };
  }

  _toNumber(value) {
    // String to number
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return NaN;
      return Number(trimmed);
    }
    
    // Boolean to number
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    
    // Already number or can be coerced
    return Number(value);
  }

  _toString(value) {
    // Boolean to string
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    
    // Null/undefined
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    // Everything else
    return String(value);
  }

  _toBoolean(value) {
    // Already boolean
    if (typeof value === 'boolean') {
      return value;
    }
    
    // Number to boolean (0 = false, non-zero = true)
    if (typeof value === 'number') {
      return value !== 0;
    }
    
    // String to boolean
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') {
        return true;
      }
      if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off' || lower === '') {
        return false;
      }
      // Non-empty string = true
      return true;
    }
    
    // Default: truthy/falsy
    return !!value;
  }

  static get help() {
    return {
      overview: "Converts values between different data types (number, string, boolean). Handles common conversion patterns and edge cases. Essential for data integration and type compatibility.",
      useCases: [
        "Convert string tag values from PLCs to numbers for math operations",
        "Transform numeric status codes to strings for display and logging",
        "Convert sensor readings to boolean for threshold detection",
        "Prepare data for API calls that require specific types"
      ],
      examples: [
        {
          title: "String to Number",
          config: { targetType: "number" },
          input: { value: "123.45" },
          output: { value: 123.45, targetType: "number", originalType: "string" }
        },
        {
          title: "Number to String",
          config: { targetType: "string" },
          input: { value: 42 },
          output: { value: "42", targetType: "string", originalType: "number" }
        },
        {
          title: "Number to Boolean",
          config: { targetType: "boolean" },
          input: { value: 0 },
          output: { value: false, targetType: "boolean", originalType: "number" }
        }
      ],
      tips: [
        "Number conversion: strings containing non-numeric characters return NaN",
        "Boolean conversion: 0, empty string, 'false', 'no', 'off' convert to false",
        "Boolean conversion: 1, non-empty strings, 'true', 'yes', 'on' convert to true",
        "String conversion preserves exact value representation including decimals",
        "Use before Math node to ensure numeric types, or before String Operations for text processing"
      ],
      relatedNodes: ["StringOpsNode", "MathNode", "ComparisonNode"]
    };
  }
}
