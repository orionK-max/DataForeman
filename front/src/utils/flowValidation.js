/**
 * Flow Validation Utilities
 * Validates flow definitions before deploy/save to prevent errors
 */

/**
 * Check if flow has at least one trigger node
 */
const hasTriggerNode = (nodes) => {
  return nodes.some(node => node.type === 'trigger-manual');
};

/**
 * Check if flow has cycles (circular dependencies)
 * Uses depth-first search to detect back edges
 */
const hasCycles = (nodes, edges) => {
  const adjacency = {};
  const visited = new Set();
  const recursionStack = new Set();

  // Build adjacency list
  nodes.forEach(node => {
    adjacency[node.id] = [];
  });

  edges.forEach(edge => {
    if (adjacency[edge.source]) {
      adjacency[edge.source].push(edge.target);
    }
  });

  // DFS to detect cycles
  const detectCycle = (nodeId) => {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacency[nodeId] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (detectCycle(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true; // Back edge found - cycle detected
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  // Check all nodes
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (detectCycle(node.id)) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Validate node configuration based on type
 */
const validateNodeConfig = (node) => {
  const errors = [];

  switch (node.type) {
    case 'tag-input':
      if (!node.data?.tagId) {
        errors.push({ nodeId: node.id, message: 'Tag Input node requires a tag to be selected' });
      }
      break;

    case 'tag-output':
      if (!node.data?.tagId) {
        errors.push({ nodeId: node.id, message: 'Tag Output node requires a tag to be selected' });
      }
      break;

    case 'script-js':
      // Allow empty code - default template will be used
      // Code validation happens at execution time, not deployment
      break;

    case 'math-add':
    case 'math-subtract':
    case 'math-multiply':
    case 'math-divide':
      // Math nodes need input connections - checked separately
      break;

    case 'compare-gt':
    case 'compare-lt':
    case 'compare-eq':
    case 'compare-neq':
      // Compare nodes need input connections - checked separately
      break;

    case 'trigger-manual':
      // Triggers need no config validation
      break;

    default:
      errors.push({ nodeId: node.id, message: `Unknown node type: ${node.type}` });
  }

  return errors;
};

/**
 * Check if nodes have required input connections
 */
const validateConnections = (nodes, edges) => {
  const errors = [];
  const nodeInputCounts = {};

  // Count inputs per node
  edges.forEach(edge => {
    nodeInputCounts[edge.target] = (nodeInputCounts[edge.target] || 0) + 1;
  });

  nodes.forEach(node => {
    const inputCount = nodeInputCounts[node.id] || 0;

    // Triggers should have no inputs
    if (node.type === 'trigger-manual' && inputCount > 0) {
      errors.push({ nodeId: node.id, message: 'Trigger nodes cannot have input connections' });
    }

    // Source nodes don't need inputs (triggers, tag-input)
    const sourceNodes = ['trigger-manual', 'tag-input'];
    
    // Most nodes need at least one input (except source nodes)
    if (!sourceNodes.includes(node.type) && inputCount === 0) {
      errors.push({ nodeId: node.id, message: 'Node requires at least one input connection' });
    }

    // Math and compare nodes typically need exactly 2 inputs
    if (node.type.startsWith('math-') || node.type.startsWith('compare-')) {
      if (inputCount < 2) {
        errors.push({ nodeId: node.id, message: 'Math/Compare nodes require at least 2 input connections' });
      }
    }
  });

  return errors;
};

/**
 * Main validation function - returns validation result
 * @param {Array} nodes - Flow nodes
 * @param {Array} edges - Flow edges
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
export const validateFlow = (nodes, edges) => {
  const errors = [];
  const warnings = [];

  // Check for empty flow
  if (!nodes || nodes.length === 0) {
    errors.push({ message: 'Flow must contain at least one node' });
    return { valid: false, errors, warnings };
  }

  // Check for trigger node
  if (!hasTriggerNode(nodes)) {
    errors.push({ message: 'Flow must have at least one trigger node' });
  }

  // Check for cycles
  if (hasCycles(nodes, edges)) {
    errors.push({ message: 'Flow contains circular dependencies (cycles are not allowed)' });
  }

  // Validate each node's configuration
  nodes.forEach(node => {
    const nodeErrors = validateNodeConfig(node);
    errors.push(...nodeErrors);
  });

  // Validate connections
  const connectionErrors = validateConnections(nodes, edges);
  errors.push(...connectionErrors);

  // Warnings for potential issues
  if (edges.length === 0 && nodes.length > 1) {
    warnings.push({ message: 'Flow has multiple nodes but no connections' });
  }

  // Check for disconnected nodes
  const connectedNodeIds = new Set();
  edges.forEach(edge => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });
  
  const disconnectedNodes = nodes.filter(node => 
    node.type !== 'trigger-manual' && !connectedNodeIds.has(node.id)
  );

  if (disconnectedNodes.length > 0) {
    warnings.push({ 
      message: `${disconnectedNodes.length} node(s) are not connected to the flow`,
      nodeIds: disconnectedNodes.map(n => n.id)
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Quick validation for save operation (less strict)
 */
export const validateForSave = (nodes, edges) => {
  if (!nodes || nodes.length === 0) {
    return { valid: false, errors: [{ message: 'Cannot save empty flow' }] };
  }
  return { valid: true, errors: [], warnings: [] };
};

/**
 * Strict validation for deploy operation
 */
export const validateForDeploy = (nodes, edges) => {
  const result = validateFlow(nodes, edges);
  
  // Additional deploy-specific checks
  if (!hasTriggerNode(nodes)) {
    result.errors.unshift({ message: 'Cannot deploy flow without a trigger node' });
    result.valid = false;
  }

  return result;
};
