// Flow Execution Engine
// Executes deployed flows with node-by-node processing
// Handles tag I/O, quality propagation, and error handling

import crypto from 'crypto';
import { executeScript, getAllowedPaths } from './script-sandbox.js';
import { NodeRegistry } from '../nodes/base/NodeRegistry.js';
import { NodeExecutionContext } from '../nodes/base/NodeExecutionContext.js';
import { LogBuffer } from './log-buffer.js';
import { InputStateManager } from './input-state-manager.js';
import { FlowSession } from './flow-session.js';


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
  
  // Note: Manual trigger nodes are optional
  // - For continuous/test mode: All nodes execute in topological order
  // - For manual execution with trigger: Only nodes downstream from trigger execute
  // This allows flows to be tested without requiring a manual trigger node
  
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
 * @deprecated Currently unused - kept for future trigger type implementations
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
 * Check if a node should skip execution based on inputs
 * Used for skipNodeOnNull feature - checks if any critical inputs are null or bad quality
 * 
 * @param {Object} node - Node to check
 * @param {Object} context - Execution context with inputStateManager
 * @param {Array} edges - Flow edges to find incoming connections
 * @returns {Object|null} Skip reason {skipped: true, reason: string} or null if should execute
 */
function shouldSkipNode(node, context, edges) {
  const { inputStateManager } = context;
  
  // Only applies to continuous execution mode with InputStateManager
  if (!inputStateManager) {
    return null; // Don't skip in manual mode
  }
  
  // Get node description to check skipNodeOnNull configuration
  if (!NodeRegistry.has(node.type)) {
    return null; // Unknown node type, let it execute (will fail later)
  }
  
  const nodeInstance = NodeRegistry.getInstance(node.type);
  const description = nodeInstance.description;
  const inputs = description.inputs || [];
  
  // Find incoming edges for this node
  const incomingEdges = edges.filter(e => e.target === node.id);
  
  // Check each input defined in node description
  for (let i = 0; i < inputs.length; i++) {
    const inputDef = inputs[i];
    const skipOnNull = inputDef.skipNodeOnNull ?? (inputDef.required ?? true); // Default: true for required, false for optional
    
    if (!skipOnNull) continue; // This input allows null, skip check
    
    // Find the edge for this input by matching targetHandle (e.g., "input-0", "input-1")
    const expectedHandle = `input-${i}`;
    const edge = incomingEdges.find(e => (e.targetHandle || 'input') === expectedHandle);
    
    if (!edge) {
      // No connection for required input
      if (inputDef.required) {
        return { skipped: true, reason: 'missing_required_input', inputIndex: i };
      }
      continue;
    }
    
    // Get input value from state manager
    const portName = edge.targetHandle || 'input';
    const inputData = inputStateManager.getInput(node.id, portName);
    
    if (!inputData) {
      return { skipped: true, reason: 'input_not_ready', inputIndex: i };
    }
    
    // Check for null/undefined value
    // Note: OPC UA statusCode 0 = Good, so we don't skip on quality=0
    // Only skip if value is actually null/undefined
    if (inputData.value === null || inputData.value === undefined) {
      return { skipped: true, reason: 'null_value', inputIndex: i, quality: inputData.quality };
    }
  }
  
  return null; // All checks passed, execute normally
}

/**
 * Execute a single node using class-based implementation from NodeRegistry
 * @param {Object} node - Node to execute
 * @param {Map} nodeOutputs - Map of node outputs
 * @param {Object} context - Execution context { app, flow, execution, inputStateManager }
 * @returns {Object} { value, quality, error, skipped? }
 */
