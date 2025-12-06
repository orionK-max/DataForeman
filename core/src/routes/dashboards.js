/**
 * Dashboard management routes
 * Handles CRUD operations for dashboard configurations
 */

import { validatePayload as validateDashboard, getSchemaVersion } from '../services/dashboardValidator.js';
import { getDashboardSchema } from '../schemas/DashboardSchema.js';
import { exportDashboard, validateImport, importDashboard } from '../services/dashboardImportExport.js';

export async function dashboardRoutes(app) {
  
  // Permission check helper
  async function checkPermission(userId, operation, reply) {
    if (!userId || !(await app.permissions.can(userId, 'dashboards', operation))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  }
  
  // Helper to fetch dashboard if user has access
  async function fetchVisible(id, userId) {
    const q = `SELECT *, (user_id = $2) as is_owner 
               FROM dashboard_configs
               WHERE id=$1 AND is_deleted=false AND (user_id=$2 OR is_shared=true)`;
    const { rows } = await app.db.query(q, [id, userId]);
    return rows[0] || null;
  }
  
  // Helper to fetch dashboard only if user owns it
  async function fetchOwned(id, userId) {
    const q = `SELECT * FROM dashboard_configs WHERE id=$1 AND user_id=$2 AND is_deleted=false`;
    const { rows } = await app.db.query(q, [id, userId]);
    return rows[0] || null;
  }
  
  // Logging helper
  function logEvent(level, evt, data) {
    try {
      const payload = { component: 'dashboards', event: evt, ...data };
      (app.log[level] || app.log.info).call(app.log, payload, evt);
    } catch {/* swallow */}
  }
  
  // GET / - List dashboards
  app.get('/', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);
    
    const scope = String(req.query?.scope || 'all');
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 50)));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    
    const baseCols = `id, name, description, created_at, updated_at, is_shared, (user_id=$1) as is_owner, 
                      COALESCE(jsonb_array_length(layout->'items'), 0) as widget_count,
                      (options->>'folder_id') as folder_id`;
    
    let where = 'is_deleted=false AND (user_id=$1 OR is_shared=true)';
    if (scope === 'mine') where = 'is_deleted=false AND user_id=$1';
    else if (scope === 'shared') where = 'is_deleted=false AND is_shared=true';
    
    const q = `SELECT ${baseCols} FROM dashboard_configs WHERE ${where} ORDER BY updated_at DESC LIMIT $2 OFFSET $3`;
    const { rows } = await app.db.query(q, [userId, limit, offset]);
    
    return { items: rows, limit, offset, count: rows.length };
  });
  
  // GET /schema - Get dashboard schema
  app.get('/schema', async (req, reply) => {
    const userId = req.user?.sub;
    await checkPermission(userId, 'read', reply);
    
    return getDashboardSchema();
  });
  
  // GET /:id - Get single dashboard
  app.get('/:id', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);
    
    const id = req.params.id;
    
    const dashboard = await fetchVisible(id, userId);
    if (!dashboard) {
      logEvent('warn', 'dashboard.not_found', { user_id: userId, dashboard_id: id });
      return reply.code(404).send({ error: 'dashboard_not_found' });
    }
    
    logEvent('info', 'dashboard.view', { user_id: userId, dashboard_id: id, is_owner: dashboard.is_owner });
    return dashboard;
  });
  
  // POST / - Create dashboard
  app.post('/', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);
    
    const result = validateDashboard(req.body || {}, { isUpdate: false });
    
    if (!result.valid) {
      logEvent('warn', 'dashboard.validation_failed', { user_id: userId, action: 'create', errors: result.errors });
      return reply.code(400).send({ error: 'validation_failed', details: result.errors });
    }
    
    const { name, description, is_shared, layout } = result.value;
    
    try {
      const q = `INSERT INTO dashboard_configs (user_id, name, description, is_shared, layout)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`;
      const { rows } = await app.db.query(q, [userId, name, description || null, is_shared, JSON.stringify(layout || {})]);
      const row = rows[0];
      
      logEvent('info', 'dashboard.create', { 
        user_id: userId, 
        dashboard_id: row.id, 
        shared: row.is_shared,
        widget_count: layout?.items?.length || 0
      });
      
      try {
        await app.audit('dashboard.create', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { dashboard_id: row.id, shared: row.is_shared, widget_count: layout?.items?.length || 0 }
        });
      } catch {}
      
      return reply.code(201).send({ ...row, is_owner: true });
    } catch (e) {
      logEvent('error', 'dashboard.create_failed', { user_id: userId, error: e?.message });
      try {
        await app.audit('dashboard.create', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { error: e?.message }
        });
      } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  // PUT /:id - Update dashboard
  app.put('/:id', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'update', reply);
    
    const id = req.params.id;
    const result = validateDashboard(req.body || {}, { isUpdate: true });
    
    if (!result.valid) {
      logEvent('warn', 'dashboard.validation_failed', { user_id: userId, action: 'update', dashboard_id: id, errors: result.errors });
      return reply.code(400).send({ error: 'validation_failed', details: result.errors });
    }
    
    // Check ownership
    const existing = await fetchOwned(id, userId);
    if (!existing) {
      logEvent('warn', 'dashboard.update_forbidden', { user_id: userId, dashboard_id: id });
      return reply.code(404).send({ error: 'dashboard_not_found' });
    }
    
    const sets = ['updated_at = NOW()'];
    const params = [id];
    function push(col, val) { params.push(val); sets.push(`${col}=$${params.length}`); }
    
    const { value } = result;
    if (value.name !== undefined) push('name', value.name);
    if (value.description !== undefined) push('description', value.description);
    if (value.is_shared !== undefined) push('is_shared', value.is_shared);
    if (value.layout !== undefined) push('layout', JSON.stringify(value.layout));
    
    if (sets.length === 1) {
      logEvent('warn', 'dashboard.update_no_changes', { user_id: userId, dashboard_id: id });
      return existing;
    }
    
    try {
      const q = `UPDATE dashboard_configs SET ${sets.join(', ')} WHERE id=$1 RETURNING *`;
      const { rows } = await app.db.query(q, params);
      const row = rows[0];
      
      logEvent('info', 'dashboard.update', { 
        user_id: userId, 
        dashboard_id: id,
        changed_fields: Object.keys(value)
      });
      
      try {
        await app.audit('dashboard.update', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { dashboard_id: id, changed_fields: Object.keys(value) }
        });
      } catch {}
      
      return { ...row, is_owner: true };
    } catch (e) {
      logEvent('error', 'dashboard.update_failed', { user_id: userId, dashboard_id: id, error: e?.message });
      try {
        await app.audit('dashboard.update', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { dashboard_id: id, error: e?.message }
        });
      } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  // DELETE /:id - Soft delete dashboard
  app.delete('/:id', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'delete', reply);
    
    const id = req.params.id;
    
    // Check ownership
    const existing = await fetchOwned(id, userId);
    if (!existing) {
      logEvent('warn', 'dashboard.delete_forbidden', { user_id: userId, dashboard_id: id });
      return reply.code(404).send({ error: 'dashboard_not_found' });
    }
    
    try {
      const q = `UPDATE dashboard_configs SET is_deleted=true, updated_at=NOW() WHERE id=$1`;
      await app.db.query(q, [id]);
      
      logEvent('info', 'dashboard.delete', { user_id: userId, dashboard_id: id });
      
      try {
        await app.audit('dashboard.delete', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { dashboard_id: id }
        });
      } catch {}
      
      return reply.code(204).send();
    } catch (e) {
      logEvent('error', 'dashboard.delete_failed', { user_id: userId, dashboard_id: id, error: e?.message });
      try {
        await app.audit('dashboard.delete', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { dashboard_id: id, error: e?.message }
        });
      } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  // POST /:id/duplicate - Clone dashboard
  app.post('/:id/duplicate', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);
    const id = req.params.id;
    const newName = String(req.body?.name || '').trim();
    
    if (!newName || newName.length > 120) {
      return reply.code(400).send({ error: 'validation_failed', details: ['name is required and must be <= 120 characters'] });
    }
    
    // Check access to source dashboard
    const source = await fetchVisible(id, userId);
    if (!source) {
      logEvent('warn', 'dashboard.duplicate_not_found', { user_id: userId, dashboard_id: id });
      return reply.code(404).send({ error: 'dashboard_not_found' });
    }
    
    try {
      const q = `INSERT INTO dashboard_configs (user_id, name, description, is_shared, layout)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`;
      const { rows } = await app.db.query(q, [
        userId,
        newName,
        source.description,
        false, // New dashboard is private by default
        source.layout
      ]);
      const row = rows[0];
      
      logEvent('info', 'dashboard.duplicate', { 
        user_id: userId, 
        source_id: id,
        new_id: row.id
      });
      
      try {
        await app.audit('dashboard.duplicate', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { source_id: id, new_id: row.id }
        });
      } catch {}
      
      return reply.code(201).send({ ...row, is_owner: true });
    } catch (e) {
      logEvent('error', 'dashboard.duplicate_failed', { user_id: userId, source_id: id, error: e?.message });
      try {
        await app.audit('dashboard.duplicate', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { source_id: id, error: e?.message }
        });
      } catch {}
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // POST /:id/export - Export dashboard to JSON
  app.post('/:id/export', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'read', reply);
    
    const id = req.params.id;
    
    try {
      const exportData = await exportDashboard(app.db, id, userId);
      
      logEvent('info', 'dashboard.export', { user_id: userId, dashboard_id: id });
      
      try {
        await app.audit('dashboard.export', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { dashboard_id: id }
        });
      } catch {}
      
      return exportData;
    } catch (err) {
      logEvent('error', 'dashboard.export_failed', { 
        user_id: userId, 
        dashboard_id: id, 
        error: err?.message 
      });
      
      try {
        await app.audit('dashboard.export', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { dashboard_id: id, error: err?.message }
        });
      } catch {}
      
      if (err.message === 'Dashboard not found or access denied') {
        return reply.code(404).send({ error: 'dashboard_not_found' });
      }
      
      return reply.code(500).send({ error: 'export_failed', message: err.message });
    }
  });

  // POST /import/validate - Validate dashboard import data
  app.post('/import/validate', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);
    
    try {
      const importData = req.body;
      const validation = await validateImport(app.db, importData, userId);
      
      logEvent('info', 'dashboard.import_validate', { 
        user_id: userId,
        valid: validation.valid,
        warnings: validation.warnings.length
      });
      
      return validation;
    } catch (err) {
      logEvent('error', 'dashboard.import_validate_failed', { 
        user_id: userId,
        error: err?.message 
      });
      
      return reply.code(500).send({ error: 'validation_failed', message: err.message });
    }
  });

  // POST /import/execute - Execute dashboard import
  app.post('/import/execute', async (req, reply) => {
    const userId = req.user.sub;
    await checkPermission(userId, 'create', reply);
    
    try {
      const { importData, validation, newName } = req.body;
      
      if (!validation?.valid) {
        return reply.code(400).send({ error: 'invalid_import_data' });
      }
      
      const dashboard = await importDashboard(app.db, importData, validation, userId, newName);
      
      logEvent('info', 'dashboard.import', { 
        user_id: userId,
        dashboard_id: dashboard.id,
        name: dashboard.name
      });
      
      try {
        await app.audit('dashboard.import', {
          outcome: 'success',
          actor_user_id: userId,
          metadata: { 
            dashboard_id: dashboard.id,
            name: dashboard.name,
            widgets_count: dashboard.layout?.items?.length || 0
          }
        });
      } catch {}
      
      return reply.code(201).send({ ...dashboard, is_owner: true });
    } catch (err) {
      logEvent('error', 'dashboard.import_failed', { 
        user_id: userId,
        error: err?.message 
      });
      
      try {
        await app.audit('dashboard.import', {
          outcome: 'failure',
          actor_user_id: userId,
          metadata: { error: err?.message }
        });
      } catch {}
      
      return reply.code(500).send({ error: 'import_failed', message: err.message });
    }
  });
}
