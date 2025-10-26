import argon2 from 'argon2';
import { randomUUID, randomBytes } from 'crypto';
import { getConfig } from './config-items.js';

export class AuthProvider {
  async login(app, email, password, ctx) { throw new Error('not implemented'); }
  async refresh(app, refreshToken, ctx) { throw new Error('not implemented'); }
  async logout(app, refreshToken, ctx) { throw new Error('not implemented'); }
}

export async function issueTokens(app, userId, role, ctx) {
  const jti = randomUUID();
  const rawRefresh = randomBytes(48).toString('base64url');
  const refresh = `${jti}.${rawRefresh}`;
  const refresh_hash = await argon2.hash(refresh, { type: argon2.argon2id });
  const refreshDays = Math.max(1, Math.min(90, Number(process.env.SESS_TTL_DAYS || 14)));
  const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * refreshDays);
  await app.db.query(
    'insert into sessions(user_id, jti, refresh_hash, user_agent, ip, expires_at) values ($1,$2,$3,$4,$5,$6)',
    [userId, jti, refresh_hash, ctx.ua || null, ctx.ip || null, expires_at]
  );
  const accessTtl = String(process.env.JWT_ACCESS_TTL || '8h');
  const access = await app.jwtSign({ sub: userId, role }, { expiresIn: accessTtl, claims: { jti } });
  return { access, refresh };
}

export async function rotateRefresh(app, oldRefresh, userId, role, ctx) {
  const [oldJti] = String(oldRefresh || '').split('.');
  if (!oldJti) throw new Error('invalid refresh');
  const { rows } = await app.db.query('select id, refresh_hash, revoked_at from sessions where jti=$1 and user_id=$2', [
    oldJti,
    userId,
  ]);
  if (rows.length === 0) throw new Error('invalid refresh');
  const s = rows[0];
  if (s.revoked_at) throw new Error('revoked');
  const ok = await argon2.verify(s.refresh_hash, oldRefresh);
  if (!ok) {
    // replay or tamper
    await app.db.query('update sessions set revoked_at=now() where id=$1', [s.id]).catch(() => {});
    throw new Error('invalid refresh');
  }
  const tokens = await issueTokens(app, userId, role, ctx);
  await app.db.query('update sessions set revoked_at=now(), replaced_by_jti=$1 where id=$2', [tokens.refresh.split('.')[0], s.id]);
  return tokens;
}

export class LocalAuthProvider extends AuthProvider {
  async login(app, email, password, ctx) {
    const minLen = (await getConfig(app, 'auth.local', 'min_length', 8)) ?? 8;
    const maxAttempts = (await getConfig(app, 'auth.local', 'max_attempts', 5)) ?? 5;
    const lockMinutes = (await getConfig(app, 'auth.local', 'lock_minutes', 15)) ?? 15;

    const { rows } = await app.db.query(
      `select u.id, u.email, u.is_active, ai.id as ai_id, ai.secret_hash, ai.failed_attempts, ai.locked_until,
              coalesce((select string_agg(r.name, ',') from user_roles ur join roles r on ur.role_id=r.id where ur.user_id=u.id),'') as roles
       from users u
       left join auth_identities ai on ai.user_id=u.id and ai.provider='local'
       where lower(u.email)=lower($1)
      `,
      [email]
    );
    if (rows.length === 0) return { error: 'invalid credentials' };
    const u = rows[0];
    if (!u.is_active) return { error: 'user inactive' };
    const now = new Date();
    if (u.locked_until && new Date(u.locked_until) > now) {
      return { error: 'locked', locked_until: u.locked_until };
    }
    if (!u.secret_hash) return { error: 'no password set' };
    const ok = await argon2.verify(u.secret_hash, String(password || ''));
    if (!ok) {
      const fails = Math.min((u.failed_attempts || 0) + 1, 1000);
      const locked_until = fails >= maxAttempts ? new Date(Date.now() + lockMinutes * 60 * 1000) : null;
      await app.db.query('update auth_identities set failed_attempts=$1, locked_until=$2 where id=$3', [
        fails,
        locked_until,
        u.ai_id,
      ]);
      await app.audit('auth.login', { outcome: 'failure', actor_user_id: u.id, ip: ctx.ip, metadata: { reason: 'bad_password' } });
      return locked_until
        ? { error: 'locked', locked_until }
        : { error: 'invalid credentials' };
    }

    if ((password || '').length < minLen) return { error: 'weak password' };
    await app.db.query('update auth_identities set failed_attempts=0, locked_until=null, last_login_at=now() where id=$1', [u.ai_id]);
    const role = String(u.roles || 'viewer').includes('admin') ? 'admin' : 'viewer';
    const tokens = await issueTokens(app, u.id, role, ctx);
    await app.audit('auth.login', { outcome: 'success', actor_user_id: u.id, ip: ctx.ip });
    return { userId: u.id, role, ...tokens };
  }

  async refresh(app, refreshToken, ctx) {
    // Derive user from refresh token jti to allow refresh after access expiry
    const [jti] = String(refreshToken || '').split('.');
    if (!jti) throw new Error('invalid refresh');
    const { rows: sessRows } = await app.db.query('select user_id, expires_at, revoked_at from sessions where jti=$1', [jti]);
    if (sessRows.length === 0) throw new Error('invalid refresh');
    const sess = sessRows[0];
    if (sess.revoked_at) throw new Error('revoked');
    if (sess.expires_at && new Date(sess.expires_at) < new Date()) throw new Error('expired');
    const userId = sess.user_id;
    const { rows } = await app.db.query(
      `select u.id, coalesce((select string_agg(r.name, ',') from user_roles ur join roles r on ur.role_id=r.id where ur.user_id=u.id),'') as roles from users u where id=$1`,
      [userId]
    );
    if (rows.length === 0) throw new Error('no user');
    const role = String(rows[0].roles || 'viewer').includes('admin') ? 'admin' : 'viewer';
    const tokens = await rotateRefresh(app, refreshToken, userId, role, ctx);
    await app.audit('auth.refresh', { outcome: 'success', actor_user_id: userId, ip: ctx.ip });
    return tokens;
  }

  async logout(app, refreshToken, ctx) {
    const [jti] = String(refreshToken || '').split('.');
    if (!jti) return;
    await app.db.query('update sessions set revoked_at=now() where jti=$1', [jti]);
    await app.audit('auth.logout', { outcome: 'success', actor_user_id: ctx.userId || null, ip: ctx.ip });
  }
}