export async function executeNode(node, nodeOutputs, context) {
  const { app, inputStateManager } = context;
  const log = app.log.child({ nodeId: node.id, nodeType: node.type });
  
  // Check if node is registered
  if (!NodeRegistry.has(node.type)) {
    throw new Error(`Unknown node type: ${node.type}. Please ensure the node is registered in the NodeRegistry.`);
  }
  
  log.debug('Executing class-based node');
  
  // Node execution timeout (default 30s, configurable per node)
  const NODE_TIMEOUT_MS = node.data?.timeoutMs || 30000;
  
  try {
    const nodeInstance = NodeRegistry.getInstance(node.type);
    const execContext = new NodeExecutionContext(node, nodeOutputs, context);
    
    // Capture input values before execution (for automatic live values)
    const capturedInputs = {};
    if (inputStateManager) {
      const inputHandles = execContext._getIncomingEdges();
      inputHandles.forEach((edge, idx) => {
        const portName = edge.targetHandle || `input-${idx}`;
        const inputData = inputStateManager.getInput(node.id, portName);
        if (inputData !== undefined) {
          capturedInputs[portName] = inputData;
        }
      });
    }
    
    // Wrap execution in timeout protection
    const executionPromise = nodeInstance.execute(execContext);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Node execution timeout after ${NODE_TIMEOUT_MS}ms`)), NODE_TIMEOUT_MS);
    });
    
    const result = await Promise.race([executionPromise, timeoutPromise]);
    
    // Capture output values after execution (for automatic live values)
    const capturedOutputs = {};
    if (result.outputs) {
      // Extract values from N8n-style outputs format
      result.outputs.forEach((outputArray, idx) => {
        if (outputArray && outputArray[0] && outputArray[0].json) {
          capturedOutputs[`output-${idx}`] = outputArray[0].json;
        }
      });
    } else if (result.value !== undefined) {
      // Simple value/quality format
      capturedOutputs['output-0'] = { value: result.value, quality: result.quality || 192 };
    }
    
    // Store captured I/O in the result for RuntimeStateStore
    result.capturedIO = {
      inputs: capturedInputs,
      outputs: capturedOutputs
    };
    
    // Automatic logging based on node's declarative log messages
    // Uses node's getLogMessages() to generate appropriate log entries
    execContext.autoLogResult(nodeInstance, result, 'info');
    execContext.autoLogResult(nodeInstance, result, 'debug');
    
    log.debug({ result }, 'Node executed successfully');
    return result;
  } catch (error) {
    log.error({ error }, 'Node execution failed');
    
    // Automatic error logging using node's declarative error message
    const nodeInstance = NodeRegistry.getInstance(node.type);
    const execContext = new NodeExecutionContext(node, nodeOutputs, context);
    execContext.autoLogError(nodeInstance, error);
    
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
export async function updateFlowTagDependencies(app, flowId, definition) {
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
 * Update flow library dependencies in database
 * Tracks which flows use nodes from external libraries
 * @param {Object} app - Fastify app instance
 * @param {String} flowId - Flow UUID
 * @param {Object} definition - Flow definition
 */
export async function updateFlowLibraryDependencies(app, flowId, definition) {
  const { nodes = [] } = definition;
  
  // Delete existing dependencies
  await app.db.query('DELETE FROM flow_library_dependencies WHERE flow_id = $1', [flowId]);
  
  // Add new dependencies for library nodes
  for (const node of nodes) {
    // Check if node type is from a library (format: libraryId:nodeType)
    if (!node.type || !node.type.includes(':')) continue;
    
    const [libraryId, ...nodeTypeParts] = node.type.split(':');
    const nodeType = nodeTypeParts.join(':'); // Handle edge case of multiple colons
    
    // Skip if it's a built-in node (shouldn't have colon, but be safe)
    if (!libraryId || !nodeType) continue;
    
    await app.db.query(
      `INSERT INTO flow_library_dependencies (flow_id, library_id, node_id, node_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (flow_id, library_id, node_id) DO UPDATE
       SET node_type = EXCLUDED.node_type`,
      [flowId, libraryId, node.id, node.type]
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
  
  // Declare these outside try block so catch block can access them
  let flow = null;
  let execution = null;
  let logBuffer = null;
  
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
    
    flow = flowResult.rows[0];
    
    // Check execution mode and deployment requirements
    // Manual flows can execute without deployment (on-demand only)
    // Continuous flows require deployment or test mode for session-based execution
    if (flow.execution_mode === 'continuous' && !flow.deployed && !flow.test_mode) {
      throw new Error(`Continuous flows must be deployed or in test mode`);
    }
    
    // Determine if this should be a continuous session or single execution
    // Continuous mode: Use FlowSession for looping execution
    // Manual mode: Always single execution, even in test mode
    const useContinuousSession = flow.execution_mode === 'continuous' && (flow.deployed || flow.test_mode);
    
    if (useContinuousSession) {
      log.info('Starting continuous execution mode with session management');
      
      // Create FlowSession for continuous execution
      const executionContext = { app, flow, execution: null, params: job.params, logBuffer: null, runtimeState: app.runtimeState };
      const flowSession = new FlowSession(flow, executionContext, ScanExecutor);
      
      try {
        const sessionId = await flowSession.start();
        log.info({ sessionId }, 'Flow session started successfully');
        
        // Session runs indefinitely until stopped
        // Complete the job immediately since session is now running in background
        await complete(job.id, { 
          success: true, 
          mode: 'continuous', 
          sessionId,
          message: 'Flow session started and running' 
        });
      } catch (error) {
        log.error({ error }, 'Failed to start flow session');
        throw error;
      }
      
      return; // Don't proceed to manual execution
    }
    
    // Manual execution mode - single run (includes manual flows in test mode)
    log.info({ executionMode: flow.execution_mode, testMode: flow.test_mode }, 'Starting single execution (manual mode)');
    
    // Apply runtime parameters to flow definition if provided
    let effectiveDefinition = flow.definition;
    const runtimeParameters = job.params.runtime_parameters || {};
    
    if (Object.keys(runtimeParameters).length > 0) {
      const { applyParameters } = await import('./parameterValidator.js');
      effectiveDefinition = applyParameters(
        flow.definition,
        flow.exposed_parameters || [],
        runtimeParameters
      );
      log.info({ parameterCount: Object.keys(runtimeParameters).length }, 'Runtime parameters applied to flow definition');
    }
    
    // Manual execution mode (existing logic)
    // Validate flow graph
    const validation = validateFlowGraph(effectiveDefinition);
    if (!validation.valid) {
      throw new Error(`Flow validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Create execution record with runtime parameters
    // Note: trigger_node_id is optional - used for auditing when flow is triggered by specific node
    const executionResult = await app.db.query(
      `INSERT INTO flow_executions 
       (flow_id, trigger_node_id, runtime_parameters, status, started_at)
       VALUES ($1, $2, $3, 'running', now())
       RETURNING *`,
      [
        flowId, 
        job.params.trigger_node_id || null,
        Object.keys(runtimeParameters).length > 0 ? JSON.stringify(runtimeParameters) : null
      ]
    );
    
    execution = executionResult.rows[0];
    execution.edges = effectiveDefinition.edges; // Add edges for node execution
    
    log.info({ 
      executionId: execution.id,
      hasParameters: Object.keys(runtimeParameters).length > 0
    }, 'Execution record created');
    
    // Create log buffer for persistent logging if enabled
    logBuffer = null;
    if (flow.logs_enabled) {
      logBuffer = new LogBuffer(app.db, app.nats);
      // Add system log for execution start
      logBuffer.add({
        execution_id: execution.id,
        flow_id: flowId,
        node_id: null,
        log_level: 'info',
        message: `Flow execution started${job.params.trigger_node_id ? ` (trigger: ${job.params.trigger_node_id})` : ''}`,
        timestamp: new Date(),
        metadata: job.params.trigger_node_id ? { trigger_node_id: job.params.trigger_node_id } : {}
      });
    }
    
    // Update tag dependencies (use original definition, not parameterized)
    await updateFlowTagDependencies(app, flowId, flow.definition);
    
    // Update library dependencies (use original definition, not parameterized)
    await updateFlowLibraryDependencies(app, flowId, flow.definition);
    
    // Get execution order (use parameterized definition)
    const { nodes = [], edges = [], pinData = {} } = effectiveDefinition;
    
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
    
    // Add job params and log buffer to context for nodes to access
    const executionContext = {
      app,
      flow,
      execution,
      params: job.params,
      logBuffer,
      runtimeState: app.runtimeState
    };
    
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
      const output = await executeNode(node, nodeOutputs, executionContext);
      const endTime = Date.now();
      
      // Add timing information to output
      output.executionTime = endTime - startTime;
      output.startedAt = new Date(startTime).toISOString();
      output.completedAt = new Date(endTime).toISOString();
      
      nodeOutputs.set(nodeId, output);
      
      // Store captured I/O in RuntimeStateStore for live value display
      if (output.capturedIO && app.runtimeState) {
        app.runtimeState.setNodeOutput(flow.id, nodeId, output.capturedIO);
      } else if (output.runtime && app.runtimeState) {
        // Fallback for nodes that still use manual runtime (backward compatibility)
        app.runtimeState.setNodeOutput(flow.id, nodeId, output.runtime);
      }
      
      log.info({ nodeId, nodeType: node.type, output, executionTime: output.executionTime }, 'Node executed');
      
      // Add node logs to buffer if logging is enabled
      if (logBuffer && output.logs && output.logs.length > 0) {
        for (const nodeLog of output.logs) {
          logBuffer.add({
            execution_id: execution.id,
            flow_id: flowId,
            node_id: nodeId,
            log_level: nodeLog.level || 'info',
            message: nodeLog.message,
            timestamp: nodeLog.timestamp || new Date(),
            metadata: nodeLog.metadata || null
          });
        }
      }
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
    
    // Flush remaining logs to database
    if (logBuffer) {
      await logBuffer.finalize();
      logBuffer.add({
        execution_id: execution.id,
        flow_id: flowId,
        node_id: null,
        log_level: 'info',
        message: 'Flow execution completed successfully',
        timestamp: new Date(),
        metadata: { node_count: executionOrder.length }
      });
      await logBuffer.finalize();
    }
    
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
    
    // Auto-exit test mode for manual flows after single execution
    if (flow.execution_mode === 'manual' && flow.test_mode) {
      await app.db.query(
        `UPDATE flows SET test_mode = false, updated_at = now() WHERE id = $1`,
        [flowId]
      );
      log.info({ flowId }, 'Auto-exited test mode after manual flow execution');
      
      // Log test mode exit
      if (logBuffer) {
        logBuffer.add({
          execution_id: execution.id,
          flow_id: flowId,
          node_id: null,
          log_level: 'info',
          message: '🛑 Test mode auto-exited after manual execution',
          timestamp: new Date(),
          metadata: { action: 'test_mode_auto_exit', execution_mode: 'manual' }
        });
        await logBuffer.finalize();
      }
    }
    
    await complete(job.id, { success: true, executionId: execution.id, outputs });
    
  } catch (error) {
    log.error({ err: error }, 'Flow execution failed');
    
    // Log error to buffer if available
    if (logBuffer) {
      logBuffer.add({
        execution_id: execution?.id,
        flow_id: flowId,
        node_id: null,
        log_level: 'error',
        message: `Flow execution failed: ${error.message}`,
        timestamp: new Date(),
        metadata: { error: error.stack }
      });
      await logBuffer.finalize();
    }
    
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

// Note: shouldSkipNode is defined above as a module-level function

/**
 * Scan-based executor for continuous flow execution
 */
class ScanExecutor {
  constructor(flow, context) {
    this.flow = flow;
    this.context = context;
    this.sessionId = null;
    this.scanCycle = 0;
    this.scanTimer = null;
    this.isRunning = false;
    this.isExecuting = false; // Flag to prevent concurrent scan cycles
    this.nodeOutputs = new Map();
    this.inputStateManager = new InputStateManager();
    this.logBuffer = null;
    this.onMetricsUpdate = null; // Callback for metrics updates after each scan
    this.log = context.app.log.child({ flowId: flow.id, sessionId: this.sessionId });
    
    // Resource monitoring metrics
    this.metrics = {
      totalCycles: 0,         // Number of scan cycles executed
      startTime: Date.now(),  // Flow start timestamp
      memoryPeakMb: 0,
      memorySamplesMb: [],
      scanDurations: [],
      scanDurationMax: 0
    };
  }
  
  async start() {
    if (this.isRunning) {
      throw new Error('Scan executor already running');
    }
    
    this.isRunning = true;
    this.sessionId = crypto.randomUUID();
    this.scanCycle = 0;
    this.log = this.context.app.log.child({ flowId: this.flow.id, sessionId: this.sessionId });
    
    // Initialize log buffer if logging is enabled
    if (this.flow.logs_enabled) {
      this.logBuffer = new LogBuffer(this.context.app.db, this.context.app.nats);
      this.logBuffer.add({
        execution_id: null, // No single execution for continuous mode
        flow_id: this.flow.id,
        node_id: null,
        log_level: 'info',
        message: `Continuous execution started (session: ${this.sessionId})`,
        timestamp: new Date(),
        metadata: { 
          session_id: this.sessionId,
          scan_rate_ms: this.flow.scan_rate_ms || 1000
        }
      });
    }
    
    const scanRateMs = this.flow.scan_rate_ms || 1000;
    this.log.info({ scanRateMs }, 'Starting scan-based execution');
    
    // Start scan loop
    this.scanTimer = setInterval(() => {
      this.executeScanCycle().catch(err => {
        this.log.error({ err }, 'Scan cycle failed');
      });
    }, scanRateMs);
    
    // Execute first scan immediately
    await this.executeScanCycle();
  }
  
  async executeScanCycle() {
    if (!this.isRunning) return;
    
    // Prevent concurrent scan cycles
    if (this.isExecuting) {
      this.log.warn({ scanCycle: this.scanCycle }, 'Skipping scan cycle - previous cycle still executing');
      return;
    }
    
    this.isExecuting = true;
    this.scanCycle++;
    const cycleLog = this.log.child({ scanCycle: this.scanCycle });
    
    // Resource monitoring - start timing
    const startTime = performance.now();
    const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
    cycleLog.debug('Scan cycle start');
    
    try {
      // Add cycle separator at START of scan (except first scan)
      if (this.scanCycle > 1 && this.logBuffer) {
        this.logBuffer.add({
          execution_id: null,
          flow_id: this.flow.id,
          node_id: null,
          log_level: 'info',
          message: `──────────`,
          metadata: { 
            scan_cycle: this.scanCycle,
            separator: true
          }
        });
      }
      
      const { nodes = [], edges = [] } = this.flow.definition;
      const executionOrder = topologicalSort(nodes, edges);
      
      cycleLog.debug({ executionOrder, totalNodes: nodes.length }, 'Execution order determined');
      
      // Clear outputs from previous scan
      this.nodeOutputs.clear();
      
      // NOTE: We don't call updateInputState() here anymore!
      // Input state will be updated immediately after each node executes,
      // so downstream nodes in the same scan get fresh values
      
      // Log input state snapshot
      this.inputStateManager.logState(`Scan ${this.scanCycle}:`);
      
      // Execute nodes in order
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      
      // Create minimal execution context for this scan
      const scanContext = {
        ...this.context,
        execution: {
          id: null, // null for continuous execution (no flow_executions record)
          session_id: this.sessionId, // Track session separately for debugging
          scan_cycle: this.scanCycle,
          edges: edges // Add edges so NodeExecutionContext can find incoming edges
        },
        inputStateManager: this.inputStateManager,
        logBuffer: this.logBuffer, // Add logBuffer so nodes can use automatic logging
        runtimeState: this.context.app.runtimeState
      };
      
      for (const nodeId of executionOrder) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        
        cycleLog.debug({ nodeId, nodeType: node.type }, 'Processing node in execution order');
        
        // Skip passive nodes (e.g., comment nodes) - they don't execute
        if (node.type === 'comment') {
          cycleLog.debug({ nodeId, nodeType: node.type }, 'Skipping passive node');
          continue;
        }
        
        // Get node log level (default to 'none')
        const nodeLogLevel = node.data?.logLevel || 'none';
        const shouldLog = this.logBuffer && nodeLogLevel !== 'none';
        
        // Performance timing for this node
        const nodeStart = performance.now();
        
        // Check if all required inputs are ready (source nodes have executed in this scan)
        const incomingEdges = edges.filter(e => e.target === nodeId);
        if (incomingEdges.length > 0) {
          // Check if all source nodes have executed in THIS scan cycle
          const hasAllInputs = incomingEdges.every(edge => {
            return this.nodeOutputs.has(edge.source);
          });
          
          if (!hasAllInputs) {
            cycleLog.debug({ nodeId, scanCycle: this.scanCycle }, 'Node skipped - waiting for input values');
            
            // Log at info level if logging is enabled for this node
            if (shouldLog && this.shouldLogLevel(nodeLogLevel, 'info')) {
              this.logBuffer.add({
                execution_id: null,
                flow_id: this.flow.id,
                node_id: nodeId,
                log_level: 'info',
                message: `Node not executed - waiting for input values from connected nodes`,
                timestamp: new Date(),
                metadata: { scan_cycle: this.scanCycle, incoming_edges: incomingEdges.length }
              });
            }
            
            continue;
          }
        }
        
        // Check trigger input - if false, skip execution
        const triggerValue = this.inputStateManager.getInput(nodeId, 'trigger');
        if (triggerValue !== undefined && triggerValue !== null && triggerValue !== true) {
          cycleLog.debug({ nodeId, triggerValue }, 'Node skipped - trigger input is false');
          
          // Log skip if logging enabled and level allows
          if (shouldLog && this.shouldLogLevel(nodeLogLevel, 'debug')) {
            this.logBuffer.add({
              execution_id: null,
              flow_id: this.flow.id,
              node_id: nodeId,
              log_level: 'debug',
              message: `Node skipped - trigger input is false`,
              timestamp: new Date(),
              metadata: { scan_cycle: this.scanCycle, trigger_value: triggerValue }
            });
          }
          
          // Set output to null so downstream nodes know this node didn't execute
          this.nodeOutputs.set(nodeId, {
            value: null,
            quality: 0,
            skipped: true,
            skipReason: 'trigger_false'
          });
          
          // Update downstream inputs with null output
          const outgoingEdges = edges.filter(e => e.source === nodeId);
          for (const edge of outgoingEdges) {
            const targetPort = edge.targetHandle || 'input';
            this.inputStateManager.updateInput(edge.target, targetPort, { value: null, quality: 0 });
          }
          
          continue;
        }
        
        // Check if node should skip based on skipNodeOnNull configuration
        const skipCheck = shouldSkipNode(node, scanContext, edges);
        if (skipCheck) {
          cycleLog.debug({ nodeId, skipCheck }, 'Node skipped - skipNodeOnNull check failed');
          
          // Log skip if logging enabled
          if (shouldLog && this.shouldLogLevel(nodeLogLevel, 'debug')) {
            this.logBuffer.add({
              execution_id: null,
              flow_id: this.flow.id,
              node_id: nodeId,
              log_level: 'debug',
              message: `Node skipped - ${skipCheck.reason}`,
              timestamp: new Date(),
              metadata: { scan_cycle: this.scanCycle, ...skipCheck }
            });
          }
          
          // Set output to null with bad quality
          this.nodeOutputs.set(nodeId, {
            value: null,
            quality: 0,
            skipped: true,
            skipReason: skipCheck.reason
          });
          
          // Update downstream inputs with null output
          const outgoingEdges = edges.filter(e => e.source === nodeId);
          for (const edge of outgoingEdges) {
            const targetPort = edge.targetHandle || 'input';
            this.inputStateManager.updateInput(edge.target, targetPort, { value: null, quality: 0 });
          }
          
          continue;
        }
        
        try {
          const output = await executeNode(node, this.nodeOutputs, scanContext);
          this.nodeOutputs.set(nodeId, output);
          
          // Store captured I/O in RuntimeStateStore for live value display
          if (output.capturedIO && scanContext.app && scanContext.app.runtimeState) {
            scanContext.app.runtimeState.setNodeOutput(this.flow.id, nodeId, output.capturedIO);
          } else if (output.runtime && scanContext.app && scanContext.app.runtimeState) {
            // Fallback for nodes that still use manual runtime (backward compatibility)
            scanContext.app.runtimeState.setNodeOutput(this.flow.id, nodeId, output.runtime);
          }
          
          // Performance check
          const nodeDuration = performance.now() - nodeStart;
          if (nodeDuration > 100) {
            cycleLog.warn({ 
              nodeId, 
              nodeType: node.type, 
              duration: Math.round(nodeDuration) 
            }, 'Slow node execution detected');
          }
          
          // Update input state for downstream nodes immediately after execution
          // Find all edges where this node is the source
          const outgoingEdges = edges.filter(e => e.source === nodeId);
          for (const edge of outgoingEdges) {
            const targetPort = edge.targetHandle || 'input';
            this.inputStateManager.updateInput(edge.target, targetPort, output);
          }
          
          // Automatic logging now handled by executeNode via node's getLogMessages()
        } catch (error) {
          cycleLog.error({ nodeId, err: error }, 'Node execution failed');
          
          // Error already logged by executeNode via node's getLogMessages().error
          // Don't duplicate the error log here
          
          // Set error output
          this.nodeOutputs.set(nodeId, {
            value: null,
            quality: 0,
            error: error.message
          });
          
          // Update downstream inputs with null output
          const outgoingEdges = edges.filter(e => e.source === nodeId);
          for (const edge of outgoingEdges) {
            const targetPort = edge.targetHandle || 'input';
            this.inputStateManager.updateInput(edge.target, targetPort, { value: null, quality: 0 });
          }
        }
      }
      
      cycleLog.debug('Scan cycle complete');
      
      // Resource monitoring - end timing
      const duration = performance.now() - startTime;
      const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Update metrics
      this.metrics.totalCycles += 1;
      this.metrics.scanDurations.push(duration);
      this.metrics.scanDurationMax = Math.max(this.metrics.scanDurationMax, duration);
      this.metrics.memorySamplesMb.push(endMem);
      this.metrics.memoryPeakMb = Math.max(this.metrics.memoryPeakMb, endMem);
      
      // Keep only last 100 samples for rolling average
      if (this.metrics.scanDurations.length > 100) {
        this.metrics.scanDurations.shift();
        this.metrics.memorySamplesMb.shift();
      }
      
      // Call metrics update callback if provided (for writing to TSDB)
      if (this.onMetricsUpdate) {
        const metrics = this.getMetrics();
        this.onMetricsUpdate(metrics).catch(err => {
          cycleLog.warn({ err }, 'Metrics update callback failed');
        });
      }
      
      // Flush logs after each scan cycle (fire-and-forget to avoid blocking)
      if (this.logBuffer) {
        this.logBuffer.flush().catch(err => {
          cycleLog.warn({ err }, 'Log flush failed');
        });
      }
      
    } catch (error) {
      cycleLog.error({ err: error }, 'Scan cycle error');
    } finally {
      // Always reset the executing flag
      this.isExecuting = false;
    }
  }
  
  /**
   * Update input state from node outputs and edges
   * This runs BEFORE each scan cycle to ensure nodes see latest values
   * IMPORTANT: Passes full output object {value, quality} to preserve quality codes
   */
  updateInputState(nodes, edges) {
    // For each edge, copy output object (with quality) to target node's input
    for (const edge of edges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (!sourceOutput) continue; // Source hasn't executed yet
      
      const targetPort = edge.targetHandle || 'input';
      // Pass the full output object to preserve quality codes
      this.inputStateManager.updateInput(edge.target, targetPort, sourceOutput);
    }
  }
  
  /**
   * Check if a message should be logged based on node's log level
   * @param {string} nodeLogLevel - Node's configured log level (none, error, warn, info, debug)
   * @param {string} messageLevel - Level of the message being logged
   * @returns {boolean} True if message should be logged
   */
  shouldLogLevel(nodeLogLevel, messageLevel) {
    const levels = { none: 0, error: 1, warn: 2, info: 3, debug: 4 };
    const nodeLevelValue = levels[nodeLogLevel] || 0;
    const messageLevelValue = levels[messageLevel] || 0;
    return messageLevelValue <= nodeLevelValue;
  }
  
  stop() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.isRunning = false;
    
    // Flush any pending logs
    if (this.logBuffer) {
      this.logBuffer.add({
        execution_id: null,
        flow_id: this.flow.id,
        node_id: null,
        log_level: 'info',
        message: `Continuous execution stopped (session: ${this.sessionId})`,
        timestamp: new Date(),
        metadata: { 
          session_id: this.sessionId,
          total_scans: this.scanCycle
        }
      });
      this.logBuffer.finalize().catch(err => {
        this.log.error({ err }, 'Failed to finalize log buffer');
      });
    }
    
    this.log.info({ totalScans: this.scanCycle }, 'Stopped scan-based execution');
  }
  
  /**
   * Get resource usage metrics
   * @returns {Object} Current resource metrics
   */
  getMetrics() {
    const avgScanDuration = this.metrics.scanDurations.length > 0
      ? this.metrics.scanDurations.reduce((a, b) => a + b, 0) / this.metrics.scanDurations.length
      : 0;
    
    const avgMemory = this.metrics.memorySamplesMb.length > 0
      ? this.metrics.memorySamplesMb.reduce((a, b) => a + b, 0) / this.metrics.memorySamplesMb.length
      : 0;
    
    // Calculate uptime in seconds
    const uptimeSeconds = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    
    // Calculate cycles per second (throughput)
    const cyclesPerSecond = uptimeSeconds > 0
      ? this.metrics.totalCycles / uptimeSeconds
      : 0;
    
    // Calculate scan efficiency - what % of scan rate is used for execution
    // Uses flow's configured scan rate
    const scanRateMs = this.flow?.scan_rate_ms || 1000;
    const scanEfficiencyPercent = scanRateMs > 0
      ? (avgScanDuration / scanRateMs) * 100
      : 0;
    
    return {
      scanEfficiencyPercent: Number(scanEfficiencyPercent.toFixed(1)),
      totalCycles: this.metrics.totalCycles,
      cyclesPerSecond: Number(cyclesPerSecond.toFixed(2)),
      uptimeSeconds: uptimeSeconds,
      memoryPeakMb: Number(this.metrics.memoryPeakMb.toFixed(2)),
      memoryAvgMb: Number(avgMemory.toFixed(2)),
      scanDurationAvgMs: Math.round(avgScanDuration),
      scanDurationMaxMs: Math.round(this.metrics.scanDurationMax)
    };
  }
}

// Export ScanExecutor for use by FlowSession
export { ScanExecutor };
