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

  // GET /api/flows/categories - Get category and section definitions
  // Requires 'flows:read' permission
  // Returns the hierarchical structure of categories and sections for the node palette
  app.get('/api/flows/categories', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const { getAllCategories } = await import('../nodes/base/CategoryDefinitions.js');
      const categories = getAllCategories();
      
      reply.send({ categories });
    } catch (error) {
      req.log.error({ err: error }, 'Failed to get categories');
      reply.code(500).send({ error: 'Failed to retrieve categories' });
    }
  });

  // GET /api/flows/node-types - Get all available node types
  // Requires 'flows:read' permission
  // NOTE: This is the authoritative source for node type metadata. Frontend should eventually
  // fetch this data instead of maintaining duplicate static metadata in nodeTypes.js
  app.get('/api/flows/node-types', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const { NodeRegistry } = await import('../nodes/base/NodeRegistry.js');
      const descriptions = NodeRegistry.getAllDescriptions();
      
      // Transform to array format for easier frontend consumption
      // Include all fields from description (icon, color, category, section, visual, etc.)
      const nodeTypes = Object.entries(descriptions).map(([type, desc]) => ({
        type,
        displayName: desc.displayName,
        name: desc.name,
        version: desc.version,
        description: desc.description,
        category: desc.category || 'OTHER',
        section: desc.section || 'BASIC',
        icon: desc.icon || '📦',
        color: desc.color || '#666666',
        schemaVersion: desc.schemaVersion || 1,
        inputs: desc.inputs || [],
        outputs: desc.outputs || [],
        inputConfiguration: desc.inputConfiguration || null,
        properties: desc.properties || [],
        visual: desc.visual || null,
        extensions: desc.extensions || {}
      }));
      
      reply.send({ 
        nodeTypes,
        count: nodeTypes.length
      });
    } catch (error) {
      req.log.error({ err: error }, 'Failed to get node types');
      reply.code(500).send({ error: 'Failed to retrieve node types' });
    }
  });

  // GET /api/flows/node-types/:type - Get specific node type details
  // Requires 'flows:read' permission
  // NOTE: Returns complete node description including inputs, outputs, and properties from NodeRegistry
  app.get('/api/flows/node-types/:type', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const { type } = req.params;
      const { NodeRegistry } = await import('../nodes/base/NodeRegistry.js');
      
      if (!NodeRegistry.has(type)) {
        return reply.code(404).send({ error: `Node type '${type}' not found` });
      }
      
      const description = NodeRegistry.getDescription(type);
      
      // Return complete description with all standard fields
      reply.send({
        type,
        displayName: description.displayName,
        name: description.name,
        version: description.version,
        description: description.description,
        category: description.category || 'OTHER',
        section: description.section || 'BASIC',
        icon: description.icon || '📦',
        color: description.color || '#666666',
        schemaVersion: description.schemaVersion || 1,
        inputs: description.inputs || [],
        outputs: description.outputs || [],
        properties: description.properties || [],
        visual: description.visual || null,
        extensions: description.extensions || {}
      });
    } catch (error) {
      req.log.error({ err: error, nodeType: req.params.type }, 'Failed to get node type details');
      reply.code(500).send({ error: 'Failed to retrieve node type details' });
    }
  });

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

    const flow = result.rows[0];

    // Enrich flow definition with current connection data
    if (flow.definition && flow.definition.nodes) {
      // Get all unique connection IDs from nodes
      const connectionIds = new Set();
      flow.definition.nodes.forEach(node => {
        if (node.data?.connectionId) {
          connectionIds.add(node.data.connectionId);
        }
      });

      // Fetch connection data if we have any connection IDs
      if (connectionIds.size > 0) {
        const connectionsResult = await db.query(`
          SELECT id, name, type as driver_type
          FROM connections
          WHERE id = ANY($1)
        `, [Array.from(connectionIds)]);

        // Create lookup map
        const connectionsMap = {};
        connectionsResult.rows.forEach(conn => {
          connectionsMap[conn.id] = {
            name: conn.name,
            driverType: conn.driver_type
          };
        });

        // Enrich nodes with current connection data
        flow.definition.nodes = flow.definition.nodes.map(node => {
          if (node.data?.connectionId && connectionsMap[node.data.connectionId]) {
            const conn = connectionsMap[node.data.connectionId];
            return {
              ...node,
              data: {
                ...node.data,
                connectionName: conn.name,
                driverType: conn.driverType
              }
            };
          }
          return node;
        });
      }
    }

    reply.send({ flow });
  });

  // PUT /api/flows/:id - Update flow
  app.put('/api/flows/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;
    const { 
      name, 
      description, 
      definition, 
      static_data, 
      deployed, 
      shared, 
      test_mode, 
      test_disable_writes, 
      test_auto_exit, 
      test_auto_exit_minutes,
      logs_enabled,
      logs_retention_days,
      scan_rate_ms
    } = req.body;

    // Verify ownership and get current state
    const ownerCheck = await db.query(
      'SELECT owner_user_id, test_mode FROM flows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    if (ownerCheck.rows[0].owner_user_id !== userId) {
      return reply.code(403).send({ error: 'only owner can update flow' });
    }

    const previousTestMode = ownerCheck.rows[0].test_mode;

    // Validate log retention if provided
    if (logs_retention_days !== undefined) {
      const retention = parseInt(logs_retention_days);
      if (isNaN(retention) || retention < 1 || retention > 365) {
        return reply.code(400).send({ error: 'logs_retention_days must be between 1 and 365' });
      }
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
    if (test_mode !== undefined) {
      updates.push(`test_mode = $${paramCount++}`);
      values.push(test_mode);
    }
    if (test_disable_writes !== undefined) {
      updates.push(`test_disable_writes = $${paramCount++}`);
      values.push(test_disable_writes);
    }
    if (test_auto_exit !== undefined) {
      updates.push(`test_auto_exit = $${paramCount++}`);
      values.push(test_auto_exit);
    }
    if (test_auto_exit_minutes !== undefined) {
      updates.push(`test_auto_exit_minutes = $${paramCount++}`);
      values.push(test_auto_exit_minutes);
    }
    if (logs_enabled !== undefined) {
      updates.push(`logs_enabled = $${paramCount++}`);
      values.push(logs_enabled);
    }
    if (logs_retention_days !== undefined) {
      updates.push(`logs_retention_days = $${paramCount++}`);
      values.push(logs_retention_days);
    }
    if (scan_rate_ms !== undefined) {
      // Validate scan rate
      const rate = parseInt(scan_rate_ms);
      if (isNaN(rate) || rate < 100 || rate > 60000) {
        return reply.code(400).send({ error: 'scan_rate_ms must be between 100 and 60000' });
      }
      updates.push(`scan_rate_ms = $${paramCount++}`);
      values.push(rate);
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await db.query(`
      UPDATE flows
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    const flow = result.rows[0];

    // Log test mode changes
    if (test_mode !== undefined && test_mode !== previousTestMode) {
      const logMessage = test_mode 
        ? `🧪 Test mode started${test_disable_writes ? ' (writes disabled)' : ''}${test_auto_exit ? ` - auto-exit in ${Math.round(test_auto_exit_minutes)} min` : ''}`
        : '🛑 Test mode stopped';
      
      const logMetadata = {
        action: test_mode ? 'test_mode_start' : 'test_mode_stop',
        disable_writes: test_disable_writes || false,
        auto_exit: test_auto_exit || false,
        auto_exit_minutes: test_auto_exit_minutes || null
      };

      // Insert system log directly to database (execution_id is NULL for system logs)
      try {
        const timestamp = new Date();
        await db.query(
          `INSERT INTO flow_execution_logs 
           (execution_id, flow_id, node_id, log_level, message, timestamp, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            null, // System log, not associated with a specific execution
            id,
            null, // System log, not associated with a node
            'info',
            logMessage,
            timestamp,
            JSON.stringify(logMetadata)
          ]
        );
      } catch (logErr) {
        console.error('Failed to log test mode change:', logErr);
      }

      // Auto-start session if entering test mode
      if (test_mode) {
        const scanRateMs = flow.scan_rate_ms || 1000;
        await db.query(`
          INSERT INTO jobs (type, params, status, created_at)
          VALUES ('flow_execution', $1, 'queued', now())
        `, [JSON.stringify({ flow_id: id, scanRateMs })]);
        req.log.info({ flowId: id, scanRateMs }, 'Test mode started, execution job queued');
      } else {
        // Stop active session when exiting test mode
        const { FlowSession } = await import('../services/flow-session.js');
        const stopped = await FlowSession.stopSessionByFlowId(id);
        if (stopped) {
          req.log.info({ flowId: id }, 'Active flow session stopped on test mode exit');
        } else {
          // If no active session in memory, update database anyway
          await db.query(
            `UPDATE flow_sessions
             SET status = 'stopped',
                 stopped_at = now(),
                 updated_at = now()
             WHERE flow_id = $1 AND status = 'active'`,
            [id]
          );
        }
        
        // Clear runtime state for the flow
        app.runtimeState.clearFlow(id);
        req.log.info({ flowId: id }, 'Test mode stopped and runtime state cleared');
      }
    }

    reply.send({ flow });
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

    try {
      // Verify ownership
      const ownerCheck = await db.query(
        'SELECT owner_user_id, scan_rate_ms FROM flows WHERE id = $1',
        [id]
      );

      if (ownerCheck.rows.length === 0) {
        req.log.warn({ flowId: id }, 'Deploy failed: flow not found');
        return reply.code(404).send({ error: 'flow not found' });
      }

      if (ownerCheck.rows[0].owner_user_id !== userId) {
        req.log.warn({ flowId: id, userId }, 'Deploy failed: not owner');
        return reply.code(403).send({ error: 'only owner can deploy flow' });
      }

      const result = await db.query(`
        UPDATE flows
        SET deployed = $1, updated_at = now()
        WHERE id = $2
        RETURNING *
      `, [deployed, id]);

      const flow = result.rows[0];

      // Auto-start session if deploying
      if (deployed) {
        // Initialize runtime state for the flow
        app.runtimeState.initFlow(id);
        req.log.debug({ flowId: id }, 'RuntimeState initialized for flow');
        
        const scanRateMs = flow.scan_rate_ms || 1000;
        await db.query(`
          INSERT INTO jobs (type, params, status, created_at)
          VALUES ('flow_execution', $1, 'queued', now())
        `, [JSON.stringify({ flow_id: id, scanRateMs })]);
        req.log.info({ flowId: id, scanRateMs }, 'Flow deployed and execution job queued');
      } else {
        // Stop active session when undeploying
        const { FlowSession } = await import('../services/flow-session.js');
        const stopped = await FlowSession.stopSessionByFlowId(id);
        if (stopped) {
          req.log.info({ flowId: id }, 'Active flow session stopped on undeploy');
        } else {
          // If no active session in memory, update database anyway
          await db.query(
            `UPDATE flow_sessions
             SET status = 'stopped',
                 stopped_at = now(),
                 updated_at = now()
             WHERE flow_id = $1 AND status = 'active'`,
            [id]
          );
        }
        
        // Clear runtime state for the flow
        app.runtimeState.clearFlow(id);
        req.log.info({ flowId: id }, 'Flow undeployed and runtime state cleared');
      }

      reply.send({ flow });
    } catch (error) {
      req.log.error({ flowId: id, error: error.message, stack: error.stack }, 'Deploy flow failed');
      
      // Log error to flow execution logs so user can see it in the UI
      try {
        await db.query(
          `INSERT INTO flow_execution_logs 
           (execution_id, flow_id, node_id, log_level, message, timestamp, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            null, // System log, not associated with a specific execution
            id,
            null, // System log, not associated with a node
            'error',
            `Failed to deploy flow: ${error.message}`,
            new Date(),
            JSON.stringify({ 
              error: error.message, 
              stack: error.stack,
              action: 'deploy',
              deployed: deployed
            })
          ]
        );
      } catch (logErr) {
        req.log.error({ err: logErr }, 'Failed to write deployment error to flow logs');
      }
      
      return reply.code(500).send({ error: 'deployment failed', details: error.message });
    }
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

    // Verify access
    const flowCheck = await db.query(`
      SELECT id, deployed, test_mode, test_disable_writes, definition
      FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const flow = flowCheck.rows[0];

    // Allow execution if deployed OR in test mode
    if (!flow.deployed && !flow.test_mode) {
      return reply.code(400).send({ error: 'flow must be deployed or in test mode before execution' });
    }

    // Test Run: Bypass trigger type and start from first trigger node
    // This allows testing flows with event/schedule triggers via the UI button
    if (!trigger_node_id) {
      const definition = flow.definition;
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
        test_run: flow.test_mode || false, // Flag if this is a test run
        test_disable_writes: flow.test_disable_writes || false // Flag if writes should be disabled
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

  // POST /api/flows/:id/trigger/:nodeId - Fire a manual trigger node (for continuous flows)
  app.post('/api/flows/:id/trigger/:nodeId', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'flows', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id, nodeId } = req.params;

    // Get flow and verify access
    const flowCheck = await db.query(`
      SELECT id, definition
      FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const flow = flowCheck.rows[0];
    const { nodes = [] } = flow.definition;

    // Find the trigger node
    const triggerNode = nodes.find(n => n.id === nodeId);
    if (!triggerNode) {
      return reply.code(404).send({ error: 'node not found' });
    }

    if (triggerNode.type !== 'trigger-manual') {
      return reply.code(400).send({ error: 'node is not a manual trigger' });
    }

    // Set trigger flag in RuntimeStateStore (in-memory, runtime state)
    app.runtimeState.setTriggerFlag(id, nodeId, true);
    req.log.info({ flowId: id, nodeId, userId }, 'Manual trigger flag set in RuntimeStateStore');

    reply.send({ 
      success: true,
      nodeId,
      message: 'Trigger fired, will execute on next scan'
    });
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

  // GET /api/flows/:id/logs - Get logs for a flow
  app.get('/api/flows/:id/logs', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;
    const { 
      execution_id, 
      node_id, 
      log_level, 
      since, 
      limit = 1000,
      offset = 0 
    } = req.query;

    try {
      // Verify access to flow
      const flowCheck = await db.query(`
        SELECT id FROM flows
        WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
      `, [id, userId]);

      if (flowCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      // Build query with filters
      let query = `
        SELECT 
          l.id,
          l.execution_id,
          l.flow_id,
          l.node_id,
          l.log_level,
          l.message,
          l.timestamp,
          l.metadata,
          l.created_at
        FROM flow_execution_logs l
        WHERE l.flow_id = $1
      `;
      const params = [id];
      let paramCount = 2;

      if (execution_id) {
        query += ` AND l.execution_id = $${paramCount++}`;
        params.push(execution_id);
      }

      if (node_id) {
        query += ` AND l.node_id = $${paramCount++}`;
        params.push(node_id);
      }

      if (log_level) {
        query += ` AND l.log_level = $${paramCount++}`;
        params.push(log_level);
      }

      if (since) {
        query += ` AND l.timestamp >= $${paramCount++}`;
        params.push(since);
      }

      query += ` ORDER BY l.timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM flow_execution_logs WHERE flow_id = $1`;
      const countParams = [id];
      const countResult = await db.query(countQuery, countParams);

      reply.send({
        logs: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to fetch flow logs');
      reply.code(500).send({ error: 'Failed to fetch logs' });
    }
  });

  // GET /api/flows/:id/executions/:execId/logs - Get logs for specific execution
  app.get('/api/flows/:id/executions/:execId/logs', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id, execId } = req.params;

    try {
      // Verify access to flow
      const flowCheck = await db.query(`
        SELECT id FROM flows
        WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
      `, [id, userId]);

      if (flowCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      // Get logs for this execution
      const result = await db.query(`
        SELECT 
          id,
          execution_id,
          flow_id,
          node_id,
          log_level,
          message,
          timestamp,
          metadata,
          created_at
        FROM flow_execution_logs
        WHERE flow_id = $1 AND execution_id = $2
        ORDER BY timestamp ASC
      `, [id, execId]);

      reply.send({ logs: result.rows });
    } catch (error) {
      req.log.error({ err: error, flowId: id, executionId: execId }, 'Failed to fetch execution logs');
      reply.code(500).send({ error: 'Failed to fetch execution logs' });
    }
  });

  // POST /api/flows/:id/logs/clear - Clear logs for a flow
  app.post('/api/flows/:id/logs/clear', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;

    try {
      // Verify ownership
      const ownerCheck = await db.query(
        'SELECT owner_user_id FROM flows WHERE id = $1',
        [id]
      );

      if (ownerCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      if (ownerCheck.rows[0].owner_user_id !== userId) {
        return reply.code(403).send({ error: 'only owner can clear logs' });
      }

      // Delete logs
      const result = await db.query(
        'DELETE FROM flow_execution_logs WHERE flow_id = $1',
        [id]
      );

      req.log.info({ flowId: id, deletedCount: result.rowCount }, 'Flow logs cleared');

      reply.send({ 
        success: true, 
        deletedCount: result.rowCount 
      });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to clear logs');
      reply.code(500).send({ error: 'Failed to clear logs' });
    }
  });

  // PUT /api/flows/:id/logs/config - Update log retention settings
  app.put('/api/flows/:id/logs/config', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;
    const { logs_enabled, logs_retention_days } = req.body;

    try {
      // Verify ownership
      const ownerCheck = await db.query(
        'SELECT owner_user_id FROM flows WHERE id = $1',
        [id]
      );

      if (ownerCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      if (ownerCheck.rows[0].owner_user_id !== userId) {
        return reply.code(403).send({ error: 'only owner can update log settings' });
      }

      // Validate retention days
      if (logs_retention_days !== undefined) {
        const days = parseInt(logs_retention_days);
        if (isNaN(days) || days < 1 || days > 365) {
          return reply.code(400).send({ error: 'logs_retention_days must be between 1 and 365' });
        }
      }

      // Update settings
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (logs_enabled !== undefined) {
        updates.push(`logs_enabled = $${paramCount++}`);
        values.push(logs_enabled);
      }

      if (logs_retention_days !== undefined) {
        updates.push(`logs_retention_days = $${paramCount++}`);
        values.push(logs_retention_days);
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'no settings provided' });
      }

      updates.push(`updated_at = now()`);
      values.push(id);

      const result = await db.query(
        `UPDATE flows SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING logs_enabled, logs_retention_days`,
        values
      );

      req.log.info({ flowId: id, settings: result.rows[0] }, 'Log settings updated');

      reply.send({ 
        success: true,
        settings: result.rows[0]
      });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to update log settings');
      reply.code(500).send({ error: 'Failed to update log settings' });
    }
  });

  // GET /api/flows/:id/logs/stream - Server-Sent Events endpoint for live log updates
  // Requires 'read' permission on flows
  // Note: EventSource doesn't support custom headers, so authentication is via query param
  app.get('/api/flows/:id/logs/stream', {
    preHandler: async (req, reply) => {
      // Handle token from query parameter for EventSource compatibility
      const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        reply.code(401).send({ error: 'unauthorized' });
        return;
      }
      
      try {
        const payload = await app.jwtVerify(token);
        req.user = { sub: payload.sub, role: payload.role || 'viewer', jti: payload.jti };
      } catch (error) {
        reply.code(401).send({ error: 'unauthorized' });
        return;
      }
    }
  }, async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    // Verify flow exists and user has access
    const flowCheck = await db.query(
      'SELECT id, owner_user_id FROM flows WHERE id = $1',
      [id]
    );

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Subscribe to NATS for this flow's logs
    const subject = `df.logs.${id}`;
    let subscription = null;

    try {
      if (app.nats && app.nats.healthy && app.nats.healthy()) {
        subscription = await app.nats.subscribe(subject, (err, msg) => {
          if (err) {
            req.log.error({ err, flowId: id }, 'NATS subscription error');
            return;
          }

          try {
            const logData = typeof msg === 'string' ? JSON.parse(msg) : msg;
            reply.raw.write(`data: ${JSON.stringify(logData)}\n\n`);
          } catch (parseError) {
            req.log.error({ err: parseError }, 'Failed to parse log message');
          }
        });

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeat = setInterval(() => {
          reply.raw.write(': heartbeat\n\n');
        }, 30000);

        // Cleanup on connection close
        req.raw.on('close', () => {
          clearInterval(heartbeat);
          if (subscription) {
            subscription.unsubscribe();
          }
          req.log.info({ flowId: id }, 'SSE connection closed');
        });
      } else {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'NATS not available' })}\n\n`);
        reply.raw.end();
      }
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to set up log stream');
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to set up log stream' })}\n\n`);
      reply.raw.end();
    }
  });

  // POST /api/flows/:id/sessions/start - Start continuous flow session
  app.post('/api/flows/:id/sessions/start', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;

    try {
      // Verify ownership
      const { rows } = await db.query(
        'SELECT scan_rate_ms FROM flows WHERE id = $1 AND owner_user_id = $2',
        [id, userId]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found or access denied' });
      }

      const flow = rows[0];

      // Check if session already active
      const activeCheck = await db.query(
        'SELECT id FROM flow_sessions WHERE flow_id = $1 AND status = $2',
        [id, 'active']
      );

      if (activeCheck.rows.length > 0) {
        return reply.code(409).send({ error: 'session already active' });
      }

      // Queue flow execution job
      await db.query(
        `INSERT INTO jobs (type, params, status) VALUES ($1, $2, $3)`,
        ['flow_execution', JSON.stringify({ flow_id: id }), 'queued']
      );

      reply.send({ success: true, message: 'session starting' });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'failed to start flow session');
      reply.code(500).send({ error: 'failed to start flow session' });
    }
  });

  // POST /api/flows/:id/sessions/:sessionId/stop - Stop flow session
  app.post('/api/flows/:id/sessions/:sessionId/stop', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id, sessionId } = req.params;

    try {
      // Verify ownership
      const ownerCheck = await db.query(
        'SELECT owner_user_id FROM flows WHERE id = $1',
        [id]
      );

      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].owner_user_id !== userId) {
        return reply.code(404).send({ error: 'flow not found or access denied' });
      }

      // Stop session
      const { rows } = await db.query(
        `UPDATE flow_sessions 
         SET status = 'stopped', 
             stopped_at = now(), 
             updated_at = now()
         WHERE id = $1 AND flow_id = $2 AND status = 'active'
         RETURNING id, scan_count`,
        [sessionId, id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'active session not found' });
      }

      reply.send({ success: true, session: rows[0] });
    } catch (error) {
      req.log.error({ err: error, flowId: id, sessionId }, 'failed to stop flow session');
      reply.code(500).send({ error: 'failed to stop flow session' });
    }
  });

  // GET /api/flows/:id/sessions/active - Get active session status
  app.get('/api/flows/:id/sessions/active', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    try {
      const { rows } = await db.query(
        `SELECT fs.id, fs.flow_id, fs.status, fs.started_at, fs.last_scan_at, 
                fs.scan_count, fs.error_message,
                EXTRACT(EPOCH FROM (now() - fs.started_at))::int as runtime_seconds
         FROM flow_sessions fs
         JOIN flows f ON fs.flow_id = f.id
         WHERE fs.flow_id = $1 AND fs.status = 'active' AND f.owner_user_id = $2
         ORDER BY fs.started_at DESC
         LIMIT 1`,
        [id, userId]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ session: null });
      }

      reply.send({ session: rows[0] });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'failed to fetch session status');
      reply.code(500).send({ error: 'failed to fetch session status' });
    }
  });

  // POST /api/flows/:id/calculate-execution-order - Calculate execution order for flow
  // Requires 'flows:read' permission
  // Returns ordered array of node IDs showing execution sequence
  app.post('/api/flows/:id/calculate-execution-order', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    try {
      // Verify access to flow
      const flowCheck = await db.query(`
        SELECT id, definition FROM flows
        WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
      `, [id, userId]);

      if (flowCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'flow not found' });
      }

      const flow = flowCheck.rows[0];
      const { nodes = [], edges = [] } = flow.definition;

      // Import topological sort function
      const { topologicalSort } = await import('../services/flow-executor.js');

      // Filter out passive nodes (like comments) that don't execute
      const passiveNodeTypes = ['comment'];
      const nodesToSort = nodes.filter(n => !passiveNodeTypes.includes(n.type));

      // Calculate execution order
      const executionOrder = topologicalSort(nodesToSort, edges);

      // Build response with node details
      const orderedNodes = executionOrder.map((nodeId, index) => {
        const node = nodes.find(n => n.id === nodeId);
        return {
          nodeId,
          order: index + 1,
          type: node?.type,
          label: node?.data?.label || node?.type
        };
      });

      req.log.info({ flowId: id, totalNodes: orderedNodes.length }, 'Execution order calculated');

      reply.send({ 
        flowId: id,
        executionOrder: orderedNodes,
        totalNodes: orderedNodes.length
      });
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to calculate execution order');
      
      // Handle specific error cases
      if (error.message?.includes('cycle')) {
        return reply.code(400).send({ 
          error: 'Flow contains cycles or unreachable nodes',
          details: error.message 
        });
      }

      reply.code(500).send({ error: 'Failed to calculate execution order' });
    }
  });
}
