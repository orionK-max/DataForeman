// Charts CRUD routes
// Implements per-user ownership and shared visibility for saved chart configurations.
// Non-owners cannot modify shared charts but may duplicate them.

import { validateChartConfig, getOptionCounts } from '../services/chartValidator.js';
import { getChartSchema } from '../schemas/ChartConfigSchema.js';
import { exportChart, validateImport, importChart } from '../services/chartImportExport.js';

export async function chartsRoutes(app) {
  // All endpoints require authenticated user
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user?.sub) return reply.code(401).send({ error: 'unauthorized' });
  });

  // Permission check helper
  async function checkPermission(userId, operation, reply) {
    if (!userId || !(await app.permissions.can(userId, 'dashboards', operation))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  }

  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  function ensureValidId(req, reply) {
    if (!uuidRe.test(req.params.id || '')) return reply.code(400).send({ error: 'invalid_id' });
  }

  // Legacy validation function - now uses new validator
  function validatePayload(body, { partial = false } = {}) {
    const result = validateChartConfig(body, { partial });
    return {
      errors: result.errors,
      value: result.value
    };
  }

  // Legacy helper - now uses new validator
  function optionCounts(opts) {
    return getOptionCounts(opts);
  }

  function logEvent(level, evt, data) {
    try {
      const payload = { component: 'charts', event: evt, ...data };
      (app.log[level] || app.log.info).call(app.log, payload, evt);
    } catch {/* swallow */}
  }

  async function fetchVisible(id, userId) {
    const q = `select *, (user_id = $2) as is_owner, COALESCE(jsonb_array_length(options->'tags'),0) as tag_count
               from chart_configs
               where id=$1 and is_deleted=false and (user_id=$2 or is_shared=true or is_system_chart=true)`;
    const { rows } = await app.db.query(q, [id, userId]);
    return rows[0] || null;
  }
  async function fetchOwned(id, userId) {
    const q = `select * from chart_configs where id=$1 and user_id=$2 and is_deleted=false`;
    const { rows } = await app.db.query(q, [id, userId]);
    return rows[0] || null;
  }

  // GET /schema - Get chart configuration schema
  // Requires 'dashboards:read' permission
  // Returns the complete schema definition for chart configurations
  // Similar to /api/flows/node-types but for chart structure
  app.get('/schema', async (req, reply) => {
    const userId = req.user?.sub;
    await checkPermission(userId, 'read', reply);
    
    try {
      const schema = getChartSchema();
      reply.send({
        schemaVersion: schema.schemaVersion,
        config: schema.config,
        options: schema.options,
        limits: schema.limits,
        description: 'Chart configuration schema definition'
      });
    } catch (error) {
      app.log.error({ err: error }, 'Failed to get chart schema');
      reply.code(500).send({ error: 'Failed to retrieve chart schema' });
    }
  });

  // POST / (create)
  app.post('/', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);
    
    const { errors, value } = validatePayload(req.body || {}, { partial: false });
    if (errors.length) {
      logEvent('warn', 'chart.validation_failed', { user_id: userId, action: 'create', errors });
      return reply.code(400).send({ error: 'validation_failed', details: errors });
    }
    const { name, time_from, time_to, is_shared, is_system_chart, time_mode, time_duration, time_offset, live_enabled, show_time_badge, options } = value;
    try {
      const q = `insert into chart_configs (user_id, name, time_from, time_to, is_shared, is_system_chart, time_mode, time_duration, time_offset, live_enabled, show_time_badge, options)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 returning *`;
      const { rows } = await app.db.query(q, [userId, name, time_from, time_to, is_shared, is_system_chart || false, time_mode, time_duration, time_offset, live_enabled, show_time_badge, options]);
  const row = rows[0];
  logEvent('info', 'chart.create', { user_id: userId, chart_id: row.id, shared: row.is_shared, ...optionCounts(row.options) });
  try { await app.audit('chart.create', { outcome: 'success', actor_user_id: userId, metadata: { chart_id: row.id, shared: row.is_shared, ...optionCounts(row.options) } }); } catch {}
      return reply.code(201).send({ ...row, is_owner: true, tag_count: (options?.tags || []).length });
    } catch (e) {
      logEvent('error', 'chart.create_failed', { user_id: userId, error: e?.message });
      try { await app.audit('chart.create', { outcome: 'failure', actor_user_id: userId, metadata: { error: e?.message } }); } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // GET / (list summaries)
  app.get('/', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);
    
    const scope = String(req.query?.scope || 'all');
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 50)));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const baseCols = `id,name,created_at,updated_at,is_shared,is_system_chart,(user_id=$1) as is_owner,COALESCE(jsonb_array_length(options->'tags'),0) as tag_count,options`;
    // Exclude system charts - they're for diagnostics only, not for Chart Composer
    let where = 'is_deleted=false and is_system_chart=false and (user_id=$1 or is_shared=true)';
    if (scope === 'mine') where = 'is_deleted=false and is_system_chart=false and user_id=$1';
    else if (scope === 'shared') where = 'is_deleted=false and is_system_chart=false and is_shared=true';
    const q = `select ${baseCols} from chart_configs where ${where} order by updated_at desc limit $2 offset $3`;
    const { rows } = await app.db.query(q, [userId, limit, offset]);
    return { items: rows, limit, offset, count: rows.length };
  });

  // GET /capacity-charts (get or initialize system capacity charts for diagnostics)
  // MUST be before GET /:id to avoid being caught by the :id parameter
  app.get('/capacity-charts', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);
    const systemUserId = '00000000-0000-0000-0000-000000000000'; // System charts belong to system user
    
    try {
      // Get the System connection ID and its tags
      const sysConnQ = `SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true`;
      const sysConnRes = await app.db.query(sysConnQ);
      if (sysConnRes.rows.length === 0) {
        return reply.code(500).send({ error: 'system_connection_not_found' });
      }
      const systemConnectionId = sysConnRes.rows[0].id;

      // Get system tags for the charts
      const tagsQ = `SELECT connection_id, tag_id, tag_path, tag_name, data_type 
                     FROM tag_metadata 
                     WHERE connection_id = $1 AND is_subscribed = true`;
      const tagsRes = await app.db.query(tagsQ, [systemConnectionId]);
      const systemTags = new Map(tagsRes.rows.map(t => [t.tag_path, t]));
    
    // Chart definitions for the 3 capacity charts
    const capacityChartDefs = [
      {
        key: 'capacity-lan',
        name: 'LAN Throughput',
        options: {
          version: 1,
          tags: [
            systemTags.get('net_rx_bps') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('net_rx_bps').tag_id,
              tag_path: 'net_rx_bps',
              tag_name: 'Network RX (bps)',
              data_type: 'REAL',
              name: 'RX (MB/s)',
              alias: null,
              color: '#3b82f6',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'default',
              interpolation: 'linear',
              hidden: false
            } : null,
            systemTags.get('net_tx_bps') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('net_tx_bps').tag_id,
              tag_path: 'net_tx_bps',
              tag_name: 'Network TX (bps)',
              data_type: 'REAL',
              name: 'TX (MB/s)',
              alias: null,
              color: '#10b981',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'default',
              interpolation: 'linear',
              hidden: false
            } : null
          ].filter(t => t !== null),
          axes: [
            { id: 'default', label: 'MB/s', orientation: 'left', domain: ['auto', 'auto'] }
          ],
          referenceLines: [],
          criticalRanges: [],
          derived: [],
          grid: { color: '#374151', opacity: 0.3, thickness: 1, dash: 'solid' },
          background: { color: '#000000', opacity: 1 },
          display: { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
          series: [
            { dataKey: 'rx', label: 'RX (MB/s)', color: '#3b82f6', yAxisId: 'default' },
            { dataKey: 'tx', label: 'TX (MB/s)', color: '#10b981', yAxisId: 'default' }
          ]
        }
      },
      {
        key: 'capacity-system',
        name: 'System Resources',
        options: {
          version: 1,
          tags: [
            systemTags.get('cpu_pct') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('cpu_pct').tag_id,
              tag_path: 'cpu_pct',
              tag_name: 'CPU Usage %',
              data_type: 'REAL',
              name: 'CPU %',
              alias: null,
              color: '#ef4444',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'default',
              interpolation: 'linear',
              hidden: false
            } : null,
            systemTags.get('mem_pct') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('mem_pct').tag_id,
              tag_path: 'mem_pct',
              tag_name: 'Memory Usage %',
              data_type: 'REAL',
              name: 'Memory %',
              alias: null,
              color: '#3b82f6',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'default',
              interpolation: 'linear',
              hidden: false
            } : null,
            systemTags.get('disk_pct') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('disk_pct').tag_id,
              tag_path: 'disk_pct',
              tag_name: 'Disk Usage %',
              data_type: 'REAL',
              name: 'Disk %',
              alias: null,
              color: '#10b981',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'default',
              interpolation: 'linear',
              hidden: false
            } : null
          ].filter(t => t !== null),
          axes: [
            { id: 'default', label: '%', orientation: 'left', domain: [0, 100] }
          ],
          referenceLines: [],
          criticalRanges: [],
          derived: [],
          grid: { color: '#374151', opacity: 0.3, thickness: 1, dash: 'solid' },
          background: { color: '#000000', opacity: 1 },
          display: { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
          series: [
            { dataKey: 'cpu', label: 'CPU %', color: '#ef4444', yAxisId: 'default' },
            { dataKey: 'memory', label: 'Memory %', color: '#3b82f6', yAxisId: 'default' },
            { dataKey: 'disk', label: 'Disk %', color: '#10b981', yAxisId: 'default' }
          ]
        }
      },
      {
        key: 'capacity-ingestor',
        name: 'Ingestor Flush Metrics',
        options: {
          version: 1,
          tags: [
            systemTags.get('last_flush_count') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('last_flush_count').tag_id,
              tag_path: 'last_flush_count',
              tag_name: 'Last Flush Count',
              data_type: 'REAL',
              name: 'Flush Count',
              alias: null,
              color: '#f59e0b',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'count',
              interpolation: 'linear',
              hidden: false
            } : null,
            systemTags.get('last_flush_ms') ? {
              connection_id: systemConnectionId,
              tag_id: systemTags.get('last_flush_ms').tag_id,
              tag_path: 'last_flush_ms',
              tag_name: 'Last Flush Time (ms)',
              data_type: 'REAL',
              name: 'Flush Time (ms)',
              alias: null,
              color: '#8b5cf6',
              thickness: 2,
              strokeType: 'solid',
              yAxisId: 'time',
              interpolation: 'linear',
              hidden: false
            } : null
          ].filter(t => t !== null),
          axes: [
            { id: 'count', label: 'Count', orientation: 'left', domain: ['auto', 'auto'] },
            { id: 'time', label: 'ms', orientation: 'right', domain: ['auto', 'auto'] }
          ],
          referenceLines: [],
          criticalRanges: [],
          derived: [],
          grid: { color: '#374151', opacity: 0.3, thickness: 1, dash: 'solid' },
          background: { color: '#000000', opacity: 1 },
          display: { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
          series: [
            { dataKey: 'count', label: 'Flush Count', color: '#f59e0b', yAxisId: 'count' },
            { dataKey: 'time_ms', label: 'Flush Time (ms)', color: '#8b5cf6', yAxisId: 'time' }
          ]
        }
      }
    ];

      // Check which charts already exist (system charts are owned by system user, not current user)
      const existingQ = `SELECT id, name, options FROM chart_configs 
                         WHERE user_id = $1 AND is_system_chart = true AND is_deleted = false 
                         AND name IN ($2, $3, $4)`;
      const existingRes = await app.db.query(existingQ, [
        systemUserId,
        capacityChartDefs[0].name,
        capacityChartDefs[1].name,
        capacityChartDefs[2].name
      ]);

      const existing = new Map(existingRes.rows.map(r => [r.name, r]));
      const charts = [];

      // Create missing charts
      for (const def of capacityChartDefs) {
        if (existing.has(def.name)) {
          // Chart already exists, return it
          charts.push(existing.get(def.name));
        } else {
          // Create new system chart (owned by system user) with Rolling mode for efficiency
          const insertQ = `INSERT INTO chart_configs 
                           (user_id, name, time_mode, time_duration, is_shared, is_system_chart, options)
                           VALUES ($1, $2, 'rolling', 900000, false, true, $3)
                           RETURNING *`;
          const insertRes = await app.db.query(insertQ, [systemUserId, def.name, def.options]);
          charts.push(insertRes.rows[0]);
          logEvent('info', 'chart.capacity_init', { 
            user_id: userId, 
            system_user_id: systemUserId,
            chart_id: insertRes.rows[0].id, 
            chart_key: def.key 
          });
        }
      }

      return reply.send({ 
        charts: charts.map(c => ({ 
          ...c, 
          is_owner: true, 
          tag_count: 0 
        })) 
      });
    } catch (e) {
      logEvent('error', 'chart.capacity_init_failed', { user_id: userId, error: e?.message });
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // GET /:id (full)
  app.get('/:id', async (req, reply) => {
    if (req.params.id === '_debug') return reply.code(404).send({ error: 'not_found' });
    ensureValidId(req, reply); if (reply.sent) return;
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);
    
    const row = await fetchVisible(req.params.id, userId);
    if (!row) { logEvent('debug', 'chart.get_not_found', { user_id: userId, chart_id: req.params.id }); return reply.code(404).send({ error: 'not_found' }); }
    return { ...row };
  });

  // PUT /:id (replace)
  app.put('/:id', async (req, reply) => {
    ensureValidId(req, reply); if (reply.sent) return;
    const userId = req.user.sub;
    await checkPermission(userId, 'update', reply);
    
    const owned = await fetchOwned(req.params.id, userId);
  if (!owned) { logEvent('warn', 'chart.update_not_found', { user_id: userId, chart_id: req.params.id }); return reply.code(404).send({ error: 'not_found' }); }
  const { errors, value } = validatePayload(req.body || {}, { partial: false });
  if (errors.length) { logEvent('warn', 'chart.validation_failed', { user_id: userId, action: 'update', chart_id: req.params.id, errors }); return reply.code(400).send({ error: 'validation_failed', details: errors }); }
    const { name, time_from, time_to, is_shared, time_mode, time_duration, time_offset, live_enabled, show_time_badge, options } = value;
    try {
      const q = `update chart_configs
                 set name=$2, time_from=$3, time_to=$4, is_shared=$5, time_mode=$6, time_duration=$7, time_offset=$8, live_enabled=$9, show_time_badge=$10, options=$11
                 where id=$1 and user_id=$12 and is_deleted=false
                 returning *`;
      const { rows } = await app.db.query(q, [req.params.id, name, time_from, time_to, is_shared, time_mode, time_duration, time_offset, live_enabled, show_time_badge, options, userId]);
  const row = rows[0];
  logEvent('info', 'chart.update', { user_id: userId, chart_id: row.id, shared: row.is_shared, ...optionCounts(row.options) });
  try { await app.audit('chart.update', { outcome: 'success', actor_user_id: userId, metadata: { chart_id: row.id, shared: row.is_shared, ...optionCounts(row.options) } }); } catch {}
      return { ...row, is_owner: true, tag_count: (options?.tags || []).length };
    } catch (e) {
      logEvent('error', 'chart.update_failed', { user_id: userId, chart_id: req.params.id, error: e?.message });
      try { await app.audit('chart.update', { outcome: 'failure', actor_user_id: userId, metadata: { chart_id: req.params.id, error: e?.message } }); } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // PATCH /:id (partial)
  app.patch('/:id', async (req, reply) => {
    ensureValidId(req, reply); if (reply.sent) return;
    const userId = req.user.sub;
    await checkPermission(userId, 'update', reply);
    
    const owned = await fetchOwned(req.params.id, userId);
  if (!owned) { logEvent('warn', 'chart.patch_not_found', { user_id: userId, chart_id: req.params.id }); return reply.code(404).send({ error: 'not_found' }); }
    const { errors, value } = validatePayload(req.body || {}, { partial: true });
  if (errors.length) { logEvent('warn', 'chart.validation_failed', { user_id: userId, action: 'patch', chart_id: req.params.id, errors }); return reply.code(400).send({ error: 'validation_failed', details: errors }); }
    // Build dynamic set clause
    const sets = [];
    const params = [req.params.id, userId];
    function push(col, val) { params.push(val); sets.push(`${col}=$${params.length}`); }
    for (const k of ['name','time_from','time_to','is_shared','time_mode','time_duration','time_offset','live_enabled','show_time_badge']) if (k in value) push(k, value[k]);
    if ('options' in value) push('options', value.options);
    if (!sets.length) return reply.code(400).send({ error: 'validation_failed', details: ['no fields to update'] });
    const q = `update chart_configs set ${sets.join(', ')} where id=$1 and user_id=$2 and is_deleted=false returning *`;
    try {
      const { rows } = await app.db.query(q, params);
  const row = rows[0];
  logEvent('info', 'chart.patch', { user_id: userId, chart_id: row.id, fields: sets.length, shared: row.is_shared, ...optionCounts(row.options) });
  try { await app.audit('chart.patch', { outcome: 'success', actor_user_id: userId, metadata: { chart_id: row.id, fields: sets.length, shared: row.is_shared, ...optionCounts(row.options) } }); } catch {}
      return { ...row, is_owner: true, tag_count: (row.options?.tags || []).length };
    } catch (e) {
      logEvent('error', 'chart.patch_failed', { user_id: userId, chart_id: req.params.id, error: e?.message });
      try { await app.audit('chart.patch', { outcome: 'failure', actor_user_id: userId, metadata: { chart_id: req.params.id, error: e?.message } }); } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // DELETE /:id (soft)
  app.delete('/:id', async (req, reply) => {
    ensureValidId(req, reply); if (reply.sent) return;
    const userId = req.user.sub;
    await checkPermission(userId, 'delete', reply);
    
    // Check if it's a system chart first
    const checkQ = `select is_system_chart from chart_configs where id=$1 and user_id=$2 and is_deleted=false`;
    const checkResult = await app.db.query(checkQ, [req.params.id, userId]);
    if (checkResult.rows.length && checkResult.rows[0].is_system_chart) {
      logEvent('warn', 'chart.delete_system_chart_blocked', { user_id: userId, chart_id: req.params.id });
      return reply.code(403).send({ error: 'system_chart_cannot_be_deleted' });
    }
    const q = `update chart_configs set is_deleted=true where id=$1 and user_id=$2 and is_deleted=false and is_system_chart=false returning id`;
    try {
      const { rows } = await app.db.query(q, [req.params.id, userId]);
  if (!rows.length) { logEvent('warn', 'chart.delete_not_found', { user_id: userId, chart_id: req.params.id }); return reply.code(404).send({ error: 'not_found' }); }
  logEvent('info', 'chart.delete', { user_id: userId, chart_id: req.params.id });
  try { await app.audit('chart.delete', { outcome: 'success', actor_user_id: userId, metadata: { chart_id: req.params.id } }); } catch {}
      return reply.code(204).send();
    } catch (e) {
      logEvent('error', 'chart.delete_failed', { user_id: userId, chart_id: req.params.id, error: e?.message });
      try { await app.audit('chart.delete', { outcome: 'failure', actor_user_id: userId, metadata: { chart_id: req.params.id, error: e?.message } }); } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // POST /:id/duplicate (duplicate visible chart into new owned private instance)
  app.post('/:id/duplicate', async (req, reply) => {
    ensureValidId(req, reply); if (reply.sent) return;
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);
    
    const src = await fetchVisible(req.params.id, userId);
  if (!src) { logEvent('warn', 'chart.duplicate_not_found', { user_id: userId, chart_id: req.params.id }); return reply.code(404).send({ error: 'not_found' }); }
    // If user owns original they could also use normal update; duplication always creates new private unless body specifies is_shared
    const body = req.body || {};
    const name = String(body.name || (src.name + ' (Copy)')).slice(0,120);
    const is_shared = !!body.is_shared && !!src.is_shared ? true : !!body.is_shared; // allow user to choose sharing for copy
    const options = src.options || {};
    try {
      const q = `insert into chart_configs (user_id,name,time_from,time_to,is_shared,options)
                 values ($1,$2,$3,$4,$5,$6) returning *`;
      const { rows } = await app.db.query(q, [userId, name, src.time_from, src.time_to, is_shared, options]);
  const row = rows[0];
  logEvent('info', 'chart.duplicate', { user_id: userId, source_chart_id: src.id, new_chart_id: row.id, shared: row.is_shared, ...optionCounts(row.options) });
  try { await app.audit('chart.duplicate', { outcome: 'success', actor_user_id: userId, metadata: { source_chart_id: src.id, new_chart_id: row.id, shared: row.is_shared, ...optionCounts(row.options) } }); } catch {}
      return reply.code(201).send({ ...row, is_owner: true, tag_count: (options?.tags || []).length });
    } catch (e) {
      logEvent('error', 'chart.duplicate_failed', { user_id: userId, chart_id: req.params.id, error: e?.message });
      try { await app.audit('chart.duplicate', { outcome: 'failure', actor_user_id: userId, metadata: { source_chart_id: src.id, error: e?.message } }); } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // POST /:id/export - Export chart with dependencies
  app.post('/:id/export', async (req, reply) => {
    ensureValidId(req, reply);
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);

    try {
      const chart = await fetchVisible(req.params.id, userId);
      if (!chart) return reply.code(404).send({ error: 'not_found' });

      const exportData = await exportChart(chart, app.db);
      
      const filename = `${chart.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
      
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(exportData);
      
      logEvent('info', 'chart.export', { user_id: userId, chart_id: chart.id, chart_name: chart.name });
    } catch (e) {
      logEvent('error', 'chart.export_failed', { user_id: userId, chart_id: req.params.id, error: e?.message });
      return reply.code(500).send({ error: 'export_failed', message: e?.message });
    }
  });

  // POST /import/validate - Validate import data
  app.post('/import/validate', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);

    try {
      const importData = req.body;
      
      if (!importData || typeof importData !== 'object') {
        return reply.code(400).send({ error: 'invalid_import_data' });
      }

      const validation = await validateImport(importData, app.db);
      
      logEvent('info', 'chart.import_validate', { 
        user_id: userId, 
        valid: validation.valid,
        total_tags: validation.summary?.total_tags,
        valid_tags: validation.summary?.valid_tags 
      });
      
      return reply.send(validation);
    } catch (e) {
      logEvent('error', 'chart.import_validate_failed', { user_id: userId, error: e?.message });
      return reply.code(500).send({ error: 'validation_failed', message: e?.message });
    }
  });

  // POST /import/execute - Execute import after validation
  app.post('/import/execute', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);

    try {
      const { importData, validation, newName } = req.body;
      
      if (!importData || !validation) {
        return reply.code(400).send({ error: 'missing_import_data_or_validation' });
      }

      if (!validation.valid) {
        return reply.code(400).send({ error: 'validation_failed', details: validation.errors });
      }

      const result = await importChart(importData, userId, validation, app.db, newName);
      
      logEvent('info', 'chart.import_execute', { 
        user_id: userId, 
        chart_id: result.chart.id,
        chart_name: result.chart.name,
        imported_tags: result.imported_tags,
        skipped_tags: result.skipped_tags
      });

      try { 
        await app.audit('chart.import', { 
          outcome: 'success', 
          actor_user_id: userId, 
          metadata: { 
            chart_id: result.chart.id, 
            imported_tags: result.imported_tags,
            skipped_tags: result.skipped_tags 
          } 
        }); 
      } catch {}
      
      return reply.code(201).send(result);
    } catch (e) {
      logEvent('error', 'chart.import_execute_failed', { user_id: userId, error: e?.message });
      try { await app.audit('chart.import', { outcome: 'failure', actor_user_id: userId, metadata: { error: e?.message } }); } catch {}
      return reply.code(500).send({ error: 'import_failed', message: e?.message });
    }
  });
}
