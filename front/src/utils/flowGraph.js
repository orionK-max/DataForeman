/**
 * Flow Graph Utilities
 * Helper functions for analyzing flow structure and dependencies
 */

/**
 * Find all upstream nodes that the target node depends on
 * @param {string} nodeId - The target node ID
 * @param {Array} edges - Array of edges in the flow
 * @returns {Array} Array of upstream node IDs (including transitive dependencies)
 */
export function findUpstreamDependencies(nodeId, edges) {
  const upstream = new Set();
  const visited = new Set();
  
  function traverse(currentId) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    
    // Find all edges that target this node
    const inputEdges = edges.filter(e => e.target === currentId);
    
    inputEdges.forEach(edge => {
      upstream.add(edge.source);
      traverse(edge.source); // Recursively find dependencies
    });
  }
  
  traverse(nodeId);
  return Array.from(upstream);
}

/**
 * Find all downstream nodes that depend on the source node
 * @param {string} nodeId - The source node ID
 * @param {Array} edges - Array of edges in the flow
 * @returns {Array} Array of downstream node IDs (including transitive dependents)
 */
export function findDownstreamDependents(nodeId, edges) {
  const downstream = new Set();
  const visited = new Set();
  
  function traverse(currentId) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    
    // Find all edges that originate from this node
    const outputEdges = edges.filter(e => e.source === currentId);
    
    outputEdges.forEach(edge => {
      downstream.add(edge.target);
      traverse(edge.target); // Recursively find dependents
    });
  }
  
  traverse(nodeId);
  return Array.from(downstream);
}

/**
 * Build execution order for a subgraph using topological sort
 * @param {Array} nodeIds - IDs of nodes to include
 * @param {Array} nodes - All nodes in the flow
 * @param {Array} edges - All edges in the flow
 * @returns {Array} Sorted array of node IDs in execution order
 */
export function getExecutionOrder(nodeIds, nodes, edges) {
  const nodeSet = new Set(nodeIds);
  const relevantEdges = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));
  
  // Calculate in-degree for each node
  const inDegree = new Map();
  nodeIds.forEach(id => inDegree.set(id, 0));
  
  relevantEdges.forEach(edge => {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });
  
  // Queue for nodes with no dependencies
  const queue = nodeIds.filter(id => inDegree.get(id) === 0);
  const sorted = [];
  
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    
    // Find all edges from current node
    const outgoing = relevantEdges.filter(e => e.source === current);
    
    outgoing.forEach(edge => {
      const newDegree = inDegree.get(edge.target) - 1;
      inDegree.set(edge.target, newDegree);
      
      if (newDegree === 0) {
        queue.push(edge.target);
      }
    });
  }
  
  return sorted;
}

/**
 * Check if a node is a trigger node
 * @param {Object} node - The node to check
 * @returns {boolean} True if node is a trigger
 */
export function isTriggerNode(node) {
  return node?.type?.startsWith('trigger-');
}

/**
 * Find the starting node for partial execution
 * If the selected node has upstream dependencies, return the first trigger or root node
 * @param {string} nodeId - The selected node ID
 * @param {Array} nodes - All nodes in the flow
 * @param {Array} edges - All edges in the flow
 * @returns {string} ID of the node to start execution from
 */
export function findStartNodeForPartialExecution(nodeId, nodes, edges) {
  const upstream = findUpstreamDependencies(nodeId, edges);
  
  if (upstream.length === 0) {
    // Node has no dependencies, start from it
    return nodeId;
  }
  
  // Find all trigger nodes in upstream
  const upstreamTriggers = upstream.filter(id => {
    const node = nodes.find(n => n.id === id);
    return isTriggerNode(node);
  });
  
  if (upstreamTriggers.length > 0) {
    // Start from first trigger in execution order
    return upstreamTriggers[0];
  }
  
  // Find root nodes (nodes with no inputs)
  const rootNodes = upstream.filter(id => {
    const inputEdges = edges.filter(e => e.target === id);
    return inputEdges.length === 0;
  });
  
  return rootNodes[0] || nodeId;
}
