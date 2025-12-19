/**
 * Flow Studio API Service
 */

const API_BASE = '/api';

/**
 * Get authentication headers
 */
function getHeaders() {
  const token = localStorage.getItem('df_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

/**
 * List flows (owned + shared)
 */
export async function listFlows() {
  const response = await fetch(`${API_BASE}/flows`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch flows');
  return response.json();
}

/**
 * Get shared flows only
 */
export async function listSharedFlows() {
  const response = await fetch(`${API_BASE}/flows/shared`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch shared flows');
  return response.json();
}

/**
 * Get flow by ID
 */
export async function getFlow(id) {
  const response = await fetch(`${API_BASE}/flows/${id}`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch flow');
  return response.json();
}

/**
 * Calculate execution order for a flow
 */
export async function calculateExecutionOrder(id) {
  const response = await fetch(`${API_BASE}/flows/${id}/calculate-execution-order`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to calculate execution order');
  return response.json();
}

/**
 * Create new flow
 */
export async function createFlow(data) {
  const response = await fetch(`${API_BASE}/flows`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to create flow');
  return response.json();
}

/**
 * Update flow
 */
export async function updateFlow(id, data) {
  const response = await fetch(`${API_BASE}/flows/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to update flow');
  return response.json();
}

/**
 * Delete flow
 */
export async function deleteFlow(id) {
  const response = await fetch(`${API_BASE}/flows/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete flow' }));
    throw new Error(error.message || error.error || 'Failed to delete flow');
  }
  return response.json();
}

/**
 * Deploy/undeploy flow
 */
export async function deployFlow(id, deployed) {
  const response = await fetch(`${API_BASE}/flows/${id}/deploy`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ deployed })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.details || error.error || 'Failed to deploy flow');
  }
  return response.json();
}

/**
 * Duplicate flow
 */
export async function duplicateFlow(id, name) {
  const body = name ? JSON.stringify({ name }) : undefined;
  const headers = getHeaders();
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(`${API_BASE}/flows/${id}/duplicate`, {
    method: 'POST',
    headers,
    body
  });
  if (!response.ok) throw new Error('Failed to duplicate flow');
  return response.json();
}

/**
 * Execute flow with optional parameters
 */
export async function executeFlow(id, triggerNodeId, parameters = null) {
  const body = { trigger_node_id: triggerNodeId };
  if (parameters) {
    body.parameters = parameters;
  }
  
  const response = await fetch(`${API_BASE}/flows/${id}/execute`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.message || error.error || 'Failed to execute flow');
  }
  
  return response.json();
}

/**
 * Get flow parameter schema
 */
export async function getFlowParameters(id) {
  const response = await fetch(`${API_BASE}/flows/${id}/parameters`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch flow parameters');
  return response.json();
}

/**
 * Update flow exposed parameters
 */
export async function updateFlowParameters(id, exposedParameters) {
  const response = await fetch(`${API_BASE}/flows/${id}/parameters`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ exposed_parameters: exposedParameters })
  });
  if (!response.ok) throw new Error('Failed to update flow parameters');
  return response.json();
}

/**
 * Get last execution outputs
 */
export async function getLastExecution(id) {
  const response = await fetch(`${API_BASE}/flows/${id}/last-execution`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch last execution');
  return response.json();
}

/**
 * Get parameter execution history
 */
export async function getParameterHistory(id, limit = 10) {
  const response = await fetch(`${API_BASE}/flows/${id}/parameter-history?limit=${limit}`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch parameter history');
  return response.json();
}

/**
 * Fire a manual trigger node (for continuous flows)
 */
export async function fireTrigger(flowId, nodeId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/trigger/${nodeId}`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fire trigger');
  return response.json();
}

/**
 * Get flow dependencies
 */
export async function getFlowDependencies(id) {
  const response = await fetch(`${API_BASE}/flows/${id}/dependencies`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch dependencies');
  return response.json();
}

/**
 * Update flow static data
 */
export async function updateFlowStaticData(id, staticData) {
  const response = await fetch(`${API_BASE}/flows/${id}/static-data`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ static_data: staticData })
  });
  if (!response.ok) throw new Error('Failed to update static data');
  return response.json();
}

/**
 * Get internal tags
 */
export async function getInternalTags() {
  const response = await fetch(`${API_BASE}/connectivity/tags/internal`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch internal tags');
  return response.json();
}

/**
 * Get execution history for a flow
 */
export async function getExecutionHistory(flowId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/history`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to get execution history');
  const data = await response.json();
  return data.executions || [];
}

/**
 * Create internal tag
 */
export async function createInternalTag(data) {
  const response = await fetch(`${API_BASE}/connectivity/tags/internal`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to create internal tag');
  return response.json();
}

/**
 * Update tag configuration
 */
export async function updateTag(tagId, data) {
  const response = await fetch(`${API_BASE}/connectivity/tags/${tagId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to update tag');
  return response.json();
}

/**
 * Get flows that write to a tag
 */
export async function getTagWriters(tagId) {
  const response = await fetch(`${API_BASE}/connectivity/tags/${tagId}/writers`, {
    method: 'GET',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to get tag writers');
  return response.json();
}

/**
 * Test execute a single node
 */
export async function testExecuteNode(flowId, nodeId, mockInputData = null) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/nodes/${nodeId}/test`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ mockInputData })
  });
  if (!response.ok) throw new Error('Failed to execute node');
  return response.json();
}

/**
 * Execute flow from a specific node (partial execution)
 * Executes the selected node and all downstream dependent nodes
 */
export async function executeFromNode(flowId, nodeId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/execute-from/${nodeId}`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to execute from node');
  return response.json();
}

/**
 * Execute node action (e.g., regen ID, create sibling)
 */
export async function executeNodeAction(flowId, nodeId, actionName, nodeData) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/nodes/${nodeId}/action`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ actionName, nodeData })
  });
  if (!response.ok) throw new Error(`Failed to execute action: ${actionName}`);
  return response.json();
}

