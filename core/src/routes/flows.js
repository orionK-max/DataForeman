/**
 * Flow Studio Routes
 * CRUD operations for workflow definitions
 */

export default async function flowRoutes(app) {
  const db = app.db;

  // Permission check helper
  async function checkPermission(userId, action, reply) {
    if (!userId || !(await app.permissions.can(userId, 'flows', action))) {
      reply.code(403).send({ error: 'forbidden' });
      return false;
    }
    return true;
  }

  // GET /api/flows - List all flows (own + shared)
  app.get('/api/flows', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const result = await db.query(`
      SELECT 
        f.*,
        u.display_name as owner_name,
        (SELECT COUNT(*) FROM flow_executions WHERE flow_id = f.id) as execution_count,
        (SELECT MAX(started_at) FROM flow_executions WHERE flow_id = f.id) as last_executed_at
      FROM flows f
      LEFT JOIN users u ON f.owner_user_id = u.id
      WHERE f.owner_user_id = $1 OR f.shared = true
      ORDER BY f.updated_at DESC
    `, [userId]);

    reply.send({ flows: result.rows });
  });

  // POST /api/flows - Create new flow
  app.post('/api/flows', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { name, description, definition, static_data } = req.body;

    if (!name || !definition) {
      return reply.code(400).send({ error: 'name and definition are required' });
    }

    const result = await db.query(`
      INSERT INTO flows (name, description, owner_user_id, definition, static_data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description || null, userId, definition, static_data || {}]);

    reply.send({ flow: result.rows[0] });
  });

  // GET /api/flows/:id - Get single flow
  app.get('/api/flows/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    const result = await db.query(`
      SELECT 
        f.*,
        u.display_name as owner_name
      FROM flows f
      LEFT JOIN users u ON f.owner_user_id = u.id
      WHERE f.id = $1 AND (f.owner_user_id = $2 OR f.shared = true)
    `, [id, userId]);

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    reply.send({ flow: result.rows[0] });
  });

  // PUT /api/flows/:id - Update flow
  app.put('/api/flows/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;
    const { name, description, definition, static_data, deployed, shared } = req.body;

    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT owner_user_id FROM flows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    if (ownerCheck.rows[0].owner_user_id !== userId) {
      return reply.code(403).send({ error: 'only owner can update flow' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (definition !== undefined) {
      updates.push(`definition = $${paramCount++}`);
      values.push(definition);
    }
    if (static_data !== undefined) {
      updates.push(`static_data = $${paramCount++}`);
      values.push(static_data);
    }
    if (deployed !== undefined) {
      updates.push(`deployed = $${paramCount++}`);
      values.push(deployed);
    }
    if (shared !== undefined) {
      updates.push(`shared = $${paramCount++}`);
      values.push(shared);
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await db.query(`
      UPDATE flows
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    reply.send({ flow: result.rows[0] });
  });

  // DELETE /api/flows/:id - Delete flow
  app.delete('/api/flows/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'delete', reply))) return;

    const { id } = req.params;

    // Verify ownership
    const result = await db.query(
      'DELETE FROM flows WHERE id = $1 AND owner_user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found or not owner' });
    }

    reply.send({ success: true });
  });

  // POST /api/flows/:id/deploy - Deploy/undeploy flow
  app.post('/api/flows/:id/deploy', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;
    const { deployed } = req.body;

    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT owner_user_id FROM flows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    if (ownerCheck.rows[0].owner_user_id !== userId) {
      return reply.code(403).send({ error: 'only owner can deploy flow' });
    }

    const result = await db.query(`
      UPDATE flows
      SET deployed = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `, [deployed, id]);

    reply.send({ flow: result.rows[0] });
  });

  // GET /api/flows/shared - Get only shared flows
  app.get('/api/flows/shared', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const result = await db.query(`
      SELECT 
        f.*,
        u.display_name as owner_name
      FROM flows f
      LEFT JOIN users u ON f.owner_user_id = u.id
      WHERE f.shared = true AND f.owner_user_id != $1
      ORDER BY f.updated_at DESC
    `, [userId]);

    reply.send({ flows: result.rows });
  });

  // POST /api/flows/:id/duplicate - Duplicate a flow
  app.post('/api/flows/:id/duplicate', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;

    // Get the original flow (must be owned or shared)
    const original = await db.query(`
      SELECT * FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (original.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const flow = original.rows[0];

    // Create duplicate
    const result = await db.query(`
      INSERT INTO flows (name, description, owner_user_id, definition, static_data, deployed, shared)
      VALUES ($1, $2, $3, $4, $5, false, false)
      RETURNING *
    `, [
      `${flow.name} (Copy)`,
      flow.description,
      userId,
      flow.definition,
      flow.static_data
    ]);

    reply.send({ flow: result.rows[0] });
  });

  // GET /api/flows/:id/dependencies - Get tag dependencies
  app.get('/api/flows/:id/dependencies', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    // Verify access
    const flowCheck = await db.query(
      'SELECT id FROM flows WHERE id = $1 AND (owner_user_id = $2 OR shared = true)',
      [id, userId]
    );

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const result = await db.query(`
      SELECT 
        ftd.*,
        tm.tag_path,
        tm.tag_name,
        tm.data_type,
        c.name as connection_name
      FROM flow_tag_dependencies ftd
      JOIN tag_metadata tm ON ftd.tag_id = tm.tag_id
      JOIN connections c ON tm.connection_id = c.id
      WHERE ftd.flow_id = $1
      ORDER BY ftd.dependency_type, tm.tag_path
    `, [id]);

    reply.send({ dependencies: result.rows });
  });

  // PUT /api/flows/:id/static-data - Update static data only
  app.put('/api/flows/:id/static-data', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;
    const { static_data } = req.body;

    // Verify ownership
    const result = await db.query(`
      UPDATE flows
      SET static_data = $1, updated_at = now()
      WHERE id = $2 AND owner_user_id = $3
      RETURNING *
    `, [static_data, id, userId]);

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found or not owner' });
    }

    reply.send({ flow: result.rows[0] });
  });

  // POST /api/flows/:id/execute - Execute a flow manually (test run)
  app.post('/api/flows/:id/execute', async (req, reply) => {
    const userId = req.user?.sub;
    // Check execute permission (separate from update)
    if (!userId || !(await app.permissions.can(userId, 'flows', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    let { trigger_node_id } = req.body;

    // Verify access and deployed status
    const flowCheck = await db.query(`
      SELECT id, deployed, definition
      FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    if (!flowCheck.rows[0].deployed) {
      return reply.code(400).send({ error: 'flow must be deployed before execution' });
    }

    // Test Run: Bypass trigger type and start from first trigger node
    // This allows testing flows with event/schedule triggers via the UI button
    if (!trigger_node_id) {
      const definition = flowCheck.rows[0].definition;
      const triggerNodes = definition.nodes?.filter(n => n.type?.startsWith('trigger-')) || [];
      if (triggerNodes.length > 0) {
        trigger_node_id = triggerNodes[0].id;
      }
    }

    // Enqueue flow execution job
    try {
      const job = await app.jobs.enqueue('flow_execution', {
        flow_id: id,
        trigger_node_id: trigger_node_id || null,
        triggered_by: userId,
        test_run: true // Flag to indicate this is a manual test run
      });

      req.log.info({ flowId: id, jobId: job.id, userId, testRun: true }, 'Flow test execution job enqueued');

      reply.send({ 
        jobId: job.id,
        flowId: id,
        status: 'queued',
        message: 'Flow test execution queued successfully'
      });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to enqueue flow execution');
      return reply.code(500).send({ error: 'failed to queue execution' });
    }
  });

  // POST /api/flows/:id/execute-from/:nodeId - Execute flow from a specific node (partial execution)
  app.post('/api/flows/:id/execute-from/:nodeId', async (req, reply) => {
    const userId = req.user?.sub;
    // Check execute permission
    if (!userId || !(await app.permissions.can(userId, 'flows', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id, nodeId } = req.params;

    try {
      // Verify access and deployed status
      const flowCheck = await db.query(`
        SELECT id, deployed, definition FROM flows
        WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
      `, [id, userId]);

      if (flowCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      const flow = flowCheck.rows[0];
      const { nodes = [], edges = [] } = flow.definition;

      // Verify node exists
      const targetNode = nodes.find(n => n.id === nodeId);
      if (!targetNode) {
        return reply.code(404).send({ error: 'node not found' });
      }

      // Find all downstream nodes (nodes that depend on this one)
      const downstreamNodes = findDownstreamNodes(nodeId, edges);
      
      // Include the starting node and all its downstream dependents
      const nodesToExecute = [nodeId, ...downstreamNodes];

      req.log.info({ 
        flowId: id, 
        startNode: nodeId, 
        totalNodes: nodesToExecute.length 
      }, 'Partial execution requested');

      // Queue the execution job
      const job = await app.jobs.enqueue('flow_execution', {
        flowId: id,
        userId,
        trigger_node_id: nodeId,
        partial: true,
        nodesToExecute: nodesToExecute
      });

      req.log.info({ 
        flowId: id, 
        jobId: job.id, 
        userId, 
        partialExecution: true,
        startNode: nodeId 
      }, 'Partial flow execution job enqueued');

      reply.send({ 
        jobId: job.id,
        flowId: id,
        startNode: nodeId,
        nodesInSubgraph: nodesToExecute.length,
        status: 'queued',
        message: 'Partial flow execution queued successfully'
      });
    } catch (error) {
      req.log.error({ err: error, flowId: id, nodeId }, 'Failed to enqueue partial execution');
      return reply.code(500).send({ error: 'failed to queue partial execution' });
    }
  });

  // Helper function to find downstream nodes
  function findDownstreamNodes(nodeId, edges) {
    const downstream = new Set();
    const visited = new Set();
    
    function traverse(currentId) {
      if (visited.has(currentId)) return;
      visited.add(currentId);
      
      const outputEdges = edges.filter(e => e.source === currentId);
      outputEdges.forEach(edge => {
        downstream.add(edge.target);
        traverse(edge.target);
      });
    }
    
    traverse(nodeId);
    return Array.from(downstream);
  }

  // GET /api/flows/:id/history - Get execution history for a flow
  app.get('/api/flows/:id/history', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify access to flow
    const flowCheck = await db.query(`
      SELECT id FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    // Get execution history
    const result = await db.query(`
      SELECT 
        id,
        trigger_node_id,
        started_at,
        completed_at,
        status,
        node_outputs,
        error_log,
        execution_time_ms,
        EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 as duration_ms
      FROM flow_executions
      WHERE flow_id = $1
      ORDER BY started_at DESC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM flow_executions WHERE flow_id = $1',
      [id]
    );

    reply.send({ 
      executions: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  });

  // POST /api/flows/:id/nodes/:nodeId/test - Test execute a single node
  app.post('/api/flows/:id/nodes/:nodeId/test', async (req, reply) => {
    const userId = req.user?.sub;
    // Check execute permission
    if (!userId || !(await app.permissions.can(userId, 'flows', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id, nodeId } = req.params;
    const { mockInputData } = req.body; // Optional mock input for testing

    try {
      // Get flow
      const flowResult = await db.query(`
        SELECT id, definition, owner_user_id
        FROM flows
        WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
      `, [id, userId]);

      if (flowResult.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      const flow = flowResult.rows[0];
      const { nodes = [], edges = [], pinData = {} } = flow.definition;

      // Find the node
      const node = nodes.find(n => n.id === nodeId);
      if (!node) {
        return reply.code(404).send({ error: 'node not found' });
      }

      // Check if node has pinned data
      if (pinData[nodeId]) {
        req.log.info({ nodeId, nodeType: node.type }, 'Using pinned data for node test execution');
        
        return reply.send({
          nodeId,
          output: pinData[nodeId],
          executionTime: 0,
          status: 'success',
          pinned: true
        });
      }

      // Import execution function
      const { executeNode: execNode } = await import('../services/flow-executor.js');

      // Create mock execution context
      const execution = {
        id: `test-${Date.now()}`,
        flow_id: id,
        edges: edges,
        test: true
      };

      // Build node outputs map with mock or upstream data
      const nodeOutputs = new Map();
      
      // If mock input provided, use it
      if (mockInputData) {
        // Find source nodes
        const inputEdges = edges.filter(e => e.target === nodeId);
        inputEdges.forEach(edge => {
          nodeOutputs.set(edge.source, mockInputData);
        });
      }

      const startTime = Date.now();

      // Execute the node
      const output = await execNode(node, nodeOutputs, { app, flow, execution });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      req.log.info({ nodeId, nodeType: node.type, executionTime }, 'Node test execution completed');

      // Return result
      reply.send({
        nodeId: node.id,
        nodeType: node.type,
        input: mockInputData || null,
        output: output,
        executionTime,
        status: 'success'
      });

    } catch (error) {
      req.log.error({ err: error, flowId: id, nodeId }, 'Node test execution failed');
      
      return reply.send({
        nodeId,
        output: null,
        error: error.message,
        status: 'error',
        executionTime: 0
      });
    }
  });
}
