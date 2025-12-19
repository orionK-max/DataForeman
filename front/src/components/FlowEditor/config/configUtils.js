/**
 * Utility functions for config UI rendering
 */

/**
 * Check if a section should be shown based on showWhen conditions
 * @param {Object} section - Section configuration with optional showWhen property
 * @param {Object} nodeData - Current node data
 * @returns {boolean} - True if section should be shown
 */
export function shouldShowSection(section, nodeData) {
  if (!section.showWhen) return true;
  
  for (const [property, expectedValues] of Object.entries(section.showWhen)) {
    const actualValue = nodeData[property];
    
    // Check if actual value is in the expected values array
    if (!expectedValues.includes(actualValue)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get nested property value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Property path (e.g., 'parent.child.value')
 * @returns {*} - Value at path or undefined
 */
export function getNestedValue(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Set nested property value in object using dot notation
 * @param {Object} obj - Object to set value in
 * @param {string} path - Property path (e.g., 'parent.child.value')
 * @param {*} value - Value to set
 * @returns {Object} - New object with value set
 */
export function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  // Clone the object
  const result = { ...obj };
  
  // Navigate to parent of target property
  let current = result;
  for (const key of keys) {
    current[key] = { ...current[key] };
    current = current[key];
  }
  
  // Set the value
  current[lastKey] = value;
  
  return result;
}
