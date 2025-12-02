/**
 * Schema Validator for Flow Node Descriptions
 * 
 * Validates node descriptions against the Flow Studio schema specification.
 * Ensures all nodes follow the standardized format and have required fields.
 * 
 * Schema Version: 1
 * See: docs/flow-node-schema.md for full specification
 */

export class SchemaValidator {
  /**
   * Validate a node description
   * @param {string} nodeType - Node type identifier (e.g., 'tag-input')
   * @param {Object} description - Node description object
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  static validate(nodeType, description) {
    const errors = [];
    const warnings = [];

    // Check required top-level fields
    if (!description) {
      errors.push('Description is required');
      return { valid: false, errors, warnings };
    }

    if (typeof description !== 'object') {
      errors.push('Description must be an object');
      return { valid: false, errors, warnings };
    }

    // Validate displayName
    if (!description.displayName || typeof description.displayName !== 'string') {
      errors.push('displayName is required and must be a string');
    }

    // Validate name (should match nodeType)
    if (!description.name || typeof description.name !== 'string') {
      errors.push('name is required and must be a string');
    } else if (description.name !== nodeType) {
      warnings.push(`name "${description.name}" does not match node type "${nodeType}"`);
    }

    // Validate name format (kebab-case)
    if (description.name && !/^[a-z0-9-]+$/.test(description.name)) {
      errors.push('name must be lowercase alphanumeric with hyphens only (kebab-case)');
    }

    // Validate version
    if (description.version === undefined || description.version === null) {
      errors.push('version is required');
    } else if (!Number.isInteger(description.version) || description.version < 1) {
      errors.push('version must be a positive integer');
    }

    // Validate description text
    if (!description.description || typeof description.description !== 'string') {
      warnings.push('description text is recommended');
    }

    // Validate category
    const validCategories = [
      'TAG_OPERATIONS', 'LOGIC_MATH', 'TRIGGERS', 'DATA_TRANSFORM',
      'COMMUNICATION', 'CONTROL', 'UTILITY', 'OTHER'
    ];
    if (!description.category) {
      warnings.push('category is recommended (will default to OTHER)');
    } else if (!validCategories.includes(description.category)) {
      warnings.push(`category "${description.category}" is not a standard category. Valid: ${validCategories.join(', ')}`);
    }

    // Validate section
    if (!description.section) {
      warnings.push('section is recommended (will default to BASIC)');
    } else if (typeof description.section !== 'string') {
      errors.push('section must be a string');
    }

    // Validate icon
    if (!description.icon) {
      warnings.push('icon is recommended (will default to 📦)');
    }

    // Validate color
    if (!description.color) {
      warnings.push('color is recommended (will default to #666666)');
    } else if (!/^#[0-9A-Fa-f]{6}$/.test(description.color)) {
      errors.push('color must be a valid hex color (e.g., #RRGGBB)');
    }

    // Validate schemaVersion
    if (!description.schemaVersion) {
      warnings.push('schemaVersion is recommended (will default to 1)');
    } else if (description.schemaVersion !== 1) {
      warnings.push(`schemaVersion ${description.schemaVersion} is not supported (only version 1 is currently supported)`);
    }

    // Validate inputs
    if (!Array.isArray(description.inputs)) {
      errors.push('inputs must be an array (use empty array [] for nodes with no inputs)');
    } else {
      description.inputs.forEach((input, index) => {
        const inputErrors = this.validateInput(input, index);
        errors.push(...inputErrors);
      });
    }

    // Validate outputs
    if (!Array.isArray(description.outputs)) {
      errors.push('outputs must be an array (use empty array [] for nodes with no outputs)');
    } else {
      description.outputs.forEach((output, index) => {
        const outputErrors = this.validateOutput(output, index);
        errors.push(...outputErrors);
      });
    }

    // Validate properties
    if (!Array.isArray(description.properties)) {
      errors.push('properties must be an array (use empty array [] for nodes with no properties)');
    } else {
      description.properties.forEach((prop, index) => {
        const propErrors = this.validateProperty(prop, index);
        errors.push(...propErrors);
      });
    }

    // Validate extensions (optional)
    if (description.extensions !== undefined) {
      if (typeof description.extensions !== 'object' || Array.isArray(description.extensions)) {
        errors.push('extensions must be an object');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate an input definition
   * @param {Object} input - Input object
   * @param {number} index - Input index for error messages
   * @returns {string[]} Array of error messages
   */
  static validateInput(input, index) {
    const errors = [];
    const prefix = `Input[${index}]`;

    if (!input || typeof input !== 'object') {
      errors.push(`${prefix}: must be an object`);
      return errors;
    }

    // Validate type
    const validTypes = ['main', 'trigger', 'number', 'string', 'boolean', 'object', 'array'];
    if (!input.type) {
      errors.push(`${prefix}: type is required`);
    } else if (!validTypes.includes(input.type)) {
      errors.push(`${prefix}: type "${input.type}" is not valid. Valid types: ${validTypes.join(', ')}`);
    }

    // Validate displayName
    if (!input.displayName || typeof input.displayName !== 'string') {
      errors.push(`${prefix}: displayName is required and must be a string`);
    }

    // Validate required (optional, defaults based on type)
    if (input.required !== undefined && typeof input.required !== 'boolean') {
      errors.push(`${prefix}: required must be a boolean`);
    }

    // Validate skipNodeOnNull (optional)
    if (input.skipNodeOnNull !== undefined && typeof input.skipNodeOnNull !== 'boolean') {
      errors.push(`${prefix}: skipNodeOnNull must be a boolean`);
    }

    // Warn if skipNodeOnNull is explicitly set but doesn't match recommended default
    if (input.skipNodeOnNull !== undefined && input.required !== undefined) {
      const recommendedDefault = input.required;
      if (input.skipNodeOnNull !== recommendedDefault) {
        // This is intentional, no warning needed - user may have good reason
      }
    }

    return errors;
  }

