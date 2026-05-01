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
          { label: 'Values', value: 'values' },
          { label: 'Extract Many', value: 'extract-many' }
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
      },
      {
        name: 'extractions',
        type: 'json',
        displayName: 'Extractions',
        description: 'Array of {name, path} objects. Each entry creates a separate output port.',
        default: [{"name": "", "path": ""}],
        required: false,
        syncOutputCount: true,
        displayOptions: {
          show: { operation: ['extract-many'] }
        }
      }
    ],
    
    ioRules: [
      {
        when: { operation: 'extract-many' },
        outputs: {
          min: 1,
          max: 20,
          default: 1,
          canAdd: false,
          canRemove: false,
          type: 'main'
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
      overview: "Performs JSON operations on incoming data. Supports 7 operations: parse, stringify, get-property, has-property, keys, values, and extract-many. Use extract-many to split a single object into multiple named output ports in one step.",
      useCases: [
        "Parsing JSON strings from HTTP responses or message queues",
        "Extracting one or more nested properties from complex objects",
        "Splitting a sensor payload into separate output ports (extract-many)",
        "Converting objects to JSON for storage or transmission",
        "Validating presence of required fields in data structures",
        "Listing all keys or values of a JSON object"
      ],
      operations: [
        {
          name: "parse",
          description: "Converts a JSON string into a JavaScript object. Fails with bad quality if the input is not valid JSON."
        },
        {
          name: "stringify",
          description: "Converts an object or value to a JSON string. Use the Indent property (0 = compact, 2 or 4 = pretty-printed)."
        },
        {
          name: "get-property",
          description: "Reads a single value from an object using dot notation (e.g. 'device.location.city'). The path can also be supplied via the optional Parameter input port."
        },
        {
          name: "has-property",
          description: "Returns true/false depending on whether the path exists in the input object. Useful for guarding against missing fields before using get-property."
        },
        {
          name: "keys",
          description: "Returns an array of all top-level property names of the input object."
        },
        {
          name: "values",
          description: "Returns an array of all top-level property values of the input object."
        },
        {
          name: "extract-many",
          description: "Extracts multiple values from a single object and routes each one to a separate output port. Define the extractions as a JSON array of {name, path} objects. The number of output handles on the canvas updates automatically as you add or remove entries."
        }
      ],
      examples: [
        {
          title: "Parse JSON string",
          description: "Convert a JSON string arriving from an HTTP response into an object",
          configuration: { operation: 'parse' },
          input: '{"name":"Sensor-1","value":42}',
          output: { name: 'Sensor-1', value: 42 }
        },
        {
          title: "Stringify with pretty-print",
          description: "Convert an object to a readable JSON string",
          configuration: { operation: 'stringify', indent: 2 },
          input: { temp: 22.5, unit: 'C' },
          output: '{\n  "temp": 22.5,\n  "unit": "C"\n}'
        },
        {
          title: "Get nested property",
          description: "Extract a deeply nested value using dot notation",
          configuration: { operation: 'get-property', path: 'device.location.building' },
          input: { device: { location: { building: 'A', floor: 2 } } },
          output: 'A'
        },
        {
          title: "Check property existence",
          description: "Verify a field exists before reading it",
          configuration: { operation: 'has-property', path: 'config.enabled' },
          input: { config: { enabled: true } },
          output: true
        },
        {
          title: "Get object keys",
          description: "List all top-level keys of an object",
          configuration: { operation: 'keys' },
          input: { temp: 22.5, humidity: 60, pressure: 1013 },
          output: ['temp', 'humidity', 'pressure']
        },
        {
          title: "Get object values",
          description: "List all top-level values of an object",
          configuration: { operation: 'values' },
          input: { temp: 22.5, humidity: 60, pressure: 1013 },
          output: [22.5, 60, 1013]
        },
        {
          title: "Extract many — sensor payload",
          description: "Split a sensor payload into three separate output ports in one node",
          configuration: {
            operation: 'extract-many',
            extractions: [
              { name: 'temperature', path: 'readings.temp' },
              { name: 'humidity',    path: 'readings.hum' },
              { name: 'timestamp',   path: 'meta.ts' }
            ]
          },
          input: { readings: { temp: 23.1, hum: 55 }, meta: { ts: 1714300000 } },
          output: ['output-0 → 23.1', 'output-1 → 55', 'output-2 → 1714300000']
        }
      ],
      tips: [
        "Dot notation paths: 'user.profile.email' accesses nested properties",
        "Array index access is not supported in paths — use array-ops for that",
        "Parse errors return null with bad quality — the error field contains the message",
        "Indent 0 produces compact JSON; use 2 or 4 for human-readable output",
        "For extract-many, each {name, path} entry maps to one output handle — names appear as handle labels on the canvas",
        "The Parameter input port (index 1) can override the path field at runtime for get-property and has-property",
        "Use has-property before get-property when a field may be absent to avoid bad-quality propagation"
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

    // extract-many returns an array directly (one result per extraction)
    if (operation === 'extract-many') {
      return this._extractMany(inputValue, inputQuality, node);
    }

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
   * Extract multiple values from an object, one per output port
   * Returns an array of {value, quality} objects aligned to output ports
   */
  _extractMany(inputValue, inputQuality, node) {
    const rawExtractions = this.getParameter(node, 'extractions', []);
    let extractionsList;
    try {
      extractionsList = Array.isArray(rawExtractions) ? rawExtractions
        : (typeof rawExtractions === 'string' ? JSON.parse(rawExtractions) : []);
    } catch {
      extractionsList = [];
    }

    if (!extractionsList.length) {
      return [{ value: null, quality: 1, error: 'No extractions configured' }];
    }

    if (typeof inputValue !== 'object' || inputValue === null) {
      return extractionsList.map(() => ({ value: null, quality: 1, error: 'Input is not an object' }));
    }

    return extractionsList.map(({ path }) => {
      if (!path) return { value: null, quality: 1, error: 'Empty path' };
      try {
        const val = this._getNestedProperty(inputValue, path);
        return { value: val, quality: inputQuality };
      } catch (err) {
        return { value: null, quality: 1, error: err.message };
      }
    });
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
