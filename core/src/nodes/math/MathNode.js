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
    ioRules: [
      {
        inputs: {
          min: 2,
          max: 10,
          default: 2,
          canAdd: true,
          canRemove: true,
          type: 'number'
        }
      }
    ],
    outputs: [{ type: 'number', displayName: 'Result' }],
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
          title: 'Math',
          color: '#00A0A0',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{operation}}',
          visible: '{{operation}}'
        },
        {
          type: 'text',
          content: '{{formula}}',
          fontSize: 11,
          color: '#999999',
          align: 'left',
          visible: '{{operation}} === "formula"'
        }
      ],
      handles: {
        inputs: [],  // Dynamic - populated by backend based on inputCount
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
          { label: 'Add All', value: 'add' },
          { label: 'Subtract (First - Rest)', value: 'subtract' },
          { label: 'Multiply All', value: 'multiply' },
          { label: 'Divide (First / Rest)', value: 'divide' },
          { label: 'Average', value: 'average' },
          { label: 'Minimum', value: 'min' },
          { label: 'Maximum', value: 'max' },
          { label: 'Custom Formula', value: 'formula' },
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
        displayName: 'Decimal Places',
        name: 'decimalPlaces',
        type: 'number',
        default: -1,
        description: 'Number of decimal places (-1 = no rounding)',
        userExposable: true
      },
      {
        displayName: 'Skip Invalid Inputs',
        name: 'skipInvalid',
        type: 'boolean',
        default: false,
        description: 'Skip inputs that are not valid numbers',
        userExposable: true
      },
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

    // Reject boolean values - use TypeConvertNode for bool->number conversion
    if (typeof numValue === 'boolean') {
      if (skipInvalid) return null;
      throw new Error(`Input ${inputIndex} is a boolean. Use TypeConvertNode to convert boolean to number.`);
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
    const skipInvalid = this.getParameter(context.node, 'skipInvalid', false);
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
      const quality = inputData.quality ?? 0; // Default good quality (0 = Good in OPC UA)

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
    const decimalPlaces = this.getParameter(context.node, 'decimalPlaces', -1);

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

  static get help() {
    return {
      overview: "Performs mathematical operations on multiple numeric inputs with support for basic arithmetic, aggregation, and custom formulas. Handles 2-10 inputs with configurable decimal precision and quality aggregation.",
      useCases: [
        "Calculate total production by adding outputs from multiple machines",
        "Compute average temperature across multiple sensors for stability monitoring",
        "Find minimum/maximum values for threshold detection and alarming",
        "Apply custom formulas for complex calculations (e.g., efficiency ratios, conversions)"
      ],
      examples: [
        {
          title: "Average Temperature",
          config: { operation: "average", decimalPlaces: 1 },
          input: { inputs: [22.3, 23.1, 22.7] },
          output: { value: 22.7, operation: "average" }
        },
        {
          title: "Production Total",
          config: { operation: "add", decimalPlaces: 0 },
          input: { inputs: [150, 200, 175, 225] },
          output: { value: 750, operation: "add" }
        },
        {
          title: "Custom Formula",
          config: { operation: "formula", formula: "(inputs[0] + inputs[1]) / 2", decimalPlaces: 2 },
          input: { inputs: [100, 50] },
          output: { value: 75.00, operation: "formula" }
        }
      ],
      tips: [
        "Use 'average' instead of manually dividing sum by count",
        "Custom formulas support full JavaScript math expressions (Math.sqrt, Math.pow, etc.)",
        "Quality output uses 'worst' strategy by default - one bad input makes output bad",
        "Add/remove inputs dynamically by adjusting input count in configuration",
        "Decimal places apply to final result, intermediate calculations use full precision"
      ],
      relatedNodes: ["ClampNode", "RoundNode", "ComparisonNode"]
    };
  }
}

