import { randomUUID } from 'crypto';
import net from 'net';

export async function connectivityRoutes(app) {
  // Viewer-level access; permission-gated features

  // Helper: Clean connection config for NATS publishing (remove database-specific fields)
  const cleanConnForNats = (conn) => {
    const { max_tags_per_group, max_concurrent_connections, ...cleaned } = conn;
    return cleaned;
  };

  // Helper: Load connection config by ID
  const loadConnectionConfig = async (client, connectionId) => {
    const { rows } = await client.query(
      `SELECT id, name, type, enabled, config_data, max_tags_per_group, max_concurrent_connections
       FROM connections
       WHERE id = $1 AND deleted_at IS NULL`,
      [connectionId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return { 
      id: row.id, 
      name: row.name, 
      type: row.type, 
      enabled: row.enabled, 
      max_tags_per_group: row.max_tags_per_group,
      max_concurrent_connections: row.max_concurrent_connections,
      ...(row.config_data || {}) 
    };
  };

  const saveConnectionConfig = async (client, connectionId, config) => {
    // Extract config_data by removing top-level properties (id, name, type, enabled)
    const { id, name, type, enabled, ...configData } = config;
    await client.query(
      `UPDATE connections
       SET config_data = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(configData), connectionId]
    );
  };

  app.addHook('preHandler', async (req, reply) => {
    const p = req.routerPath || req.url || '';
    // Allow summary to be readable without permission check so the UI can show system chips
    if (p.endsWith('/summary') || p.endsWith('/connectivity/summary')) return;
    const userId = req.user?.sub;    
    // Determine feature based on route path
    let feature = 'connectivity.devices'; // default
    if (p.includes('/tags') || p.includes('/poll-groups')) {
      feature = p.includes('/poll-groups') ? 'connectivity.poll_groups' : 'connectivity.tags';
    }
    
    // Determine required operation based on HTTP method
    const method = req.method;
    let operation = 'read';
    if (method === 'POST') operation = 'create';
    else if (method === 'PUT' || method === 'PATCH') operation = 'update';
    else if (method === 'DELETE') operation = 'delete';
    
    req.log.info({ userId, feature, path: p, method, operation }, 'connectivity preHandler checking permission');
    const hasPermission = await app.permissions.can(userId, feature, operation);
    req.log.info({ userId, feature, operation, hasPermission }, 'connectivity preHandler permission result');
    
    if (!hasPermission) {
      return reply.code(403).send({ error: 'forbidden', feature, operation });
    }
  });

  const normalizeBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
      if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
    }
    return defaultValue;
  };

  const formatPollGroupRow = (row) => {
    if (!row) return null;
    const tagCount = row.tag_count == null ? 0 : Number(row.tag_count);
    return {
      group_id: row.group_id,
      name: row.name,
      poll_rate_ms: row.poll_rate_ms,
      description: row.description,
      is_active: row.is_active,
      created_at: row.created_at,
      tag_count: Number.isNaN(tagCount) ? 0 : tagCount,
    };
  };

  const fetchPollGroupById = async (client, groupId) => {
    const { rows } = await client.query(
      `SELECT pg.group_id, pg.name, pg.poll_rate_ms, pg.description, pg.is_active, pg.created_at,
              COALESCE(COUNT(tm.tag_id), 0) AS tag_count
         FROM poll_groups pg
         LEFT JOIN tag_metadata tm ON tm.poll_group_id = pg.group_id
        WHERE pg.group_id = $1
        GROUP BY pg.group_id, pg.name, pg.poll_rate_ms, pg.description, pg.is_active, pg.created_at`,
      [groupId]
    );
    return formatPollGroupRow(rows[0]);
  };

  // Poll Groups API endpoints
  app.get('/poll-groups', async (req, reply) => {
    const userId = req.user?.sub;    
    try {
      const includeInactive = normalizeBoolean(req.query?.include_inactive, false);
      const { rows } = await app.db.query(
        `SELECT pg.group_id, pg.name, pg.poll_rate_ms, pg.description, pg.is_active, pg.created_at,
                COALESCE(COUNT(tm.tag_id), 0) AS tag_count
           FROM poll_groups pg
           LEFT JOIN tag_metadata tm ON tm.poll_group_id = pg.group_id
          ${includeInactive ? '' : 'WHERE pg.is_active = true'}
          GROUP BY pg.group_id, pg.name, pg.poll_rate_ms, pg.description, pg.is_active, pg.created_at
          ORDER BY pg.poll_rate_ms ASC, pg.group_id ASC`
      );

      return { poll_groups: rows.map(formatPollGroupRow) };
    } catch (e) {
      req.log.error({ err: e }, 'failed to fetch poll groups');
      return reply.code(500).send({ error: 'failed_to_fetch_poll_groups' });
    }
  });

  app.post('/poll-groups', async (req, reply) => {
    const userId = req.user?.sub;
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = body.description === undefined ? null : String(body.description || '').trim() || null;
    const pollRate = Number(body.poll_rate_ms);
    const isActive = normalizeBoolean(body.is_active, true);

    if (!name) {
      return reply.code(400).send({ error: 'name_required' });
    }
    if (!Number.isInteger(pollRate) || pollRate <= 0) {
      return reply.code(400).send({ error: 'invalid_poll_rate' });
    }

    try {
      const insertQuery = `
        WITH next_id AS (
          SELECT COALESCE(MAX(group_id), 0) + 1 AS next_group_id FROM poll_groups
        ), inserted AS (
          INSERT INTO poll_groups (group_id, name, poll_rate_ms, description, is_active)
          SELECT next_group_id, $1, $2, $3, $4 FROM next_id
          RETURNING group_id
        )
        SELECT group_id FROM inserted`;

      const { rows } = await app.db.query(insertQuery, [name, pollRate, description, isActive]);
      const groupId = rows[0]?.group_id;

      const pollGroup = await fetchPollGroupById(app.db, groupId);
      return { poll_group: pollGroup };
    } catch (e) {
      req.log.error({ err: e }, 'failed to create poll group');
      if (e?.code === '23505') {
        return reply.code(409).send({ error: 'duplicate_poll_group', message: e.detail });
      }
      return reply.code(500).send({ error: 'failed_to_create_poll_group' });
    }
  });

  app.put('/poll-groups/:groupId', async (req, reply) => {
    const userId = req.user?.sub;
    const groupId = Number(req.params?.groupId);
    if (!Number.isInteger(groupId) || groupId < 1) {
      return reply.code(400).send({ error: 'invalid_poll_group_id' });
    }

    const body = req.body || {};
    const updates = [];
    const values = [];

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return reply.code(400).send({ error: 'name_required' });
      values.push(name);
      updates.push(`name = $${values.length}`);
    }

    if (body.poll_rate_ms !== undefined) {
      const pollRate = Number(body.poll_rate_ms);
      if (!Number.isInteger(pollRate) || pollRate <= 0) {
        return reply.code(400).send({ error: 'invalid_poll_rate' });
      }
      values.push(pollRate);
      updates.push(`poll_rate_ms = $${values.length}`);
    }

    if (body.description !== undefined) {
      const description = body.description === null ? null : String(body.description).trim();
      values.push(description === '' ? null : description);
      updates.push(`description = $${values.length}`);
    }

    if (body.is_active !== undefined) {
      values.push(normalizeBoolean(body.is_active, true));
      updates.push(`is_active = $${values.length}`);
    }

    if (!updates.length) {
      return reply.code(400).send({ error: 'no_updates_provided' });
    }

    values.push(groupId);

    try {
      const { rowCount } = await app.db.query(
        `UPDATE poll_groups
            SET ${updates.join(', ')}
          WHERE group_id = $${values.length}`,
        values
      );

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'poll_group_not_found' });
      }

      const pollGroup = await fetchPollGroupById(app.db, groupId);
      return { poll_group: pollGroup };
    } catch (e) {
      req.log.error({ err: e, groupId }, 'failed to update poll group');
      if (e?.code === '23505') {
        return reply.code(409).send({ error: 'duplicate_poll_group', message: e.detail });
      }
      return reply.code(500).send({ error: 'failed_to_update_poll_group' });
    }
  });

  app.delete('/poll-groups/:groupId', async (req, reply) => {
    const userId = req.user?.sub;
    const groupId = Number(req.params?.groupId);
    if (!Number.isInteger(groupId) || groupId < 1) {
      return reply.code(400).send({ error: 'invalid_poll_group_id' });
    }

    const reassignRaw = req.query?.reassign_to ?? req.query?.reassign_to_group_id;
    const reassignTo = reassignRaw !== undefined && reassignRaw !== null ? Number(reassignRaw) : null;
    if (reassignTo !== null) {
      if (!Number.isInteger(reassignTo) || reassignTo < 1) {
        return reply.code(400).send({ error: 'invalid_reassign_target' });
      }
      if (reassignTo === groupId) {
        return reply.code(400).send({ error: 'cannot_reassign_to_same_group' });
      }
    }

    const client = await app.db.connect();
    try {
      await client.query('BEGIN');

      if (reassignTo !== null) {
        const { rows: targetRows } = await client.query(
          'SELECT 1 FROM poll_groups WHERE group_id = $1 LIMIT 1',
          [reassignTo]
        );
        if (!targetRows.length) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'reassign_target_not_found' });
        }
      }

      let reassignedCount = 0;
      if (reassignTo !== null) {
        const { rowCount } = await client.query(
          'UPDATE tag_metadata SET poll_group_id = $1, updated_at = now() WHERE poll_group_id = $2',
          [reassignTo, groupId]
        );
        reassignedCount = rowCount;
      }

      const { rowCount: updateCount } = await client.query(
        'UPDATE poll_groups SET is_active = false WHERE group_id = $1',
        [groupId]
      );

      if (updateCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'poll_group_not_found' });
      }

      const pollGroup = await fetchPollGroupById(client, groupId);

      await client.query('COMMIT');

      return { ok: true, poll_group: pollGroup, reassigned_count: reassignedCount };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      req.log.error({ err: e, groupId }, 'failed to delete poll group');
      return reply.code(500).send({ error: 'failed_to_delete_poll_group' });
    } finally {
      client.release();
    }
  });

  app.get('/summary', async () => {
    // Provide a lightweight summary without requiring admin diagnostics
    // DB status
    let db = 'down';
    try { await app.db.query('select 1'); db = 'up'; } catch {}

    // NATS status: prefer client health, fallback to TCP probe
    let natsOk = null;
    try { natsOk = app.nats?.healthy() === true; } catch {}
    if (natsOk === null) {
      const parseNatsUrl = (url) => {
        try { const u = new URL(url || 'nats://localhost:4222'); return { host: u.hostname, port: Number(u.port || 4222) }; } catch { return { host: 'localhost', port: 4222 }; }
      };
      const testTcp = ({ host, port, timeout = 800 }) => new Promise((resolve) => {
        const socket = new net.Socket(); let done = false;
        const finish = (ok) => { if (done) return; done = true; try { socket.destroy(); } catch {}; resolve({ ok }); };
        socket.setTimeout(timeout);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
      });
      try {
        const { host, port } = parseNatsUrl(process.env.NATS_URL || 'nats://nats:4222');
        const res = await testTcp({ host, port, timeout: 800 });
        natsOk = !!res.ok;
      } catch { natsOk = null; }
    }
    const ingest = app.telemetryIngest?.metrics || null;
    return { db, nats: { ok: natsOk }, ingest };
  });

  // Publish a connectivity config message (upsert/delete)
  app.post('/config', async (req, reply) => {
    const userId = req.user?.sub;    const body = req.body || {};
    try {
      // Ensure schema and ts
      const msg = { ...body };
      if (!msg.schema) msg.schema = 'connectivity.config@v1';
      if (!msg.ts) msg.ts = new Date().toISOString();
      if (!msg.op || !['upsert', 'delete'].includes(msg.op)) return reply.code(400).send({ error: 'invalid op' });
      if (msg.op === 'upsert' && !msg.conn) return reply.code(400).send({ error: 'missing conn' });
      if (msg.op === 'delete' && !msg.id) return reply.code(400).send({ error: 'missing id' });
      // Clean conn if upsert
      if (msg.op === 'upsert' && msg.conn) {
        msg.conn = cleanConnForNats(msg.conn);
      }
      app.nats.publish('df.connectivity.config.v1', msg);
      try { await app.audit('connectivity.config.publish', { outcome: 'success', actor_user_id: req.user?.sub }); } catch {}
      return { ok: true };
    } catch (e) {
      req.log.error({ err: e }, 'failed to publish connectivity config');
      try { await app.audit('connectivity.config.publish', { outcome: 'failure', actor_user_id: req.user?.sub, metadata: { error: e?.message } }); } catch {}
      const code = String(e?.message).includes('nats_not_connected') ? 503 : 500;
      return reply.code(code).send({ error: 'unavailable' });
    }
  });

  // Latest statuses observed from NATS (ephemeral)
  app.get('/status', async () => {
    // Current live statuses from NATS
    const live = Array.from(app.connectivityStatus.values());
    const byId = new Map(live.map(s => [s.id, { ...s }]));

    // Fetch subscribed tag counts from DB
    let tagCounts = [];
    try {
      const { rows } = await app.db.query(
        `select connection_id, count(*)::int as tag_count
         from tag_metadata
         where is_subscribed = true
         group by connection_id`
      );
      tagCounts = rows || [];
    } catch {}

    // Merge counts into live statuses
    for (const row of tagCounts) {
      const id = row.connection_id;
      const cnt = row.tag_count | 0;
      if (byId.has(id)) {
        byId.set(id, { ...byId.get(id), tag_count: cnt });
      } else {
        // If no live status, add a synthetic entry so UI can show polling devices
        byId.set(id, {
          id,
          state: 'unknown',
          reason: 'not_running',
          tag_count: cnt,
          stats: {}
        });
      }
    }

    // sort by ts desc (synthetic entries may not have ts -> treat as lowest)
    const items = Array.from(byId.values()).sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    return { items };
  });

  // One-shot read via NATS RPC
  app.get('/read', async (req, reply) => {
    const id = req.query?.id;
    const tagCsv = String(req.query?.tag_ids || '').trim();
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    let tag_ids = [];
    if (tagCsv) tag_ids = tagCsv.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    try {
      let res = await app.nats.request(`df.connectivity.read.v1.${id}`, { tag_ids }, 5000);
      if (res?.error === 'not_found') {
        // Attempt temporary start similar to browse/attributes logic
        try {
          const saved = await loadConnectionConfig(app.db, id);
          if (saved) {
            const wasEnabled = saved.enabled !== false;
            try { app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'upsert', conn: { ...cleanConnForNats(saved), enabled: true } }); } catch {}
            const start = Date.now();
            while (Date.now() - start < 8000) {
              const s = app.connectivityStatus.get(id);
              if (s && (s.state === 'connected' || s.state === 'error')) break;
              await new Promise((r) => setTimeout(r, 150));
            }
            try { res = await app.nats.request(`df.connectivity.read.v1.${id}`, { tag_ids }, 5000); } catch {}
            if (!wasEnabled) {
              try { app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'delete', id }); } catch {}
            }
          }
        } catch {}
      }
      return res;
    } catch (e) {
      req.log.warn({ err: e, id }, 'read failed');
      return reply.code(500).send({ error: 'read_failed' });
    }
  });

  // Publish telemetry write requests to a specific connection
  app.post('/write/:id', async (req, reply) => {
    const userId = req.user?.sub;    const id = req.params?.id;
    if (!id) return reply.code(400).send({ error: 'missing id' });
    const body = req.body || {};
    try {
      const msg = { ...body };
      if (!msg.schema) msg.schema = 'telemetry.write@v1';
      if (!msg.ts) msg.ts = new Date().toISOString();
      if (!Array.isArray(msg.requests) || msg.requests.length === 0) return reply.code(400).send({ error: 'empty requests' });
      app.nats.publish(`df.telemetry.write.v1.${id}`, msg);
      try { await app.audit('connectivity.write.publish', { outcome: 'success', actor_user_id: req.user?.sub, metadata: { id, count: msg.requests.length } }); } catch {}
      return { ok: true };
    } catch (e) {
      req.log.error({ err: e }, 'failed to publish telemetry write');
      try { await app.audit('connectivity.write.publish', { outcome: 'failure', actor_user_id: req.user?.sub, metadata: { id, error: e?.message } }); } catch {}
      const code = String(e?.message).includes('nats_not_connected') ? 503 : 500;
      return reply.code(code).send({ error: 'unavailable' });
    }
  });

  // Browse a connection (simple request-reply via NATS)
  app.get('/browse/:id', async (req, reply) => {
    const userId = req.user?.sub;    const id = req.params?.id;
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    try {
      const node = req.query?.node ? String(req.query.node) : undefined;
      const payload = node ? { node } : undefined;
      let res;
      let attemptedAutoStart = false;
      
      try {
        res = await app.nats.request(`df.connectivity.browse.v1.${id}`, payload, 5000);
      } catch (browseErr) {
        // First browse attempt failed - try auto-start
        req.log.info({ id, err: browseErr.message }, 'initial browse failed, attempting auto-start');
        attemptedAutoStart = true;
        
        try {
          req.log.info({ id }, 'loading connection config from database');
          const saved = await loadConnectionConfig(app.db, id);
          req.log.info({ id, saved: !!saved }, 'connection config loaded');
          if (!saved) {
            req.log.warn({ id }, 'connection not found in database');
            return reply.code(404).send({ error: 'not_found', message: 'Connection not found in database' });
          }
          
          const wasEnabled = saved.enabled !== false;
          req.log.info({ id, wasEnabled }, 'attempting to start connection for browse');
          
          // Publish config to start the connection
          app.nats.publish('df.connectivity.config.v1', { 
            schema: 'connectivity.config@v1', 
            ts: new Date().toISOString(), 
            op: 'upsert', 
            conn: { ...cleanConnForNats(saved), enabled: true } 
          });
          
          // Wait up to 8s for connection to be ready
          const start = Date.now();
          let lastState = null;
          while (Date.now() - start < 8000) {
            const s = app.connectivityStatus.get(id);
            lastState = s?.state;
            if (s && (s.state === 'connected' || s.state === 'error')) {
              req.log.info({ id, state: s.state, elapsed: Date.now() - start }, 'connection state changed');
              break;
            }
            await new Promise((r) => setTimeout(r, 150));
          }
          
          req.log.info({ id, lastState, elapsed: Date.now() - start }, 'finished waiting for connection');
          
          // Retry browse
          try {
            res = await app.nats.request(`df.connectivity.browse.v1.${id}`, payload, 5000);
          } catch (retryErr) {
            req.log.warn({ id, err: retryErr.message, lastState }, 'browse retry failed after auto-start');
            return reply.code(500).send({ 
              error: 'browse_failed', 
              message: `Browse failed after starting connection. Last connection state: ${lastState || 'unknown'}. ${retryErr.message}` 
            });
          }
          
          // If connection wasn't originally enabled, stop it
          if (!wasEnabled) {
            app.nats.publish('df.connectivity.config.v1', { 
              schema: 'connectivity.config@v1', 
              ts: new Date().toISOString(), 
              op: 'delete', 
              id 
            });
          }
        } catch (startErr) {
          req.log.error({ err: startErr, id }, 'failed to auto-start connection');
          return reply.code(500).send({ 
            error: 'browse_failed', 
            message: `Failed to start connection: ${startErr.message}` 
          });
        }
      }
      
      return res;
    } catch (e) {
      req.log.warn({ err: e, id }, 'browse failed with exception');
      return reply.code(500).send({ 
        error: 'browse_failed', 
        message: e.message || 'Browse request failed' 
      });
    }
  });

  // OPC UA attributes for a specific node
  app.get('/attributes/:id', async (req, reply) => {
    const userId = req.user?.sub;    const id = req.params?.id;
    const node = req.query?.node ? String(req.query.node) : undefined;
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!node) return reply.code(400).send({ error: 'missing node' });
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    try {
      let res = await app.nats.request(`df.connectivity.attr.v1.${id}`, { node }, 5000);
      if (res?.error === 'not_found') {
        try {
          const saved = await loadConnectionConfig(app.db, id);
          if (saved) {
            const wasEnabled = saved.enabled !== false;
            try { app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'upsert', conn: { ...cleanConnForNats(saved), enabled: true } }); } catch {}
            const start = Date.now();
            while (Date.now() - start < 8000) {
              const s = app.connectivityStatus.get(id);
              if (s && (s.state === 'connected' || s.state === 'error')) break;
              await new Promise((r) => setTimeout(r, 150));
            }
            try { res = await app.nats.request(`df.connectivity.attr.v1.${id}`, { node }, 5000); } catch {}
            if (!wasEnabled) {
              try { app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'delete', id }); } catch {}
            }
          }
        } catch {}
      }
      return res;
    } catch (e) {
      req.log.warn({ err: e, id, node }, 'attributes failed');
      return reply.code(500).send({ error: 'attributes_failed' });
    }
  });

  // EIP tag list (browse-lite) - query: search, limit, refresh
  app.get('/eip/tags/:id', async (req, reply) => {
    const userId = req.user?.sub;    const id = req.params?.id;
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    try {
      const payload = {
        search: req.query?.search ? String(req.query.search) : undefined,
        limit: req.query?.limit ? Number(req.query.limit) : undefined,
        refresh: req.query?.refresh === '1' || req.query?.refresh === 'true',
  raw: req.query?.raw === '1' || req.query?.raw === 'true',
  // Pass-through pagination/program params for legacy paging
  page: req.query?.page ? Number(req.query.page) : undefined,
  program: req.query?.program ? String(req.query.program) : undefined,
  paginate: req.query?.paginate === '1' || req.query?.paginate === 'true' || req.query?.page != null,
  action: req.query?.action ? String(req.query.action) : undefined,
  snapshot: req.query?.snapshot ? String(req.query.snapshot) : undefined,
  scope: req.query?.scope ? String(req.query.scope) : undefined,
      };
  req.log.info({ id, action: payload.action, snapshot: payload.snapshot }, 'eip tags route start');
      let res = await app.nats.request(`df.connectivity.eip.tags.v1.${id}`, payload, 10_000);
      if (res?.error === 'not_found') {
        // Attempt temporary start similar to browse/attributes logic
        try {
          const saved = await loadConnectionConfig(app.db, id);
          if (saved) {
            const wasEnabled = saved.enabled !== false; // default true if missing
            try {
              app.nats.publish('df.connectivity.config.v1', {
                schema: 'connectivity.config@v1',
                ts: new Date().toISOString(),
                op: 'upsert',
                conn: { ...cleanConnForNats(saved), enabled: true },
              });
            } catch {}
            // Wait up to 8s for connected or error state
            const start = Date.now();
            while (Date.now() - start < 8000) {
              const s = app.connectivityStatus.get(id);
              if (s && (s.state === 'connected' || s.state === 'error')) break;
              await new Promise((r) => setTimeout(r, 150));
            }
            try { res = await app.nats.request(`df.connectivity.eip.tags.v1.${id}`, payload, 10_000); } catch {}
            if (!wasEnabled) {
              const isSnapshot = payload.action && payload.action.startsWith('snapshot.');
              if (isSnapshot) {
                req.log.info({ id, action: payload.action }, 'retaining transient EIP connection for snapshot lifecycle');
              } else {
                // Tear back down so we don't leave it running for non-snapshot browse
                try {
                  app.nats.publish('df.connectivity.config.v1', {
                    schema: 'connectivity.config@v1',
                    ts: new Date().toISOString(),
                    op: 'delete',
                    id,
                  });
                } catch {}
              }
            }
          }
        } catch {}
      }
  req.log.debug({ id, count: Array.isArray(res?.items) ? res.items.length : 'n/a', error: res?.error }, 'eip tags route done');
      return res;
    } catch (e) {
      req.log.warn({ err: e, id }, 'eip tags failed');
      return reply.code(500).send({ error: 'eip_tags_failed' });
    }
  });

  // EIP tag list & snapshot actions via POST (JSON body) to support snapshot.create/page/delete
  app.post('/eip/tags/:id', async (req, reply) => {
    const userId = req.user?.sub;    const id = req.params?.id;
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    try {
      let b = req.body || {};
      // If client forgot JSON content-type Fastify may deliver a string/buffer
      if (b && typeof b === 'string') {
        try { b = JSON.parse(b); } catch { b = {}; }
      }
      const payload = {
        action: b.action ? String(b.action) : undefined,
        snapshot: b.snapshot ? String(b.snapshot) : undefined,
        scope: b.scope ? String(b.scope) : undefined,
        program: b.program ? String(b.program) : undefined,
        page: b.page != null ? Number(b.page) : undefined,
        limit: b.limit != null ? Number(b.limit) : undefined,
        search: b.search ? String(b.search) : undefined,
        refresh: !!b.refresh,
        raw: !!b.raw,
      };
      req.log.debug({ id, action: payload.action, page: payload.page, scope: payload.scope }, 'eip tags POST route start');
      const res = await app.nats.request(`df.connectivity.eip.tags.v1.${id}`, payload, 15_000);
      return res;
    } catch (e) {
      req.log.warn({ err: e, id }, 'eip tags post failed');
      return reply.code(500).send({ error: 'eip_tags_failed' });
    }
  });

  // EIP snapshot heartbeat to keep snapshots alive while user is working
  app.post('/eip/snapshot/:id/heartbeat', async (req, reply) => {
    const userId = req.user?.sub;    const id = req.params?.id;
    const snapshotId = req.body?.snapshotId;
    if (!id) return reply.code(400).send({ error: 'missing connection id' });
    if (!snapshotId) return reply.code(400).send({ error: 'missing snapshotId' });
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    
    try {
      const payload = {
        action: 'snapshot.heartbeat',
        snapshot: snapshotId
      };
      req.log.debug({ id, snapshotId }, 'eip snapshot heartbeat');
      const res = await app.nats.request(`df.connectivity.eip.tags.v1.${id}`, payload, 5_000);
      return res;
    } catch (e) {
      req.log.warn({ err: e, id, snapshotId }, 'eip snapshot heartbeat failed');
      return reply.code(500).send({ error: 'eip_heartbeat_failed' });
    }
  });

  // EIP tag type resolution - resolve data types for specific tag names
  app.post('/eip/resolve-types/:id', async (req, reply) => {
    const userId = req.user?.sub;
    const id = req.params?.id;
    const tagNames = req.body?.tag_names;
    
    if (!id) return reply.code(400).send({ error: 'missing connection id' });
    if (!Array.isArray(tagNames) || tagNames.length === 0) {
      return reply.code(400).send({ error: 'missing or invalid tag_names array' });
    }
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    
    try {
      const payload = {
        action: 'resolve_types',
        tag_names: tagNames
      };
      req.log.debug({ id, tagCount: tagNames.length }, 'eip resolve types request');
      const res = await app.nats.request(`df.connectivity.eip.tags.v1.${id}`, payload, 10_000);
      return res;
    } catch (e) {
      req.log.warn({ err: e, id, tagCount: tagNames.length }, 'eip resolve types failed');
      return reply.code(500).send({ error: 'eip_resolve_types_failed' });
    }
  });

  // Test connection helper: publish a temporary config and wait for connected/error
  app.post('/test', async (req, reply) => {
    const userId = req.user?.sub;
    // Requires write permission since we publish a config message
    if (!app.nats?.healthy()) return reply.code(503).send({ error: 'nats_unavailable' });
    
    const body = req.body || {};
    const connType = body.type || 'opcua-client';
    const timeoutMs = Math.max(1000, Math.min(60_000, Number(body.timeout_ms || body.timeout || 15_000)));
    
    // Validate required fields based on connection type
    if (connType === 'opcua-client' || connType === 'opcua-server') {
      const endpoint = body.endpoint;
      if (!endpoint || typeof endpoint !== 'string') {
        return reply.code(400).send({ error: 'missing endpoint' });
      }
    } else if (connType === 'eip') {
      const host = body.host;
      if (!host || typeof host !== 'string') {
        return reply.code(400).send({ error: 'missing host' });
      }
    } else if (connType === 's7') {
      const host = body.host;
      if (!host || typeof host !== 'string') {
        return reply.code(400).send({ error: 'missing host' });
      }
    }

    const id = body.id && typeof body.id === 'string' ? body.id : `test-${randomUUID()}`;
    const startedAt = Date.now();
    
    // Build connection config based on type
    let conn = { id, type: connType, enabled: true };
    
    if (connType === 'opcua-client' || connType === 'opcua-server') {
      conn.endpoint = body.endpoint;
    } else if (connType === 'eip') {
      conn.host = body.host;
      conn.slot = body.slot !== undefined ? body.slot : 0;
      conn.port = body.port !== undefined ? body.port : 44818;
      conn.timeout = body.timeout !== undefined ? body.timeout : 5000;
    } else if (connType === 's7') {
      conn.host = body.host;
      conn.rack = body.rack !== undefined ? body.rack : 0;
      conn.slot = body.slot !== undefined ? body.slot : 1;
      conn.port = body.port !== undefined ? body.port : 102;
    }
    
    // Publish upsert
    try {
      app.nats.publish('df.connectivity.config.v1', {
        schema: 'connectivity.config@v1',
        ts: new Date().toISOString(),
        op: 'upsert',
        conn: cleanConnForNats(conn),
      });
    } catch (e) {
      return reply.code(503).send({ error: 'publish_failed' });
    }

    // Wait for terminal status
    let final = null;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    while (Date.now() - startedAt < timeoutMs) {
      const s = app.connectivityStatus.get(id);
      if (s && (s.state === 'connected' || s.state === 'error')) { final = s; break; }
      await wait(200);
    }

    // Tear down the temporary connection
    try {
      app.nats.publish('df.connectivity.config.v1', {
        schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'delete', id,
      });
    } catch {}

    if (!final) return { id, state: 'timeout' };
    return { id, state: final.state, reason: final.reason || undefined, ts: final.ts };
  });

  // Persisted connections
  app.get('/connections', async (_req, _reply) => {
    try {
      const { rows } = await app.db.query(
        `SELECT id, name, type, enabled, config_data, max_tags_per_group, max_concurrent_connections
         FROM connections
         WHERE deleted_at IS NULL
         ORDER BY name ASC`
      );
      const items = rows.map((r) => ({ 
        id: r.id, 
        name: r.name, 
        type: r.type, 
        enabled: r.enabled, 
        max_tags_per_group: r.max_tags_per_group,
        max_concurrent_connections: r.max_concurrent_connections,
        ...(r.config_data || {}) 
      }));
      
      // Add INTERNAL tags as a pseudo-connection
      items.unshift({
        id: 'INTERNAL',
        name: 'Internal Tags',
        type: 'INTERNAL',
        enabled: true,
        max_tags_per_group: null,
        max_concurrent_connections: null
      });
      
      return { items };
    } catch (e) {
      app.log.error({ err: e }, 'failed to load saved connections');
      return { items: [] };
    }
  });

  app.post('/connections', async (req, reply) => {
    const userId = req.user?.sub;    const body = req.body || {};
    const op = body.op;
    if (!op || !['upsert', 'delete'].includes(op)) return reply.code(400).send({ error: 'invalid op' });
    try {
      if (op === 'delete') {
        const id = body.id;
        if (!id) return reply.code(400).send({ error: 'missing id' });
        
        // Prevent deletion of system connections
        const saved = await loadConnectionConfig(app.db, id);
        if (saved?.is_system_connection) {
          return reply.code(403).send({ error: 'cannot_delete_system_connection', message: 'System connections cannot be deleted' });
        }
        
        // Delete from connections table
        await app.db.query(`UPDATE connections SET deleted_at = now() WHERE id = $1`, [id]);
        // Best-effort: stop running connection
        try { if (app.nats?.healthy()) app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'delete', id }); } catch {}
        // Purge all historical rows for this connection
        let deleted = 0;
        try {
          const tsdb = app.tsdb || app.db;
          const res = await tsdb.query(`delete from tag_values where connection_id=$1`, [id]);
          deleted = Number(res?.rowCount || 0);
        } catch (e) {
          req.log.warn({ err: e, id }, 'failed to purge connection history');
        }
        
        // Send connection removal notification to enhanced telemetry service (via NATS)
        try {
          if (app.nats?.healthy()) {
            app.nats.publish('df.connectivity.tags.changed.v1', {
              schema: 'connectivity.tags.changed@v1',
              ts: new Date().toISOString(),
              connection_id: id,
              op: 'connection_removed'
            });
          }
        } catch (e) {
          req.log.warn({ err: e, id }, 'failed to send connection removal notification');
        }
        
        // delayed sweep in case of late arrivals
        try { setTimeout(async () => { try { const tsdb = app.tsdb || app.db; await tsdb.query(`delete from tag_values where connection_id=$1`, [id]); } catch {} }, 1500); } catch {}
        return { ok: true, deleted_rows: deleted };
      }
      // upsert
      const conn = body.conn || {};
      if (!conn.id) conn.id = randomUUID(); // Auto-generate UUID if missing
      
      const { id, name, type, enabled, ...configData } = conn;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'missing conn.name' });
      }
      if (!type || typeof type !== 'string') {
        return reply.code(400).send({ error: 'missing conn.type' });
      }

      // Prevent modification of system connections
      const existing = await loadConnectionConfig(app.db, id);
      if (existing?.is_system_connection) {
        return reply.code(403).send({ error: 'cannot_modify_system_connection', message: 'System connections cannot be modified' });
      }
      
      // Extract EIP-specific fields
      const maxTagsPerGroup = conn.max_tags_per_group ?? 500;
      const maxConcurrentConnections = conn.max_concurrent_connections ?? 8;
      
      // Upsert into connections table with config_data
      await app.db.query(
        `INSERT INTO connections (id, name, type, enabled, config_data, max_tags_per_group, max_concurrent_connections)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id)
         DO UPDATE SET name = $2, type = $3, enabled = $4, config_data = $5, max_tags_per_group = $6, max_concurrent_connections = $7, updated_at = now()`,
        [id, name.trim(), type, enabled !== false, configData, maxTagsPerGroup, maxConcurrentConnections]
      );
      
      return { ok: true, id };
    } catch (e) {
      req.log.error({ err: e }, 'failed to save connection');
      return reply.code(500).send({ error: 'failed to save' });
    }
  });

  // Tag save endpoint using new schema only
  app.post('/tags/save', async (req, reply) => {
    const userId = req.user?.sub;    const body = req.body || {};
    const id = String(body.id || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const addSubscribe = !!body.subscribe;
    const pollGroupId = Number(body.poll_group_id) || 5; // Default to Standard (1000ms)
    const unitId = body.unit_id ? Number(body.unit_id) : null; // Optional unit of measure
    // Write on change settings (enabled by default)
    const onChangeEnabled = body.on_change_enabled !== undefined ? body.on_change_enabled : true;
    const onChangeDeadband = body.on_change_deadband !== undefined ? Number(body.on_change_deadband) : 0;
    const onChangeDeadbandType = body.on_change_deadband_type || 'absolute';
    const onChangeHeartbeat = body.on_change_heartbeat_ms !== undefined ? Number(body.on_change_heartbeat_ms) : 60000;
    
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!items.length) return reply.code(400).send({ error: 'empty items' });
    
    try {
      // Get connection config to determine driver type
      const conn = await loadConnectionConfig(app.db, id);
      if (!conn) return reply.code(404).send({ error: 'not_found' });
      
      // Map connection type to driver type
      const driverTypeMap = { 'opcua-client': 'OPCUA', 's7': 'S7', 'eip': 'EIP' };
      const driverType = driverTypeMap[conn.type];
      if (!driverType) {
        return reply.code(400).send({ error: 'unsupported_driver_type' });
      }

  const added = [];
      
      // Save to tag_metadata table
      for (const it of items) {
        const tagPath = String(it?.nodeId || '').trim();
        if (!tagPath) continue;
        // Determine tag name and data type based on driver type
        // For OPC UA: prefer DisplayName (fallback BrowseName -> NodeId); DataType from attributes when provided
        // For EIP/S7: use provided name/type and normalize PLC types
        const tagName = (driverType === 'OPCUA')
          ? (it?.displayName || it?.name || it?.browseName || tagPath)
          : (it?.name || it?.browseName || tagPath);

        let dataType = (driverType === 'OPCUA')
          ? (it?.dataType || it?.type || 'UNKNOWN')
          : (it?.type || it?.dataType || 'UNKNOWN');

        if (typeof dataType === 'string') {
          dataType = dataType.replace(/\[.*?\].*$/, '').trim();
          if (driverType !== 'OPCUA') {
            const typeMap = {
              'DINT': 'DINT',
              'REAL': 'REAL',
              'INT': 'INT',
              'SINT': 'SINT',
              'LINT': 'LINT',
              'UDINT': 'UDINT',
              'UINT': 'UINT',
              'USINT': 'USINT',
              'BOOL': 'BOOL',
              'LREAL': 'LREAL',
              'STRING': 'STRING'
            };
            dataType = typeMap[dataType.toUpperCase()] || dataType;
          }
        }
        
        try {
          const { rows: insertResult } = await app.db.query(`
            INSERT INTO tag_metadata (
              connection_id, driver_type, tag_path, tag_name, data_type, 
              poll_group_id, is_subscribed, status, metadata, unit_id,
              on_change_enabled, on_change_deadband, on_change_deadband_type, on_change_heartbeat_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11, $12, $13)
            ON CONFLICT (connection_id, tag_path, driver_type) 
            DO UPDATE SET
              tag_name = EXCLUDED.tag_name,
              data_type = EXCLUDED.data_type,
              poll_group_id = EXCLUDED.poll_group_id,
              is_subscribed = EXCLUDED.is_subscribed OR tag_metadata.is_subscribed,
              status = 'active',
              delete_job_id = NULL,
              delete_started_at = NULL,
              deleted_at = NULL,
              original_subscribed = NULL,
              metadata = EXCLUDED.metadata,
              unit_id = COALESCE(EXCLUDED.unit_id, tag_metadata.unit_id),
              on_change_enabled = EXCLUDED.on_change_enabled,
              on_change_deadband = EXCLUDED.on_change_deadband,
              on_change_deadband_type = EXCLUDED.on_change_deadband_type,
              on_change_heartbeat_ms = EXCLUDED.on_change_heartbeat_ms,
              updated_at = now()
            RETURNING tag_id, tag_name
          `, [
            id, // connection_id
            driverType,
            tagPath,
            tagName,
            dataType,
            pollGroupId,
            addSubscribe,
            JSON.stringify({
              original_request: it,
              saved_at: new Date().toISOString()
            }),
            unitId,
            onChangeEnabled,
            onChangeDeadband,
            onChangeDeadbandType,
            onChangeHeartbeat
          ]);
          
          if (insertResult.length > 0) {
            added.push({
              tag_id: insertResult[0].tag_id,
              tag_name: insertResult[0].tag_name,
              nodeId: tagPath,
              poll_group_id: pollGroupId
            });
          }
        } catch (dbErr) {
          req.log.warn({ err: dbErr, tagPath }, 'Failed to insert tag metadata');
        }
      }

      // If subscribing, ensure the connection is enabled so telemetry can flow
      try {
        if (addSubscribe && conn.enabled !== true) {
          // Persist enabled=true in connections table
          await app.db.query(
            `UPDATE connections SET enabled = true, updated_at = now() WHERE id = $1`,
            [id]
          );
          conn.enabled = true;
          req.log.info({ id }, 'Enabled connection due to subscribe request');
        }
      } catch (e) {
        req.log.warn({ err: e, id }, 'Failed to persist enabled=true; continuing with NATS publish');
        // Best-effort: still set enabled in the event to bring it up transiently
        conn = { ...conn, enabled: true };
      }

      // Trigger multi-rate driver update via NATS
      try { 
        if (app.nats?.healthy()) {
          // Send general config update
          app.nats.publish('df.connectivity.config.v1', { 
            schema: 'connectivity.config@v1', 
            ts: new Date().toISOString(), 
            op: 'upsert', 
            conn: cleanConnForNats(conn)
          }); 
          
          // Send specific tag addition notifications
          for (const addedTag of added) {
            app.nats.publish('df.connectivity.tags.changed.v1', {
              schema: 'connectivity.tags.changed@v1',
              ts: new Date().toISOString(),
              connection_id: id,
              op: 'tag_added',
              added_tag: {
                tag_id: addedTag.tag_id,
                connection_id: id,
                driver_type: driverType,
                tag_path: addedTag.nodeId,
                tag_name: addedTag.tag_name,
                poll_group_id: addedTag.poll_group_id
              }
            });
          }
          
          // Send summary notification
          if (added.length > 0) {
            app.nats.publish('df.connectivity.tags.changed.v1', {
              schema: 'connectivity.tags.changed@v1',
              ts: new Date().toISOString(),
              connection_id: id,
              op: 'tags_added_summary',
              added_count: added.length
            });
          }
        }
      } catch {}
      
      return { ok: true, added, schema: 'new' };
    } catch (e) {
      req.log.error({ err: e }, 'failed to save tags');
      return reply.code(500).send({ error: 'failed_to_save' });
    }
  });

  // Legacy endpoint alias for backward compatibility
  app.post('/tags/save-legacy', async (req, reply) => {
    // Force legacy mode
    req.body = { ...req.body, use_new_schema: false };
    return app.inject({
      method: 'POST',
      url: '/tags/save',
      payload: req.body,
      headers: req.headers
    }).then(response => reply.code(response.statusCode).send(response.json()));
  });

  // Update poll group for specific tags
  app.put('/tags/poll-group', async (req, reply) => {
    const userId = req.user?.sub;    
    const body = req.body || {};
    const tagIds = Array.isArray(body.tag_ids) ? body.tag_ids : [];
    const pollGroupId = Number(body.poll_group_id);
    
    if (!tagIds.length) return reply.code(400).send({ error: 'missing tag_ids' });
    if (!Number.isInteger(pollGroupId) || pollGroupId < 1 || pollGroupId > 10) {
      return reply.code(400).send({ error: 'invalid poll_group_id' });
    }
    
    try {
      const { rows } = await app.db.query(`
        UPDATE tag_metadata 
        SET poll_group_id = $1, updated_at = now()
        WHERE tag_id = ANY($2)
        RETURNING tag_id, tag_name, connection_id
      `, [pollGroupId, tagIds]);
      
      // Trigger driver updates for affected connections
      const connectionIds = [...new Set(rows.map(r => r.connection_id))];
      for (const connId of connectionIds) {
        try {
          const conn = await loadConnectionConfig(app.db, connId);
          if (conn && app.nats?.healthy()) {
            app.nats.publish('df.connectivity.config.v1', { 
              schema: 'connectivity.config@v1', 
              ts: new Date().toISOString(), 
              op: 'upsert', 
              conn: cleanConnForNats(conn)
            });
          }
        } catch {}
      }
      
      return { 
        ok: true, 
        updated_tags: rows.length,
        affected_connections: connectionIds.length 
      };
    } catch (e) {
      req.log.error({ err: e }, 'failed to update poll groups');
      return reply.code(500).send({ error: 'failed_to_update' });
    }
  });

  // Get tags for a connection (enhanced with poll group info)
  app.get('/tags/:connectionId', async (req, reply) => {
    const connectionId = req.params.connectionId;
    // Reverted semantics: hide deleted by default; include them only if include_deleted=true
    const includeDeleted = req.query?.include_deleted === 'true';
    
    try {
      // Handle INTERNAL tags separately
      if (connectionId === 'INTERNAL') {
        const { rows } = await app.db.query(`
          SELECT 
            tm.tag_id,
            tm.connection_id,
            tm.driver_type,
            tm.tag_path,
            tm.tag_name,
            tm.data_type,
            tm.is_subscribed,
            coalesce(tm.status,'active') as status,
            tm.created_at,
            tm.updated_at,
            tm.unit_id,
            u.name as unit_name,
            u.symbol as unit_symbol,
            u.category as unit_category
          FROM tag_metadata tm
          LEFT JOIN units_of_measure u ON tm.unit_id = u.id
          WHERE tm.driver_type = 'INTERNAL'
            ${includeDeleted ? '' : "AND coalesce(tm.status,'active') <> 'deleted'"}
          ORDER BY tm.tag_name ASC
        `);
        
        return { 
          connection_id: connectionId, 
          tags: rows, 
          schema: 'internal',
          total_tags: rows.length,
          deleted_included: includeDeleted ? 1 : 0
        };
      }
      
      // Query tag_metadata with poll group info (new schema only)
      const { rows } = await app.db.query(`
        SELECT 
          tm.tag_id,
          tm.connection_id,
          tm.driver_type,
          tm.tag_path,
          tm.tag_name,
          tm.data_type,
          tm.is_subscribed,
          coalesce(tm.status,'active') as status,
          tm.delete_job_id,
          tm.original_subscribed,
          tm.delete_started_at,
          tm.deleted_at,
          tm.created_at,
          tm.updated_at,
          tm.unit_id,
          pg.group_id as poll_group_id,
          pg.name as poll_group_name,
          pg.poll_rate_ms,
          pg.description as poll_group_description,
          u.name as unit_name,
          u.symbol as unit_symbol,
          u.category as unit_category
        FROM tag_metadata tm
        JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
        LEFT JOIN units_of_measure u ON tm.unit_id = u.id
        WHERE tm.connection_id = $1
          ${includeDeleted ? '' : "AND coalesce(tm.status,'active') <> 'deleted'"}
        ORDER BY pg.poll_rate_ms ASC, tm.tag_name ASC
      `, [connectionId]);
      let totalDeleted = null;
      if (!includeDeleted) {
        try {
          const { rows: del } = await app.db.query(`select count(*)::int as n from tag_metadata where connection_id=$1 and coalesce(status,'active')='deleted'`, [connectionId]);
          totalDeleted = del[0]?.n ?? null;
        } catch {}
      }
      
      return { 
        connection_id: connectionId, 
        tags: rows, 
        schema: 'new',
        total_tags: rows.length,
        deleted_included: includeDeleted ? 1 : 0,
        total_deleted: totalDeleted
      };
    } catch (e) {
      req.log.error({ err: e }, 'failed to get tags');
      return reply.code(500).send({ error: 'failed_to_get_tags' });
    }
  });

  // Get tags by poll group
  app.get('/tags/by-poll-group/:groupId', async (req, reply) => {
    const userId = req.user?.sub;    
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId < 1 || groupId > 10) {
      return reply.code(400).send({ error: 'invalid_poll_group_id' });
    }
    
    try {
      const { rows } = await app.db.query(`
   SELECT tm.tag_id, tm.connection_id, tm.driver_type, tm.tag_path, 
     tm.tag_name, tm.data_type, tm.is_subscribed, tm.status, tm.delete_job_id, tm.original_subscribed,
     tm.delete_started_at, tm.deleted_at, tm.metadata,
     pg.name as poll_group_name, pg.poll_rate_ms, pg.description
        FROM tag_metadata tm
        JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
        WHERE tm.poll_group_id = $1 AND tm.is_subscribed = true
        ORDER BY tm.connection_id, tm.tag_path
      `, [groupId]);
      
      return { 
        poll_group_id: groupId,
        tags: rows,
        count: rows.length
      };
    } catch (e) {
      req.log.error({ err: e }, 'failed to get tags by poll group');
      return reply.code(500).send({ error: 'failed_to_get_tags_by_poll_group' });
    }
  });

  // Bulk update poll groups for tags
  app.patch('/tags/poll-groups', async (req, reply) => {
    const userId = req.user?.sub;    
    const body = req.body || {};
    const updates = Array.isArray(body.updates) ? body.updates : [];
    
    if (!updates.length) {
      return reply.code(400).send({ error: 'no_updates_provided' });
    }
    
    try {
      let updatedCount = 0;
      
      for (const update of updates) {
        const { tag_id, poll_group_id } = update;
        if (!Number.isInteger(tag_id) || !Number.isInteger(poll_group_id)) continue;
        
        const { rowCount } = await app.db.query(`
          UPDATE tag_metadata 
          SET poll_group_id = $1, updated_at = now()
          WHERE tag_id = $2
        `, [poll_group_id, tag_id]);
        
        updatedCount += rowCount;
      }
      
      return { ok: true, updated_count: updatedCount };
    } catch (e) {
      req.log.error({ err: e }, 'failed to update poll groups');
      return reply.code(500).send({ error: 'failed_to_update_poll_groups' });
    }
  });

  // Bulk update units for tags
  app.patch('/tags/units', async (req, reply) => {
    const userId = req.user?.sub;    
    const body = req.body || {};
    const tag_ids = Array.isArray(body.tag_ids) ? body.tag_ids : [];
    const unit_id = body.unit_id !== undefined ? body.unit_id : null;
    
    if (!tag_ids.length) {
      return reply.code(400).send({ error: 'no_tag_ids_provided' });
    }
    
    // Validate unit_id if provided
    if (unit_id !== null && !Number.isInteger(unit_id)) {
      return reply.code(400).send({ error: 'invalid_unit_id' });
    }
    
    try {
      // If unit_id is provided, verify it exists
      if (unit_id !== null) {
        const { rows: unitCheck } = await app.db.query(
          'SELECT id FROM units_of_measure WHERE id = $1',
          [unit_id]
        );
        if (unitCheck.length === 0) {
          return reply.code(404).send({ error: 'unit_not_found' });
        }
      }
      
      // Update tags
      const placeholders = tag_ids.map((_, i) => `$${i + 2}`).join(',');
      const { rowCount } = await app.db.query(
        `UPDATE tag_metadata 
         SET unit_id = $1, updated_at = now()
         WHERE tag_id IN (${placeholders})`,
        [unit_id, ...tag_ids]
      );
      
      return { ok: true, updated_count: rowCount };
    } catch (e) {
      req.log.error({ err: e }, 'failed to update tag units');
      return reply.code(500).send({ error: 'failed_to_update_tag_units' });
    }
  });

  // Bulk update write on change settings for tags
  app.patch('/tags/on-change', async (req, reply) => {
    const userId = req.user?.sub;    
    const body = req.body || {};
    const tag_ids = Array.isArray(body.tag_ids) ? body.tag_ids : [];
    const on_change_enabled = body.on_change_enabled ?? false;
    const on_change_deadband = body.on_change_deadband ?? 0;
    const on_change_deadband_type = body.on_change_deadband_type ?? 'absolute';
    const on_change_heartbeat_ms = body.on_change_heartbeat_ms ?? 60000;
    
    if (!tag_ids.length) {
      return reply.code(400).send({ error: 'no_tag_ids_provided' });
    }
    
    // Validate deadband_type
    if (!['absolute', 'percent'].includes(on_change_deadband_type)) {
      return reply.code(400).send({ error: 'invalid_deadband_type' });
    }
    
    try {
      // Update tags
      const placeholders = tag_ids.map((_, i) => `$${i + 5}`).join(',');
      const { rowCount } = await app.db.query(
        `UPDATE tag_metadata 
         SET on_change_enabled = $1, 
             on_change_deadband = $2, 
             on_change_deadband_type = $3,
             on_change_heartbeat_ms = $4,
             updated_at = now()
         WHERE tag_id IN (${placeholders})`,
        [on_change_enabled, on_change_deadband, on_change_deadband_type, on_change_heartbeat_ms, ...tag_ids]
      );
      
      req.log.info({ tag_ids, on_change_enabled, on_change_deadband, on_change_deadband_type, on_change_heartbeat_ms, updated_count: rowCount }, 'updated tag write on change settings');
      
      return { ok: true, updated_count: rowCount };
    } catch (e) {
      req.log.error({ err: e }, 'failed to update tag write on change');
      return reply.code(500).send({ error: 'failed_to_update_on_change' });
    }
  });

  // Data migration endpoints
  app.post('/migration/tags/preview', async (req, reply) => {
    const userId = req.user?.sub;    
    try {
      const { rows } = await app.db.query(`
        SELECT migrated_connections, migrated_tags, errors 
        FROM migrate_existing_tags_to_metadata()
      `);
      
      return { 
        preview: true,
        ...rows[0],
        message: 'This is a preview. Use /migration/tags/execute to actually migrate data.'
      };
    } catch (e) {
      req.log.error({ err: e }, 'migration preview failed');
      return reply.code(500).send({ error: 'migration_preview_failed' });
    }
  });

  app.post('/migration/tags/execute', async (req, reply) => {
    const userId = req.user?.sub;    
    const force = req.body?.force === true;
    
    try {
      // Check if migration has already been run
      const { rows: existingTags } = await app.db.query(`
        SELECT COUNT(*) as count FROM tag_metadata
      `);
      
      if (existingTags[0].count > 0 && !force) {
        return reply.code(400).send({ 
          error: 'migration_already_exists',
          message: 'Tag metadata already exists. Use force=true to proceed anyway.',
          existing_tags: existingTags[0].count
        });
      }
      
      // Execute migration
      const { rows } = await app.db.query(`
        SELECT migrated_connections, migrated_tags, errors 
        FROM migrate_existing_tags_to_metadata()
      `);
      
      req.log.info(rows[0], 'Tag migration completed');
      
      return { 
        migration_completed: true,
        ...rows[0],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      req.log.error({ err: e }, 'migration execution failed');
      return reply.code(500).send({ error: 'migration_execution_failed' });
    }
  });

  app.get('/migration/status', async (req, reply) => {
    try {
      const { rows: tagCount } = await app.db.query('SELECT COUNT(*) as count FROM tag_metadata');
      const { rows: configCount } = await app.db.query(`
        SELECT COUNT(*) as count FROM connections WHERE deleted_at IS NULL
      `);
      const { rows: mappingStatus } = await app.db.query(`
        SELECT connection_id, migrated_tag_count 
        FROM tag_migration_status 
        ORDER BY connection_id
      `);
      
      return {
        new_schema_tags: tagCount[0].count,
        total_connections: configCount[0].count,
        migration_details: mappingStatus,
        migration_available: configCount[0].count > 0,
        migration_completed: tagCount[0].count > 0
      };
    } catch (e) {
      req.log.error({ err: e }, 'failed to get migration status');
      return reply.code(500).send({ error: 'failed_to_get_migration_status' });
    }
  });

  // List saved tags for a connection with basic meta
  app.get('/tags/saved', async (req, reply) => {
    const userId = req.user?.sub;    const id = String(req.query?.id || req.query?.conn_id || '').trim();
    if (!id) return reply.code(400).send({ error: 'missing id' });
    try {
      const conn = await loadConnectionConfig(app.db, id);
      if (!conn) return reply.code(404).send({ error: 'not_found' });
      const map = (conn.driver_opts && conn.driver_opts.tag_map) || {};
      const meta = (conn.driver_opts && conn.driver_opts.tag_meta) || {};
      const pollMs = conn.driver_opts?.sampling_ms ?? conn.poll_ms ?? null;
      const items = Object.keys(map).map((k) => {
        const tagId = Number(k);
        const node_id = String(map[k]);
        const m = meta && meta[tagId] || {};
        return {
          tag_id: tagId,
          name: m.name || undefined,
          type: m.type || undefined,
          node_id,
          source: conn.type || undefined,
          poll_ms: pollMs || undefined,
        };
      });
      return { items, poll_ms: pollMs || undefined, conn: { id: conn.id, name: conn.name, type: conn.type, endpoint: conn.endpoint, host: conn.host } };
    } catch (e) {
      req.log.error({ err: e }, 'failed to load saved tags');
      return reply.code(500).send({ error: 'failed_to_load' });
    }
  });

  // Update poll/sampling rate for a connection
  app.post('/tags/poll', async (req, reply) => {
    const userId = req.user?.sub;    const body = req.body || {};
    const id = String(body.id || body.conn_id || '').trim();
    let pollMs = Number(body.poll_ms ?? body.sampling_ms);
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!Number.isFinite(pollMs) || pollMs <= 0) return reply.code(400).send({ error: 'bad_poll_ms' });
    try {
      const conn = await loadConnectionConfig(app.db, id);
      if (!conn) return reply.code(404).send({ error: 'not_found' });
      conn.driver_opts = conn.driver_opts || {};
      conn.driver_opts.sampling_ms = pollMs;
      // maintain legacy field for drivers that still read poll_ms
      conn.poll_ms = pollMs;
      await saveConnectionConfig(app.db, id, conn);
      try {
        if (app.nats?.healthy()) app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'upsert', conn: cleanConnForNats({ id, name: conn.name, enabled: conn.enabled, ...conn }) });
      } catch {}
      return { ok: true, poll_ms: pollMs };
    } catch (e) {
      req.log.error({ err: e }, 'failed to update poll rate');
      return reply.code(500).send({ error: 'failed_to_update' });
    }
  });

  // Remove (deactivate) a tag: mark pending_delete instead of full removal; enqueue purge job
  app.post('/tags/remove', async (req, reply) => {
    const userId = req.user?.sub;    const body = req.body || {};
    const id = String(body.id || body.conn_id || '').trim();
    const tagId = Number(body.tag_id);
    const batchSize = body.batch_size != null ? Number(body.batch_size) : undefined;
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!Number.isFinite(tagId)) return reply.code(400).send({ error: 'missing tag_id' });
    try {
      const conn = await loadConnectionConfig(app.db, id);
      if (!conn) return reply.code(404).send({ error: 'not_found' });
      conn.driver_opts = conn.driver_opts || {};
      const tag_map = conn.driver_opts.tag_map = conn.driver_opts.tag_map || {};
      const tag_meta = conn.driver_opts.tag_meta = conn.driver_opts.tag_meta || {};

      const wasSubscribed = Array.isArray(conn.subscribe) && conn.subscribe.some(x => Number(x) === tagId);
      if (Array.isArray(conn.subscribe)) {
        conn.subscribe = conn.subscribe.filter(x => Number(x) !== tagId); // stop polling
      }

      // Leave mapping & meta so UI still shows tag (grayed) but mark status pending_delete in tag_metadata table
      try {
        await app.db.query(`update tag_metadata set status='pending_delete', original_subscribed=coalesce(original_subscribed,$1) where connection_id=$2 and tag_id=$3`, [wasSubscribed, id, tagId]);
      } catch (e) {
        req.log.warn({ err: e, id, tagId }, 'failed to mark tag_metadata pending_delete');
      }

      await saveConnectionConfig(app.db, id, conn);

      try {
        if (app.nats?.healthy()) {
          app.nats.publish('df.connectivity.config.v1', { schema: 'connectivity.config@v1', ts: new Date().toISOString(), op: 'upsert', conn: cleanConnForNats({ id, name: conn.name, enabled: conn.enabled, ...conn }) });
          app.nats.publish('df.connectivity.tags.changed.v1', { schema: 'connectivity.tags.changed@v1', ts: new Date().toISOString(), connection_id: id, op: 'tag_pending_delete', removed_tag_id: tagId });
        }
      } catch {}

      let jobId = null;
      try {
        const job = await app.jobs.enqueue('tag_delete', { connection_id: id, tag_id: tagId, batch_size: batchSize });
        jobId = job.id;
        await app.db.query(`update tag_metadata set delete_started_at=now(), status='deleting' where connection_id=$1 and tag_id=$2`, [id, tagId]);
      } catch (e) {
        req.log.warn({ err: e, id, tagId }, 'failed to enqueue tag_delete job');
      }
      return { ok: true, job_id: jobId, status: jobId ? 'deleting' : 'pending_delete' };
    } catch (e) {
      req.log.error({ err: e }, 'failed to deactivate tag');
      return reply.code(500).send({ error: 'failed_to_remove' });
    }
  });

  // Batch remove multiple tags: mark all pending_delete, enqueue single job for all tags
  app.post('/tags/remove-batch', async (req, reply) => {
    const userId = req.user?.sub;    const body = req.body || {};
    const id = String(body.id || body.conn_id || '').trim();
    const tagIds = body.tag_ids;
    const batchSize = body.batch_size != null ? Number(body.batch_size) : undefined;
    
    if (!id) return reply.code(400).send({ error: 'missing id' });
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return reply.code(400).send({ error: 'missing or empty tag_ids array' });
    }
    
    // Normalize tag IDs
    const normalizedTagIds = [...new Set(tagIds.map(Number).filter(n => Number.isFinite(n)))];
    if (normalizedTagIds.length === 0) {
      return reply.code(400).send({ error: 'no valid tag_ids' });
    }
    
    try {
      const conn = await loadConnectionConfig(app.db, id);
      if (!conn) return reply.code(404).send({ error: 'not_found' });
      
      conn.driver_opts = conn.driver_opts || {};
      const tag_map = conn.driver_opts.tag_map = conn.driver_opts.tag_map || {};
      const tag_meta = conn.driver_opts.tag_meta = conn.driver_opts.tag_meta || {};

      // Remove all tags from subscription
      const originalSubscribed = [];
      if (Array.isArray(conn.subscribe)) {
        for (const tagId of normalizedTagIds) {
          const wasSubscribed = conn.subscribe.some(x => Number(x) === tagId);
          if (wasSubscribed) originalSubscribed.push(tagId);
        }
        conn.subscribe = conn.subscribe.filter(x => !normalizedTagIds.includes(Number(x)));
      }

      // Mark all tags as pending_delete in tag_metadata
      try {
        for (const tagId of normalizedTagIds) {
          const wasSubscribed = originalSubscribed.includes(tagId);
          await app.db.query(
            `update tag_metadata set status='pending_delete', original_subscribed=coalesce(original_subscribed,$1) where connection_id=$2 and tag_id=$3`,
            [wasSubscribed, id, tagId]
          );
        }
      } catch (e) {
        req.log.warn({ err: e, id, tagIds: normalizedTagIds }, 'failed to mark tags pending_delete');
      }

      await saveConnectionConfig(app.db, id, conn);

      // Publish events
      try {
        if (app.nats?.healthy()) {
          app.nats.publish('df.connectivity.config.v1', { 
            schema: 'connectivity.config@v1', 
            ts: new Date().toISOString(), 
            op: 'upsert', 
            conn: cleanConnForNats({ id, name: conn.name, enabled: conn.enabled, ...conn })
          });
          for (const tagId of normalizedTagIds) {
            app.nats.publish('df.connectivity.tags.changed.v1', { 
              schema: 'connectivity.tags.changed@v1', 
              ts: new Date().toISOString(), 
              connection_id: id, 
              op: 'tag_pending_delete', 
              removed_tag_id: tagId 
            });
          }
        }
      } catch {}

      // Enqueue a SINGLE job for ALL tags
      let jobId = null;
      try {
        const job = await app.jobs.enqueue('tags_delete', { 
          connection_id: id, 
          tag_ids: normalizedTagIds, 
          batch_size: batchSize 
        });
        jobId = job.id;
        
        // Mark all tags as deleting
        await app.db.query(
          `update tag_metadata set delete_started_at=now(), status='deleting' where connection_id=$1 and tag_id = any($2)`,
          [id, normalizedTagIds]
        );
      } catch (e) {
        req.log.warn({ err: e, id, tagIds: normalizedTagIds }, 'failed to enqueue tags_delete job');
      }
      
      return { 
        ok: true, 
        job_id: jobId, 
        status: jobId ? 'deleting' : 'pending_delete',
        tag_count: normalizedTagIds.length 
      };
    } catch (e) {
      req.log.error({ err: e }, 'failed to batch remove tags');
      return reply.code(500).send({ error: 'failed_to_remove' });
    }
  });

  // Telemetry history (MVP)
  // GET /connectivity/tags/history?conn_id=ID&tag_id=NN&from=ISO&to=ISO&limit=1000
  app.get('/tags/history', async (req, reply) => {
    const q = req.query || {};
    // Accept aliases: id/tag
    const connId = q.conn_id ? String(q.conn_id) : (q.id ? String(q.id) : '');
    const tagId = q.tag_id != null ? Number(q.tag_id) : (q.tag != null ? Number(q.tag) : NaN);
    if (!connId) return reply.code(400).send({ error: 'missing conn_id' });
    if (Number.isNaN(tagId)) return reply.code(400).send({ error: 'missing tag_id' });
    // time window
    let fromTs = q.from ? new Date(q.from) : new Date(Date.now() - 15 * 60 * 1000); // default last 15m
    let toTs = q.to ? new Date(q.to) : new Date();
    if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime())) return reply.code(400).send({ error: 'bad_time' });
    if (fromTs > toTs) [fromTs, toTs] = [toTs, fromTs];
    let limit = q.limit != null ? Number(q.limit) : 1000;
    if (Number.isNaN(limit) || limit <= 0) limit = 1000;
    if (limit > 5000) limit = 5000;
    // Choose tsdb if present else main db
    const db = app.tsdb || app.db;
    try {
      const { rows } = await db.query(
        `select ts, quality, coalesce(v_num::text, v_text, case when v_json is not null then v_json::text else null end) as value,
                v_num, v_text, v_json
         from tag_values
         where connection_id=$1 and tag_id=$2 and ts between $3 and $4
         order by ts desc
         limit $5`,
        [connId, tagId, fromTs.toISOString(), toTs.toISOString(), limit]
      );
      const points = rows.map(r => ({
        ts: r.ts,
        q: r.quality == null ? undefined : r.quality,
        // precedence: json -> num -> text
        v: r.v_json != null ? r.v_json : (r.v_num != null ? Number(r.v_num) : (r.v_text != null ? r.v_text : null))
      }));
      // Enrich meta from saved config
      let node_id = undefined; let name = undefined;
      try {
        const conn = await loadConnectionConfig(app.db, connId);
        if (conn) {
          const map = (conn.driver_opts && conn.driver_opts.tag_map) || {};
          const meta = (conn.driver_opts && conn.driver_opts.tag_meta) || {};
          if (map && map[tagId] != null) node_id = String(map[tagId]);
          const m = meta && meta[tagId];
          if (m && m.name) name = String(m.name);
        }
      } catch {}
      return { points, meta: { conn_id: connId, tag_id: tagId, node_id, name, from: fromTs.toISOString(), to: toTs.toISOString(), count: points.length } };
    } catch (e) {
      req.log.error({ err: e }, 'history query failed');
      return reply.code(500).send({ error: 'history_failed' });
    }
  });

  // EIP Device Discovery - Network scan for CIP devices
  app.post('/eip/discover', async (req, reply) => {
    const userId = req.user?.sub;
    const { broadcast_address = '255.255.255.255', force_refresh = false } = req.body || {};
    
    try {
      // Check device cache first (last 5 minutes) unless force refresh
      if (!force_refresh) {
        const { rows } = await app.db.query(`
          SELECT host, vendor, product_name, product_code, serial, revision_major, revision_minor
          FROM eip_device_cache
          WHERE last_seen_at > NOW() - INTERVAL '5 minutes'
          ORDER BY last_seen_at DESC
        `);
        
        if (rows.length > 0) {
          const devices = rows.map(row => ({
            ip: row.host,
            vendor: row.vendor,
            product_name: row.product_name,
            product_code: row.product_code,
            serial: row.serial,
            revision: { major: row.revision_major, minor: row.revision_minor }
          }));
          
          req.log.info({ deviceCount: devices.length, userId }, 'Returning cached device discovery');
          return { devices, cached: true };
        }
      }
      
      // Broadcast discovery via NATS to connectivity service
      req.log.info({ broadcastAddress: broadcast_address, userId }, 'Requesting device discovery from connectivity service');
      
      const result = await app.nats.request('df.connectivity.eip.discover.v1', 
        { broadcast_address },
        15000
      );
      
      const data = result;
      
      if (data.error) {
        req.log.error({ error: data.error }, 'Device discovery failed');
        return reply.code(500).send({ error: data.error });
      }
      
      // Cache results
      for (const device of data.devices || []) {
        await app.db.query(`
          INSERT INTO eip_device_cache (host, vendor, product_name, product_code, serial, revision_major, revision_minor, last_seen_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (host) DO UPDATE
            SET last_seen_at = NOW(),
                vendor = $2,
                product_name = $3,
                product_code = $4,
                serial = $5,
                revision_major = $6,
                revision_minor = $7
        `, [device.ip, device.vendor, device.product_name, device.product_code, device.serial, device.revision.major, device.revision.minor]);
      }
      
      req.log.info({ deviceCount: data.devices?.length || 0, userId }, 'Device discovery complete');
      return { devices: data.devices || [], cached: false };
      
    } catch (err) {
      req.log.error({ err: String(err?.message || err), userId }, 'Device discovery failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // EIP Device Identification - Single device lookup
  app.post('/eip/identify', async (req, reply) => {
    const userId = req.user?.sub;
    const { ip_address } = req.body || {};
    
    if (!ip_address) {
      return reply.code(400).send({ error: 'missing ip_address' });
    }
    
    try {
      req.log.info({ ipAddress: ip_address, userId }, 'Requesting device identification');
      
      const result = await app.nats.request('df.connectivity.eip.identify.v1',
        { ip_address },
        5000
      );
      
      const data = result;
      
      if (data.error) {
        req.log.error({ error: data.error }, 'Device identification failed');
        return reply.code(500).send({ error: data.error });
      }
      
      // Cache result
      await app.db.query(`
        INSERT INTO eip_device_cache (host, vendor, product_name, product_code, serial, revision_major, revision_minor, last_seen_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (host) DO UPDATE
          SET last_seen_at = NOW(),
              vendor = $2,
              product_name = $3,
              product_code = $4,
              serial = $5,
              revision_major = $6,
              revision_minor = $7
      `, [data.ip, data.vendor, data.product_name, data.product_code, data.serial, data.revision.major, data.revision.minor]);
      
      req.log.info({ device: data, userId }, 'Device identified');
      return data;
      
    } catch (err) {
      req.log.error({ err: String(err?.message || err), ipAddress: ip_address, userId }, 'Device identification failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // EIP Rack Configuration - Get all modules in a ControlLogix rack
  app.post('/eip/rack-config', async (req, reply) => {
    const userId = req.user?.sub;
    const { ip_address, slot = 0 } = req.body || {};
    
    if (!ip_address) {
      return reply.code(400).send({ error: 'missing ip_address' });
    }
    
    try {
      req.log.info({ ipAddress: ip_address, slot, userId }, 'Requesting rack configuration');
      
      const result = await app.nats.request('df.connectivity.eip.rack-config.v1',
        { ip_address, slot },
        30000 // Longer timeout for rack scanning
      );
      
      const data = result;
      
      if (data.error) {
        req.log.error({ error: data.error }, 'Rack configuration failed');
        return reply.code(500).send({ error: data.error });
      }
      
      req.log.info({ 
        type: data.type, 
        moduleCount: data.module_count || 1,
        userId 
      }, 'Rack configuration retrieved');
      
      return data;
      
    } catch (err) {
      req.log.error({ err: String(err?.message || err), ipAddress: ip_address, userId }, 'Rack configuration failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // EIP Bulk Tag Save - Add multiple tags from browser
  app.post('/eip/tags/:id/bulk-save', async (req, reply) => {
    const userId = req.user?.sub;
    const { id } = req.params;
    const { tags = [], poll_group_id = 4, dead_band = 0 } = req.body || {};
    
    if (!Array.isArray(tags) || tags.length === 0) {
      return reply.code(400).send({ error: 'tags array required' });
    }
    
    try {
      const saved = [];
      
      // Use transaction for bulk insert
      await app.db.query('BEGIN');
      
      try {
        for (const tag of tags) {
          const { rows } = await app.db.query(`
            INSERT INTO tag_metadata (connection_id, tag_name, tag_path, data_type, poll_group_id, dead_band, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (connection_id, tag_path) DO UPDATE
              SET poll_group_id = $5, dead_band = $6, updated_at = NOW()
            RETURNING tag_id, connection_id, tag_name, tag_path, data_type, poll_group_id, dead_band
          `, [id, tag.tag_name, tag.tag_path || tag.tag_name, tag.data_type || 'UNKNOWN', poll_group_id, dead_band]);
          
          if (rows.length > 0) {
            saved.push(rows[0]);
          }
        }
        
        await app.db.query('COMMIT');
        
        // Notify connectivity service of config change
        app.nats.publish('df.connectivity.config.v1', JSON.stringify({
          schema: 'connectivity.config@v1',
          op: 'tag_subscription_update',
          connection_id: id
        }));
        
        req.log.info({ connectionId: id, savedCount: saved.length, userId }, 'Bulk tags saved');
        return { saved: saved.length, tags: saved };
        
      } catch (err) {
        await app.db.query('ROLLBACK');
        throw err;
      }
      
    } catch (err) {
      req.log.error({ err: String(err?.message || err), connectionId: id, userId }, 'Bulk tag save failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // Export tags for a connection as JSON
  app.get('/tags/:connectionId/export', async (req, reply) => {
    const connectionId = req.params.connectionId;
    const userId = req.user?.sub;
    
    try {
      // Get connection info
      const connResult = await app.db.query(
        `SELECT id, name, type FROM connections WHERE id = $1 AND deleted_at IS NULL`,
        [connectionId]
      );
      
      if (connResult.rows.length === 0) {
        return reply.code(404).send({ error: 'connection_not_found' });
      }
      
      const connection = connResult.rows[0];
      
      // Get all active tags for this connection
      const { rows } = await app.db.query(`
        SELECT 
          tm.tag_name,
          tm.tag_path,
          tm.data_type,
          pg.name as poll_group_name,
          pg.poll_rate_ms,
          u.name as unit_name,
          u.symbol as unit_symbol,
          tm.on_change_enabled,
          tm.on_change_deadband,
          tm.on_change_deadband_type,
          tm.on_change_heartbeat_ms
        FROM tag_metadata tm
        JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
        LEFT JOIN units_of_measure u ON tm.unit_id = u.id
        WHERE tm.connection_id = $1
          AND coalesce(tm.status,'active') = 'active'
        ORDER BY tm.tag_name ASC
      `, [connectionId]);
      
      const exportData = {
        export_version: '1.0',
        connection: {
          id: connection.id,
          name: connection.name,
          type: connection.type
        },
        exported_at: new Date().toISOString(),
        exported_by: userId,
        tag_count: rows.length,
        tags: rows.map(tag => ({
          tag_name: tag.tag_name,
          tag_path: tag.tag_path,
          data_type: tag.data_type,
          poll_group_name: tag.poll_group_name,
          poll_rate_ms: tag.poll_rate_ms,
          unit_name: tag.unit_name,
          unit_symbol: tag.unit_symbol,
          on_change_enabled: tag.on_change_enabled,
          on_change_deadband: tag.on_change_deadband,
          on_change_deadband_type: tag.on_change_deadband_type,
          on_change_heartbeat_ms: tag.on_change_heartbeat_ms
        }))
      };
      
      req.log.info({ connectionId, tagCount: rows.length, userId }, 'Tags exported');
      
      // Set headers for file download
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="tags_${connection.name}_${connectionId}_${new Date().toISOString().split('T')[0]}.json"`);
      
      return exportData;
    } catch (err) {
      req.log.error({ err: String(err?.message || err), connectionId, userId }, 'Tag export failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // Import tags from JSON
  app.post('/tags/:connectionId/import', async (req, reply) => {
    const connectionId = req.params.connectionId;
    const userId = req.user?.sub;
    const { tags, merge_strategy = 'skip' } = req.body; // merge_strategy: 'skip', 'replace', 'update'
    
    if (!Array.isArray(tags)) {
      return reply.code(400).send({ error: 'tags must be an array' });
    }
    
    try {
      // Verify connection exists
      const connResult = await app.db.query(
        `SELECT id, name, type FROM connections WHERE id = $1 AND deleted_at IS NULL`,
        [connectionId]
      );
      
      if (connResult.rows.length === 0) {
        return reply.code(404).send({ error: 'connection_not_found' });
      }
      
      const connection = connResult.rows[0];
      
      // Get all poll groups for matching
      const pollGroupsResult = await app.db.query(`
        SELECT group_id, name, poll_rate_ms FROM poll_groups WHERE is_active = true
      `);
      const pollGroupMap = new Map();
      pollGroupsResult.rows.forEach(pg => {
        pollGroupMap.set(pg.name.toLowerCase(), pg);
        pollGroupMap.set(pg.poll_rate_ms, pg);
      });
      
      // Get all units for matching
      const unitsResult = await app.db.query(`
        SELECT id, name, symbol FROM units_of_measure
      `);
      const unitMap = new Map();
      unitsResult.rows.forEach(u => {
        unitMap.set(u.name.toLowerCase(), u);
        unitMap.set(u.symbol.toLowerCase(), u);
      });
      
      let imported = 0;
      let skipped = 0;
      let updated = 0;
      let errors = [];
      
      await app.db.query('BEGIN');
      
      try {
        for (const tag of tags) {
          if (!tag.tag_name || !tag.tag_path) {
            errors.push({ tag: tag.tag_name || 'unknown', error: 'missing tag_name or tag_path' });
            continue;
          }
          
          // Find matching poll group
          let pollGroupId = 5; // default
          if (tag.poll_group_name) {
            const pg = pollGroupMap.get(tag.poll_group_name.toLowerCase()) || 
                       pollGroupMap.get(tag.poll_rate_ms);
            if (pg) pollGroupId = pg.group_id;
          }
          
          // Find matching unit
          let unitId = null;
          if (tag.unit_name || tag.unit_symbol) {
            const unit = unitMap.get((tag.unit_name || '').toLowerCase()) ||
                        unitMap.get((tag.unit_symbol || '').toLowerCase());
            if (unit) unitId = unit.id;
          }
          
          // Check if tag already exists
          const existingResult = await app.db.query(
            `SELECT tag_id, status FROM tag_metadata WHERE connection_id = $1 AND tag_path = $2`,
            [connectionId, tag.tag_path]
          );
          
          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            
            if (merge_strategy === 'skip') {
              skipped++;
              continue;
            } else if (merge_strategy === 'replace' || merge_strategy === 'update') {
              // Update existing tag
              await app.db.query(`
                UPDATE tag_metadata
                SET tag_name = $1,
                    data_type = $2,
                    poll_group_id = $3,
                    unit_id = $4,
                    on_change_enabled = COALESCE($5, on_change_enabled),
                    on_change_deadband = COALESCE($6, on_change_deadband),
                    on_change_deadband_type = COALESCE($7, on_change_deadband_type),
                    on_change_heartbeat_ms = COALESCE($8, on_change_heartbeat_ms),
                    updated_at = NOW()
                WHERE tag_id = $9
              `, [
                tag.tag_name,
                tag.data_type || 'UNKNOWN',
                pollGroupId,
                unitId,
                tag.on_change_enabled,
                tag.on_change_deadband,
                tag.on_change_deadband_type,
                tag.on_change_heartbeat_ms,
                existing.tag_id
              ]);
              updated++;
            }
          } else {
            // Insert new tag
            await app.db.query(`
              INSERT INTO tag_metadata (
                connection_id, driver_type, tag_name, tag_path, data_type,
                is_subscribed, poll_group_id, unit_id,
                on_change_enabled, on_change_deadband, on_change_deadband_type,
                on_change_heartbeat_ms, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, 'active', NOW(), NOW())
            `, [
              connectionId,
              connection.type,
              tag.tag_name,
              tag.tag_path,
              tag.data_type || 'UNKNOWN',
              pollGroupId,
              unitId,
              tag.on_change_enabled !== undefined ? tag.on_change_enabled : true,
              tag.on_change_deadband || 0,
              tag.on_change_deadband_type || 'absolute',
              tag.on_change_heartbeat_ms || 60000
            ]);
            imported++;
          }
        }
        
        await app.db.query('COMMIT');
        
        // Notify connectivity service of config change
        if (imported > 0 || updated > 0) {
          app.nats.publish('df.connectivity.config.v1', JSON.stringify({
            schema: 'connectivity.config@v1',
            op: 'tag_subscription_update',
            connection_id: connectionId
          }));
        }
        
        req.log.info({ connectionId, imported, updated, skipped, errorCount: errors.length, userId }, 'Tags imported');
        
        return { 
          imported, 
          updated, 
          skipped, 
          errors: errors.length > 0 ? errors : undefined,
          total_processed: tags.length
        };
        
      } catch (err) {
        await app.db.query('ROLLBACK');
        throw err;
      }
      
    } catch (err) {
      req.log.error({ err: String(err?.message || err), connectionId, userId }, 'Tag import failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // Export tags as CSV for Excel editing
  app.get('/tags/:connectionId/export-csv', async (req, reply) => {
    const connectionId = req.params.connectionId;
    const driverType = req.query.driver || 's7';
    const userId = req.user?.sub;
    
    try {
      // Get connection info
      const connResult = await app.db.query(
        `SELECT id, name, type FROM connections WHERE id = $1 AND deleted_at IS NULL`,
        [connectionId]
      );
      
      if (connResult.rows.length === 0) {
        return reply.code(404).send({ error: 'connection_not_found' });
      }
      
      const connection = connResult.rows[0];
      
      // Get all active tags
      const { rows } = await app.db.query(`
        SELECT 
          tm.tag_name,
          tm.tag_path,
          tm.data_type,
          pg.name as poll_group_name,
          u.symbol as unit,
          tm.on_change_enabled,
          tm.on_change_deadband,
          tm.on_change_deadband_type,
          tm.on_change_heartbeat_ms
        FROM tag_metadata tm
        JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
        LEFT JOIN units_of_measure u ON tm.unit_id = u.id
        WHERE tm.connection_id = $1
          AND coalesce(tm.status,'active') = 'active'
        ORDER BY tm.tag_name ASC
      `, [connectionId]);
      
      // Generate CSV based on driver type
      let csv = '';
      
      if (driverType === 's7') {
        // S7 format: address,data_type,tag_name,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec
        csv = 'address,data_type,tag_name,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec\n';
        
        rows.forEach(tag => {
          const address = tag.tag_path || '';
          const dataType = tag.data_type || '';
          const tagName = tag.tag_name !== tag.tag_path ? tag.tag_name : '';
          const pollGroup = tag.poll_group_name || '';
          const unit = tag.unit || '';
          const writeOnChange = tag.on_change_enabled ? 'true' : 'false';
          const deadband = tag.on_change_deadband || '';
          const deadbandType = tag.on_change_deadband_type || 'absolute';
          const heartbeatSec = tag.on_change_heartbeat_ms ? Math.round(tag.on_change_heartbeat_ms / 1000) : '';
          
          csv += `${address},${dataType},${tagName},${pollGroup},${unit},${writeOnChange},${deadband},${deadbandType},${heartbeatSec}\n`;
        });
      } else if (driverType === 'eip') {
        // EIP format: tag_name,data_type,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec
        csv = 'tag_name,data_type,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec\n';
        
        rows.forEach(tag => {
          const tagName = tag.tag_name || tag.tag_path || '';
          const dataType = tag.data_type || '';
          const pollGroup = tag.poll_group_name || '';
          const unit = tag.unit || '';
          const writeOnChange = tag.on_change_enabled ? 'true' : 'false';
          const deadband = tag.on_change_deadband || '';
          const deadbandType = tag.on_change_deadband_type || 'absolute';
          const heartbeatSec = tag.on_change_heartbeat_ms ? Math.round(tag.on_change_heartbeat_ms / 1000) : '';
          
          csv += `${tagName},${dataType},${pollGroup},${unit},${writeOnChange},${deadband},${deadbandType},${heartbeatSec}\n`;
        });
      } else if (driverType === 'opcua') {
        // OPCUA format: node_id,tag_name,data_type,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec
        csv = 'node_id,tag_name,data_type,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec\n';
        
        rows.forEach(tag => {
          const nodeId = tag.tag_path || '';
          const tagName = tag.tag_name !== tag.tag_path ? tag.tag_name : '';
          const dataType = tag.data_type || '';
          const pollGroup = tag.poll_group_name || '';
          const unit = tag.unit || '';
          const writeOnChange = tag.on_change_enabled ? 'true' : 'false';
          const deadband = tag.on_change_deadband || '';
          const deadbandType = tag.on_change_deadband_type || 'absolute';
          const heartbeatSec = tag.on_change_heartbeat_ms ? Math.round(tag.on_change_heartbeat_ms / 1000) : '';
          
          csv += `${nodeId},${tagName},${dataType},${pollGroup},${unit},${writeOnChange},${deadband},${deadbandType},${heartbeatSec}\n`;
        });
      }
      
      req.log.info({ connectionId, tagCount: rows.length, driverType, userId }, 'Tags exported to CSV');
      
      // Set headers for file download
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${driverType}_tags_${connection.name}_${connectionId}_${new Date().toISOString().split('T')[0]}.csv"`);
      
      return csv;
    } catch (err) {
      req.log.error({ err: String(err?.message || err), connectionId, userId }, 'CSV export failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // Import tags from CSV
  app.post('/tags/:connectionId/import-csv', async (req, reply) => {
    const connectionId = req.params.connectionId;
    const userId = req.user?.sub;
    
    try {
      // Get uploaded file
      const data = await req.file();
      if (!data) {
        req.log.error({ connectionId, userId }, 'No file uploaded');
        return reply.code(400).send({ error: 'no_file_uploaded' });
      }
      
      req.log.info({ connectionId, filename: data.filename, fields: data.fields }, 'CSV file received');
      
      // Get driver type from fields
      let driverType = 's7';
      if (data.fields && data.fields.driver) {
        driverType = data.fields.driver.value || 's7';
      }
      
      // Read file content
      const buffer = await data.toBuffer();
      const csvContent = buffer.toString('utf-8');
      
      req.log.info({ connectionId, driverType, contentLength: csvContent.length, userId }, 'CSV content read');
      
      // Parse CSV - detect delimiter (comma or tab)
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return reply.code(400).send({ error: 'empty_csv_file' });
      }
      
      // Detect delimiter from first line (prefer tab if present, otherwise comma)
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      
      // Parse header
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      
      req.log.info({ connectionId, headers, delimiter, lineCount: lines.length, userId }, 'CSV parsed');
      
      // Verify connection exists
      const connResult = await app.db.query(
        `SELECT id, name, type FROM connections WHERE id = $1 AND deleted_at IS NULL`,
        [connectionId]
      );
      
      if (connResult.rows.length === 0) {
        return reply.code(404).send({ error: 'connection_not_found' });
      }
      
      const connection = connResult.rows[0];
      
      // Normalize driver type for database constraint
      // connection.type might be 'opcua-client', 'opcua-server', 'pycomm3', etc.
      // but DB constraint expects: 'EIP', 'OPCUA', 'S7', 'SYSTEM'
      const normalizeDriverType = (type) => {
        const upper = type.toUpperCase();
        if (upper.startsWith('OPCUA')) return 'OPCUA';
        if (upper === 'PYCOMM3') return 'EIP';
        return upper; // S7, EIP already correct
      };
      const normalizedDriverType = normalizeDriverType(connection.type);
      
      // Get poll groups and units for matching
      const pollGroupsResult = await app.db.query(`
        SELECT group_id, name FROM poll_groups WHERE is_active = true
      `);
      const pollGroupMap = new Map();
      pollGroupsResult.rows.forEach(pg => {
        pollGroupMap.set(pg.name.toLowerCase(), pg.group_id);
      });
      
      const unitsResult = await app.db.query(`
        SELECT id, symbol FROM units_of_measure
      `);
      const unitMap = new Map();
      unitsResult.rows.forEach(u => {
        unitMap.set(u.symbol.toLowerCase(), u.id);
      });
      
      let imported = 0;
      let skipped = 0;
      let errors = [];
      
      await app.db.query('BEGIN');
      
      try {
        // Process data rows
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter).map(v => v.trim());
          if (values.length === 0 || !values[0]) continue;
          
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });
          
          // Validate and process based on driver type
          if (driverType === 's7') {
            if (!row.address || !row.data_type) {
              errors.push({ row: i + 1, error: 'Missing required fields: address, data_type' });
              continue;
            }
            
            const tagPath = row.address;
            const tagName = row.tag_name || row.address;
            const dataType = row.data_type.toUpperCase();
            
            // Find poll group (default to 5 - Medium)
            let pollGroupId = 5;
            if (row.poll_group) {
              const pgId = pollGroupMap.get(row.poll_group.toLowerCase());
              if (pgId) pollGroupId = pgId;
            }
            
            // Find unit
            let unitId = null;
            if (row.unit) {
              const uId = unitMap.get(row.unit.toLowerCase());
              if (uId) unitId = uId;
            }
            
            // Parse write-on-change settings
            const onChangeEnabled = row.write_on_change ? 
              ['true', '1', 'yes', 'y'].includes(row.write_on_change.toLowerCase()) : true;
            const deadband = (row.deadband && row.deadband.trim() !== '') ? parseFloat(row.deadband) : 0;
            const deadbandType = row.deadband_type && ['absolute', 'percent'].includes(row.deadband_type.toLowerCase()) 
              ? row.deadband_type.toLowerCase() 
              : 'absolute';
            const heartbeatSec = (row.heartbeat_sec && row.heartbeat_sec.trim() !== '') ? parseInt(row.heartbeat_sec) : 60;
            const heartbeatMs = heartbeatSec * 1000;
            
            // Check if tag already exists
            const existingResult = await app.db.query(
              `SELECT tag_id FROM tag_metadata WHERE connection_id = $1 AND tag_path = $2`,
              [connectionId, tagPath]
            );
            
            if (existingResult.rows.length > 0) {
              skipped++;
              continue;
            }
            
            // Insert new tag
            await app.db.query(`
              INSERT INTO tag_metadata (
                connection_id, driver_type, tag_name, tag_path, data_type,
                is_subscribed, poll_group_id, unit_id,
                on_change_enabled, on_change_deadband, on_change_deadband_type,
                on_change_heartbeat_ms, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, 'active', NOW(), NOW())
            `, [
              connectionId,
              normalizedDriverType,
              tagName,
              tagPath,
              dataType,
              pollGroupId,
              unitId,
              onChangeEnabled,
              deadband,
              deadbandType,
              heartbeatMs
            ]);
            
            imported++;
          } else if (driverType === 'eip') {
            if (!row.tag_name || !row.data_type) {
              errors.push({ row: i + 1, error: 'Missing required fields: tag_name, data_type' });
              continue;
            }
            
            const tagName = row.tag_name;
            const tagPath = row.tag_name; // EIP uses tag_name as path
            const dataType = row.data_type.toUpperCase();
            
            // Find poll group (default to 5 - Medium)
            let pollGroupId = 5;
            if (row.poll_group) {
              const pgId = pollGroupMap.get(row.poll_group.toLowerCase());
              if (pgId) pollGroupId = pgId;
            }
            
            // Find unit
            let unitId = null;
            if (row.unit) {
              const uId = unitMap.get(row.unit.toLowerCase());
              if (uId) unitId = uId;
            }
            
            // Parse write-on-change settings
            const onChangeEnabled = row.write_on_change ? 
              ['true', '1', 'yes', 'y'].includes(row.write_on_change.toLowerCase()) : true;
            const deadband = (row.deadband && row.deadband.trim() !== '') ? parseFloat(row.deadband) : 0;
            const deadbandType = row.deadband_type && ['absolute', 'percent'].includes(row.deadband_type.toLowerCase()) 
              ? row.deadband_type.toLowerCase() 
              : 'absolute';
            const heartbeatSec = (row.heartbeat_sec && row.heartbeat_sec.trim() !== '') ? parseInt(row.heartbeat_sec) : 60;
            const heartbeatMs = heartbeatSec * 1000;
            
            // Check if tag already exists
            const existingResult = await app.db.query(
              `SELECT tag_id FROM tag_metadata WHERE connection_id = $1 AND tag_path = $2`,
              [connectionId, tagPath]
            );
            
            if (existingResult.rows.length > 0) {
              skipped++;
              continue;
            }
            
            // Insert new tag
            await app.db.query(`
              INSERT INTO tag_metadata (
                connection_id, driver_type, tag_name, tag_path, data_type,
                is_subscribed, poll_group_id, unit_id,
                on_change_enabled, on_change_deadband, on_change_deadband_type,
                on_change_heartbeat_ms, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, 'active', NOW(), NOW())
            `, [
              connectionId,
              normalizedDriverType,
              tagName,
              tagPath,
              dataType,
              pollGroupId,
              unitId,
              onChangeEnabled,
              deadband,
              deadbandType,
              heartbeatMs
            ]);

            
            imported++;
          } else if (driverType === 'opcua') {
            req.log.info({ row: i + 1, originalRow: row, values }, 'OPC UA CSV row - BEFORE processing');
            
            // Handle case where node_id might be split across columns due to semicolon in CSV
            // If node_id looks like "ns=X" and tag_name looks like "i=Y" or "s=Y", combine them
            let nodeId = row.node_id;
            let tagName = row.tag_name;
            
            // Check case-insensitively for node_id patterns
            const tagNameLower = (tagName || '').toLowerCase();
            if (nodeId && tagName && nodeId.startsWith('ns=') && (tagNameLower.startsWith('i=') || tagNameLower.startsWith('s=') || tagNameLower.startsWith('b='))) {
              req.log.info({ row: i + 1, nodeId, tagName }, 'OPC UA: Detected split node_id, combining');
              // Combine them with semicolon
              nodeId = `${nodeId};${tagName}`;
              // The actual tag_name is now in the data_type column, shift everything
              tagName = row.data_type;
              row.data_type = row.poll_group;
              row.poll_group = row.unit;
              row.unit = row.write_on_change;
              row.write_on_change = row.deadband;
              row.deadband = row.deadband_type;
              row.deadband_type = row.heartbeat_sec;
              row.heartbeat_sec = values[headers.indexOf('heartbeat_sec') + 1] || '60';
              req.log.info({ row: i + 1, nodeId, tagName, shiftedRow: row }, 'OPC UA: After shifting columns');
            }
            
            if (!nodeId || !row.data_type) {
              errors.push({ row: i + 1, error: 'Missing required fields: node_id, data_type', received: row });
              req.log.warn({ row: i + 1, rowData: row }, 'OPC UA CSV row missing required fields');
              continue;
            }
            
            const tagPath = nodeId; // OPC UA uses node_id as path
            const dataType = row.data_type.toUpperCase();
            
            req.log.info({ row: i + 1, nodeId, tagName, tagPath, dataType }, 'OPC UA: Parsed identifiers');
            
            // Find poll group (default to 5 - Medium)
            let pollGroupId = 5;
            if (row.poll_group) {
              const pgId = pollGroupMap.get(row.poll_group.toLowerCase());
              if (pgId) pollGroupId = pgId;
            }
            
            // Find unit
            let unitId = null;
            if (row.unit) {
              const uId = unitMap.get(row.unit.toLowerCase());
              if (uId) unitId = uId;
            }
            
            req.log.info({ row: i + 1, rawDeadband: row.deadband, rawHeartbeat: row.heartbeat_sec }, 'OPC UA: Raw numeric values');
            
            // Parse write-on-change settings
            const onChangeEnabled = row.write_on_change ? 
              ['true', '1', 'yes', 'y'].includes(row.write_on_change.toLowerCase()) : true;
            const deadband = (row.deadband && row.deadband.trim() !== '') ? parseFloat(row.deadband) : 0;
            const deadbandType = row.deadband_type && ['absolute', 'percent'].includes(row.deadband_type.toLowerCase()) 
              ? row.deadband_type.toLowerCase() 
              : 'absolute';
            const heartbeatSec = (row.heartbeat_sec && row.heartbeat_sec.trim() !== '') ? parseInt(row.heartbeat_sec) : 60;
            const heartbeatMs = heartbeatSec * 1000;
            
            req.log.info({ 
              row: i + 1, 
              parsedDeadband: deadband, 
              parsedHeartbeatSec: heartbeatSec,
              parsedHeartbeatMs: heartbeatMs,
              isDeadbandNaN: isNaN(deadband),
              isHeartbeatNaN: isNaN(heartbeatMs)
            }, 'OPC UA: Parsed numeric values');
            
            // Check if tag already exists
            const existingResult = await app.db.query(
              `SELECT tag_id FROM tag_metadata WHERE connection_id = $1 AND tag_path = $2`,
              [connectionId, tagPath]
            );
            
            if (existingResult.rows.length > 0) {
              req.log.info({ row: i + 1, tagPath }, 'OPC UA: Tag already exists, skipping');
              skipped++;
              continue;
            }
            
            req.log.info({ 
              row: i + 1,
              insertParams: {
                connectionId,
                driverType: connection.type.toUpperCase(),
                tagName,
                tagPath,
                dataType,
                pollGroupId,
                unitId,
                onChangeEnabled,
                deadband,
                deadbandType,
                heartbeatMs
              }
            }, 'OPC UA: About to insert tag');
            
            // Insert new tag
            try {
              await app.db.query(`
                INSERT INTO tag_metadata (
                  connection_id, driver_type, tag_name, tag_path, data_type,
                  is_subscribed, poll_group_id, unit_id,
                  on_change_enabled, on_change_deadband, on_change_deadband_type,
                  on_change_heartbeat_ms, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, 'active', NOW(), NOW())
              `, [
                connectionId,
                normalizedDriverType,
                tagName,
                tagPath,
                dataType,
                pollGroupId,
                unitId,
                onChangeEnabled,
                deadband,
                deadbandType,
                heartbeatMs
              ]);
              
              req.log.info({ row: i + 1, tagPath }, 'OPC UA: Tag inserted successfully');
              imported++;
            } catch (insertError) {
              req.log.error({ 
                row: i + 1, 
                error: insertError.message,
                insertParams: [connectionId, connection.type.toUpperCase(), tagName, tagPath, dataType, pollGroupId, unitId, onChangeEnabled, deadband, deadbandType, heartbeatMs]
              }, 'OPC UA: Insert failed');
              errors.push({ row: i + 1, error: insertError.message });
            }
          }
        }
        
        await app.db.query('COMMIT');
        
        // Notify connectivity service
        if (imported > 0) {
          app.nats.publish('df.connectivity.config.v1', JSON.stringify({
            schema: 'connectivity.config@v1',
            op: 'tag_subscription_update',
            connection_id: connectionId
          }));
        }
        
        req.log.info({ connectionId, imported, skipped, errorCount: errors.length, userId }, 'CSV tags imported');
        
        return { 
          imported, 
          updated: 0,
          skipped, 
          errors: errors.length > 0 ? errors : undefined,
          total_processed: lines.length - 1
        };
        
      } catch (err) {
        await app.db.query('ROLLBACK');
        throw err;
      }
      
    } catch (err) {
      req.log.error({ err: String(err?.message || err), connectionId, userId }, 'CSV import failed');
      return reply.code(500).send({ error: String(err?.message || err) });
    }
  });

  // =====================================================
  // Internal Tags API (Flow Studio)
  // =====================================================

  // GET /api/connectivity/tags/internal - List all internal tags (system-wide)
  app.get('/tags/internal', async (req, reply) => {
    const userId = req.user?.sub;
    
    try {
      const result = await app.db.query(`
        SELECT 
          tm.tag_id,
          tm.tag_path,
          tm.tag_name,
          tm.data_type,
          tm.unit_id,
          tm.description,
          tm.is_subscribed,
          tm.on_change_enabled,
          tm.on_change_deadband,
          tm.on_change_deadband_type,
          tm.on_change_heartbeat_ms,
          tm.poll_group_id,
          tm.status,
          tm.created_at,
          tm.updated_at,
          c.id as connection_id,
          c.name as connection_name,
          u.name as unit_name,
          u.symbol as unit_symbol,
          pg.poll_rate_ms
        FROM tag_metadata tm
        JOIN connections c ON c.id = tm.connection_id
        LEFT JOIN units_of_measure u ON u.id = tm.unit_id
        LEFT JOIN poll_groups pg ON pg.group_id = tm.poll_group_id
        WHERE tm.driver_type = 'INTERNAL'
          AND coalesce(tm.status,'active') <> 'deleted'
        ORDER BY tm.tag_path ASC
      `);

      return reply.send({ tags: result.rows });
    } catch (e) {
      req.log.error({ err: e, userId }, 'failed to get internal tags');
      return reply.code(500).send({ error: 'failed_to_get_internal_tags' });
    }
  });

  // POST /api/connectivity/tags/internal - Create internal tag manually
  app.post('/tags/internal', async (req, reply) => {
    const userId = req.user?.sub;
    const { tag_path, tag_name, data_type, unit_id, description } = req.body;

    if (!tag_path || !tag_name || !data_type) {
      return reply.code(400).send({ error: 'tag_path, tag_name, and data_type are required' });
    }

    try {
      // Get System connection ID
      const connResult = await app.db.query(
        `SELECT id FROM connections WHERE type = 'system' AND name = 'System' LIMIT 1`
      );

      if (connResult.rows.length === 0) {
        return reply.code(500).send({ error: 'system_connection_not_found' });
      }

      const systemConnectionId = connResult.rows[0].id;

      // Check if tag already exists (including deleted tags)
      const existing = await app.db.query(
        `SELECT tag_id, status FROM tag_metadata 
         WHERE connection_id = $1 AND tag_path = $2 AND driver_type = 'INTERNAL'`,
        [systemConnectionId, tag_path]
      );

      let result;
      
      if (existing.rows.length > 0) {
        const existingTag = existing.rows[0];
        const existingStatus = existingTag.status || 'active';
        
        // If tag is deleted, resurrect it by updating to active
        if (existingStatus === 'deleted') {
          result = await app.db.query(`
            UPDATE tag_metadata 
            SET 
              tag_name = $1,
              data_type = $2,
              unit_id = $3,
              description = $4,
              status = 'active',
              is_subscribed = false,
              deleted_at = NULL,
              delete_job_id = NULL,
              delete_started_at = NULL,
              updated_at = now()
            WHERE tag_id = $5
            RETURNING *
          `, [tag_name, data_type, unit_id || null, description || null, existingTag.tag_id]);
          
          req.log.info({ tag_id: existingTag.tag_id, tag_path, userId }, 'internal tag resurrected from deleted status');
        } else {
          // Tag exists and is active
          return reply.code(409).send({ error: 'tag_already_exists' });
        }
      } else {
        // Create new tag
        result = await app.db.query(`
          INSERT INTO tag_metadata (
            connection_id, 
            driver_type, 
            tag_path, 
            tag_name, 
            data_type,
            unit_id,
            description,
            is_subscribed,
            status,
            created_at,
            updated_at
          ) VALUES ($1, 'INTERNAL', $2, $3, $4, $5, $6, false, 'active', now(), now())
          RETURNING *
        `, [systemConnectionId, tag_path, tag_name, data_type, unit_id || null, description || null]);
        
        req.log.info({ tag_id: result.rows[0].tag_id, tag_path, userId }, 'internal tag created');
      }

      return reply.send({ tag: result.rows[0] });
    } catch (e) {
      req.log.error({ err: e, tag_path, userId }, 'failed to create internal tag');
      return reply.code(500).send({ error: 'failed_to_create_tag' });
    }
  });

  // GET /api/connectivity/tags/:tagId/writers - Get flows that write to this tag
  app.get('/tags/:tagId/writers', async (req, reply) => {
    const userId = req.user?.sub;
    const tagId = parseInt(req.params.tagId);

    if (!Number.isInteger(tagId) || tagId <= 0) {
      return reply.code(400).send({ error: 'invalid_tag_id' });
    }

    try {
      const result = await app.db.query(`
        SELECT 
          f.id as flow_id,
          f.name as flow_name,
          f.owner_user_id,
          f.deployed,
          f.shared,
          u.display_name as owner_name,
          ftd.node_id,
          ftd.dependency_type
        FROM flow_tag_dependencies ftd
        JOIN flows f ON f.id = ftd.flow_id
        LEFT JOIN users u ON u.id = f.owner_user_id
        WHERE ftd.tag_id = $1 
          AND ftd.dependency_type = 'output'
        ORDER BY f.name ASC
      `, [tagId]);

      return reply.send({ writers: result.rows });
    } catch (e) {
      req.log.error({ err: e, tag_id: tagId, userId }, 'failed to get tag writers');
      return reply.code(500).send({ error: 'failed_to_get_writers' });
    }
  });
}
