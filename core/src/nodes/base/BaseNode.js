/**
 * Base Node Class
 * 
 * Abstract base class for all Flow Studio nodes.
 * Provides common functionality and defines the interface that all nodes must implement.
 * 
 * @abstract
 */
export class BaseNode {
  /**
   * Node description - defines metadata, inputs, outputs, and parameters
   * Must be overridden by subclass
   * 
   * @type {Object}
   * @property {string} displayName - Human-readable name shown in UI
   * @property {string} name - Unique identifier (kebab-case)
   * @property {number} version - Node version for backward compatibility
   * @property {string} description - What this node does
   * @property {string} category - Category for organization (TAG_OPERATIONS, LOGIC_MATH, etc.)
   * @property {Array<Object>} inputs - Input port definitions
   * @property {Array<Object>} outputs - Output port definitions
   * @property {Array<Object>} properties - Parameter definitions
   * @property {Object} [visual] - Visual representation configuration (optional)
   * @property {string} [visual.subtitle] - Template for node subtitle (supports {{field}} placeholders)
   * @property {Object|Function} [visual.iconMap] - Map of field values to emoji/icons, or function(data) => icon
   * @property {Array<Object>} [visual.badges] - Badges to display on node
   * @property {string} [visual.badges[].field] - Field name from node.data
   * @property {string} [visual.badges[].template] - Template string with {{placeholders}}
   * @property {string} [visual.badges[].color] - Badge background color
   * @property {Array<Object>} [visual.infoLines] - Additional info lines below node title
   * @property {string} [visual.infoLines[].template] - Template string with {{placeholders}}
   */
  description = {
    displayName: 'Base Node',
    name: 'base-node',
    version: 1,
    description: 'Base node class - must be extended',
    category: 'BASE',
    inputs: [{ type: 'main', displayName: 'Input' }],
    outputs: [{ type: 'main', displayName: 'Output' }],
    properties: []
  };

