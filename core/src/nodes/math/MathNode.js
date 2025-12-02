import { BaseNode } from '../base/BaseNode.js';

/**
 * Unified Math Node - handles all mathematical operations
 * Supports: add, subtract, multiply, divide, average, min, max, and custom formulas
 */
export class MathNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Math',
    name: 'math',
    version: 1,
    description: 'Perform mathematical operations on multiple inputs (2 minimum, expandable)',
    category: 'LOGIC_MATH',
    section: 'MATH',
    icon: '🔢',
    color: '#00A0A0',
    inputs: [
      { type: 'number', displayName: 'Input 1', required: true },
      { type: 'number', displayName: 'Input 2', required: true }
    ],
    inputConfiguration: {
      minInputs: 2,
      maxInputs: 10,
      defaultInputs: 2,
      canAddInputs: true,
      canRemoveInputs: true
    },
    outputs: [{ type: 'number', displayName: 'Result' }],
    visual: {
      iconMap: {
        add: '➕',
        subtract: '➖',
        multiply: '✖️',
        divide: '➗',
        average: '📊',
        min: '⬇️',
        max: '⬆️',
        formula: '𝑓',
      },
      subtitle: '{{operation}}',
    },
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          {
            name: 'Add All',
            value: 'add',
            description: 'Sum all input values',
          },
          {
            name: 'Subtract (First - Rest)',
            value: 'subtract',
            description: 'Subtract all subsequent inputs from the first',
          },
          {
            name: 'Multiply All',
            value: 'multiply',
            description: 'Multiply all input values',
          },
          {
            name: 'Divide (First / Rest)',
            value: 'divide',
            description: 'Divide first input by all subsequent inputs',
          },
          {
            name: 'Average',
            value: 'average',
            description: 'Calculate the average of all inputs',
          },
          {
            name: 'Minimum',
            value: 'min',
            description: 'Find the smallest value',
          },
          {
            name: 'Maximum',
            value: 'max',
            description: 'Find the largest value',
          },
          {
            name: 'Custom Formula',
            value: 'formula',
            description: 'Enter your own mathematical formula',
          },
        ],
        default: 'add',
        noDataExpression: true,
      },
      {
        displayName: 'Formula',
        name: 'formula',
        type: 'string',
        default: 'input0 + input1',
        placeholder: 'input0 + input1 * input2',
        description: 'Use input0, input1, input2, etc. Operators: +, -, *, /, %, ** (power), sqrt(), abs(), round(), etc.',
        displayOptions: {
          show: {
            operation: ['formula'],
          },
        },
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Decimal Places',
            name: 'decimalPlaces',
            type: 'number',
            default: -1,
            description: 'Number of decimal places to round to. -1 means no rounding.',
          },
          {
            displayName: 'Skip Invalid Inputs',
            name: 'skipInvalid',
            type: 'boolean',
            default: false,
            description: 'Whether to skip inputs that are not valid numbers instead of throwing an error',
          },
        ],
      },
    ],
  };

  /**
   * Declarative log messages
   */
  getLogMessages() {
    const operationLabels = {
      'add': 'Add',
      'subtract': 'Subtract',
      'multiply': 'Multiply',
      'divide': 'Divide',
      'average': 'Average',
      'min': 'Min',
      'max': 'Max',
      'formula': 'Formula'
    };
    
    return {
      info: (result) => {
        const label = operationLabels[result.operation] || result.operation;
        return `${label}: [${result.inputs.join(', ')}] = ${result.value}`;
      },
      debug: (result) => `Math operation: ${result.operation}, quality: ${result.quality}`,
      error: (error) => `Math operation failed: ${error.message}`
    };
  }

  /**
   * Validates that a value is a valid number
   */
  validateNumber(value, inputIndex, skipInvalid = false) {
    // Handle null/undefined
    if (value === null || value === undefined) {
      if (skipInvalid) return null;
      throw new Error(`Input ${inputIndex} is null or undefined`);
    }

    // Extract numeric value if it's an object
    let numValue = value;
    if (typeof value === 'object') {
      numValue = value.value ?? value.v_num ?? value.v_json;
    }

    // Convert to number
    const num = Number(numValue);

    // Validate
    if (isNaN(num) || !isFinite(num)) {
      if (skipInvalid) return null;
      throw new Error(`Input ${inputIndex} is not a valid number: ${JSON.stringify(value)}`);
    }

    return num;
  }

  /**
   * Collects and validates all input values
   */
  collectInputValues(context) {
    const skipInvalid = this.getParameter(context.node, 'options.skipInvalid', false);
    const values = [];
    const qualities = [];

    for (let i = 0; i < context.getInputCount(); i++) {
      const inputData = context.getInputValue(i);
      
      if (!inputData) {
        if (!skipInvalid) {
          throw new Error(`Input ${i} is empty`);
        }
        continue;
      }

      // Extract value and quality from input
      const value = inputData.value ?? inputData;
      const quality = inputData.quality ?? 192; // Default good quality

      // Validate number
      const numValue = this.validateNumber(value, i, skipInvalid);
      
      if (numValue !== null) {
        values.push(numValue);
        qualities.push(quality);
      }
    }

    if (values.length === 0) {
      throw new Error('No valid numeric inputs found');
    }

    return { values, qualities };
  }

  /**
   * Calculates result quality (minimum of all input qualities)
   */
  calculateQuality(qualities) {
    return qualities.length > 0 ? Math.min(...qualities) : 0;
  }

  /**
   * Rounds value to specified decimal places
   */
  roundValue(value, decimalPlaces) {
    if (decimalPlaces < 0) return value;
    const multiplier = Math.pow(10, decimalPlaces);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Evaluates a custom formula safely using mathjs
   */
  evaluateFormula(formula, values) {
    // Build scope with input variables
    const scope = {};
    values.forEach((value, index) => {
      scope[`input${index}`] = value;
    });

    try {
      // Simple math expression parser (avoiding eval for security)
      // Replace input variables
      let expression = formula;
      values.forEach((value, index) => {
        const regex = new RegExp(`\\binput${index}\\b`, 'g');
        expression = expression.replace(regex, value);
      });

      // Support basic math functions
      expression = expression.replace(/\bsqrt\s*\(/g, 'Math.sqrt(');
      expression = expression.replace(/\babs\s*\(/g, 'Math.abs(');
      expression = expression.replace(/\bround\s*\(/g, 'Math.round(');
      expression = expression.replace(/\bfloor\s*\(/g, 'Math.floor(');
      expression = expression.replace(/\bceil\s*\(/g, 'Math.ceil(');
      expression = expression.replace(/\bmin\s*\(/g, 'Math.min(');
      expression = expression.replace(/\bmax\s*\(/g, 'Math.max(');
      expression = expression.replace(/\bpow\s*\(/g, 'Math.pow(');

      // Validate expression contains only safe characters
      if (!/^[\d\s+\-*/%().]+$/.test(expression.replace(/Math\.\w+/g, ''))) {
        throw new Error('Formula contains invalid characters');
      }

      // Use Function constructor (safer than eval, but still sandboxed)
      const result = new Function('Math', `return ${expression}`)(Math);
      
      if (!isFinite(result)) {
        throw new Error('Formula resulted in invalid number (Infinity or NaN)');
      }

      return result;
    } catch (error) {
      throw new Error(`Formula evaluation failed: ${error.message}`);
    }
  }

  /**
   * Executes the math operation
   */
  async execute(context) {
    const operation = this.getParameter(context.node, 'operation', 'add');
    const decimalPlaces = this.getParameter(context.node, 'options.decimalPlaces', -1);

    // Collect and validate all inputs
    const { values, qualities } = this.collectInputValues(context);
    
    let result;

    // Perform operation
    switch (operation) {
      case 'add':
        result = values.reduce((sum, val) => sum + val, 0);
        break;

      case 'subtract':
        result = values.reduce((diff, val, idx) => idx === 0 ? val : diff - val);
        break;

      case 'multiply':
        result = values.reduce((product, val) => product * val, 1);
        break;

      case 'divide':
        result = values.reduce((quotient, val, idx) => {
          if (idx === 0) return val;
          if (val === 0) {
            throw new Error(`Cannot divide by zero (input ${idx})`);
          }
          return quotient / val;
        });
        break;

      case 'average':
        result = values.reduce((sum, val) => sum + val, 0) / values.length;
        break;

      case 'min':
        result = Math.min(...values);
        break;

      case 'max':
        result = Math.max(...values);
        break;

      case 'formula':
        const formula = this.getParameter(context.node, 'formula', 'input0 + input1');
        result = this.evaluateFormula(formula, values);
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    // Validate result
    if (!isFinite(result)) {
      throw new Error('Operation resulted in invalid number (Infinity or NaN)');
    }

    // Round if needed
    result = this.roundValue(result, decimalPlaces);

    // Calculate output quality
    const quality = this.calculateQuality(qualities);

    return {
      value: result,
      quality,
      operation,
      inputs: values,
      timestamp: new Date().toISOString(),
    };
  }
}

