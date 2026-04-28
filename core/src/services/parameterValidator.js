/**
 * Parameter Validator Service
 * Validates runtime parameters against flow parameter schema
 */

/**
 * Validate runtime parameters against flow schema
 * @param {Array} parameterSchema - Flow's exposed_parameters array
 * @param {Object} runtimeParameters - User-provided parameter values
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
export function validateParameters(parameterSchema, runtimeParameters) {
  const errors = [];
  const warnings = [];

  if (!parameterSchema || !Array.isArray(parameterSchema)) {
    return { valid: true, errors: [], warnings: [] }; // No parameters to validate
  }

  // Check for required parameters
  for (const param of parameterSchema) {
    const value = runtimeParameters[param.name];

    if (param.required && (value === null || value === undefined || value === '')) {
      errors.push({
        parameter: param.name,
        message: `Required parameter '${param.alias || param.displayName || param.name}' is missing`
      });
      continue;
    }

    // Skip validation if parameter is optional and not provided
    if (value === null || value === undefined) {
      continue;
    }

    // Type-specific validation
    const typeError = validateParameterType(param, value);
    if (typeError) {
      errors.push({
        parameter: param.name,
        message: typeError
      });
    }
  }

  // Check for unexpected parameters
  for (const key of Object.keys(runtimeParameters)) {
    const isDefined = parameterSchema.some(p => p.name === key);
    if (!isDefined) {
      warnings.push({
        parameter: key,
        message: `Parameter '${key}' is not defined in flow schema`
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate parameter type
 * @param {Object} param - Parameter schema definition
 * @param {any} value - Runtime value
 * @returns {string|null} Error message or null if valid
 */
function validateParameterType(param, value) {
  const { type, displayName, alias, name, min, max, pattern, options } = param;
  const label = alias || displayName || name;

  switch (type) {
    case 'string':
    case 'file':
    case 'directory':
      if (typeof value !== 'string') {
        return `Parameter '${label}' must be a string`;
      }
      if (pattern) {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          return `Parameter '${label}' does not match required pattern`;
        }
      }
      if (min !== undefined && value.length < min) {
        return `Parameter '${label}' must be at least ${min} characters`;
      }
      if (max !== undefined && value.length > max) {
        return `Parameter '${label}' must be at most ${max} characters`;
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return `Parameter '${label}' must be a valid number`;
      }
      if (min !== undefined && value < min) {
        return `Parameter '${label}' must be at least ${min}`;
      }
      if (max !== undefined && value > max) {
        return `Parameter '${label}' must be at most ${max}`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `Parameter '${label}' must be a boolean`;
      }
      break;

    case 'date':
    case 'datetime':
      // Accept ISO 8601 string or Date object
      const date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) {
        return `Parameter '${label}' must be a valid date`;
      }
      break;

    case 'options':
      if (!options || !Array.isArray(options)) {
        return `Parameter '${label}' has invalid options definition`;
      }
      // Support both string array and object array formats
      const validValues = options.map(opt => 
        typeof opt === 'string' ? opt : opt.value
      );
      if (!validValues.includes(value)) {
        return `Parameter '${label}' must be one of: ${validValues.join(', ')}`;
      }
      break;

    case 'json':
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
        } catch (e) {
          return `Parameter '${label}' must be valid JSON`;
        }
      } else if (typeof value !== 'object') {
        return `Parameter '${label}' must be a JSON object or string`;
      }
      break;

    default:
      return `Parameter '${label}' has unknown type '${type}'`;
  }

  return null; // Valid
}

/**
 * Sanitize file/directory paths for security
 * @param {string} path - File or directory path
 * @param {Array} allowedBasePaths - Array of allowed base directory paths
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export function sanitizePath(path, allowedBasePaths = []) {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Invalid path' };
  }

  // Remove any path traversal attempts
  const normalized = path.replace(/\.\./g, '').replace(/\/+/g, '/');

  // Check against allowed base paths if provided
  if (allowedBasePaths.length > 0) {
    const isAllowed = allowedBasePaths.some(basePath => 
      normalized.startsWith(basePath)
    );
    
    if (!isAllowed) {
      return {
        valid: false,
        error: `Path must be within allowed directories: ${allowedBasePaths.join(', ')}`
      };
    }
  }

  return {
    valid: true,
    sanitized: normalized
  };
}

/**
 * Apply runtime parameters to flow definition
 * Creates a copy of the flow definition with parameter values injected
 * @param {Object} flowDefinition - Original flow definition
 * @param {Array} parameterSchema - Flow's exposed_parameters
 * @param {Object} runtimeParameters - User-provided values
 * @returns {Object} Modified flow definition
 */
export function applyParameters(flowDefinition, parameterSchema, runtimeParameters) {
  if (!parameterSchema || parameterSchema.length === 0) {
    return flowDefinition; // No parameters to apply
  }

  // Deep clone the definition to avoid mutation
  const modifiedDefinition = JSON.parse(JSON.stringify(flowDefinition));

  // Apply each parameter to its target node
  for (const param of parameterSchema) {
    const value = runtimeParameters[param.name];
    
    // Skip if parameter not provided (use default from node)
    if (value === undefined || value === null) {
      continue;
    }

    // Find the target node
    const node = modifiedDefinition.nodes?.find(n => n.id === param.nodeId);
    if (!node) {
      console.warn(`Parameter '${param.name}' references non-existent node '${param.nodeId}'`);
      continue;
    }

    // Inject the parameter value
    if (!node.data) {
      node.data = {};
    }
    node.data[param.nodeParameter] = value;
  }

  return modifiedDefinition;
}
