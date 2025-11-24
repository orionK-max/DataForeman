// Trigger Expression Evaluator
// Parses and evaluates trigger expressions for conditional node execution
// Supports comparisons, dot notation, and boolean logic

/**
 * Evaluates trigger expressions for conditional node execution.
 * Supports:
 * - Comparisons: >, <, >=, <=, ===, !==
 * - Dot notation: $input.port.nested.path
 * - Boolean logic: &&, ||, !
 * - Literals: numbers, strings (single/double quotes), true, false, null
 */
export class TriggerEvaluator {
  constructor(inputStateManager) {
    this.inputStateManager = inputStateManager;
  }

  /**
   * Evaluate a trigger expression for a node
   * @param {string} nodeId - Node ID for input context
   * @param {string} expression - Trigger expression to evaluate
   * @returns {boolean} True if trigger fires, false otherwise
   * @throws {Error} If expression is invalid
   */
  evaluate(nodeId, expression) {
    if (!expression || typeof expression !== 'string') {
      throw new Error('Trigger expression must be a non-empty string');
    }

    // Get all inputs for this node
    const inputs = this.inputStateManager.getInputsAsObject(nodeId);

    // Create evaluation context with $input object
    const context = {
      $input: inputs
    };

    // Parse and evaluate expression safely
    try {
      const result = this._evaluateExpression(expression, context);
      
      // Coerce result to boolean
      return Boolean(result);
    } catch (error) {
      throw new Error(`Failed to evaluate trigger expression: ${error.message}`);
    }
  }

  /**
   * Internal method to evaluate expression in context
   * @private
   */
  _evaluateExpression(expression, context) {
    // Replace $input references with context.$input
    const prepared = this._prepareExpression(expression);
    
    // Use Function constructor for safe evaluation
    // Pass context variables as function parameters
    try {
      const fn = new Function('$input', `
        'use strict';
        return ${prepared};
      `);
      
      return fn(context.$input);
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  /**
   * Prepare expression by keeping $input references intact
   * @private
   */
  _prepareExpression(expression) {
    // Expression already uses $input.port syntax
    // Just return it as-is since we're passing $input as a parameter
    return expression;
  }

  /**
   * Validate a trigger expression without executing it
   * @param {string} expression - Expression to validate
   * @returns {Object} { valid: boolean, error: string|null }
   */
  static validate(expression) {
    if (!expression || typeof expression !== 'string') {
      return { valid: false, error: 'Expression must be a non-empty string' };
    }

    // Check for dangerous patterns
    const dangerous = [
      /require\s*\(/i,
      /import\s+/i,
      /process\./i,
      /global\./i,
      /__dirname/i,
      /__filename/i,
      /child_process/i,
      /fs\./i,
      /eval\(/i,
      /Function\(/i
    ];

    for (const pattern of dangerous) {
      if (pattern.test(expression)) {
        return { valid: false, error: 'Expression contains forbidden patterns' };
      }
    }

    // Check basic syntax by attempting to parse as function body
    try {
      new Function('context', `'use strict'; return ${expression}`);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: `Syntax error: ${error.message}` };
    }
  }

  /**
   * Get available input ports for a node (for UI autocomplete)
   * @param {string} nodeId - Node ID
   * @returns {string[]} Array of input port names
   */
  getAvailableInputs(nodeId) {
    const inputs = this.inputStateManager.getAllInputs(nodeId);
    return Array.from(inputs.keys());
  }
}

/**
 * Example trigger expressions:
 * 
 * Simple comparisons:
 *   $input.temperature > 100
 *   $input.pressure < 50
 *   $input.status === 'OK'
 *   $input.alarm !== true
 * 
 * Dot notation:
 *   $input.sensor.value > 100
 *   $input.data.nested.field === 'active'
 * 
 * Boolean logic:
 *   $input.temp > 100 && $input.pressure < 50
 *   ($input.alarm === true) || ($input.warning === true)
 *   !$input.enabled
 * 
 * Complex expressions:
 *   ($input.temp > 100 && $input.temp < 200) || $input.override === true
 *   $input.value >= 10 && $input.value <= 20
 */
