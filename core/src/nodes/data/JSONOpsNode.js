import { BaseNode } from '../base/BaseNode.js';

/**
 * JSON Operations Node
 * Performs JSON operations including parse, stringify, and property access by path.
 * 
 * Operations:
 * - parse: Parse JSON string into object
 * - stringify: Convert object to JSON string
 * - get-property: Get property value by dot notation path (e.g., "user.name")
 * - set-property: Set property value by path
 * - has-property: Check if property exists
 * - keys: Get object keys as array
 * - values: Get object values as array
 */
export class JSONOpsNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'JSON Operations',
    name: 'json-ops',
    version: 1,
    icon: '📋',
    color: '#FF6F00',
    category: 'DATA_TRANSFORM',
    section: 'BASIC',
    description: 'Parse JSON, stringify objects, access properties by path',
    inputs: [
      {
        name: 'input',
        type: 'main',
        displayName: 'Input',
        description: 'Input value (string for parse, object for stringify/get-property)'
      },
      {
        name: 'parameter',
        type: 'main',
        displayName: 'Parameter',
        description: 'Operation parameter (path, value, etc)',
        required: false
      }
    ],
    outputs: [
      {
        name: 'output',
        type: 'main',
        displayName: 'Result',
        description: 'The operation result'
      }
    ],
    properties: [
      {
        name: 'operation',
        type: 'select',
        displayName: 'Operation',
        description: 'JSON operation to perform',
        default: 'parse',
        required: false,
        options: [
          { label: 'Parse', value: 'parse' },
          { label: 'Stringify', value: 'stringify' },
          { label: 'Get Property', value: 'get-property' },
          { label: 'Has Property', value: 'has-property' },
          { label: 'Keys', value: 'keys' },
          { label: 'Values', value: 'values' }
        ]
      },
      {
        name: 'path',
        type: 'string',
        displayName: 'Property Path',
        description: 'Property path in dot notation (e.g., "user.address.city")',
        default: '',
        required: false
      },
      {
        name: 'indent',
        type: 'number',
        displayName: 'Indent',
        description: 'JSON stringify indent (0 for compact)',
        default: 0,
        required: false
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
          icon: '📋',
          title: 'JSON Ops',
          color: '#FF6F00',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{operation}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true },
          { index: 1, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        outputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff'
      }
    },
    
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        }
      ]
    },
    
    help: {
      overview: "Handles JSON parsing, stringification, and property access using dot notation paths. Essential for working with structured data from APIs, configuration objects, and complex data structures.",
      useCases: [
        "Parsing JSON strings from HTTP responses or message queues",
        "Extracting nested properties from complex objects",
        "Converting objects to JSON for storage or transmission",
        "Validating presence of required fields in data structures"
      ],
      examples: [
        {
          title: "Parse JSON",
          description: "Convert JSON string to object",
          configuration: { operation: 'parse' },
          input: '{"name":"Sensor-1","value":42}',
          output: { name: 'Sensor-1', value: 42 }
        },
        {
          title: "Get Nested Property",
          description: "Extract deeply nested value",
          configuration: { operation: 'get-property', path: 'device.location.building' },
          input: { device: { location: { building: 'A', floor: 2 } } },
          output: 'A'
        },
        {
          title: "Stringify with Formatting",
          description: "Convert object to pretty JSON",
          configuration: { operation: 'stringify', indent: 2 },
          input: { temp: 22.5, unit: 'C' },
          output: '{\n  "temp": 22.5,\n  "unit": "C"\n}'
        },
        {
          title: "Check Property",
          description: "Verify field exists",
          configuration: { operation: 'has-property', path: 'config.enabled' },
          input: { config: { enabled: true } },
          output: true
        }
      ],
      tips: [
        "Dot notation paths: 'user.profile.email' accesses nested properties",
        "Parse errors return null with bad quality - check error field",
        "Indent 0 produces compact JSON, 2 or 4 for readability",
        "keys operation returns array of property names at root level",
        "values operation returns array of property values",
        "Use has-property to avoid errors when fields may be missing"
      ],
      relatedNodes: ["array-ops", "string-ops", "type-convert"]
    }
  };

  get description() {
    return JSONOpsNode.description;
  }

  /**
   * Perform JSON operation
   */
  async execute(context) {
    const { node } = context;
    const operation = this.getParameter(node, 'operation', 'parse');
    
    // Get input
    const inputData = context.getInputValue(0);
    if (!inputData) {
      return { value: null, quality: 1 }; // Bad quality - no input
    }
    
    const inputValue = inputData.value;
    const inputQuality = inputData.quality ?? 0;

    try {
      let result;

      switch (operation) {
        case 'parse':
          result = this._parse(inputValue);
          break;
        case 'stringify':
          result = this._stringify(inputValue, node);
          break;
        case 'get-property':
          result = this._getProperty(inputValue, node, context);
          break;
        case 'has-property':
          result = this._hasProperty(inputValue, node, context);
          break;
        case 'keys':
          result = this._keys(inputValue);
          break;
        case 'values':
          result = this._values(inputValue);
          break;
        default:
          result = { value: null, error: `Unknown operation: ${operation}` };
      }

      return {
        value: result.value,
        quality: result.error ? 1 : inputQuality,
        error: result.error,
        operation
      };

    } catch (error) {
      return {
        value: null,
        quality: 1,
        error: error.message
      };
    }
  }

  /**
   * Parse JSON string
   */
  _parse(input) {
    if (typeof input !== 'string') {
      return { value: null, error: `Cannot parse: expected string, got ${typeof input}` };
    }

    try {
      return { value: JSON.parse(input) };
    } catch (error) {
      return { value: null, error: `JSON parse error: ${error.message}` };
    }
  }

  /**
   * Stringify object to JSON
   */
  _stringify(input, node) {
    const indent = Number(this.getParameter(node, 'indent', 0));
    
    try {
      const indentValue = indent > 0 ? indent : undefined;
      return { value: JSON.stringify(input, null, indentValue) };
    } catch (error) {
      return { value: null, error: `JSON stringify error: ${error.message}` };
    }
  }

  /**
   * Get property value by path (dot notation)
   */
  _getProperty(input, node, context) {
    if (typeof input !== 'object' || input === null) {
      return { value: null, error: `Cannot get property: expected object, got ${typeof input}` };
    }

    // Try parameter input first, then property
    const paramData = context.getInputValue(1);
    let path;
    
    if (paramData && paramData.value !== null && paramData.value !== undefined) {
      path = String(paramData.value);
    } else {
      path = this.getParameter(node, 'path', '');
    }

    if (!path) {
      return { value: null, error: 'Property path is required' };
    }

    try {
      const value = this._getNestedProperty(input, path);
      return { value };
    } catch (error) {
      return { value: null, error: error.message };
    }
  }

  /**
   * Check if property exists by path
   */
  _hasProperty(input, node, context) {
    if (typeof input !== 'object' || input === null) {
      return { value: false };
    }

    // Try parameter input first, then property
    const paramData = context.getInputValue(1);
    let path;
    
    if (paramData && paramData.value !== null && paramData.value !== undefined) {
      path = String(paramData.value);
    } else {
      path = this.getParameter(node, 'path', '');
    }

    if (!path) {
      return { value: false, error: 'Property path is required' };
    }

    try {
      this._getNestedProperty(input, path);
      return { value: true };
    } catch {
      return { value: false };
    }
  }

  /**
   * Get nested property by dot notation path
   */
  _getNestedProperty(obj, path) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        throw new Error(`Property '${key}' not found in path '${path}'`);
      }
      
      if (typeof current !== 'object') {
        throw new Error(`Cannot access property '${key}' on non-object`);
      }

      if (!(key in current)) {
        throw new Error(`Property '${key}' not found in path '${path}'`);
      }

      current = current[key];
    }

    return current;
  }

  /**
   * Get object keys
   */
  _keys(input) {
    if (typeof input !== 'object' || input === null) {
      return { value: null, error: `Cannot get keys: expected object, got ${typeof input}` };
    }

    return { value: Object.keys(input) };
  }

  /**
   * Get object values
   */
  _values(input) {
    if (typeof input !== 'object' || input === null) {
      return { value: null, error: `Cannot get values: expected object, got ${typeof input}` };
    }

    return { value: Object.values(input) };
  }
}
