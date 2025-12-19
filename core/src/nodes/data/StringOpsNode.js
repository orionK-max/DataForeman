import { BaseNode } from '../base/BaseNode.js';

/**
 * String Operations Node - performs common string manipulation operations
 * Essential for text processing and formatting
 */
export class StringOpsNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'String Operations',
    name: 'string-ops',
    version: 1,
    description: 'Perform string operations (substring, concat, replace, case, trim, split, join)',
    category: 'DATA_TRANSFORM',
    section: 'TEXT',
    icon: '📝',
    color: '#795548',
    inputs: [
      { type: 'string', displayName: 'Input', required: true }
    ],
    outputs: [
      { type: 'string', displayName: 'Result' }
    ],
    ioRules: [
      {
        when: { operation: ['concat', 'join'] },
        inputs: {
          min: 2,
          max: 5,
          default: 2,
          canAdd: true,
          canRemove: true,
          type: 'string'
        }
      },
      {
        // Default: single input for all other operations
        inputs: {
          count: 1,
          type: 'string'
        }
      }
    ],
    visual: {
      canvas: {
        minWidth: 180,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '📝',
          title: 'String Ops',
          color: '#795548',
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
          { label: 'Substring', value: 'substring' },
          { label: 'Concatenate', value: 'concat' },
          { label: 'Replace', value: 'replace' },
          { label: 'Uppercase', value: 'uppercase' },
          { label: 'Lowercase', value: 'lowercase' },
          { label: 'Trim', value: 'trim' },
          { label: 'Split', value: 'split' },
          { label: 'Join', value: 'join' },
          { label: 'Length', value: 'length' },
          { label: 'Contains', value: 'contains' },
          { label: 'Starts With', value: 'startsWith' },
          { label: 'Ends With', value: 'endsWith' }
        ],
        default: 'concat',
        required: true,
        description: 'String operation to perform'
      },
      {
        displayName: 'Start Index',
        name: 'startIndex',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            operation: ['substring']
          }
        },
        description: 'Starting position (0-based)'
      },
      {
        displayName: 'End Index',
        name: 'endIndex',
        type: 'number',
        default: -1,
        displayOptions: {
          show: {
            operation: ['substring']
          }
        },
        description: 'Ending position (-1 for end of string)'
      },
      {
        displayName: 'Search Text',
        name: 'searchText',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            operation: ['replace', 'contains', 'startsWith', 'endsWith']
          }
        },
        description: 'Text to search for'
      },
      {
        displayName: 'Replace With',
        name: 'replaceWith',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            operation: ['replace']
          }
        },
        description: 'Replacement text'
      },
      {
        displayName: 'Replace All',
        name: 'replaceAll',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            operation: ['replace']
          }
        },
        description: 'Replace all occurrences (not just first)'
      },
      {
        displayName: 'Delimiter',
        name: 'delimiter',
        type: 'string',
        default: ',',
        displayOptions: {
          show: {
            operation: ['split', 'join']
          }
        },
        description: 'Character(s) to split/join on'
      },
      {
        displayName: 'Case Sensitive',
        name: 'caseSensitive',
        type: 'boolean',
        default: true,
        displayOptions: {
          show: {
            operation: ['contains', 'startsWith', 'endsWith']
          }
        },
        description: 'Match case when comparing'
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
    const operation = this.getParameter(context.node, 'operation', 'concat');
    const startIndex = this.getParameter(context.node, 'startIndex', 0);
    const endIndex = this.getParameter(context.node, 'endIndex', -1);
    const searchText = this.getParameter(context.node, 'searchText', '');
    const replaceWith = this.getParameter(context.node, 'replaceWith', '');
    const replaceAll = this.getParameter(context.node, 'replaceAll', false);
    const delimiter = this.getParameter(context.node, 'delimiter', ',');
    const caseSensitive = this.getParameter(context.node, 'caseSensitive', true);

    // Get input values
    const values = [];
    for (let i = 0; i < context.getInputCount(); i++) {
      const inputData = context.getInputValue(i);
      values.push(inputData?.value ?? inputData);
    }
    const input = values[0];
    
    // Handle null/undefined
    if (input === null || input === undefined) {
      return { value: null, quality: 192 };
    }

    try {
      let result;

      switch (operation) {
        case 'substring':
          result = this._substring(String(input), startIndex, endIndex);
          break;

        case 'concat':
          // Join all inputs
          result = values.map(v => v ?? '').join('');
          break;

        case 'replace':
          result = this._replace(String(input), searchText, replaceWith, replaceAll);
          break;

        case 'uppercase':
          result = String(input).toUpperCase();
          break;

        case 'lowercase':
          result = String(input).toLowerCase();
          break;

        case 'trim':
          result = String(input).trim();
          break;

        case 'split':
          result = String(input).split(delimiter);
          break;

        case 'join':
          // Join all inputs with delimiter
          result = values.map(v => v ?? '').join(delimiter);
          break;

        case 'length':
          result = String(input).length;
          break;

        case 'contains':
          result = this._contains(String(input), searchText, caseSensitive);
          break;

        case 'startsWith':
          result = this._startsWith(String(input), searchText, caseSensitive);
          break;

        case 'endsWith':
          result = this._endsWith(String(input), searchText, caseSensitive);
          break;

        default:
          result = input;
      }

      return { 
        value: result, 
        quality: 0,
        operation,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return { 
        value: null, 
        quality: 192, 
        operation,
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
          return `String operation failed: ${result.error}`;
        }
        return `String ${result.operation}: result = "${result.value}"`;
      },
      debug: (result) => {
        if (result.error) {
          return `String error: ${result.error}, quality: ${result.quality}`;
        }
        return `String operation: ${result.operation}, quality: ${result.quality}`;
      },
      error: (error) => `String operation failed: ${error.message}`
    };
  }

  _substring(str, start, end) {
    const actualEnd = end === -1 ? str.length : end;
    return str.substring(start, actualEnd);
  }

  _replace(str, search, replace, replaceAll) {
    if (replaceAll) {
      return str.split(search).join(replace);
    }
    return str.replace(search, replace);
  }

  _contains(str, search, caseSensitive) {
    if (!caseSensitive) {
      return str.toLowerCase().includes(search.toLowerCase());
    }
    return str.includes(search);
  }

  _startsWith(str, search, caseSensitive) {
    if (!caseSensitive) {
      return str.toLowerCase().startsWith(search.toLowerCase());
    }
    return str.startsWith(search);
  }

  _endsWith(str, search, caseSensitive) {
    if (!caseSensitive) {
      return str.toLowerCase().endsWith(search.toLowerCase());
    }
    return str.endsWith(search);
  }

  static get help() {
    return {
      overview: "Performs string manipulation operations including substring extraction, concatenation, replacement, case conversion, trimming, splitting, and pattern matching. Essential for text processing and formatting.",
      useCases: [
        "Format sensor names by converting to uppercase or extracting device IDs",
        "Parse equipment status messages by splitting on delimiters",
        "Clean up tag names by trimming whitespace or replacing special characters",
        "Build alert messages by concatenating multiple text fields"
      ],
      examples: [
        {
          title: "Extract Substring",
          config: { operation: "substring", start: 0, length: 5 },
          input: { input: "MOTOR-001-STATUS" },
          output: { value: "MOTOR", operation: "substring" }
        },
        {
          title: "Concatenate Paths",
          config: { operation: "concat", separator: "/" },
          input: { inputs: ["devices", "sensors", "temp01"] },
          output: { value: "devices/sensors/temp01", operation: "concat" }
        },
        {
          title: "Case Conversion",
          config: { operation: "toUpperCase" },
          input: { input: "alarm message" },
          output: { value: "ALARM MESSAGE", operation: "toUpperCase" }
        }
      ],
      tips: [
        "Substring operation: negative start positions count from end of string",
        "Replace operation supports regex patterns for advanced text manipulation",
        "Split operation returns array - connect to Array Operations for further processing",
        "Concat and join operations support multiple inputs (2-5) via dynamic input configuration",
        "Use trim operation to clean user input or parsed data before comparison",
        "Case-sensitive option available for contains, startsWith, and endsWith operations"
      ],
      relatedNodes: ["ArrayOpsNode", "JSONOpsNode", "TypeConvertNode"]
    };
  }
}
