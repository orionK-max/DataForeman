/**
 * Flow Validation Utilities
 * Validates flow definitions before deploy/save to prevent errors
 */

import { getNodeMetadata } from '../constants/nodeTypes';

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

  // Check if node type is registered in backend metadata
  const nodeMetadata = getNodeMetadata(node.type);
  if (!nodeMetadata) {
    errors.push({ nodeId: node.id, message: `Unknown node type: ${node.type}` });
    return errors;
  }

  // Type-specific validation for built-in nodes
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

    case 'math':
      // Math node needs input connections - checked separately
      if (node.data?.operation === 'formula' && !node.data?.formula) {
        errors.push({ nodeId: node.id, message: 'Custom formula is required when operation is set to "formula"' });
      }
      break;

    case 'comparison':
      // Comparison node has default operation, no validation needed
      break;

    case 'gate':
      // Gate node has default configuration, no validation needed
      break;

    case 'constant':
      // Constant node has default values, no validation needed
      break;

    case 'comment':
      // Comment node is passive, no validation needed
      break;

    case 'trigger-manual':
      // Triggers need no config validation
      break;

    default:
      // For library nodes and other dynamic node types, no specific validation
      // They are considered valid if they exist in the metadata
      break;
  }

  return errors;
};

/**
 * Check if nodes have required input connections
 * Note: Unconnected nodes are allowed but won't execute
 */
const validateConnections = (nodes, edges) => {
  const errors = [];
  // No longer validate input connections - unconnected nodes will simply be skipped during execution
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
    !connectedNodeIds.has(node.id)
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
  return validateFlow(nodes, edges);
};
