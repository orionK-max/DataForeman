/**
 * I/O Rules Utilities
 * 
 * Utilities for parsing and applying parameter-driven dynamic I/O rules.
 * Supports homogeneous, heterogeneous, and hybrid input/output configurations.
 */

/**
 * Match a rule's condition against node data
 * @param {Object} nodeData - Node data (parameters)
 * @param {Object} when - Rule condition (parameter name -> value or array)
 * @returns {boolean} True if rule matches
 */
export function matchesCondition(nodeData, when) {
  if (!when) return true; // No condition = default rule (always matches)
  
  for (const [param, expected] of Object.entries(when)) {
    const actual = nodeData[param];
    
    if (Array.isArray(expected)) {
      // Array means any of these values match (OR condition)
      if (!expected.includes(actual)) {
        return false;
      }
    } else {
      // Single value - must match exactly
      if (actual !== expected) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Find matching ioRule for current node state
 * @param {Object} metadata - Node type metadata
 * @param {Object} nodeData - Node data (parameters)
 * @returns {Object|null} Matching rule or null
 */
export function findMatchingRule(metadata, nodeData) {
  if (!metadata?.ioRules || !Array.isArray(metadata.ioRules)) {
    return null;
  }
  
  // Find first matching rule
  for (const rule of metadata.ioRules) {
    if (matchesCondition(nodeData, rule.when)) {
      return rule;
    }
  }
  
  return null;
}

/**
 * Get input configuration from ioRule or fallback to inputConfiguration
 * @param {Object} metadata - Node type metadata
 * @param {Object} nodeData - Node data
 * @returns {Object} Input configuration
 */
export function getInputConfig(metadata, nodeData) {
  // Try ioRules first
  const rule = findMatchingRule(metadata, nodeData);
  
  if (rule?.inputs) {
    return parseInputConfig(rule.inputs, nodeData);
  }
  
  // Fallback to legacy inputConfiguration
  if (metadata.inputConfiguration) {
    return {
      min: metadata.inputConfiguration.minInputs || 1,
      max: metadata.inputConfiguration.maxInputs || 10,
      default: metadata.inputConfiguration.defaultInputs || 2,
      canAdd: metadata.inputConfiguration.canAddInputs ?? true,
      canRemove: metadata.inputConfiguration.canRemoveInputs ?? true,
      type: metadata.inputs?.[0]?.type || 'main',
      typeFixed: metadata.inputs?.[0]?.typeFixed ?? false
    };
  }
  
  // Ultimate fallback
  return {
    min: 1,
    max: 1,
    default: 1,
    canAdd: false,
    canRemove: false,
    type: 'main',
    typeFixed: false
  };
}

/**
 * Parse input configuration from ioRule
 * @param {Object} inputsConfig - Rule's inputs configuration
 * @param {Object} nodeData - Node data
 * @returns {Object} Normalized input config
 */
export function parseInputConfig(inputsConfig, nodeData) {
  // Handle fixed count (shorthand)
  if (inputsConfig.count !== undefined) {
    return {
      min: inputsConfig.count,
      max: inputsConfig.count,
      default: inputsConfig.count,
      canAdd: false,
      canRemove: false,
      type: inputsConfig.type || 'main',
      types: inputsConfig.types, // Pass through types array for dynamic typing
      typeFixed: inputsConfig.typeFixed ?? false,
      required: inputsConfig.required ?? true,
      definitions: inputsConfig.definitions,
      dynamic: inputsConfig.dynamic
    };
  }
  
  // Handle min/max range
  return {
    min: inputsConfig.min ?? 1,
    max: inputsConfig.max ?? 10,
    default: inputsConfig.default ?? (inputsConfig.min || 1),
    canAdd: inputsConfig.canAdd ?? (inputsConfig.max > inputsConfig.min),
    canRemove: inputsConfig.canRemove ?? (inputsConfig.max > inputsConfig.min),
    type: inputsConfig.type || 'main',
    types: inputsConfig.types, // Pass through types array for dynamic typing
    typeFixed: inputsConfig.typeFixed ?? false,
    required: inputsConfig.required ?? true,
    definitions: inputsConfig.definitions,
    dynamic: inputsConfig.dynamic
  };
}

/**
 * Get output configuration from ioRule or fallback
 * @param {Object} metadata - Node type metadata
 * @param {Object} nodeData - Node data
 * @returns {Object} Output configuration
 */
export function getOutputConfig(metadata, nodeData) {
  // Try ioRules first
  const rule = findMatchingRule(metadata, nodeData);
  if (rule?.outputs) {
    return parseOutputConfig(rule.outputs);
  }
  
  // Fallback to static outputs
  return {
    count: metadata.outputs?.length || 1,
    canAdd: false,
    canRemove: false,
    type: metadata.outputs?.[0]?.type || 'main'
  };
}

/**
 * Parse output configuration from ioRule
 * @param {Object} outputsConfig - Rule's outputs configuration
 * @returns {Object} Normalized output config
 */
function parseOutputConfig(outputsConfig) {
  if (outputsConfig.count !== undefined) {
    return {
      count: outputsConfig.count,
      min: outputsConfig.count,
      max: outputsConfig.count,
      canAdd: false,
      canRemove: false,
      type: outputsConfig.type || 'main',
      types: outputsConfig.types
    };
  }
  
  return {
    min: outputsConfig.min ?? 1,
    max: outputsConfig.max ?? 1,
    count: outputsConfig.default ?? outputsConfig.min ?? 1,
    canAdd: outputsConfig.canAdd ?? false,
    canRemove: outputsConfig.canRemove ?? false,
    type: outputsConfig.type || 'main',
    types: outputsConfig.types
  };
}

/**
 * Generate input definitions from ioRule
 * @param {Object} metadata - Node type metadata
 * @param {Object} nodeData - Node data
 * @returns {Array} Array of input definitions
 */
export function generateInputs(metadata, nodeData) {
  const config = getInputConfig(metadata, nodeData);
  const inputs = [];
  
  // Mode 1: Explicit definitions (heterogeneous)
  if (config.definitions) {
    inputs.push(...config.definitions.map((def, idx) => ({
      ...def,
      index: idx,
      isExplicit: true
    })));
  }
  
  // Mode 2: Homogeneous (or no definitions)
  if (!config.definitions || config.dynamic) {
    const count = nodeData.inputCount ?? config.default;
    const startIndex = config.definitions ? config.definitions.length : 0;
    
    for (let i = 0; i < count; i++) {
      let type = config.type;
      
      // Use specific type if types array provided (like outputs do)
      if (config.types && config.types[i]) {
        type = config.types[i];
      }
      
      inputs.push({
        type,
        displayName: `Input ${startIndex + i + 1}`,
        typeFixed: config.typeFixed,
        required: config.required,
        index: startIndex + i,
        isDynamic: true
      });
    }
  }
  
  // Mode 3: Hybrid dynamic section
  if (config.dynamic) {
    const dynamicCount = nodeData.dynamicInputCount ?? config.dynamic.default ?? 0;
    const startIndex = config.definitions ? config.definitions.length : 0;
    const template = config.dynamic.template?.displayName || 'Input {n}';
    
    for (let i = 0; i < dynamicCount; i++) {
      inputs.push({
        type: config.dynamic.type,
        displayName: template.replace('{n}', i + 1),
        typeFixed: config.dynamic.typeFixed,
        required: config.dynamic.required ?? false,
        index: startIndex + i,
        isDynamic: true,
        isHybridDynamic: true
      });
    }
  }
  
  return inputs;
}

/**
 * Generate output definitions from ioRule
 * @param {Object} metadata - Node type metadata
 * @param {Object} nodeData - Node data
 * @returns {Array} Array of output definitions
 */
export function generateOutputs(metadata, nodeData) {
  const config = getOutputConfig(metadata, nodeData);
  const outputs = [];
  
  const count = nodeData.outputCount ?? config.count;
  
  for (let i = 0; i < count; i++) {
    let type = config.type;
    
    // Use specific type if types array provided
    if (config.types && config.types[i]) {
      type = config.types[i];
    }
    
    outputs.push({
      type,
      displayName: metadata.outputs?.[i]?.displayName || `Output ${i + 1}`,
      description: metadata.outputs?.[i]?.description,
      index: i
    });
  }
  
  return outputs;
}

/**
 * Check if input count needs adjustment based on ioRule
 * @param {Object} metadata - Node type metadata
 * @param {Object} nodeData - Node data
 * @returns {Object|null} { inputCount: number } if adjustment needed, null otherwise
 */
export function getRequiredInputAdjustment(metadata, nodeData) {
  const config = getInputConfig(metadata, nodeData);
  const currentCount = nodeData.inputCount ?? config.default;
  
  // Check if current count is outside allowed range
  if (currentCount < config.min) {
    return { inputCount: config.min };
  }
  if (currentCount > config.max) {
    return { inputCount: config.max };
  }
  
  return null;
}
