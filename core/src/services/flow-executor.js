// Flow Execution Engine
// Executes deployed flows with node-by-node processing
// Handles tag I/O, quality propagation, and error handling

import { executeScript, getAllowedPaths } from './script-sandbox.js';
import { NodeRegistry } from '../nodes/base/NodeRegistry.js';
import { NodeExecutionContext } from '../nodes/base/NodeExecutionContext.js';

/**
 * Validate flow graph structure
 * @param {Object} definition - Flow definition with nodes and edges
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateFlowGraph(definition) {
  const errors = [];
  
  if (!definition || typeof definition !== 'object') {
    errors.push('Flow definition must be an object');
    return { valid: false, errors };
  }
  
  const { nodes = [], edges = [] } = definition;
  
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push('Flow must have at least one node');
    return { valid: false, errors };
  }
  
  // Check for trigger node
  const triggers = nodes.filter(n => n.type === 'trigger-manual');
  if (triggers.length === 0) {
    errors.push('Flow must have at least one manual trigger node');
  }
  
  // Validate node structure
  nodes.forEach((node, idx) => {
    if (!node.id) errors.push(`Node at index ${idx} missing id`);
    if (!node.type) errors.push(`Node at index ${idx} missing type`);
  });
  
  // Validate edges
  if (!Array.isArray(edges)) {
    errors.push('Edges must be an array');
  } else {
    const nodeIds = new Set(nodes.map(n => n.id));
    edges.forEach((edge, idx) => {
      if (!edge.source || !nodeIds.has(edge.source)) {
        errors.push(`Edge at index ${idx} has invalid source: ${edge.source}`);
      }
      if (!edge.target || !nodeIds.has(edge.target)) {
        errors.push(`Edge at index ${idx} has invalid target: ${edge.target}`);
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Find all trigger nodes in flow definition
 * @param {Object} definition - Flow definition
 * @returns {Array} Array of trigger node objects
 */
export function findTriggerNodes(definition) {
  const { nodes = [] } = definition;
  return nodes.filter(n => n.type === 'trigger-manual');
}

/**
 * Topological sort to determine execution order
 * @param {Array} nodes - Array of node objects
 * @param {Array} edges - Array of edge objects
 * @returns {Array} Ordered array of node IDs
 */
export function topologicalSort(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map();
  const adjList = new Map();
  
  // Initialize
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjList.set(n.id, []);
  });
  
  // Build adjacency list and in-degree count
  edges.forEach(edge => {
    const { source, target } = edge;
    if (adjList.has(source) && nodeMap.has(target)) {
      adjList.get(source).push(target);
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  });
  
  // Find nodes with no incoming edges (triggers)
  const queue = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });
  
  const sorted = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    sorted.push(nodeId);
    
    const neighbors = adjList.get(nodeId) || [];
    neighbors.forEach(neighborId => {
      const newDegree = inDegree.get(neighborId) - 1;
      inDegree.set(neighborId, newDegree);
      if (newDegree === 0) {
        queue.push(neighborId);
      }
    });
  }
  
  // Check for cycles
  if (sorted.length !== nodes.length) {
    throw new Error('Flow contains cycles or unreachable nodes');
  }
  
  return sorted;
}

/**
 * Execute a single node using class-based implementation from NodeRegistry
 * @param {Object} node - Node to execute
 * @param {Map} nodeOutputs - Map of node outputs
 * @param {Object} context - Execution context { app, flow, execution }
 * @returns {Object} { value, quality, error }
 */
export async function executeNode(node, nodeOutputs, context) {
  const { app } = context;
  const log = app.log.child({ nodeId: node.id, nodeType: node.type });
  
  // Check if node is registered
  if (!NodeRegistry.has(node.type)) {
    throw new Error(`Unknown node type: ${node.type}. Please ensure the node is registered in the NodeRegistry.`);
  }
  
  log.debug('Executing class-based node');
  
  try {
    const nodeInstance = NodeRegistry.getInstance(node.type);
    const execContext = new NodeExecutionContext(node, nodeOutputs, context);
    const result = await nodeInstance.execute(execContext);
    
    log.debug({ result }, 'Node executed successfully');
    return result;
  } catch (error) {
    log.error({ error }, 'Node execution failed');
    
    // Check onError setting
    const onError = node.data?.onError || 'stop';
    if (onError === 'stop') {
      throw error;
    }
    
    // Skip this node - return bad quality
    return { value: null, quality: 0, error: error.message };
  }
}

/**
 * Update flow tag dependencies in database
 * @param {Object} app - Fastify app instance
 * @param {String} flowId - Flow UUID
 * @param {Object} definition - Flow definition
 */
