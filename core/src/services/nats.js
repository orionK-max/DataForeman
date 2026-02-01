import fp from 'fastify-plugin';
import { connect, StringCodec } from 'nats';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const natsPlugin = fp(async function (app) {
  const NATS_URL = process.env.NATS_URL || 'nats://nats:4222';
  const sc = StringCodec();

  // Connectivity status cache
  const statusMap = new Map(); // id -> latest status object
  app.decorate('connectivityStatus', statusMap);

  // Ajv for schemas (optional validation for outgoing/incoming messages)
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addMetaSchema({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://json-schema.org/draft/2020-12/schema' });
  const schemas = {};
  function loadSchemas() {
    const candidates = [
      '/app/spec/connectivity/schemas',
      resolve(__dirname, '../../../spec/connectivity/schemas')
    ];
    for (const dir of candidates) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.schema.json')) continue;
          const p = resolve(dir, file);
          const obj = JSON.parse(readFileSync(p, 'utf8'));
          const idConst = obj?.properties?.schema?.const;
          if (idConst && !schemas[idConst]) {
            schemas[idConst] = obj;
            ajv.addSchema(obj, idConst);
          }
        }
        // If we loaded any, we are done
        if (Object.keys(schemas).length > 0) return;
      } catch {}
    }
  }
  loadSchemas();

  function validateOrThrow(obj) {
    const key = obj?.schema;
    const v = key && ajv.getSchema(key);
    if (!v) return; // no schemas loaded or unknown; skip
    if (!v(obj)) {
      const err = new Error('schema validation failed');
      err.errors = v.errors;
      throw err;
    }
  }

  let nc = null;
  try {
    nc = await connect({ servers: NATS_URL, name: 'core' });
    app.log.info({ NATS_URL }, 'Core connected to NATS');
  } catch (err) {
    app.log.error({ err }, 'Core failed to connect to NATS');
    // Continue without NATS; routes should handle absence gracefully
  }

  app.decorate('nats', {
    publish: (subject, dataObj) => {
      if (!nc) throw new Error('nats_not_connected');
      try { validateOrThrow(dataObj); } catch (e) { app.log.warn({ subject, errors: e.errors }, 'NATS publish validation failed'); }
      const data = sc.encode(JSON.stringify(dataObj));
      nc.publish(subject, data);
    },
    request: async (subject, dataObj, timeoutMs = 3000) => {
      if (!nc) throw new Error('nats_not_connected');
      const data = dataObj === undefined ? undefined : sc.encode(JSON.stringify(dataObj));
      const msg = await nc.request(subject, data, { timeout: timeoutMs }).catch((e) => { throw e; });
      try {
        return JSON.parse(sc.decode(msg.data));
      } catch {
        return sc.decode(msg.data);
      }
    },
    subscribeStatus: () => {
      if (!nc) return;
      const sub = nc.subscribe('df.connectivity.status.v1.*');
      (async () => {
        for await (const m of sub) {
          try {
            const obj = JSON.parse(sc.decode(m.data));
            try { validateOrThrow(obj); } catch {}
            if (obj?.id) {
              // Remove status entries for deleted connections to prevent accumulation
              if (obj.state === 'deleted') {
                statusMap.delete(obj.id);
              } else {
                statusMap.set(obj.id, obj);
              }
            }
          } catch (err) {
            app.log.warn({ err }, 'Failed to parse status message');
          }
        }
      })();
    },
    healthy: () => !!nc,
    subscribe: (subject, handler) => {
      if (!nc) throw new Error('nats_not_connected');
      const sub = nc.subscribe(subject);
      (async () => {
        for await (const m of sub) {
          try {
            const obj = JSON.parse(sc.decode(m.data));
            handler(obj, m);
          } catch (err) {
            app.log.warn({ err }, 'nats subscribe parse failed');
          }
        }
      })();
      return sub;
    },
    subscribeRaw: (subject) => {
      // Returns raw subscription for direct async iteration (used by SSE streaming)
      if (!nc) throw new Error('nats_not_connected');
      return nc.subscribe(subject);
    }
  });

  // Start status subscription immediately
  try { app.nats.subscribeStatus(); } catch {}

  app.addHook('onClose', async () => { try { await nc?.drain(); } catch {} });
});
