import fp from 'fastify-plugin';
import { createSecretKey } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

const roles = ['viewer', 'admin'];

export const jwtPlugin = fp(async (app) => {
  const secret = process.env.JWT_SECRET || 'change-me';
  const key = createSecretKey(Buffer.from(secret));

  app.decorate('jwtSign', async (payload, opts = {}) => {
    const { sub, role = 'viewer' } = payload;
    const token = await new SignJWT({ role, ...opts.claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn || '1d')
      .sign(key);
    return token;
  });

  app.decorate('jwtVerify', async (token) => {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return payload;
  });

  app.addHook('onRequest', async (req, reply) => {
    const url = req.raw?.url || req.url || '';
    // Public endpoints: health/metrics and selected auth routes
  if (url.startsWith('/health') || url.startsWith('/metrics')) return;
  // Public connectivity system summary (used for UI chips)
  if (url.startsWith('/api/connectivity/summary')) return;
  // MQTT auth webhook (called by nanoMQ broker)
  if (url === '/api/mqtt/auth') return;
    if (
      url === '/api/auth/login' ||
      url === '/api/auth/refresh' ||
      url === '/api/auth/demo-info' ||
      url === '/api/auth/demo-credentials' ||
      url === '/api/auth/dev-token'
    ) {
      return;
    }
  // SSE endpoints handle authentication in preHandler hooks (EventSource can't send headers)
  if (url.includes('/execution-events?') || url.includes('/logs/stream?')) return;
  if (String(process.env.AUTH_DEV_TOKEN) === '1' && url.startsWith('/api/logs')) return;
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return reply.code(401).send({ error: 'Missing token' });
    try {
      const payload = await app.jwtVerify(token);
      // If access token carries a jti, ensure the session is still valid
      if (payload?.jti && payload?.sub) {
        const { rows } = await app.db.query('select revoked_at from sessions where jti=$1 and user_id=$2', [payload.jti, payload.sub]);
        if (rows.length === 0 || rows[0].revoked_at) return reply.code(401).send({ error: 'Invalid token' });
      }
      req.user = { sub: payload.sub, role: payload.role || 'viewer', jti: payload.jti };
    } catch (e) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });
});
