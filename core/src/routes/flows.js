/**
 * Flow Studio Routes
 * CRUD operations for workflow definitions
 */

import { ensureFlowResourceTags, updateFlowResourceTagNames } from '../services/flow-resource-metrics.js';
import { getFlowNodeSchema } from '../schemas/FlowNodeSchema.js';

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
      const { CategoryService } = await import('../services/CategoryService.js');
      const categories = await CategoryService.getAllCategories(db);
      
      reply.send({ categories });
    } catch (error) {
      req.log.error({ err: error }, 'Failed to get categories');
      reply.code(500).send({ error: 'Failed to retrieve categories' });
    }
  });

  // GET /api/flows/schema - Get flow node schema definition
  // Requires 'flows:read' permission
  // Returns the schema definition for flow nodes including version, types, and structure
  app.get('/api/flows/schema', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const schema = getFlowNodeSchema();
      reply.send(schema);
    } catch (error) {
      req.log.error({ err: error }, 'Failed to get flow node schema');
      reply.code(500).send({ error: 'Failed to retrieve schema' });
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
        ioRules: desc.ioRules || null, // Parameter-driven dynamic I/O configuration
        properties: desc.properties || [],
        visual: desc.visual || null,
        extensions: desc.extensions || {},
        configUI: desc.configUI || null, // UI configuration for node config panel
        help: desc.help || null, // Help documentation for the node
        library: desc.library // Include library metadata if node is from a library
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
        inputConfiguration: description.inputConfiguration || null,
        ioRules: description.ioRules || null, // Parameter-driven dynamic I/O configuration
        properties: description.properties || [],
        visual: description.visual || null,
        extensions: description.extensions || {},
        configUI: description.configUI || null, // UI configuration for node config panel
        library: description.library // Include library metadata if node is from a library
      });
    } catch (error) {
      req.log.error({ err: error, nodeType: req.params.type }, 'Failed to get node type details');
      reply.code(500).send({ error: 'Failed to retrieve node type details' });
    }
  });

  // GET /api/flows - List flows based on scope parameter
  app.get('/api/flows', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const scope = String(req.query?.scope || 'all');
    let whereClause = 'f.owner_user_id = $1';
    
    if (scope === 'all') {
      // Show both owned and shared flows
      whereClause = '(f.owner_user_id = $1 OR f.shared = true)';
    } else if (scope === 'shared') {
      // Show only shared flows (excluding owned)
      whereClause = 'f.shared = true AND f.owner_user_id != $1';
    }
    // scope === 'mine' uses the default whereClause (owned only)

    const result = await db.query(`
      SELECT 
        f.*,
        u.display_name as owner_name,
        (f.owner_user_id = $1) as is_owner,
        (SELECT COUNT(*) FROM flow_executions WHERE flow_id = f.id) as execution_count,
        (SELECT MAX(started_at) FROM flow_executions WHERE flow_id = f.id) as last_executed_at
      FROM flows f
      LEFT JOIN users u ON f.owner_user_id = u.id
      WHERE ${whereClause}
      ORDER BY f.updated_at DESC
    `, [userId]);

    reply.send({ flows: result.rows });
  });

  // POST /api/flows - Create new flow
  app.post('/api/flows', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { name, description, definition, static_data, execution_mode } = req.body;

    if (!name || !definition) {
      return reply.code(400).send({ error: 'name and definition are required' });
    }

    // Validate execution_mode if provided
    if (execution_mode && !['continuous', 'manual'].includes(execution_mode)) {
      return reply.code(400).send({ error: 'execution_mode must be either "continuous" or "manual"' });
    }

    const result = await db.query(`
      INSERT INTO flows (name, description, owner_user_id, definition, static_data, execution_mode)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description || null, userId, definition, static_data || {}, execution_mode || 'continuous']);

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

  // POST /api/flows/:id/resource-chart - Get or create the resource monitor chart for a flow
  // Idempotent: if flows.resource_chart_id is already set, returns it without creating anything.
  // If missing, only the flow owner can create it (requires flows:update + dashboards:create).
  app.post('/api/flows/:id/resource-chart', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    try {
      await db.query('BEGIN');

      // Lock row to avoid duplicate chart creation if multiple clients open the monitor at once
      const flowRes = await db.query(
        `SELECT id, name, owner_user_id, shared, resource_chart_id
         FROM flows
         WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
         FOR UPDATE`,
        [id, userId]
      );

      if (flowRes.rows.length === 0) {
        await db.query('ROLLBACK');
        return reply.code(404).send({ error: 'flow not found' });
      }

      const flow = flowRes.rows[0];

      // If already set, verify chart still exists before returning
      if (flow.resource_chart_id) {
        const chartExists = await db.query(
          'SELECT id FROM chart_configs WHERE id = $1',
          [flow.resource_chart_id]
        );
        
        if (chartExists.rows.length > 0) {
          await db.query('COMMIT');
          return reply.send({ chart_id: flow.resource_chart_id });
        }
        
        // Chart was deleted, clear stale reference and continue to create new one
        req.log.warn({ flowId: flow.id, chartId: flow.resource_chart_id }, 'Stored chart no longer exists, will create new one');
        await db.query(
          'UPDATE flows SET resource_chart_id = NULL WHERE id = $1',
          [flow.id]
        );
      }

      // Only owner can create/store the chart
      if (flow.owner_user_id !== userId) {
        await db.query('ROLLBACK');
        return reply.code(403).send({ error: 'forbidden' });
      }

      // Route-specific permission checks (modifies DB + creates a chart config)
      if (!(await app.permissions.can(userId, 'flows', 'update'))) {
        await db.query('ROLLBACK');
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!(await app.permissions.can(userId, 'dashboards', 'create'))) {
        await db.query('ROLLBACK');
        return reply.code(403).send({ error: 'forbidden' });
      }

      // Ensure the System connection exists
      const sysConnRes = await db.query(
        `SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true LIMIT 1`
      );
      if (sysConnRes.rows.length === 0) {
        await db.query('ROLLBACK');
        req.log.error({ flowId: id }, 'System connection not found for resource chart creation');
        return reply.code(500).send({ error: 'system_connection_not_found' });
      }
      const systemConnId = sysConnRes.rows[0].id;

      // Ensure tags exist (or are re-activated) so chart can start populating immediately
      let tagIds;
      try {
        tagIds = (await ensureFlowResourceTags(app, { id: flow.id, name: flow.name })) || {};
      } catch (tagError) {
        await db.query('ROLLBACK');
        req.log.error({ err: tagError, flowId: id }, 'Failed to initialize flow resource tags');
        return reply.code(500).send({ error: 'tag_initialization_failed' });
      }

      const flowTagBase = `flow.${flow.id}`;
      const options = {
        version: 1,
        smartCompression: true,
        maxDataPoints: 500,
        tags: [
          {
            tag_id: tagIds.scan_efficiency_pct || null,
            connection_id: systemConnId,
            tag_path: `${flowTagBase}.scan_efficiency_pct`,
            tag_name: `${flow.name} - Scan Efficiency (%)`,
            data_type: 'REAL',
            name: 'Scan Efficiency (%)',
            alias: 'Scan Efficiency (%)',
            color: '#1976d2',
            thickness: 2,
            strokeType: 'solid',
            yAxisId: 'efficiency',
            interpolation: 'linear',
            hidden: false
          },
          {
            tag_id: tagIds.cycles_per_second || null,
            connection_id: systemConnId,
            tag_path: `${flowTagBase}.cycles_per_second`,
            tag_name: `${flow.name} - Cycles/Second`,
            data_type: 'REAL',
            name: 'Cycles/Second',
            alias: 'Cycles/Second',
            color: '#2e7d32',
            thickness: 2,
            strokeType: 'solid',
            yAxisId: 'cycles',
            interpolation: 'linear',
            hidden: false
          },
          {
            tag_id: tagIds.memory_avg_mb || null,
            connection_id: systemConnId,
            tag_path: `${flowTagBase}.memory_avg_mb`,
            tag_name: `${flow.name} - Memory Avg (MB)`,
            data_type: 'REAL',
            name: 'Memory Avg (MB)',
            alias: 'Memory Avg (MB)',
            color: '#dc004e',
            thickness: 2,
            strokeType: 'solid',
            yAxisId: 'memory',
            interpolation: 'linear',
            hidden: false
          },
          {
            tag_id: tagIds.scan_duration_ms || null,
            connection_id: systemConnId,
            tag_path: `${flowTagBase}.scan_duration_ms`,
            tag_name: `${flow.name} - Scan Duration (ms)`,
            data_type: 'REAL',
            name: 'Scan Duration (ms)',
            alias: 'Scan Duration (ms)',
            color: '#ff9800',
            thickness: 2,
            strokeType: 'solid',
            yAxisId: 'scan',
            interpolation: 'linear',
            hidden: false
          }
        ],
        axes: [
          {
            id: 'efficiency',
            orientation: 'right',
            label: 'Scan Efficiency (%)',
            domain: ['auto', 'auto'],
            offset: 0,
            nameLocation: 'inside',
            nameGap: 25
          },
          {
            id: 'cycles',
            orientation: 'right',
            label: 'Cycles/Second',
            domain: ['auto', 'auto'],
            offset: 80,
            nameLocation: 'inside',
            nameGap: 25
          },
          {
            id: 'memory',
            orientation: 'left',
            label: 'Memory Avg (MB)',
            domain: ['auto', 'auto'],
            offset: 0,
            nameLocation: 'inside',
            nameGap: 25
          },
          {
            id: 'scan',
            orientation: 'left',
            label: 'Scan Duration (ms)',
            domain: ['auto', 'auto'],
            offset: 80,
            nameLocation: 'inside',
            nameGap: 25
          }
        ]
      };

      const chartName = `Flow Resources: ${flow.name}`;
      const chartRes = await db.query(
        `INSERT INTO chart_configs (
          user_id, name, time_mode, time_duration, is_shared, is_system_chart, live_enabled, show_time_badge, options
        ) VALUES (
          $1, $2, 'rolling', $3, false, true, true, true, $4
        ) RETURNING id`,
        [userId, chartName, 600000, options]
      );

      const chartId = chartRes.rows[0].id;
      await db.query(
        `UPDATE flows SET resource_chart_id = $1, updated_at = now() WHERE id = $2`,
        [chartId, flow.id]
      );

      await db.query('COMMIT');
      return reply.send({ chart_id: chartId });
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch {}
      req.log.error({ err: error, flowId: id, userId }, 'Failed to get-or-create flow resource chart');
      return reply.code(500).send({ error: 'chart_creation_failed' });
    }
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
      scan_rate_ms,
      execution_mode,
      live_values_use_scan_rate
    } = req.body;

    // Verify ownership and get current state
    const ownerCheck = await db.query(
      'SELECT owner_user_id, test_mode, name FROM flows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    if (ownerCheck.rows[0].owner_user_id !== userId) {
      return reply.code(403).send({ error: 'only owner can update flow' });
    }

    const previousTestMode = ownerCheck.rows[0].test_mode;
    const previousName = ownerCheck.rows[0].name;

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
      // Clean up orphaned edges before saving
      if (definition && definition.nodes && definition.edges) {
        const nodeIds = new Set(definition.nodes.map(n => n.id));
        definition.edges = definition.edges.filter(edge => {
          const hasValidSource = nodeIds.has(edge.source);
          const hasValidTarget = nodeIds.has(edge.target);
          if (!hasValidSource || !hasValidTarget) {
            req.log.debug({ 
              flowId: id, 
              edge, 
              reason: !hasValidSource ? 'invalid source' : 'invalid target' 
            }, 'Removing orphaned edge');
            return false;
          }
          return true;
        });
      }
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
    if (execution_mode !== undefined) {
      // Validate execution_mode
      if (!['continuous', 'manual'].includes(execution_mode)) {
        return reply.code(400).send({ error: 'execution_mode must be either "continuous" or "manual"' });
      }
      updates.push(`execution_mode = $${paramCount++}`);
      values.push(execution_mode);
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
    if (req.body.resource_chart_id !== undefined) {
      updates.push(`resource_chart_id = $${paramCount++}`);
      values.push(req.body.resource_chart_id);
    }
    if (live_values_use_scan_rate !== undefined) {
      updates.push(`live_values_use_scan_rate = $${paramCount++}`);
      values.push(live_values_use_scan_rate);
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

    // Handle flow name change - update resource tag names
    if (name !== undefined && name !== previousName) {
      try {
        await updateFlowResourceTagNames(app, id, previousName, name);
        req.log.info({ flowId: id, oldName: previousName, newName: name }, 'Flow resource tags updated for name change');
      } catch (err) {
        req.log.warn({ err, flowId: id }, 'Failed to update flow resource tag names');
      }
    }

    reply.send({ flow });
  });

  // DELETE /api/flows/:id - Delete flow
  app.delete('/api/flows/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'delete', reply))) return;

    const { id } = req.params;

    // Verify flow exists and user owns it
    const flowResult = await db.query(
      'SELECT id, name, deployed FROM flows WHERE id = $1 AND owner_user_id = $2',
      [id, userId]
    );

    if (flowResult.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found or not owner' });
    }

    const flowId = flowResult.rows[0].id;
    const flowName = flowResult.rows[0].name;
    const deployed = flowResult.rows[0].deployed;

    // Prevent deletion of deployed flows
    if (deployed) {
      return reply.code(400).send({ error: 'cannot delete deployed flow', message: 'Please undeploy the flow before deleting it' });
    }

    // Delete the flow (cascade deletes sessions, logs, etc.)
    await db.query(
      'DELETE FROM flows WHERE id = $1 AND owner_user_id = $2',
      [id, userId]
    );

    // Enqueue background job to clean up flow metrics (tags + time-series data)
    try {
      const job = await app.jobs.enqueue('flow_metrics_cleanup', { flowId });
      req.log.info({ flowId, flowName, jobId: job.id }, 'Flow deleted, metrics cleanup job enqueued');
    } catch (error) {
      req.log.error({ error, flowId, flowName }, 'Failed to enqueue metrics cleanup job');
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
      // Verify ownership and execution mode
      const ownerCheck = await db.query(
        'SELECT owner_user_id, scan_rate_ms, execution_mode FROM flows WHERE id = $1',
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

      // Prevent deployment of manual flows
      if (ownerCheck.rows[0].execution_mode === 'manual') {
        return reply.code(400).send({ 
          error: 'Manual flows cannot be deployed',
          message: 'Manual flows run on-demand only. Use the Execute button instead.'
        });
      }

      const result = await db.query(`
        UPDATE flows
        SET deployed = $1, updated_at = now()
        WHERE id = $2
        RETURNING *
      `, [deployed, id]);

      const flow = result.rows[0];

      // Update tag dependencies when deploying
      if (deployed && flow.definition) {
        const { updateFlowTagDependencies, updateFlowLibraryDependencies } = await import('../services/flow-executor.js');
        await updateFlowTagDependencies(app, id, flow.definition);
        await updateFlowLibraryDependencies(app, id, flow.definition);
        req.log.debug({ flowId: id }, 'Tag and library dependencies updated');
      }

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
    const { name } = req.body || {};

    // Get the original flow (must be owned or shared)
    const original = await db.query(`
      SELECT * FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (original.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const flow = original.rows[0];

    // Use provided name or default to "{name} (Copy)"
    const duplicateName = name?.trim() || `${flow.name} (Copy)`;

    // Create duplicate
    const result = await db.query(`
      INSERT INTO flows (name, description, owner_user_id, definition, static_data, deployed, shared)
      VALUES ($1, $2, $3, $4, $5, false, false)
      RETURNING *
    `, [
      duplicateName,
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

  // POST /api/flows/:id/execute - Execute a flow manually (test run or with parameters)
  app.post('/api/flows/:id/execute', async (req, reply) => {
    const userId = req.user?.sub;
    // Check execute permission (separate from update)
    if (!userId || !(await app.permissions.can(userId, 'flows', 'read'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { id } = req.params;
    let { trigger_node_id, parameters } = req.body;

    // Verify access
    const flowCheck = await db.query(`
      SELECT id, deployed, test_mode, test_disable_writes, definition, execution_mode, exposed_parameters
      FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const flow = flowCheck.rows[0];

    // Manual flows can execute without deployment (on-demand)
    // Continuous flows require deployment or test mode
    if (flow.execution_mode === 'continuous' && !flow.deployed && !flow.test_mode) {
      return reply.code(400).send({ error: 'Continuous flows must be deployed or in test mode before execution' });
    }

    // Validate parameters if provided
    let validatedParameters = null;
    if (parameters) {
      const { validateParameters } = await import('../services/parameterValidator.js');
      const validation = validateParameters(flow.exposed_parameters || [], parameters);
      
      if (!validation.valid) {
        req.log.warn({ flowId: id, errors: validation.errors }, 'Parameter validation failed');
        return reply.code(400).send({ 
          error: 'Invalid parameters',
          details: validation.errors
        });
      }
      
      // Log warnings but continue
      if (validation.warnings.length > 0) {
        req.log.warn({ flowId: id, warnings: validation.warnings }, 'Parameter validation warnings');
      }
      
      validatedParameters = parameters;
    }

    // Enqueue flow execution job
    try {
      const job = await app.jobs.enqueue('flow_execution', {
        flow_id: id,
        trigger_node_id: trigger_node_id || null,
        triggered_by: userId,
        test_run: flow.test_mode || false, // Flag if this is a test run
        test_disable_writes: flow.test_disable_writes || false, // Flag if writes should be disabled
        runtime_parameters: validatedParameters || {} // Include validated parameters
      });

      req.log.info({ 
        flowId: id, 
        jobId: job.id, 
        userId, 
        testRun: flow.test_mode || false,
        hasParameters: !!validatedParameters 
      }, 'Flow execution job enqueued');

      reply.send({ 
        jobId: job.id,
        flowId: id,
        status: 'queued',
        message: validatedParameters ? 'Flow execution with parameters queued successfully' : 'Flow test execution queued successfully'
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

  // GET /api/flows/:id/parameters - Get parameter schema for a flow
  app.get('/api/flows/:id/parameters', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    // Verify access
    const flowCheck = await db.query(`
      SELECT id, exposed_parameters, execution_mode, definition
      FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    const flow = flowCheck.rows[0];
    const parameters = flow.exposed_parameters || [];
    const definition = flow.definition || {};
    const edges = definition.edges || [];

    // Build a map of nodes with incoming connections
    const connectedInputs = new Set();
    for (const edge of edges) {
      if (edge.target && edge.targetHandle) {
        connectedInputs.add(`${edge.target}:${edge.targetHandle}`);
      }
    }

    // Separate inputs and outputs, mark connected inputs as read-only
    const inputs = [];
    const outputs = [];

    for (const param of parameters) {
      const paramCopy = { ...param };
      
      if (param.parameterKind === 'input') {
        // Check if this input has an incoming connection
        const inputKey = `${param.nodeId}:${param.nodeParameter}`;
        paramCopy.readOnly = connectedInputs.has(inputKey);
        inputs.push(paramCopy);
      } else if (param.parameterKind === 'output') {
        // Outputs are always read-only
        paramCopy.readOnly = true;
        outputs.push(paramCopy);
      }
    }

    reply.send({ 
      inputs,
      outputs,
      execution_mode: flow.execution_mode,
      has_parameters: parameters.length > 0
    });
  });

  // PUT /api/flows/:id/parameters - Update exposed parameters
  app.put('/api/flows/:id/parameters', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id } = req.params;
    const { exposed_parameters } = req.body;

    if (!Array.isArray(exposed_parameters)) {
      return reply.code(400).send({ error: 'exposed_parameters must be an array' });
    }

    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT owner_user_id FROM flows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    if (ownerCheck.rows[0].owner_user_id !== userId) {
      return reply.code(403).send({ error: 'only owner can update parameters' });
    }

    // Validate parameter schema
    for (const param of exposed_parameters) {
      if (!param.name || !param.nodeId || !param.nodeParameter) {
        return reply.code(400).send({ 
          error: 'Invalid parameter definition',
          message: 'Each parameter must have: name, nodeId, nodeParameter'
        });
      }
      
      // Validate parameterKind (input or output)
      const validKinds = ['input', 'output'];
      if (!param.parameterKind || !validKinds.includes(param.parameterKind)) {
        return reply.code(400).send({
          error: 'Invalid parameter kind',
          message: `Parameter kind must be one of: ${validKinds.join(', ')}`
        });
      }
      
      // Validate type
      const validTypes = ['string', 'number', 'boolean', 'file', 'directory', 'date', 'datetime', 'options', 'json'];
      if (!param.type || !validTypes.includes(param.type)) {
        return reply.code(400).send({
          error: 'Invalid parameter type',
          message: `Parameter type must be one of: ${validTypes.join(', ')}`
        });
      }
    }

    // Update parameters
    const result = await db.query(`
      UPDATE flows
      SET exposed_parameters = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(exposed_parameters), id]);

    reply.send({ flow: result.rows[0] });
  });

  // GET /api/flows/:id/last-execution - Get last execution outputs
  app.get('/api/flows/:id/last-execution', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    // Verify access
    const flowCheck = await db.query(`
      SELECT id FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    // Get the most recent completed execution
    const result = await db.query(`
      SELECT 
        id,
        started_at,
        completed_at,
        status,
        node_outputs,
        runtime_parameters
      FROM flow_executions
      WHERE flow_id = $1 AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `, [id]);

    if (result.rows.length === 0) {
      return reply.send({ 
        hasExecution: false,
        message: 'No completed executions found'
      });
    }

    const execution = result.rows[0];
    
    reply.send({ 
      hasExecution: true,
      executionId: execution.id,
      completedAt: execution.completed_at,
      status: execution.status,
      outputs: execution.node_outputs || {},
      parameters: execution.runtime_parameters || {}
    });
  });

  // GET /api/flows/:id/execution-events - SSE stream for execution completion events
  // GET /api/flows/:id/execution-events - Server-Sent Events endpoint for flow execution notifications
  // Requires 'read' permission on flows
  // Note: EventSource doesn't support custom headers, so authentication is via query param
  app.get('/api/flows/:id/execution-events', {
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
    const log = app.log.child({ route: 'execution-events', flowId: id, userId });

    // Verify access to this flow
    const flowCheck = await db.query(`
      SELECT id FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable buffering in nginx
    });

    // Send initial comment to establish connection
    reply.raw.write(': connected\n\n');

    // Subscribe to NATS for this flow's execution events
    const subject = `flow.${id}.execution.complete`;
    const sub = app.nats.subscribe(subject, (event) => {
      // Handler is called by nats.js subscribe loop
      // Event processing happens in the async loop below
    });

    log.info({ subject }, 'SSE connection established');

    // Send keepalive every 30 seconds to prevent timeout
    const keepaliveInterval = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch (err) {
        // Ignore write errors (client disconnected)
      }
    }, 30000);

    // Process NATS messages using callback-style iteration to avoid "already yielding" errors
    // Each message is processed independently without blocking
    (async () => {
      try {
        for await (const msg of sub) {
          const event = msg.json();
          
          try {
            // Send event to client
            reply.raw.write(`event: execution-complete\n`);
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
            
            log.info({ executionId: event.executionId }, 'Sent execution completion event');
          } catch (writeErr) {
            // Client disconnected during write, stop processing
            log.warn({ writeErr }, 'Failed to send event, client disconnected');
            break;
          }
        }
      } catch (err) {
        // Subscription closed or errored
        if (err.code !== 'BAD API') {
          log.error({ err }, 'Error in NATS subscription');
        }
      }
    })();

    // Clean up on client disconnect
    req.raw.on('close', () => {
      log.info('Client disconnected, cleaning up');
      clearInterval(keepaliveInterval);
      try {
        sub.unsubscribe();
      } catch (e) {
        // Already unsubscribed
      }
    });
  });

  // GET /api/flows/:id/parameter-history - Get recent parameter executions
  app.get('/api/flows/:id/parameter-history', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;
    const { limit = 10 } = req.query;

    // Verify access
    const flowCheck = await db.query(`
      SELECT id FROM flows
      WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
    `, [id, userId]);

    if (flowCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'flow not found' });
    }

    // Get recent executions with parameters
    const result = await db.query(`
      SELECT 
        id,
        runtime_parameters,
        started_at,
        completed_at,
        status,
        execution_time_ms
      FROM flow_executions
      WHERE flow_id = $1
        AND runtime_parameters IS NOT NULL
        AND jsonb_typeof(runtime_parameters) = 'object'
        AND runtime_parameters::text != '{}'
      ORDER BY started_at DESC
      LIMIT $2
    `, [id, parseInt(limit)]);

    reply.send({ history: result.rows });
  });

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

  // POST /api/flows/:id/nodes/:nodeId/action - Execute node action (Regen, Create sibling, etc.)
  app.post('/api/flows/:id/nodes/:nodeId/action', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    const { id, nodeId } = req.params;
    const { actionName, nodeData } = req.body;

    try {
      // Get flow
      const flowResult = await db.query(
        'SELECT id, definition FROM flows WHERE id = $1',
        [id]
      );

      if (flowResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Flow not found' });
      }

      const flow = flowResult.rows[0];
      const definition = flow.definition;

      // Find node
      const node = definition.nodes.find(n => n.id === nodeId);
      if (!node) {
        return reply.code(404).send({ error: 'Node not found' });
      }

      // Get node instance from registry
      const { NodeRegistry } = await import('../nodes/base/NodeRegistry.js');
      if (!NodeRegistry.has(node.type)) {
        return reply.code(400).send({ error: `Unknown node type: ${node.type}` });
      }

      const nodeInstance = NodeRegistry.getInstance(node.type);

      // Check if node supports actions
      if (!nodeInstance.handleAction || typeof nodeInstance.handleAction !== 'function') {
        return reply.code(400).send({ error: `Node type ${node.type} does not support actions` });
      }

      // Create action context
      const actionContext = {
        node: { ...node, data: nodeData },
        flow: definition,
        nodePosition: node.position
      };

      // Execute action
      const result = await nodeInstance.handleAction(actionName, actionContext);

      if (!result) {
        return reply.code(400).send({ error: `Action ${actionName} returned no result` });
      }

      req.log.info({ nodeId, actionName, result }, 'Node action executed');

      // Return result
      reply.send(result);

    } catch (error) {
      req.log.error({ err: error, flowId: id, nodeId, actionName }, 'Node action execution failed');
      
      return reply.code(500).send({
        error: error.message
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
        subscription = app.nats.subscribe(subject, (logData) => {
          try {
            reply.raw.write(`data: ${JSON.stringify(logData)}\n\n`);
          } catch (parseError) {
            req.log.error({ err: parseError }, 'Failed to write log message');
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

  // POST /api/flows/:id/export - Export flow to JSON
  app.post('/api/flows/:id/export', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { id } = req.params;

    try {
      // Verify user has access to this flow
      const accessCheck = await db.query(`
        SELECT id FROM flows
        WHERE id = $1 AND (owner_user_id = $2 OR shared = true)
      `, [id, userId]);

      if (accessCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Flow not found' });
      }

      const { exportFlow } = await import('../services/flowImportExport.js');
      const exportData = await exportFlow(id, db);

      reply.send(exportData);
    } catch (error) {
      req.log.error({ err: error, flowId: id }, 'Failed to export flow');
      reply.code(500).send({ error: 'Failed to export flow', message: error.message });
    }
  });

  // POST /api/flows/import/validate - Validate flow import data
  app.post('/api/flows/import/validate', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const { importData, connectionMappings } = req.body;

      if (!importData) {
        return reply.code(400).send({ error: 'missing_import_data' });
      }

      const { validateImport } = await import('../services/flowImportExport.js');
      const validation = await validateImport(importData, db, connectionMappings || {});

      reply.send(validation);
    } catch (error) {
      req.log.error({ err: error }, 'Failed to validate flow import');
      reply.code(500).send({ error: 'Failed to validate import', message: error.message });
    }
  });

  // POST /api/flows/import/execute - Execute flow import after validation
  app.post('/api/flows/import/execute', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    try {
      const { importData, validation, newName, connectionMappings } = req.body;

      if (!importData || !validation) {
        return reply.code(400).send({ error: 'missing_import_data_or_validation' });
      }

      if (!validation.valid) {
        return reply.code(400).send({ error: 'validation_failed', details: validation.errors });
      }

      const { importFlow } = await import('../services/flowImportExport.js');
      const result = await importFlow(importData, userId, validation, db, newName, connectionMappings || {});

      req.log.info({ 
        userId, 
        flowId: result.flow.id,
        flowName: result.flow.name,
        importedNodes: result.imported_nodes,
        importedConnections: result.imported_connections,
        importedTags: result.imported_tags
      }, 'Flow imported successfully');

      reply.code(201).send(result);
    } catch (error) {
      req.log.error({ err: error, userId }, 'Failed to execute flow import');
      reply.code(500).send({ error: 'Failed to import flow', message: error.message });
    }
  });
}
