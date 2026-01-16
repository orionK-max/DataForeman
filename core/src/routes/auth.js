import { LocalAuthProvider } from '../services/auth-provider.js';
import { getDemoInfo, createNewDemoUser } from '../services/demo-mode.js';

const prov = new LocalAuthProvider();

function ctxFrom(req) {
  return { ip: req.ip, ua: req.headers['user-agent'], access: (req.headers.authorization || '').slice(7) };
}

export async function authRoutes(app) {
  // Demo mode info (public endpoint)
  app.get('/demo-info', async (req, reply) => {
    return await getDemoInfo(app);
  });

  // Create new demo user (public endpoint)
  app.post('/demo-credentials', async (req, reply) => {
    try {
      const demoUser = await createNewDemoUser(app);
      return {
        username: demoUser.username,
        email: demoUser.email,
        password: demoUser.password,
      };
    } catch (err) {
      app.log.error({ err }, 'Failed to create demo user');
      return reply.code(500).send({ error: 'Failed to create demo user' });
    }
  });

  // Auth endpoints
  app.post('/login', async (req, reply) => {
    const { email, password } = req.body || {};
    const res = await prov.login(app, String(email || ''), String(password || ''), ctxFrom(req));
    if (res?.error) return reply.code(401).send({ error: res.error, locked_until: res.locked_until });
    return { token: res.access, refresh: res.refresh, role: res.role };
  });

  app.post('/refresh', async (req, reply) => {
    const { refresh } = req.body || {};
    try {
      const tokens = await prov.refresh(app, String(refresh || ''), ctxFrom(req));
      return { token: tokens.access, refresh: tokens.refresh };
    } catch (e) {
      await app.audit('auth.refresh', { outcome: 'failure', actor_user_id: null, ip: req.ip, metadata: { reason: e.message } });
      return reply.code(401).send({ error: 'invalid refresh' });
    }
  });

  app.post('/logout', async (req) => {
    const { refresh } = req.body || {};
    await prov.logout(app, String(refresh || ''), { ...ctxFrom(req), userId: req.user?.sub });
    return { ok: true };
  });

  app.get('/me', async (req) => ({ sub: req.user?.sub, role: req.user?.role }));

  app.get('/sessions', async (req) => {
    const { rows } = await app.db.query(
      'select id, jti, created_at, expires_at, revoked_at, replaced_by_jti, user_agent, ip from sessions where user_id=$1 order by created_at desc limit 100',
      [req.user?.sub]
    );
    return { sessions: rows };
  });

  app.post('/sessions/:id/revoke', async (req) => {
    await app.db.query('update sessions set revoked_at=now() where id=$1 and user_id=$2', [req.params.id, req.user?.sub]);
    return { ok: true };
  });

  // Self-service password change
  app.post('/password', async (req) => {
    const { current_password, new_password } = req.body || {};
    const userId = req.user?.sub;
    
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    // Verify current password
    const { rows } = await app.db.query(
      'select ai.id, ai.secret_hash from auth_identities ai where ai.user_id=$1 and ai.provider=$2',
      [userId, 'local']
    );
    
    if (rows.length === 0 || !rows[0].secret_hash) {
      return reply.code(400).send({ error: 'no_password_set' });
    }
    
    const argon2 = (await import('argon2')).default;
    const validPassword = await argon2.verify(rows[0].secret_hash, String(current_password || ''));
    
    if (!validPassword) {
      return reply.code(401).send({ error: 'invalid_current_password' });
    }
    
    // Hash new password
    const newHash = await argon2.hash(String(new_password || ''), { type: argon2.argon2id });
    
    // Update password
    await app.db.query('update auth_identities set secret_hash=$1, failed_attempts=0, locked_until=null where id=$2', [newHash, rows[0].id]);
    
    // Revoke all other sessions except current one
    if (req.user?.jti) {
      await app.db.query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null and jti != $2', [userId, req.user.jti]);
    } else {
      await app.db.query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [userId]);
    }
    
    await app.audit('auth.password_change', { outcome: 'success', actor_user_id: userId, ip: req.ip });
    
    return { ok: true };
  });

  // Admin-only: user CRUD and role assignment
  const requireAdmin = async (req, reply) => {
    const userId = req.user?.sub;
    
    // Determine required operation based on HTTP method
    const method = req.method;
    let operation = 'read';
    if (method === 'POST') operation = 'create';
    else if (method === 'PUT' || method === 'PATCH') operation = 'update';
    else if (method === 'DELETE') operation = 'delete';
    
    if (!userId || !(await app.permissions.can(userId, 'users', operation))) {
      return reply.code(403).send({ error: 'forbidden', feature: 'users', operation });
    }
  };

  app.get('/admin/users', { preHandler: requireAdmin }, async () => {
    const { rows } = await app.db.query('select id, email, display_name, is_active from users order by email asc');
    return { users: rows };
  });

  // Admin: sessions of a specific user
  app.get('/admin/users/:id/sessions', { preHandler: requireAdmin }, async (req) => {
    const { rows } = await app.db.query(
      'select id, jti, created_at, expires_at, revoked_at, replaced_by_jti, user_agent, ip from sessions where user_id=$1 order by created_at desc limit 200',
      [req.params.id]
    );
    return { sessions: rows };
  });

  app.post('/admin/users/:id/sessions/:sid/revoke', { preHandler: requireAdmin }, async (req) => {
    // revoke selected session
    const r = await app.db.query('update sessions set revoked_at=now() where id=$1 and user_id=$2 and revoked_at is null', [req.params.sid, req.params.id]);
    // also revoke by jti if present
    const { rows } = await app.db.query('select jti from sessions where id=$1 and user_id=$2', [req.params.sid, req.params.id]);
    const jti = rows[0]?.jti;
    if (jti) {
      await app.db.query('update sessions set revoked_at=now() where jti=$1 and user_id=$2 and revoked_at is null', [jti, req.params.id]);
    }
    await app.audit('admin.session.revoke', { outcome: 'success', actor_user_id: req.user?.sub, ip: req.ip, metadata: { target_user_id: req.params.id, session_id: req.params.sid } });
    return { ok: true, updated: r.rowCount };
  });

  app.post('/admin/users/:id/sessions/revoke-all', { preHandler: requireAdmin }, async (req) => {
    const r = await app.db.query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [req.params.id]);
    await app.audit('admin.session.revoke_all', { outcome: 'success', actor_user_id: req.user?.sub, ip: req.ip, metadata: { target_user_id: req.params.id, updated: r.rowCount } });
    return { ok: true, updated: r.rowCount };
  });

  app.post('/admin/users', { preHandler: requireAdmin }, async (req) => {
    const { email, display_name, is_active } = req.body || {};
    const { rows } = await app.db.query(
      'insert into users(email, display_name, is_active) values ($1,$2,coalesce($3,true)) returning id',
      [email, display_name || null, is_active]
    );
    const userId = rows[0].id;
    
    // Assign default 'viewer' role to new user
    await app.db.query(
      "insert into user_roles(user_id, role_id) select $1, r.id from roles r where r.name='viewer' on conflict do nothing",
      [userId]
    );
    
    // Grant default permissions to new user
    const defaultFeatures = [
      'dashboards',
      'connectivity.devices',
      'connectivity.tags',
      'connectivity.poll_groups',
      'connectivity.units',
      'connectivity.internal_tags',
      'chart_composer',
      'diagnostics',
      'diagnostic.system',
      'diagnostic.capacity',
      'diagnostic.logs',
      'diagnostic.network',
      'jobs',
      'logs',
      'flows'
    ];
    
    for (const feature of defaultFeatures) {
      await app.db.query(
        'insert into user_permissions(user_id, feature, can_create, can_read, can_update, can_delete) values ($1, $2, true, true, true, true) on conflict do nothing',
        [userId, feature]
      );
    }
    
    return { id: userId };
  });

  app.post('/admin/users/:id', { preHandler: requireAdmin }, async (req) => {
    const { display_name, is_active } = req.body || {};
    await app.db.query('update users set display_name=$1, is_active=coalesce($2,is_active), updated_at=now() where id=$3', [
      display_name || null,
      is_active,
      req.params.id,
    ]);
    return { ok: true };
  });

  app.post('/admin/users/:id/password', { preHandler: requireAdmin }, async (req) => {
    const { password } = req.body || {};
    const targetUserId = req.params.id;
    const currentUserId = req.user?.sub;
    
    const hash = await (await import('argon2')).default.hash(String(password || ''), { type: (await import('argon2')).default.argon2id });
    // upsert auth identity for local
    const { rows } = await app.db.query('select id from auth_identities where user_id=$1 and provider=$2', [targetUserId, 'local']);
    if (rows.length === 0) {
      await app.db.query(
        'insert into auth_identities(user_id, provider, provider_user_id, secret_hash, failed_attempts, locked_until) values ($1,$2,$3,$4,0,null)',
        [targetUserId, 'local', targetUserId, hash]
      );
    } else {
      await app.db.query('update auth_identities set secret_hash=$1, failed_attempts=0, locked_until=null where id=$2', [hash, rows[0].id]);
    }
    
    // revoke all sessions for this user EXCEPT current session if admin is changing their own password
    if (targetUserId === currentUserId && req.user?.jti) {
      // Admin changing their own password - keep current session active
      await app.db.query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null and jti != $2', [targetUserId, req.user.jti]);
      return { ok: true, self_password_change: true };
    } else {
      // Changing another user's password - revoke all their sessions
      await app.db.query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [targetUserId]);
      return { ok: true };
    }
  });

  app.get('/admin/users/:id/roles', { preHandler: requireAdmin }, async (req) => {
    const { rows } = await app.db.query(
      'select r.name from user_roles ur join roles r on ur.role_id=r.id where ur.user_id=$1 order by r.name asc',
      [req.params.id]
    );
    return { roles: rows.map((r) => r.name) };
  });

  app.post('/admin/users/:id/roles', { preHandler: requireAdmin }, async (req) => {
    const { roles } = req.body || {};
    const { rows: all } = await app.db.query('select id, name from roles');
    const map = new Map(all.map((r) => [r.name, r.id]));
    await app.db.query('delete from user_roles where user_id=$1', [req.params.id]);
    for (const name of Array.isArray(roles) ? roles : []) {
      const rid = map.get(name);
      if (rid) await app.db.query('insert into user_roles(user_id, role_id) values ($1,$2) on conflict do nothing', [req.params.id, rid]);
    }
    return { ok: true };
  });

  // Permission management endpoints
  // Users can read their own permissions, admins can read any user's permissions
  app.get('/users/:userId/permissions', async (req, reply) => {
    const userId = req.user?.sub;
    const targetUserId = req.params.userId;
    
    // Allow users to read their own permissions, or admins to read any permissions
    const isOwnPermissions = userId === targetUserId;
    const canReadPermissions = await app.permissions.can(userId, 'permissions', 'read');
    
    if (!userId || (!isOwnPermissions && !canReadPermissions)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { rows } = await app.db.query(
      `SELECT feature, can_create, can_read, can_update, can_delete, updated_at
       FROM user_permissions
       WHERE user_id = $1
       ORDER BY feature`,
      [targetUserId]
    );

    return { permissions: rows };
  });

  app.put('/users/:userId/permissions', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'permissions', 'update'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) {
      return reply.code(400).send({ error: 'permissions must be an array' });
    }

    const client = await app.db.connect();
    try {
      await client.query('BEGIN');

      // Delete existing permissions for this user
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [req.params.userId]);

      // Insert new permissions
      for (const perm of permissions) {
        const { feature, can_create, can_read, can_update, can_delete } = perm;
        await client.query(
          `INSERT INTO user_permissions (user_id, feature, can_create, can_read, can_update, can_delete)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.params.userId, feature, !!can_create, !!can_read, !!can_update, !!can_delete]
        );
      }

      await client.query('COMMIT');

      // Invalidate permission cache for this user
      app.permissions.invalidateCache(req.params.userId);

      await app.audit('permissions.update', {
        outcome: 'success',
        actor_user_id: req.user?.sub,
        target_user_id: req.params.userId,
        ip: req.ip,
        metadata: { permission_count: permissions.length }
      });

      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      app.log.error({ err, userId: req.params.userId }, 'Failed to update permissions');
      return reply.code(500).send({ error: 'Failed to update permissions' });
    } finally {
      client.release();
    }
  });

  app.delete('/users/:userId/permissions/:feature', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId || !(await app.permissions.can(userId, 'permissions', 'delete'))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    await app.db.query(
      'DELETE FROM user_permissions WHERE user_id = $1 AND feature = $2',
      [req.params.userId, req.params.feature]
    );

    // Invalidate permission cache for this user
    app.permissions.invalidateCache(req.params.userId);

    await app.audit('permissions.delete', {
      outcome: 'success',
      actor_user_id: req.user?.sub,
      target_user_id: req.params.userId,
      ip: req.ip,
      metadata: { feature: req.params.feature }
    });

    return { ok: true };
  });

  // Extras kept from legacy: dev-token
  if (String(process.env.AUTH_DEV_TOKEN) === '1') {
    app.get('/dev-token', async () => {
      // Stable development UUID for local testing
      const devSub = '00000000-0000-0000-0000-000000000001';
      const token = await app.jwtSign({ sub: devSub, role: 'admin' }, { expiresIn: '1d' });
      return { token, role: 'admin', sub: devSub };
    });
  }
  
}