async function updateFlowTagDependencies(app, flowId, definition) {
  const { nodes = [] } = definition;
  
  // Delete existing dependencies
  await app.db.query('DELETE FROM flow_tag_dependencies WHERE flow_id = $1', [flowId]);
  
  // Add new dependencies
  for (const node of nodes) {
    const tagId = node.data?.tagId;
    if (!tagId) continue;
    
    let dependencyType;
    if (node.type === 'tag-input') {
      dependencyType = 'input';
    } else if (node.type === 'tag-output') {
      dependencyType = 'output';
    } else {
      continue;
    }
    
    await app.db.query(
      `INSERT INTO flow_tag_dependencies (flow_id, tag_id, node_id, dependency_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (flow_id, tag_id, node_id, dependency_type) DO NOTHING`,
      [flowId, tagId, node.id, dependencyType]
    );
  }
}

/**
 * Execute a flow
 * @param {Object} context - Job context { job, complete, fail, app }
 */
export async function executeFlow(context) {
  const { job, complete, fail, app } = context;
  const { flow_id: flowId } = job.params;
  
  const log = app.log.child({ job: 'flow_executor', jobId: job.id, flowId });
  
  try {
    log.info('Starting flow execution');
    
    // Get flow from database
    const flowResult = await app.db.query(
      'SELECT * FROM flows WHERE id = $1',
      [flowId]
    );
    
    if (flowResult.rows.length === 0) {
      throw new Error(`Flow ${flowId} not found`);
    }
    
    const flow = flowResult.rows[0];
    
    // Check if flow is deployed
    if (!flow.deployed) {
      throw new Error(`Flow ${flowId} is not deployed`);
    }
    
    // Validate flow graph
    const validation = validateFlowGraph(flow.definition);
    if (!validation.valid) {
      throw new Error(`Flow validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Create execution record
    const executionResult = await app.db.query(
      `INSERT INTO flow_executions 
       (flow_id, trigger_node_id, status, started_at)
       VALUES ($1, $2, 'running', now())
       RETURNING *`,
      [flowId, job.params.trigger_node_id || null]
    );
    
    const execution = executionResult.rows[0];
    execution.edges = flow.definition.edges; // Add edges for node execution
    
    log.info({ executionId: execution.id }, 'Execution record created');
    
    // Update tag dependencies
    await updateFlowTagDependencies(app, flowId, flow.definition);
    
    // Get execution order
    const { nodes = [], edges = [], pinData = {} } = flow.definition;
    
    // Handle partial execution if specified
    let nodesToExecute = nodes;
    if (job.params.partial && job.params.nodesToExecute) {
      const nodeIdSet = new Set(job.params.nodesToExecute);
      nodesToExecute = nodes.filter(n => nodeIdSet.has(n.id));
      log.info({ 
        partial: true, 
        totalNodes: nodes.length, 
        executing: nodesToExecute.length 
      }, 'Partial execution mode');
    }
    
    const executionOrder = topologicalSort(nodesToExecute, edges);
    
    // Execute nodes in order
    const nodeOutputs = new Map();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    for (const nodeId of executionOrder) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      
      // Check if node has pinned data and we're in partial execution mode
      if (job.params.partial && pinData[nodeId]) {
        log.info({ nodeId, nodeType: node.type }, 'Using pinned data in partial execution');
        nodeOutputs.set(nodeId, {
          value: pinData[nodeId].value || pinData[nodeId],
          quality: pinData[nodeId].quality || 192,
          logs: [],
          error: null,
          executionTime: 0,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          pinned: true
        });
        continue;
      }
      
      const startTime = Date.now();
      const output = await executeNode(node, nodeOutputs, { app, flow, execution });
      const endTime = Date.now();
      
      // Add timing information to output
      output.executionTime = endTime - startTime;
      output.startedAt = new Date(startTime).toISOString();
      output.completedAt = new Date(endTime).toISOString();
      
      nodeOutputs.set(nodeId, output);
      
      log.info({ nodeId, nodeType: node.type, output, executionTime: output.executionTime }, 'Node executed');
    }
    
    // Collect all node outputs (including logs and timing)
    const outputs = {};
    nodeOutputs.forEach((output, nodeId) => {
      outputs[nodeId] = {
        value: output.value,
        quality: output.quality,
        logs: output.logs || [],
        error: output.error || null,
        executionTime: output.executionTime,
        startedAt: output.startedAt,
        completedAt: output.completedAt
      };
    });
    
    // Update execution record
    await app.db.query(
      `UPDATE flow_executions
       SET status = 'completed',
           completed_at = now(),
           node_outputs = $1
       WHERE id = $2`,
      [outputs, execution.id]
    );
    
    log.info({ executionId: execution.id, outputs }, 'Flow execution completed');
    
    await complete(job.id, { success: true, executionId: execution.id, outputs });
    
  } catch (error) {
    log.error({ err: error }, 'Flow execution failed');
    
    // Update execution record if it exists
    if (job.params.executionId) {
      await app.db.query(
        `UPDATE flow_executions
         SET status = 'failed',
             completed_at = now(),
             error_log = $1
         WHERE id = $2`,
        [[{ message: error.message, timestamp: new Date().toISOString() }], job.params.executionId]
      ).catch(e => log.error({ err: e }, 'Failed to update execution record'));
    }
    
    await fail(job.id, error);
  }
}
