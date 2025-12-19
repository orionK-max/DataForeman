import { BaseNode } from '../base/BaseNode.js';

/**
 * Array Operations Node
 * Performs various operations on arrays including element access, length, first, last, join, slice.
 * 
 * Operations:
 * - get-element: Get element at specific index (supports negative indexing)
 * - length: Get array length
 * - first: Get first element
 * - last: Get last element
 * - join: Join array elements into string
 * - slice: Extract portion of array
 * - includes: Check if array contains value
 * - index-of: Find index of value in array
 */
export class ArrayOpsNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Array Operations',
    name: 'array-ops',
    version: 1,
    category: 'DATA_TRANSFORM',
    section: 'BASIC',
    description: 'Perform operations on arrays (get, length, first, last, join, slice)',
    icon: '📊',
    color: '#1976D2',
    inputs: [
      {
        name: 'array',
        type: 'array',
        displayName: 'Array',
        description: 'The input array'
      },
      {
        name: 'index',
        type: 'number',
        displayName: 'Index',
        description: 'Array index (optional input)',
        required: false
      },
      {
        name: 'separator',
        type: 'string',
        displayName: 'Separator',
        description: 'Join separator (optional input)',
        required: false
      },
      {
        name: 'start',
        type: 'number',
        displayName: 'Start',
        description: 'Start index (optional input)',
        required: false
      },
      {
        name: 'end',
        type: 'number',
        displayName: 'End',
        description: 'End index (optional input)',
        required: false
      },
      {
        name: 'value',
        type: 'main',
        displayName: 'Value',
        description: 'Value to search for (includes/index-of)',
        required: false
      }
    ],
    outputs: [
      {
        name: 'result',
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
        description: 'Array operation to perform',
        default: 'get-element',
        required: false,
        options: [
          { label: 'Get Element', value: 'get-element' },
          { label: 'Length', value: 'length' },
          { label: 'First Element', value: 'first' },
          { label: 'Last Element', value: 'last' },
          { label: 'Join', value: 'join' },
          { label: 'Slice', value: 'slice' },
          { label: 'Includes', value: 'includes' },
          { label: 'Index Of', value: 'index-of' }
        ]
      },
      {
        name: 'index',
        type: 'number',
        displayName: 'Index',
        description: 'Array index (for get-element, supports negative)',
        default: 0,
        required: false,
        userExposable: true
      },
      {
        name: 'separator',
        type: 'string',
        displayName: 'Separator',
        description: 'Join separator (for join operation)',
        default: ',',
        required: false,
        userExposable: true
      },
      {
        name: 'start',
        type: 'number',
        displayName: 'Start',
        description: 'Start index (for slice operation)',
        default: 0,
        required: false,
        userExposable: true
      },
      {
        name: 'end',
        type: 'number',
        displayName: 'End',
        description: 'End index (for slice operation, optional)',
        required: false,
        userExposable: true
      },
      {
        name: 'value',
        type: 'string',
        displayName: 'Value',
        description: 'Value to search for (includes/index-of operations)',
        default: '',
        required: false,
        userExposable: true
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
          icon: '📊',
          title: 'Array Ops',
          color: '#1976D2',
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
          { index: 1, position: 'auto', color: 'auto', label: null, visible: true },
          { index: 2, position: 'auto', color: 'auto', label: null, visible: true },
          { index: 3, position: 'auto', color: 'auto', label: null, visible: true },
          { index: 4, position: 'auto', color: 'auto', label: null, visible: true },
          { index: 5, position: 'auto', color: 'auto', label: null, visible: true }
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
      overview: "Performs common array operations including element access, searching, slicing, and transformations. Supports 8 operations: get-element, length, first, last, join, slice, includes, and index-of. All parameter properties can be provided as inputs for dynamic operation.",
      useCases: [
        "Extracting specific elements from data arrays using get-element",
        "Converting arrays to formatted strings with join",
        "Searching for values in collections with includes/index-of",
        "Processing batches of sensor readings with slice"
      ],
      examples: [
        {
          title: "Get Element by Index",
          description: "get-element: Returns the element at specified index (supports negative indices)",
          configuration: { operation: 'get-element', index: 2 },
          input: [10, 20, 30, 40],
          output: 30
        },
        {
          title: "Array Length",
          description: "length: Returns the number of elements in the array",
          configuration: { operation: 'length' },
          input: [10, 20, 30, 40],
          output: 4
        },
        {
          title: "First Element",
          description: "first: Returns the first element (equivalent to index 0)",
          configuration: { operation: 'first' },
          input: [10, 20, 30],
          output: 10
        },
        {
          title: "Last Element",
          description: "last: Returns the last element (equivalent to index -1)",
          configuration: { operation: 'last' },
          input: [10, 20, 30],
          output: 30
        },
        {
          title: "Join to String",
          description: "join: Combines array elements into a single string with separator",
          configuration: { operation: 'join', separator: ', ' },
          input: ['red', 'green', 'blue'],
          output: 'red, green, blue'
        },
        {
          title: "Slice Range",
          description: "slice: Extracts a portion of the array from start to end index",
          configuration: { operation: 'slice', start: 1, end: 3 },
          input: [10, 20, 30, 40, 50],
          output: [20, 30]
        },
        {
          title: "Check Includes",
          description: "includes: Returns true if array contains the specified value",
          configuration: { operation: 'includes', value: 'error' },
          input: ['ok', 'warning', 'error'],
          output: true
        },
        {
          title: "Find Index",
          description: "index-of: Returns the index of first occurrence of value, or -1 if not found",
          configuration: { operation: 'index-of', value: 30 },
          input: [10, 20, 30, 40],
          output: 2
        }
      ],
      tips: [
        "get-element: Negative indices count from end (-1 = last, -2 = second to last)",
        "length, first, last: Simple operations that don't require additional parameters",
        "join: Default separator is comma - customize with separator parameter",
        "slice: Omit end parameter to slice to array end",
        "includes: Case-sensitive exact match for the value",
        "index-of: Returns -1 if value not found in array",
        "All parameters can be connected as inputs for dynamic operation"
      ],
      relatedNodes: ["json-ops", "string-ops"]
    }
  };

  get description() {
    return ArrayOpsNode.description;
  }

  /**
   * Perform array operation
   */
  async execute(context) {
    const { node } = context;
    const operation = this.getParameter(node, 'operation', 'get-element');
    
    // Get array input
    const arrayData = context.getInputValue(0);
    if (!arrayData) {
      return { value: null, quality: 1 }; // Bad quality - no input
    }
    
    const arrayValue = arrayData.value;
    const inputQuality = arrayData.quality ?? 0;
    
    // Validate input is an array
    if (!Array.isArray(arrayValue)) {
      return {
        value: null,
        quality: 1,
        error: `Invalid input: expected array, got ${typeof arrayValue}`
      };
    }

    try {
      let result;

      switch (operation) {
        case 'get-element':
          result = this._getElement(arrayValue, node, context);
          break;
        case 'length':
          result = { value: arrayValue.length };
          break;
        case 'first':
          result = { value: arrayValue.length > 0 ? arrayValue[0] : null };
          break;
        case 'last':
          result = { value: arrayValue.length > 0 ? arrayValue[arrayValue.length - 1] : null };
          break;
        case 'join':
          result = this._join(arrayValue, node, context);
          break;
        case 'slice':
          result = this._slice(arrayValue, node, context);
          break;
        case 'includes':
          result = this._includes(arrayValue, node, context);
          break;
        case 'index-of':
          result = this._indexOf(arrayValue, node, context);
          break;
        default:
          result = { value: null, error: `Unknown operation: ${operation}` };
      }

      return {
        value: result.value,
        quality: result.error ? 1 : inputQuality,
        error: result.error,
        operation,
        arrayLength: arrayValue.length
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
   * Get element at index (supports negative indexing)
   */
  _getElement(array, node, context) {
    // Try input first, then property
    // Input 1 is the optional parameter input used by tests/runner.
    const indexInput = context.getInputValue(1);
    let index;
    
    if (indexInput && indexInput.value !== null && indexInput.value !== undefined) {
      index = Number(indexInput.value);
    } else {
      index = Number(this.getParameter(node, 'index', 0));
    }

    if (isNaN(index)) {
      return { value: null, error: 'Index must be a number' };
    }

    // Handle negative indexing
    const actualIndex = index < 0 ? array.length + index : index;

    if (actualIndex < 0 || actualIndex >= array.length) {
      return { value: null, error: `Index ${index} out of bounds (array length: ${array.length})` };
    }

    return { value: array[actualIndex] };
  }

  /**
   * Join array elements into string
   */
  _join(array, node, context) {
    // Try input first, then property
    const separatorInput = context.getInputValue(2);
    let separator;
    
    if (separatorInput && separatorInput.value !== null && separatorInput.value !== undefined) {
      separator = String(separatorInput.value);
    } else {
      separator = this.getParameter(node, 'separator', ',');
    }
    
    return { value: array.join(separator) };
  }

  /**
   * Slice array
   */
  _slice(array, node, context) {
    // Try inputs first, then properties
    const startInput = context.getInputValue(3);
    const endInput = context.getInputValue(4);
    
    let start;
    if (startInput && startInput.value !== null && startInput.value !== undefined) {
      start = Number(startInput.value);
    } else {
      start = Number(this.getParameter(node, 'start', 0));
    }
    
    let endParam;
    if (endInput && endInput.value !== null && endInput.value !== undefined) {
      endParam = endInput.value;
    } else {
      endParam = this.getParameter(node, 'end');
    }
    
    if (isNaN(start)) {
      return { value: null, error: 'Start must be a number' };
    }

    if (endParam !== null && endParam !== undefined) {
      const end = Number(endParam);
      if (isNaN(end)) {
        return { value: null, error: 'End must be a number' };
      }
      return { value: array.slice(start, end) };
    }

    return { value: array.slice(start) };
  }

  /**
   * Check if array includes value
   */
  _includes(array, node, context) {
    // Try input first, then property
    // Prefer the dedicated value input (index 5). For backward-compat and tests,
    // also accept the parameter input at index 1.
    const valueInput = context.getInputValue(5) || context.getInputValue(1);
    let searchValue;
    
    if (valueInput && valueInput.value !== null && valueInput.value !== undefined) {
      searchValue = valueInput.value;
    } else {
      searchValue = this.getParameter(node, 'value');
    }
    
    if (searchValue === null || searchValue === undefined || searchValue === '') {
      return { value: null, error: 'Value is required for includes operation' };
    }

    return { value: array.includes(searchValue) };
  }

  /**
   * Find index of value
   */
  _indexOf(array, node, context) {
    // Try input first, then property
    // Prefer the dedicated value input (index 5). For backward-compat and tests,
    // also accept the parameter input at index 1.
    const valueInput = context.getInputValue(5) || context.getInputValue(1);
    let searchValue;
    
    if (valueInput && valueInput.value !== null && valueInput.value !== undefined) {
      searchValue = valueInput.value;
    } else {
      searchValue = this.getParameter(node, 'value');
    }
    
    if (searchValue === null || searchValue === undefined || searchValue === '') {
      return { value: null, error: 'Value is required for index-of operation' };
    }

    return { value: array.indexOf(searchValue) };
  }
}