  /**
   * Validate node configuration
   * Override in subclass to add custom validation rules
   * 
   * @param {Object} node - Node instance from flow definition
   * @param {string} node.id - Unique node ID
   * @param {string} node.type - Node type identifier
   * @param {Object} node.data - Node configuration data
   * @returns {Object} Validation result
   * @returns {boolean} result.valid - Whether configuration is valid
   * @returns {Array<string>} result.errors - Array of error messages
   */
  validate(node) {
    const errors = [];
    
    // Basic validation - ensure node has required fields
    if (!node.id) {
      errors.push('Node ID is required');
    }
    
    if (!node.type) {
      errors.push('Node type is required');
    }
    
    // Validate required parameters
    for (const prop of this.description.properties) {
      if (prop.required) {
        const value = this.getParameter(node, prop.name);
        if (value === undefined || value === null || value === '') {
          errors.push(`${prop.displayName || prop.name} is required`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute node logic
   * MUST be overridden by subclass
   * 
   * @abstract
   * @param {NodeExecutionContext} context - Execution context with helpers
   * @returns {Promise<Object>} Execution result
   * @returns {*} result.value - Output value
   * @returns {number} result.quality - Quality code (0=bad, 192=good)
   * @returns {Object} [result.metadata] - Optional metadata
   * @throws {Error} If not implemented by subclass
   */
  async execute(context) {
    throw new Error(
      `Node ${this.description.name} must implement execute() method`
    );
  }

  /**
   * Get parameter value from node configuration
   * 
   * @param {Object} node - Node instance
   * @param {string} name - Parameter name
   * @param {*} [defaultValue] - Default value if parameter not set
   * @returns {*} Parameter value or default
   */
  getParameter(node, name, defaultValue = undefined) {
    if (!node.data || typeof node.data !== 'object') {
      return defaultValue;
    }
    
    const value = node.data[name];
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get all parameter values from node configuration
   * 
   * @param {Object} node - Node instance
   * @returns {Object} All parameters as key-value pairs
   */
  getParameters(node) {
    return node.data || {};
  }

  /**
   * Check if node has a specific parameter defined
   * 
   * @param {Object} node - Node instance
   * @param {string} name - Parameter name
   * @returns {boolean} True if parameter exists
   */
  hasParameter(node, name) {
    return node.data && name in node.data;
  }

  /**
   * Get node metadata (description)
   * Useful for dynamic UI generation
   * 
   * @returns {Object} Node description
   */
  getDescription() {
    return this.description;
  }

  /**
   * Get node version
   * 
   * @returns {number} Version number
   */
  getVersion() {
    return this.description.version || 1;
  }

  /**
   * Get node display name
   * 
   * @returns {string} Display name
   */
  getDisplayName() {
    return this.description.displayName || this.description.name;
  }

  /**
   * Get extension field value
   * Extensions allow adding custom metadata without breaking schema compatibility
   * 
   * @param {string} key - Extension field name
   * @param {*} [defaultValue] - Default value if extension not found
   * @returns {*} Extension value or default
   * 
   * @example
   * const maxRetries = this.getExtension('maxRetries', 3);
   */
  getExtension(key, defaultValue = undefined) {
    if (!this.description.extensions || typeof this.description.extensions !== 'object') {
      return defaultValue;
    }
    
    const value = this.description.extensions[key];
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Check if an extension field exists
   * 
   * @param {string} key - Extension field name
   * @returns {boolean} True if extension exists
   */
  hasExtension(key) {
    return this.description.extensions && 
           typeof this.description.extensions === 'object' &&
           key in this.description.extensions;
  }

  /**
   * Get all extensions
   * 
   * @returns {Object} Extensions object or empty object
   */
  getExtensions() {
    return this.description.extensions || {};
  }

  /**
   * Validate parameter value against expected type
   * 
   * @param {Object} node - Node instance
   * @param {string} name - Parameter name
   * @param {string} expectedType - Expected type (string, number, boolean, options, tag, code)
   * @returns {Object} { valid: boolean, error: string|null }
   */
  validateParameter(node, name, expectedType) {
    const value = this.getParameter(node, name);
    
    if (value === undefined || value === null) {
      return { valid: true, error: null }; // Null/undefined is valid, check required separately
    }
    
    switch (expectedType) {
      case 'string':
      case 'code':
      case 'tag':
        if (typeof value !== 'string') {
          return { valid: false, error: `${name} must be a string` };
        }
        break;
        
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: `${name} must be a number` };
        }
        break;
        
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: `${name} must be a boolean` };
        }
        break;
        
      case 'options':
        // Options validation requires checking against allowed values
        // This is done in the property definition's options array
        break;
        
      default:
        return { valid: true, error: null };
    }
    
    return { valid: true, error: null };
  }

  /**
   * Get parameter definition from description
   * 
   * @param {string} name - Parameter name
   * @returns {Object|null} Parameter definition or null if not found
   */
  getParameterDefinition(name) {
    if (!this.description.properties) {
      return null;
    }
    
    return this.description.properties.find(prop => prop.name === name) || null;
  }

  /**
   * Get declarative log messages for different levels
   * Override this in subclass to provide custom log messages
   * 
   * Each function receives the execution result or error and should return a string
   * 
   * @returns {Object} Log message functions
   * @returns {Function} [return.info] - Info level message generator (result) => string
   * @returns {Function} [return.debug] - Debug level message generator (result) => string
   * @returns {Function} [return.warn] - Warning level message generator (result) => string
   * @returns {Function} [return.error] - Error level message generator (error) => string
   * 
   * @example
   * getLogMessages() {
   *   return {
   *     info: (result) => `Processed value: ${result.value}`,
   *     debug: (result) => `Execution took ${result.executionTime}ms`,
   *     error: (error) => `Failed: ${error.message}`
   *   };
   * }
   */
  getLogMessages() {
    return {
      // Default implementations - can be overridden
      info: null,  // No info logging by default
      debug: null, // No debug logging by default
      warn: null,  // No warn logging by default
      error: (error) => `Node execution failed: ${error.message}` // Default error message
    };
  }
}