/**
 * Get logs for a flow
 */
export async function getFlowLogs(flowId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.execution_id) params.append('execution_id', filters.execution_id);
  if (filters.node_id) params.append('node_id', filters.node_id);
  if (filters.log_level) params.append('log_level', filters.log_level);
  if (filters.since) params.append('since', filters.since);
  if (filters.limit) params.append('limit', filters.limit);
  if (filters.offset) params.append('offset', filters.offset);

  const response = await fetch(`${API_BASE}/flows/${flowId}/logs?${params}`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch logs');
  return response.json();
}

/**
 * Get logs for a specific execution
 */
export async function getExecutionLogs(flowId, executionId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/executions/${executionId}/logs`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch execution logs');
  return response.json();
}

/**
 * Clear logs for a flow
 */
export async function clearFlowLogs(flowId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/logs/clear`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to clear logs');
  return response.json();
}

/**
 * Update log configuration for a flow
 */
export async function updateLogConfig(flowId, config) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/logs/config`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(config)
  });
  if (!response.ok) throw new Error('Failed to update log configuration');
  return response.json();
}

/**
 * Start continuous flow session
 */
export async function startFlowSession(flowId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/sessions/start`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to start flow session');
  return response.json();
}

/**
 * Stop continuous flow session
 */
export async function stopFlowSession(flowId, sessionId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/sessions/${sessionId}/stop`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to stop flow session');
  return response.json();
}

/**
 * Get active flow session status
 */
export async function getFlowSessionStatus(flowId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/sessions/active`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    if (response.status === 404) return { session: null };
    throw new Error('Failed to fetch session status');
  }
  return response.json();
}

/**
 * Export flow to JSON
 */
export async function exportFlow(flowId) {
  const response = await fetch(`${API_BASE}/flows/${flowId}/export`, {
    method: 'POST',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to export flow');
  return response.json();
}

/**
 * Validate flow import data
 */
export async function validateFlowImport(importData, connectionMappings = {}) {
  const response = await fetch(`${API_BASE}/flows/import/validate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ importData, connectionMappings })
  });
  if (!response.ok) throw new Error('Failed to validate flow import');
  return response.json();
}

/**
 * Execute flow import after validation
 */
export async function executeFlowImport(importData, validation, newName = null, connectionMappings = {}) {
  const response = await fetch(`${API_BASE}/flows/import/execute`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ importData, validation, newName, connectionMappings })
  });
  if (!response.ok) throw new Error('Failed to import flow');
  return response.json();
}

