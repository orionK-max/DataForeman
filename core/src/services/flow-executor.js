// Flow Execution Engine
// Executes deployed flows with node-by-node processing
// Handles tag I/O, quality propagation, and error handling

import { executeScript, getAllowedPaths } from './script-sandbox.js';

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
 * Execute a single node
 * @param {Object} node - Node to execute
 * @param {Map} nodeOutputs - Map of node outputs
 * @param {Object} context - Execution context { app, flow, execution }
 * @returns {Object} { value, quality, error }
 */
export async function executeNode(node, nodeOutputs, context) {
  const { app, flow, execution } = context;
  const log = app.log.child({ flowId: flow.id, executionId: execution.id, nodeId: node.id });
  
  try {
    switch (node.type) {
      case 'trigger-manual':
        // Trigger nodes just pass through
        return { value: true, quality: 192 };
      
      case 'tag-input': {
        // TODO: Replace DB query with memory cache read for better performance
        // Current implementation queries tag_values table directly, which works but adds latency (4-6ms)
        // Future: Implement in-memory tag cache (e.g., Redis or app-level Map) that's updated by ingestor
        // This would reduce tag read time to <1ms and avoid DB load during flow execution
        
        const tagId = node.data?.tagId;
        if (!tagId) {
          throw new Error('Tag input node missing tagId');
        }
        
        // Get tag metadata
        const metaResult = await app.db.query(
          'SELECT tag_path, data_type, connection_id FROM tag_metadata WHERE tag_id = $1',
          [tagId]
        );
        
        if (metaResult.rows.length === 0) {
          throw new Error(`Tag ${tagId} not found`);
        }
        
        const { tag_path: tagPath, connection_id: connectionId } = metaResult.rows[0];
        
        // TEMPORARY: Query latest value from tag_values table
        // This should be replaced with memory cache lookup for production use
        const tsdb = app.tsdb || app.db;
        const valueResult = await tsdb.query(
          `SELECT ts, quality, v_num, v_text, v_json
           FROM tag_values
           WHERE connection_id = $1 AND tag_id = $2
           ORDER BY ts DESC
           LIMIT 1`,
          [connectionId, tagId]
        );
        
        if (valueResult.rows.length === 0) {
          // No data yet - return null with bad quality
          log.warn({ tagId, tagPath }, 'No tag values found in cache');
          return { value: null, quality: 0, tagPath };
        }
        
        const row = valueResult.rows[0];
        // Precedence: v_json -> v_num -> v_text
        const value = row.v_json != null ? row.v_json : 
                      (row.v_num != null ? Number(row.v_num) : 
                      (row.v_text != null ? row.v_text : null));
        const quality = row.quality != null ? row.quality : 192;
        
        return { value, quality, tagPath };
      }
      
      case 'tag-output': {
        // Write to internal tag
        const tagId = node.data?.tagId;
        if (!tagId) {
          throw new Error('Tag output node missing tagId');
        }
        
        // Get input value from source node
        const inputEdge = execution.edges?.find(e => e.target === node.id);
        
        if (!inputEdge) {
          log.warn('No input connected to tag-output node');
          return { value: null, quality: 0 };
        }
        
        const inputValue = nodeOutputs.get(inputEdge.source);
        if (!inputValue) {
          log.warn({ sourceNodeId: inputEdge.source }, 'Source node output not found');
          return { value: null, quality: 0 };
        }
        
        // Verify tag exists and is internal
        const tagResult = await app.db.query(
          'SELECT tag_id, tag_path, driver_type FROM tag_metadata WHERE tag_id = $1',
          [tagId]
        );
        
        if (tagResult.rows.length === 0) {
          throw new Error(`Tag ${tagId} not found`);
        }
        
        if (tagResult.rows[0].driver_type !== 'INTERNAL') {
          throw new Error(`Tag ${tagId} is not an internal tag`);
        }
        
        // Publish to NATS (tag update)
        const tagPath = tagResult.rows[0].tag_path;
        const payload = {
          tag_id: tagId,
          tag_path: tagPath,
          value: inputValue.value,
          quality: inputValue.quality,
          timestamp: new Date().toISOString(),
          source: 'flow_engine'
        };
        
        await app.nats.publish(`df.tag.update.${tagId}`, payload);
        log.info({ tagId, tagPath, value: inputValue.value }, 'Published tag update');
        
        return { value: inputValue.value, quality: inputValue.quality };
      }
      
      case 'math-add':
      case 'math-subtract':
      case 'math-multiply':
      case 'math-divide': {
        // Get inputs - combine connected edges AND static values
        const edges = execution.edges?.filter(e => e.target === node.id) || [];
        let inputs = [];
        
        // Start with values from connected nodes
        if (edges.length > 0) {
          inputs = edges.map(edge => nodeOutputs.get(edge.source)).filter(Boolean);
        }
        
        // Add static values from node configuration
        if (node.data?.values && Array.isArray(node.data.values)) {
          const staticInputs = node.data.values.map(v => ({ value: v, quality: 192 }));
          inputs = inputs.concat(staticInputs);
          log.info({ nodeId: node.id, edgeInputs: edges.length, staticValues: node.data.values.length, totalInputs: inputs.length }, 'Math node combining edge and static inputs');
        } else if (inputs.length > 0) {
          log.info({ nodeId: node.id, edgeInputs: inputs.length }, 'Math node using only edge inputs');
        }
        
        if (inputs.length === 0) {
          log.warn({ nodeId: node.id, hasEdges: edges.length > 0, hasStaticValues: !!node.data?.values }, 'Math node has no inputs');
          return { value: null, quality: 0 };
        }
        
        // Check quality - if any input is bad, output is bad
        const minQuality = Math.min(...inputs.map(i => i.quality));
        if (minQuality < 64) { // Bad quality threshold
          return { value: null, quality: 0 };
        }
        
        // Perform operation
        const values = inputs.map(i => Number(i.value)).filter(v => !isNaN(v));
        if (values.length === 0) {
          return { value: null, quality: 0 };
        }
        
        let result;
        const operation = node.type.split('-')[1];
        
        switch (operation) {
          case 'add':
            result = values.reduce((a, b) => a + b, 0);
            break;
          case 'subtract':
            result = values.length > 0 ? values[0] - values.slice(1).reduce((a, b) => a + b, 0) : 0;
            break;
          case 'multiply':
            result = values.reduce((a, b) => a * b, 1);
            break;
          case 'divide':
            if (values.length > 1 && values.slice(1).some(v => v === 0)) {
              throw new Error('Division by zero');
            }
            result = values.length > 0 ? values.slice(1).reduce((a, b) => a / b, values[0]) : 0;
            break;
          default:
            throw new Error(`Unknown math operation: ${operation}`);
        }
        
        return { value: result, quality: minQuality };
      }
      
      case 'compare-gt':
      case 'compare-lt':
      case 'compare-eq':
      case 'compare-neq': {
        // Get two inputs
        const edges = execution.edges?.filter(e => e.target === node.id) || [];
        const inputs = edges.map(edge => nodeOutputs.get(edge.source)).filter(Boolean);
        
        if (inputs.length < 2) {
          return { value: false, quality: 0 };
        }
        
        // Check quality
        const minQuality = Math.min(...inputs.map(i => i.quality));
        if (minQuality < 64) {
          return { value: false, quality: 0 };
        }
        
        const a = Number(inputs[0].value);
        const b = Number(inputs[1].value);
        
        if (isNaN(a) || isNaN(b)) {
          return { value: false, quality: 0 };
        }
        
        const operation = node.type.split('-')[1];
        let result;
        
        switch (operation) {
          case 'gt':
            result = a > b;
            break;
          case 'lt':
            result = a < b;
            break;
          case 'eq':
            result = Math.abs(a - b) < Number.EPSILON;
            break;
          case 'neq':
            result = Math.abs(a - b) >= Number.EPSILON;
            break;
          default:
            throw new Error(`Unknown comparison operation: ${operation}`);
        }
        
        return { value: result, quality: minQuality };
      }
      
      case 'script-js': {
        // Execute JavaScript code
        const code = node.data?.code || '';
        if (!code || code.trim() === '') {
          log.warn('Script node has no code');
          return { value: null, quality: 0 };
        }
        
        // Get input value if connected
        const edges = execution.edges?.filter(e => e.target === node.id) || [];
        let inputValue = null;
        let inputQuality = 192;
        
        if (edges.length > 0) {
          const firstEdge = edges[0];
          const sourceOutput = nodeOutputs.get(firstEdge.source);
          if (sourceOutput) {
            inputValue = sourceOutput.value;
            inputQuality = sourceOutput.quality;
          }
        }
        
        // Execute script with sandbox
        const allowedPaths = getAllowedPaths();
        const timeout = node.data?.timeout || 10000;
        
        const scriptResult = await executeScript(code, {}, {
          app,
          flowId: flow.id,
          nodeOutputs,
          input: inputValue,
          timeout,
          allowedPaths
        });
        
        if (scriptResult.error) {
          log.error({ error: scriptResult.error, logs: scriptResult.logs }, 'Script execution failed');
          
          // Check onError setting
          const onError = node.data?.onError || 'stop';
          if (onError === 'stop') {
            throw new Error(`Script error: ${scriptResult.error.message}`);
          }
          
          return { value: null, quality: 0, error: scriptResult.error.message, logs: scriptResult.logs };
        }
        
        log.info({ result: scriptResult.result, logs: scriptResult.logs }, 'Script executed successfully');
        
        return {
          value: scriptResult.result,
          quality: inputQuality, // Inherit input quality
          logs: scriptResult.logs
        };
      }
      
      default:
        log.warn({ nodeType: node.type }, 'Unknown node type');
        return { value: null, quality: 0 };
    }
  } catch (error) {
    log.error({ err: error, nodeType: node.type }, 'Node execution failed');
    
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
