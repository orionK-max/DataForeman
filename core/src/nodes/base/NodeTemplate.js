import { BaseNode } from './BaseNode.js';

/**
 * Node Template - Complete Example
 * 
 * This is a fully documented example showing how to create a Flow Studio node
 * following the standardized schema specification (v1).
 * 
 * USE THIS AS A TEMPLATE when creating new nodes.
 * 
 * @extends BaseNode
 */
export class NodeTemplate extends BaseNode {
  /**
   * Node Description
   * 
   * This object defines all metadata, inputs, outputs, and configuration
   * for the node. It follows the standardized schema specification v1.
   * 
   * See: docs/flow-node-schema.md for complete specification
   */
  description = {
    // ============================================
    // METADATA (Required)
    // ============================================
    
    /**
     * Schema version - indicates which schema format this node uses
     * Current version: 1
     * 
     * This allows the parser to handle multiple schema versions if we
     * need to make breaking changes in the future.
     */
    schemaVersion: 1,
    
    /**
     * Display name shown in UI
     * Format: Title Case
     * Keep it concise and descriptive
     */
    displayName: 'Template Node',
    
    /**
     * Unique identifier for this node type
     * Format: kebab-case
     * Must be unique across all node types
     */
    name: 'template-node',
    
    /**
     * Node implementation version (separate from schema version)
     * Increment when you make changes to node behavior
     */
    version: 1,
    
    /**
     * Brief description of what this node does
     * Keep it to one sentence or short paragraph
     */
    description: 'Example node demonstrating all standard features and best practices',
    
    /**
     * Category for organizing nodes in UI palette
     * Standard categories: TAG_OPERATIONS, LOGIC_MATH, COMMUNICATION, TRIGGERS
     */
    category: 'LOGIC_MATH',
    
    /**
     * Icon shown in UI (emoji or icon identifier)
     * Choose something that clearly represents the node's function
     */
    icon: '📋',
    
    /**
     * Node color in flow editor (hex code)
     * Choose distinct colors for different node types
     */
    color: '#607D8B',
    
    // ============================================
    // INPUTS (Required, can be empty array)
    // ============================================
    
    /**
     * Input definitions - always use array format
     * Each input is accessed by index in execute() method
     * 
     * Empty array [] for nodes with no inputs (e.g., triggers, data sources)
     */
    inputs: [
      {
        /**
         * Input data type
         * Options: 'main', 'number', 'string', 'boolean', 'trigger', 'any'
         * 
         * - main: Generic data type (accepts any value)
         * - number: Numeric values only
         * - string: Text values only
         * - boolean: True/false only
         * - trigger: Trigger signal (boolean flag)
         * - any: Explicitly accepts any type
         */
        type: 'number',
        
        /**
         * Label shown in UI for this input
         */
        displayName: 'First Value',
        
        /**
         * Is this input required for execution?
         * If true, node won't execute without this input connected
         */
        required: true,
        
        /**
         * Help text shown in UI (optional but recommended)
         */
        description: 'First operand for the operation'
      },
      {
        type: 'number',
        displayName: 'Second Value',
        required: true,
        description: 'Second operand for the operation'
      }
    ],
    
    // ============================================
    // INPUT CONFIGURATION (Optional)
    // For nodes with dynamic input count
    // ============================================
    
    /**
     * Configuration for dynamic inputs (optional)
     * Only include this if your node allows adding/removing inputs at runtime
     * 
     * Example use cases:
     * - Math operations with variable operands
     * - Aggregation nodes
     * - Concatenation nodes
     */
    inputConfiguration: {
      minInputs: 2,          // Minimum number of inputs
      maxInputs: 10,         // Maximum number of inputs  
      defaultInputs: 2,      // Initial number of inputs shown
      canAddInputs: true,    // Can user add more inputs?
      canRemoveInputs: true  // Can user remove inputs?
    },
    
    // ============================================
    // OUTPUTS (Required, can be empty array)
    // ============================================
    
    /**
     * Output definitions - always use array format
     * Most nodes have at least one output
     * 
     * Empty array [] for nodes that only have side effects (rare)
     */
    outputs: [
      {
        /**
         * Output data type
         * Same options as input types
         */
        type: 'number',
        
        /**
         * Label shown in UI for this output
         */
        displayName: 'Result',
        
        /**
         * Help text explaining what this output provides
         */
        description: 'Result of the operation'
      }
    ],
    
    // ============================================
    // PROPERTIES (Required, can be empty array)
    // Configuration parameters for the node
    // ============================================
    
    /**
     * Property definitions - configuration parameters
     * Empty array [] for nodes with no configuration
     */
    properties: [
      // ========== EXAMPLE: Options (Dropdown) ==========
      {
        /**
         * Internal property name (used in code)
         * Format: camelCase
         */
        name: 'operation',
        
        /**
         * Label shown in UI
         * Format: Title Case
         */
        displayName: 'Operation',
        
        /**
         * Property type - determines UI widget
         * Options: string, number, boolean, options, tag, code, collection
         */
        type: 'options',
        
        /**
         * Default value
         * Must be valid for the type
         */
        default: 'add',
        
        /**
         * Is this property required?
         * If true, validation will fail if not set
         */
        required: true,
        
        /**
         * Help text shown in UI
         */
        description: 'Operation to perform on inputs',
        
        /**
         * Available options (for 'options' type)
         */
        options: [
          {
            name: 'Add',              // Display name
            value: 'add',             // Internal value
            description: 'Add inputs' // Tooltip (optional)
          },
          {
            name: 'Subtract',
            value: 'subtract',
            description: 'Subtract second from first'
          },
          {
            name: 'Multiply',
            value: 'multiply',
            description: 'Multiply inputs'
          },
          {
            name: 'Custom',
            value: 'custom',
            description: 'Use custom formula'
          }
        ]
      },
      
      // ========== EXAMPLE: String with Conditional Display ==========
      {
        name: 'formula',
        displayName: 'Custom Formula',
        type: 'string',
        default: 'input0 + input1',
        required: false,
        placeholder: 'e.g., input0 * 2 + input1',
        description: 'Custom formula (use input0, input1, etc.)',
        
        /**
         * Conditional visibility
         * This property only shows when operation === 'custom'
         */
        displayOptions: {
          show: {
            operation: ['custom']  // Show when operation is 'custom'
          }
        }
      },
      
      // ========== EXAMPLE: Number with Constraints ==========
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 5000,
        required: false,
        description: 'Maximum execution time in milliseconds',
        
        /**
         * Constraints for number type
         */
        min: 100,      // Minimum value
        max: 60000,    // Maximum value
        step: 100      // Step increment for UI spinner
      },
      
      // ========== EXAMPLE: Boolean ==========
      {
        name: 'skipErrors',
        displayName: 'Skip Errors',
        type: 'boolean',
        default: false,
        required: false,
        description: 'Continue execution even if an error occurs'
      },
      
      // ========== EXAMPLE: Collection (Nested Properties) ==========
      {
        name: 'advanced',
        displayName: 'Advanced Options',
        type: 'collection',
        default: {},
        description: 'Advanced configuration options',
        
        /**
         * Nested properties within the collection
         */
        options: [
          {
            name: 'decimalPlaces',
            displayName: 'Decimal Places',
            type: 'number',
            default: -1,
            description: 'Number of decimal places (-1 = no rounding)',
            min: -1,
            max: 10
          },
          {
            name: 'strictMode',
            displayName: 'Strict Mode',
            type: 'boolean',
            default: false,
            description: 'Enable strict validation'
          }
        ]
      }
    ],
    
