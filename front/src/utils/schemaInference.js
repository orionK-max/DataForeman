/**
 * Schema Inference Utility
 * Infers expected output structure for nodes based on type and inputs
 */

/**
 * Infer output schema for a node based on its type and input data
 * @param {Object} node - The node to infer schema for
 * @param {Object} inputData - Data from connected input nodes
 * @param {Object} flowDefinition - The flow definition (nodes and edges)
 * @returns {Object} Expected output schema
 */
export function inferOutputSchema(node, inputData = {}, flowDefinition = {}) {
  if (!node) return null;

  switch (node.type) {
    case 'trigger-manual':
      return {
        type: 'object',
        description: 'Manual trigger returns true when executed',
        properties: {
          value: { type: 'boolean', example: true },
          quality: { type: 'number', example: 192, description: 'OPC UA quality code (192 = Good)' }
        }
      };

    case 'tag-input':
      return {
        type: 'object',
        description: `Read value from tag: ${node.config?.tagName || 'Not configured'}`,
        properties: {
          value: { 
            type: 'number', 
            example: 0,
            description: 'Tag value from data source'
          },
          quality: { 
            type: 'number', 
            example: 192,
            description: 'OPC UA quality code (192 = Good, 0 = Bad)'
          },
          timestamp: {
            type: 'string',
            example: new Date().toISOString(),
            description: 'Timestamp when value was read'
          }
        }
      };

    case 'tag-output':
      return {
        type: 'object',
        description: `Write value to tag: ${node.config?.tagName || 'Not configured'}`,
        properties: {
          value: { 
            type: 'number', 
            example: inputData?.value ?? 0,
            description: 'Value written to tag'
          },
          quality: { 
            type: 'number', 
            example: 192,
            description: 'Write operation quality'
          },
          success: {
            type: 'boolean',
            example: true,
            description: 'Whether write was successful'
          }
        }
      };

    case 'math-add':
    case 'math-subtract':
    case 'math-multiply':
    case 'math-divide':
      return {
        type: 'object',
        description: `Mathematical operation: ${node.type.replace('math-', '')}`,
        properties: {
          value: { 
            type: 'number', 
            example: 0,
            description: 'Result of calculation'
          },
          quality: { 
            type: 'number', 
            example: inputData?.quality ?? 192,
            description: 'Inherited from input quality'
          }
        }
      };

    case 'compare-gt':
    case 'compare-lt':
    case 'compare-eq':
    case 'compare-neq':
      return {
        type: 'object',
        description: `Comparison: ${node.type.replace('compare-', '')}`,
        properties: {
          value: { 
            type: 'boolean', 
            example: false,
            description: 'Comparison result (true/false)'
          },
          quality: { 
            type: 'number', 
            example: inputData?.quality ?? 192,
            description: 'Inherited from input quality'
          }
        }
      };

    case 'script':
      return {
        type: 'object',
        description: 'JavaScript execution result',
        properties: {
          value: { 
            type: 'any', 
            example: null,
            description: 'Return value from script (can be any type)'
          },
          quality: { 
            type: 'number', 
            example: 192,
            description: 'Quality code'
          }
        }
      };

    default:
      return {
        type: 'object',
        description: 'Generic node output',
        properties: {
          value: { type: 'any', example: null },
          quality: { type: 'number', example: 192 }
        }
      };
  }
}

/**
 * Get input data from connected nodes
 * @param {string} nodeId - ID of the node to get inputs for
 * @param {Object} flowDefinition - The flow definition
 * @param {Object} executionData - Execution data from previous nodes
 * @returns {Object} Combined input data
 */
export function getInputDataForNode(nodeId, flowDefinition, executionData = {}) {
  const { edges = [] } = flowDefinition;
  
  // Find all edges that connect to this node
  const inputEdges = edges.filter(edge => edge.target === nodeId);
  
  if (inputEdges.length === 0) {
    return {};
  }
  
  // For single input, return that node's data
  if (inputEdges.length === 1) {
    const sourceId = inputEdges[0].source;
    return executionData[sourceId] || {};
  }
  
  // For multiple inputs, combine them
  const combinedInput = {};
  inputEdges.forEach(edge => {
    const sourceId = edge.source;
    const sourceData = executionData[sourceId];
    if (sourceData) {
      Object.assign(combinedInput, sourceData);
    }
  });
  
  return combinedInput;
}

/**
 * Format schema as human-readable JSON structure
 * @param {Object} schema - The schema object
 * @returns {string} Formatted schema string
 */
export function formatSchema(schema) {
  if (!schema) return 'No schema available';
  
  const formatProperty = (prop, indent = 2) => {
    const spaces = ' '.repeat(indent);
    if (prop.type === 'object' && prop.properties) {
      const props = Object.entries(prop.properties)
        .map(([key, value]) => `${spaces}${key}: ${formatProperty(value, indent + 2)}`)
        .join(',\n');
      return `{\n${props}\n${' '.repeat(indent - 2)}}`;
    }
    
    let result = prop.type;
    if (prop.example !== undefined) {
      result += ` (example: ${JSON.stringify(prop.example)})`;
    }
    return result;
  };
  
  if (schema.type === 'object' && schema.properties) {
    const props = Object.entries(schema.properties)
      .map(([key, value]) => `  ${key}: ${formatProperty(value, 4)}`)
      .join(',\n');
    return `{\n${props}\n}`;
  }
  
  return JSON.stringify(schema, null, 2);
}
