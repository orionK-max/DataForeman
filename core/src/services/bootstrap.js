import argon2 from 'argon2';

// Ensure admin@example.com has a local password if ADMIN_PASSWORD is provided
export async function ensureAdminPassword(app) {
  const log = app.log || console;
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const envPw = process.env.ADMIN_PASSWORD;
    // Find or create admin user
    const { rows: users } = await app.db.query('select id from users where lower(email)=lower($1) limit 1', [adminEmail]);
    let userId;
    if (users.length === 0) {
      // Create new admin user
      const ins = await app.db.query(
        "insert into users(email, display_name, is_active) values ($1,$2,true) returning id",
        [adminEmail, 'Admin']
      );
      userId = ins.rows[0].id;
    } else {
      userId = users[0].id;
    }
    
    // Ensure admin role is assigned (idempotent)
    await app.db.query(
      "insert into user_roles(user_id, role_id) select $1, r.id from roles r where r.name='admin' on conflict do nothing",
      [userId]
    );

    // Ensure admin has all permissions (idempotent)
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
      'users',
      'permissions',
      'jobs',
      'logs',
      'flows',
      'configuration',
      'mqtt'
    ];
    
    for (const feature of defaultFeatures) {
      await app.db.query(
        'insert into user_permissions(user_id, feature, can_create, can_read, can_update, can_delete) values ($1, $2, true, true, true, true) on conflict do nothing',
        [userId, feature]
      );
    }

    const { rows } = await app.db.query(
      `select u.id as user_id, ai.id as ai_id, ai.secret_hash
         from users u
         left join auth_identities ai on ai.user_id=u.id and ai.provider='local'
        where lower(u.email)=lower($1)
        limit 1`,
      [adminEmail]
    );
    if (rows.length === 0) return; // shouldn't happen
    const rec = rows[0];
    // Only set if not present and env is provided
    if (!rec.secret_hash && envPw && envPw.length > 0) {
      const hash = await argon2.hash(String(envPw), { type: argon2.argon2id });
      if (!rec.ai_id) {
        await app.db.query(
          'insert into auth_identities(user_id, provider, provider_user_id, secret_hash, failed_attempts, locked_until) values ($1,$2,$3,$4,0,null)',
          [rec.user_id, 'local', rec.user_id, hash]
        );
      } else {
        await app.db.query('update auth_identities set secret_hash=$1, failed_attempts=0, locked_until=null where id=$2', [hash, rec.ai_id]);
      }
      log.info({ email: adminEmail }, 'bootstrap: admin password set from ADMIN_PASSWORD');
    } else if (!rec.secret_hash && !envPw) {
      log.warn({ email: adminEmail }, 'bootstrap: ADMIN_PASSWORD not set; admin has no password');
    }
  } catch (e) {
    try { (app.log || console).error(e, 'bootstrap: ensureAdminPassword failed'); } catch {}
  }
}
