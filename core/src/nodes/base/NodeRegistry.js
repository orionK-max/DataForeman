/**
 * Node Registry
 * 
 * Singleton registry for managing node type registrations.
 * Provides lookup and validation for node classes.
 * 
 * This is the single source of truth for node type definitions. All node metadata
 * (inputs, outputs, properties, descriptions) should be defined here in each node's
 * static description object. Frontend can fetch this via GET /api/flows/node-types.
 */

import { SchemaValidator } from './SchemaValidator.js';

class NodeRegistryClass {
  constructor() {
    /**
     * Map of node type -> node class
     * @private
     */
    this._registry = new Map();
    
    /**
     * Map of node type -> node instance (cached)
     * @private
     */
    this._instances = new Map();
  }

  /**
   * Register a node class
   * Validates description against schema and applies defaults
   * 
   * @param {string} nodeType - Node type identifier (e.g., 'tag-input')
   * @param {Class} NodeClass - Node class that extends BaseNode
   * @param {Object} options - Registration options
   * @param {boolean} options.skipValidation - Skip schema validation (for legacy nodes)
   * @throws {Error} If node type already registered
   * @throws {Error} If NodeClass is invalid
   * @throws {Error} If description fails schema validation
   */
  register(nodeType, NodeClass, options = {}) {
    const { skipValidation = false } = options;
    
    // Validation
    if (!nodeType || typeof nodeType !== 'string') {
      throw new Error('Node type must be a non-empty string');
    }
    
    if (!NodeClass || typeof NodeClass !== 'function') {
      throw new Error('NodeClass must be a constructor function');
    }
    
    // Check for duplicates
    if (this._registry.has(nodeType)) {
      throw new Error(`Node type '${nodeType}' is already registered`);
    }
    
    // Validate that it has required methods
    const instance = new NodeClass();
    if (typeof instance.execute !== 'function') {
      throw new Error(`Node class for '${nodeType}' must implement execute() method`);
    }
    
    if (!instance.description || typeof instance.description !== 'object') {
      throw new Error(`Node class for '${nodeType}' must have a description object`);
    }
    
    // Validate and apply defaults using SchemaValidator
    if (!skipValidation) {
      const validation = SchemaValidator.validateAndApplyDefaults(nodeType, instance.description);
      
      // Log warnings
      if (validation.warnings && validation.warnings.length > 0) {
        console.warn(`[NodeRegistry] Warnings for ${nodeType}:`);
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }
      
      // Fail on errors
      if (!validation.valid) {
        console.error(`[NodeRegistry] Schema validation failed for ${nodeType}:`);
        validation.errors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`Schema validation failed for '${nodeType}': ${validation.errors.join('; ')}`);
      }
      
      // Apply defaults to the instance description
      instance.description = validation.description;
    }
    
    // Register
    this._registry.set(nodeType, NodeClass);
    
    const schemaVersion = instance.description.schemaVersion || 'unknown';
    console.log(`[NodeRegistry] Registered node type: ${nodeType} (schema v${schemaVersion})`);
  }

  /**
   * Get node class for a given type
   * 
   * @param {string} nodeType - Node type identifier
   * @returns {Class|undefined} Node class or undefined if not found
   */
  get(nodeType) {
    return this._registry.get(nodeType);
  }

  /**
   * Check if a node type is registered
   * 
   * @param {string} nodeType - Node type identifier
   * @returns {boolean} True if registered
   */
  has(nodeType) {
    return this._registry.has(nodeType);
  }

  /**
   * Get node instance (cached)
   * Creates new instance if not cached
   * 
   * @param {string} nodeType - Node type identifier
   * @returns {BaseNode|undefined} Node instance or undefined if not found
   */
  getInstance(nodeType) {
    // Check cache first
    if (this._instances.has(nodeType)) {
      return this._instances.get(nodeType);
    }
    
    // Get class and create instance
    const NodeClass = this._registry.get(nodeType);
    if (!NodeClass) {
      return undefined;
    }
    
    const instance = new NodeClass();
    this._instances.set(nodeType, instance);
    
    return instance;
  }

  /**
   * Get node description
   * 
   * @param {string} nodeType - Node type identifier
   * @returns {Object|undefined} Node description or undefined if not found
   */
  getDescription(nodeType) {
    const instance = this.getInstance(nodeType);
    return instance ? instance.description : undefined;
  }

  /**
   * Get all registered node types
   * 
   * @returns {Array<string>} Array of node type identifiers
   */
  getAll() {
    return Array.from(this._registry.keys());
  }

  /**
   * Get all node descriptions
   * Useful for API endpoints that need to return all available node types
   * 
   * @returns {Object} Map of node type -> description
   */
  getAllDescriptions() {
    const descriptions = {};
    
    for (const nodeType of this._registry.keys()) {
      const description = this.getDescription(nodeType);
      if (description) {
        descriptions[nodeType] = description;
      }
    }
    
    return descriptions;
  }

  /**
   * Get count of registered nodes
   * 
   * @returns {number} Number of registered node types
   */
  count() {
    return this._registry.size;
  }
  
  /**
   * Check if a schema version is supported
   * 
   * @param {number} version - Schema version to check
   * @returns {boolean} True if version is supported
   */
  isSchemaVersionSupported(version) {
    // Currently only version 1 is supported
    return version === 1;
  }
  
  /**
   * Get supported schema versions
   * 
   * @returns {Array<number>} Array of supported schema versions
   */
  getSupportedSchemaVersions() {
    return [1];
  }

  /**
   * Unregister a node type (mainly for testing)
   * 
   * @param {string} nodeType - Node type identifier
   * @returns {boolean} True if was registered and removed
   */
  unregister(nodeType) {
    this._instances.delete(nodeType);
    return this._registry.delete(nodeType);
  }

  /**
   * Clear all registrations (mainly for testing)
   */
  clear() {
    this._registry.clear();
    this._instances.clear();
  }

  /**
   * Validate a node instance against its registered type
   * 
   * @param {Object} node - Node instance from flow
   * @returns {Object} Validation result
   * @returns {boolean} result.valid - Whether node is valid
   * @returns {Array<string>} result.errors - Array of error messages
   */
  validateNode(node) {
    const errors = [];
    
    if (!node || typeof node !== 'object') {
      errors.push('Node must be an object');
      return { valid: false, errors };
    }
    
    if (!node.type) {
      errors.push('Node type is required');
      return { valid: false, errors };
    }
    
    // Check if type is registered
    if (!this.has(node.type)) {
      errors.push(`Node type '${node.type}' is not registered`);
      return { valid: false, errors };
    }
    
    // Validate using node's validate method
    const instance = this.getInstance(node.type);
    if (instance && typeof instance.validate === 'function') {
      const result = instance.validate(node);
      if (result && !result.valid) {
        errors.push(...(result.errors || []));
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Create singleton instance
const NodeRegistry = new NodeRegistryClass();

// Export singleton
export { NodeRegistry };
export default NodeRegistry;
