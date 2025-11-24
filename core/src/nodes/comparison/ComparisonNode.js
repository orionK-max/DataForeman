import { BaseNode } from '../base/BaseNode.js';

/**
 * ComparisonNode - Unified comparison operations node
 * Compares two input values using various comparison operators
 * 
 * Supported operations:
 * - Greater Than (>)
 * - Less Than (<)
 * - Greater or Equal (>=)
 * - Less or Equal (<=)
 * - Equal (==)
 * - Not Equal (!=)
 * 
 * @extends BaseNode
 */
export class ComparisonNode extends BaseNode {
  /**
   * Node description following Flow Studio convention
   */
  description = {
    displayName: 'Comparison',
    description: 'Compare two values using various comparison operators (>, <, >=, <=, ==, !=)',
    group: 'Logic & Math',
    version: 1,
    icon: '🔍',
    color: '#9C27B0',
    
    inputs: {
      input0: {
        displayName: 'First Value',
        type: 'number',
        required: true
      },
      input1: {
        displayName: 'Second Value',
        type: 'number',
        required: true
      }
    },
    
    outputs: {
      value: {
        displayName: 'Result',
        type: 'boolean',
        description: 'Comparison result (true/false)'
      },
      quality: {
        displayName: 'Quality',
        type: 'number',
        description: 'OPC UA quality code (minimum of input qualities)'
      },
      operator: {
        displayName: 'Operator',
        type: 'string',
        description: 'The comparison operator used'
      }
    },
    
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'options',
        default: 'gt',
        required: true,
        options: [
          { value: 'gt', label: 'Greater Than (>)' },
          { value: 'lt', label: 'Less Than (<)' },
          { value: 'gte', label: 'Greater or Equal (>=)' },
          { value: 'lte', label: 'Less or Equal (<=)' },
          { value: 'eq', label: 'Equal (==)' },
          { value: 'neq', label: 'Not Equal (!=)' }
        ],
        description: 'Comparison operator to use'
      },
      {
        name: 'tolerance',
        displayName: 'Equality Tolerance',
        type: 'number',
        default: null,
        displayOptions: {
          show: {
            operation: ['eq', 'neq']
          }
        },
        description: 'Tolerance for equality comparisons (leave empty for Number.EPSILON)'
      }
    ]
  };

  /**
   * Declarative log messages
   */
  getLogMessages() {
    const operatorSymbols = {
      'gt': '>',
      'lt': '<',
      'gte': '>=',
      'lte': '<=',
      'eq': '==',
      'neq': '!='
    };
    
    return {
      info: (result) => {
        const symbol = operatorSymbols[result.operator] || result.operator;
        return `Compare: ${result.inputs[0]} ${symbol} ${result.inputs[1]} = ${result.value}`;
      },
      debug: (result) => `Comparison quality: ${result.quality}`,
      error: (error) => `Comparison failed: ${error.message}`
    };
  }

  /**
   * Extract numeric value from input data
   * @param {*} inputData - Input data (may be wrapped in {value, quality})
   * @returns {number} - Extracted number
   */
  extractValue(inputData) {
    if (inputData === null || inputData === undefined) {
      return null;
    }
    
    // If it's an object with value property, extract it
    if (typeof inputData === 'object' && 'value' in inputData) {
      return Number(inputData.value);
    }
    
    return Number(inputData);
  }

  /**
   * Extract quality from input data
   * @param {*} inputData - Input data
   * @returns {number} - Quality code (192 if not specified)
   */
  extractQuality(inputData) {
    if (inputData && typeof inputData === 'object' && 'quality' in inputData) {
      return inputData.quality;
    }
    return 192; // Good quality by default
  }

  /**
   * Validate node configuration
   * @param {Object} context - Node execution context
   * @returns {Array<string>} - Array of validation errors (empty if valid)
   */
  validate(context) {
    const errors = [];
    const { data } = context.node;

    // Validate operation
    const validOps = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq'];
    if (!data?.operation || !validOps.includes(data.operation)) {
      errors.push('Invalid or missing operation');
    }

    // Validate tolerance if specified
    if (data?.tolerance !== null && data?.tolerance !== undefined) {
      const tolerance = Number(data.tolerance);
      if (isNaN(tolerance) || tolerance < 0) {
        errors.push('Tolerance must be a non-negative number');
      }
    }

    return errors;
  }

  /**
   * Execute comparison operation
   * @param {Object} context - Node execution context
   * @returns {Promise<Object>} - Execution result
   */
  async execute(context) {
    const { node, log } = context;
    const { operation, tolerance } = node.data || {};

    // Get input values
    const input0Data = context.getInputValue(0);
    const input1Data = context.getInputValue(1);

    // Check if we have both inputs
    if (input0Data === undefined || input1Data === undefined) {
      log.warn('Comparison node missing one or both inputs');
      return {
        value: false,
        quality: 0,
        operator: operation,
        error: 'Missing inputs'
      };
    }

    // Extract values and qualities
    const value0 = this.extractValue(input0Data);
    const value1 = this.extractValue(input1Data);
    const quality0 = this.extractQuality(input0Data);
    const quality1 = this.extractQuality(input1Data);

    // Validate numeric values
    if (value0 === null || value1 === null || isNaN(value0) || isNaN(value1)) {
      log.warn('Comparison node received non-numeric input', { value0, value1 });
      return {
        value: false,
        quality: 0,
        operator: operation,
        error: 'Non-numeric inputs'
      };
    }

    // Check quality threshold (64 = uncertain)
    const minQuality = Math.min(quality0, quality1);
    if (minQuality < 64) {
      log.warn('Comparison node input quality too low', { minQuality });
      return {
        value: false,
        quality: 0,
        operator: operation,
        error: 'Low quality inputs'
      };
    }

    // Perform comparison
    let result;
    const effectiveTolerance = tolerance !== null && tolerance !== undefined 
      ? Number(tolerance) 
      : Number.EPSILON;

    switch (operation) {
      case 'gt':
        result = value0 > value1;
        break;
      
      case 'lt':
        result = value0 < value1;
        break;
      
      case 'gte':
        result = value0 >= value1;
        break;
      
      case 'lte':
        result = value0 <= value1;
        break;
      
      case 'eq':
        result = Math.abs(value0 - value1) < effectiveTolerance;
        break;
      
      case 'neq':
        result = Math.abs(value0 - value1) >= effectiveTolerance;
        break;
      
      default:
        throw new Error(`Unknown comparison operation: ${operation}`);
    }

    return {
      value: result,
      quality: minQuality,
      operator: operation,
      inputs: [value0, value1],
      timestamp: new Date().toISOString()
    };
  }
}