  /**
   * Validate an output definition
   * @param {Object} output - Output object
   * @param {number} index - Output index for error messages
   * @returns {string[]} Array of error messages
   */
  static validateOutput(output, index) {
    const errors = [];
    const prefix = `Output[${index}]`;

    if (!output || typeof output !== 'object') {
      errors.push(`${prefix}: must be an object`);
      return errors;
    }

    // Validate type
    const validTypes = ['main', 'trigger', 'number', 'string', 'boolean', 'object', 'array'];
    if (!output.type) {
      errors.push(`${prefix}: type is required`);
    } else if (!validTypes.includes(output.type)) {
      errors.push(`${prefix}: type "${output.type}" is not valid. Valid types: ${validTypes.join(', ')}`);
    }

    // Validate displayName
    if (!output.displayName || typeof output.displayName !== 'string') {
      errors.push(`${prefix}: displayName is required and must be a string`);
    }

    return errors;
  }

  /**
   * Validate a property definition
   * @param {Object} prop - Property object
   * @param {number} index - Property index for error messages
   * @returns {string[]} Array of error messages
   */
  static validateProperty(prop, index) {
    const errors = [];
    const prefix = `Property[${index}]`;

    if (!prop || typeof prop !== 'object') {
      errors.push(`${prefix}: must be an object`);
      return errors;
    }

    // Validate name
    if (!prop.name || typeof prop.name !== 'string') {
      errors.push(`${prefix}: name is required and must be a string`);
    } else if (!/^[a-zA-Z0-9_]+$/.test(prop.name)) {
      errors.push(`${prefix}: name must be alphanumeric with underscores only`);
    }

    // Validate displayName
    if (!prop.displayName || typeof prop.displayName !== 'string') {
      errors.push(`${prefix}: displayName is required and must be a string`);
    }

    // Validate type
    const validTypes = ['string', 'number', 'boolean', 'options', 'tag', 'code', 'collection'];
    if (!prop.type) {
      errors.push(`${prefix}: type is required`);
    } else if (!validTypes.includes(prop.type)) {
      errors.push(`${prefix}: type "${prop.type}" is not valid. Valid types: ${validTypes.join(', ')}`);
    }

    // Validate type-specific fields
    if (prop.type === 'options') {
      if (!Array.isArray(prop.options) || prop.options.length === 0) {
        errors.push(`${prefix}: type "options" requires non-empty options array`);
      } else {
        prop.options.forEach((option, optIndex) => {
          if (!option.name || !option.value) {
            errors.push(`${prefix}.options[${optIndex}]: must have name and value`);
          }
        });
      }
    }

    if (prop.type === 'collection') {
      if (!Array.isArray(prop.options) || prop.options.length === 0) {
        errors.push(`${prefix}: type "collection" requires non-empty options array`);
      }
    }

    // Validate required (optional)
    if (prop.required !== undefined && typeof prop.required !== 'boolean') {
      errors.push(`${prefix}: required must be a boolean`);
    }

    // Validate displayOptions (optional)
    if (prop.displayOptions !== undefined) {
      if (typeof prop.displayOptions !== 'object') {
        errors.push(`${prefix}: displayOptions must be an object`);
      } else {
        const { show, hide } = prop.displayOptions;
        if (show !== undefined && typeof show !== 'object') {
          errors.push(`${prefix}: displayOptions.show must be an object`);
        }
        if (hide !== undefined && typeof hide !== 'object') {
          errors.push(`${prefix}: displayOptions.hide must be an object`);
        }
      }
    }

    return errors;
  }

  /**
   * Apply defaults to a description
   * Fills in missing optional fields with sensible defaults
   * @param {Object} description - Node description
   * @returns {Object} Description with defaults applied
   */
  static applyDefaults(description) {
    const result = { ...description };

    // Apply top-level defaults
    if (!result.category) result.category = 'OTHER';
    if (!result.icon) result.icon = '📦';
    if (!result.color) result.color = '#666666';
    if (!result.schemaVersion) result.schemaVersion = 1;
    if (!result.inputs) result.inputs = [];
    if (!result.outputs) result.outputs = [];
    if (!result.properties) result.properties = [];
    if (!result.extensions) result.extensions = {};

    // Apply input defaults
    result.inputs = result.inputs.map(input => {
      const inputWithDefaults = { ...input };
      
      // Default required based on input type
      if (inputWithDefaults.required === undefined) {
        inputWithDefaults.required = inputWithDefaults.type !== 'trigger';
      }
      
      // Default skipNodeOnNull based on required flag
      if (inputWithDefaults.skipNodeOnNull === undefined) {
        inputWithDefaults.skipNodeOnNull = inputWithDefaults.required;
      }
      
      return inputWithDefaults;
    });

    // Apply property defaults
    result.properties = result.properties.map(prop => {
      const propWithDefaults = { ...prop };
      
      if (propWithDefaults.required === undefined) {
        propWithDefaults.required = false;
      }
      
      return propWithDefaults;
    });

    return result;
  }

  /**
   * Validate and apply defaults in one step
   * @param {string} nodeType - Node type identifier
   * @param {Object} description - Node description
   * @returns {Object} { valid, errors, warnings, description }
   */
  static validateAndApplyDefaults(nodeType, description) {
    const validation = this.validate(nodeType, description);
    
    if (!validation.valid) {
      return {
        ...validation,
        description: null
      };
    }

    const descriptionWithDefaults = this.applyDefaults(description);

    return {
      ...validation,
      description: descriptionWithDefaults
    };
  }
}