    // ============================================
    // EXTENSIONS (Optional)
    // For future features and non-breaking additions
    // ============================================
    
    /**
     * Extensions object for flexibility
     * Use this for:
     * - Experimental features
     * - Custom metadata
     * - Features that may become standard later
     * - Node-specific configuration
     */
    extensions: {
      /**
       * Node behaviors (boolean flags)
       */
      behaviors: {
        streaming: false,      // Processes continuous data streams
        stateful: false,       // Maintains state between executions
        sideEffects: false,    // Has external side effects
        experimental: false,   // Experimental/beta feature
        retryable: true        // Supports automatic retry on failure
      },
      
      /**
       * Custom metadata (any valid JSON)
       */
      metadata: {
        author: 'DataForeman Team',
        documentation: 'https://docs.example.com/nodes/template',
        tags: ['example', 'template'],
        version: '1.0.0'
      },
      
      /**
       * Advanced configuration
       */
      advanced: {
        // Future features can go here without breaking schema
      }
    }
  };

  /**
   * Validate Node Configuration
   * 
   * Override this method to add custom validation logic beyond
   * the standard schema validation.
   * 
   * Called automatically when node is registered and when flow is saved.
   * 
   * @param {Object} node - Node instance from flow definition
   * @returns {Object} Validation result
   * @returns {boolean} result.valid - Whether configuration is valid
   * @returns {Array<string>} result.errors - Array of error messages
   */
  validate(node) {
    // Start with base validation (checks required fields)
    const baseValidation = super.validate(node);
    if (!baseValidation.valid) {
      return baseValidation;
    }
    
    const errors = [];
    
    // Add custom validation rules
    const operation = this.getParameter(node, 'operation');
    const formula = this.getParameter(node, 'formula');
    
    // Example: Validate that formula is provided for custom operation
    if (operation === 'custom' && (!formula || formula.trim() === '')) {
      errors.push('Custom formula is required when operation is "custom"');
    }
    
    // Example: Validate number ranges
    const timeout = this.getParameter(node, 'timeout');
    if (timeout && (timeout < 100 || timeout > 60000)) {
      errors.push('Timeout must be between 100 and 60000 milliseconds');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Declarative Log Messages
   * 
   * Define log messages for different execution outcomes.
   * These are called automatically by the execution engine.
   * 
   * Return null to skip logging at that level.
   * 
   * @returns {Object} Log message functions
   */
  getLogMessages() {
    return {
      /**
       * Info-level message for successful execution
       * @param {Object} result - Execution result from execute()
       * @returns {string|null} Message or null to skip
       */
      info: (result) => {
        return `Operation ${result.operation}: ${result.inputs.join(' ')} = ${result.value}`;
      },
      
      /**
       * Debug-level message for detailed information
       * @param {Object} result - Execution result from execute()
       * @returns {string|null} Message or null to skip
       */
      debug: (result) => {
        return `Quality: ${result.quality}, Execution time: ${result.executionTime}ms`;
      },
      
      /**
       * Warning-level message for non-fatal issues
       * @param {Object} result - Execution result from execute()
       * @returns {string|null} Message or null to skip
       */
      warn: (result) => {
        if (result.quality < 192) {
          return `Low quality input detected (${result.quality})`;
        }
        return null; // No warning
      },
      
      /**
       * Error-level message for failures
       * @param {Error} error - Error that occurred
       * @returns {string} Error message (should always return a string)
       */
      error: (error) => {
        return `Node execution failed: ${error.message}`;
      }
    };
  }

  /**
   * Execute Node Logic
   * 
   * This is the main method that performs the node's work.
   * Called by the flow execution engine.
   * 
   * @param {NodeExecutionContext} context - Execution context with helpers
   * @returns {Promise<Object>} Execution result
   * @returns {*} result.value - Output value
   * @returns {number} result.quality - Quality code (0=bad, 192=good)
   * @returns {Object} [result.metadata] - Optional metadata
   */
  async execute(context) {
    const startTime = Date.now();
    
    // ========== STEP 1: Get Configuration Parameters ==========
    
    const operation = this.getParameter(context.node, 'operation', 'add');
    const timeout = this.getParameter(context.node, 'timeout', 5000);
    const skipErrors = this.getParameter(context.node, 'skipErrors', false);
    
    // Access nested properties from collection
    const decimalPlaces = this.getParameter(context.node, 'advanced.decimalPlaces', -1);
    const strictMode = this.getParameter(context.node, 'advanced.strictMode', false);
    
    // ========== STEP 2: Get Input Values ==========
    
    // Get single input (by index)
    const input0 = context.getInputValue(0);
    const input1 = context.getInputValue(1);
    
    // OR get all inputs at once
    // const allInputs = context.getInputValues();
    
    // Check if inputs exist
    if (!input0 || !input1) {
      if (skipErrors) {
        return { value: null, quality: 0 };
      }
      throw new Error('Missing required inputs');
    }
    
    // Extract values and quality
    const value0 = input0.value;
    const value1 = input1.value;
    const quality0 = input0.quality || 192;
    const quality1 = input1.quality || 192;
    
    // ========== STEP 3: Validate Input Data ==========
    
    // Check for valid numbers
    if (typeof value0 !== 'number' || typeof value1 !== 'number') {
      throw new Error('Inputs must be numbers');
    }
    
    if (!isFinite(value0) || !isFinite(value1)) {
      throw new Error('Inputs must be finite numbers');
    }
    
    // Strict mode validation
    if (strictMode) {
      if (isNaN(value0) || isNaN(value1)) {
        throw new Error('Strict mode: NaN values not allowed');
      }
    }
    
    // ========== STEP 4: Perform Operation ==========
    
    let result;
    
    switch (operation) {
      case 'add':
        result = value0 + value1;
        break;
        
      case 'subtract':
        result = value0 - value1;
        break;
        
      case 'multiply':
        result = value0 * value1;
        break;
        
      case 'custom':
        const formula = this.getParameter(context.node, 'formula');
        result = this.evaluateFormula(formula, [value0, value1]);
        break;
        
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    // ========== STEP 5: Validate Result ==========
    
    if (!isFinite(result)) {
      throw new Error('Operation resulted in invalid number');
    }
    
    // Apply decimal rounding if configured
    if (decimalPlaces >= 0) {
      const multiplier = Math.pow(10, decimalPlaces);
      result = Math.round(result * multiplier) / multiplier;
    }
    
    // ========== STEP 6: Calculate Output Quality ==========
    
    // Output quality is minimum of input qualities
    // OPC UA quality codes: 0=bad, 64=uncertain, 192=good
    const outputQuality = Math.min(quality0, quality1);
    
    // ========== STEP 7: Return Result ==========
    
    const executionTime = Date.now() - startTime;
    
    return {
      value: result,
      quality: outputQuality,
      
      // Optional metadata for debugging/logging
      operation: operation,
      inputs: [value0, value1],
      executionTime: executionTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Helper: Evaluate Custom Formula
   * 
   * Example helper method. Keep node logic organized in separate methods.
   * 
   * @param {string} formula - Formula string
   * @param {Array<number>} values - Input values
   * @returns {number} Result
   * @private
   */
  evaluateFormula(formula, values) {
    // Replace input0, input1, etc. with actual values
    let expression = formula;
    values.forEach((value, index) => {
      const regex = new RegExp(`\\binput${index}\\b`, 'g');
      expression = expression.replace(regex, value);
    });
    
    // Validate expression (whitelist approach for security)
    if (!/^[\d\s+\-*/%().]+$/.test(expression)) {
      throw new Error('Formula contains invalid characters');
    }
    
    // Evaluate safely
    try {
      const result = new Function(`return ${expression}`)();
      
      if (!isFinite(result)) {
        throw new Error('Formula resulted in invalid number');
      }
      
      return result;
    } catch (error) {
      throw new Error(`Formula evaluation failed: ${error.message}`);
    }
  }
}

// ============================================
// USAGE NOTES
// ============================================

/**
 * HOW TO USE THIS TEMPLATE:
 * 
 * 1. Copy this file to create your new node
 * 2. Rename the class (e.g., MyCustomNode)
 * 3. Update the description object with your node's details
 * 4. Implement the execute() method with your logic
 * 5. Add custom validation if needed
 * 6. Define log messages for different outcomes
 * 7. Register in core/src/nodes/index.js
 * 
 * TESTING YOUR NODE:
 * 
 * 1. Register: NodeRegistry.register('my-node', MyCustomNode)
 * 2. Restart backend
 * 3. Check /api/flows/node-types endpoint
 * 4. Create flow in UI with your node
 * 5. Test execution
 * 
 * BEST PRACTICES:
 * 
 * - Keep execute() focused on core logic
 * - Extract complex logic into helper methods
 * - Validate inputs thoroughly
 * - Handle errors gracefully
 * - Propagate quality codes correctly
 * - Use meaningful log messages
 * - Document complex behavior
 * - Test edge cases (null, NaN, Infinity)
 * 
 * COMMON PATTERNS:
 * 
 * - Read tags: Query tag_metadata and tag_values
 * - Write tags: Publish to NATS
 * - Database queries: Use context.query()
 * - Time-series data: Use context.queryTimeseries()
 * - External APIs: Use fetch() or axios
 * - File operations: Use fs with allowed paths
 * 
 * DEBUGGING TIPS:
 * 
 * - Use context.logDebug() for detailed logging
 * - Check flow_execution_logs table
 * - Test with simple flows first
 * - Verify input connections in UI
 * - Check quality codes (0=bad, 192=good)
 * - Look for validation errors in console
 */

