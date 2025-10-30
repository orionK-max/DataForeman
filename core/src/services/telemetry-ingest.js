// Simple telemetry ingestion worker (MVP)
// Subscribes to NATS subjects: df.telemetry.raw.* (JSON messages)
// Inserts batched rows into tag_values (Timescale hypertable if available)

import fp from 'fastify-plugin';

// Message shape (MVP): { connection_id, tag_id, ts, v, q }
// - connection_id: UUID string of the connection
// - tag_id: integer tag identifier
// - ts: ISO timestamp string or Unix timestamp in milliseconds
// - v: value (number, string, boolean, or object)
// - q: optional quality code (smallint)

export const telemetryIngestPlugin = fp(async (app) => {
  const nats = app.nats;
  const tsdb = app.tsdb || app.db; // fallback if tsdb not configured
  if (!nats || !nats.healthy()) {
    app.log.warn('telemetry-ingest: NATS not connected, skipping');
    return;
  }
  if (!tsdb) {
    app.log.warn('telemetry-ingest: no tsdb/db handle, skipping');
    return;
  }

  // Ensure table exists (idempotent); attempt hypertable if TimescaleDB available
  try {
    await tsdb.query(
      `CREATE TABLE IF NOT EXISTS tag_values (
         connection_id uuid NOT NULL,
         tag_id  integer NOT NULL,
         ts      timestamptz NOT NULL DEFAULT now(),
         quality smallint,
         v_num   double precision,
         v_text  text,
         v_json  jsonb,
         PRIMARY KEY (connection_id, tag_id, ts)
       );`
    );
    await tsdb.query(`CREATE INDEX IF NOT EXISTS tag_values_ts_desc ON tag_values (connection_id, tag_id, ts DESC);`);
    await tsdb.query(`CREATE INDEX IF NOT EXISTS tag_values_ts_idx ON tag_values (ts DESC);`);
    await tsdb.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
           -- skip
         ELSE
           PERFORM public.create_hypertable('tag_values', 'ts', 
             chunk_time_interval => INTERVAL '1 day',
             if_not_exists => TRUE);
         END IF;
       END$$;`
    );
  } catch (err) {
    app.log.warn({ err }, 'telemetry-ingest: failed to ensure tag_values table');
  }

  const subject = 'df.telemetry.raw.*';
  const batch = [];
  let flushing = false;
  const MAX_BATCH = 500; // MVP: modest batch size
  const MAX_AGE_MS = 100; // flush at least every 100ms
  let lastFlush = Date.now();
  const metrics = {
    totalRows: 0,
    lastFlushCount: 0,
    lastFlushMs: 0,
    lastFlushAt: null,
    skippedDeleted: 0,
  };
  app.decorate('telemetryIngest', { metrics });

  // Maintain a lightweight cache of deleted tag_ids to suppress ingestion for removed tags.
  const deletedTags = new Set();
  let lastDeletedRefresh = 0;
  const DELETED_REFRESH_INTERVAL_MS = 30_000; // refresh every 30s (cheap query)
  async function refreshDeletedTags(force = false) {
    if (!force && Date.now() - lastDeletedRefresh < DELETED_REFRESH_INTERVAL_MS) return;
    try {
      const { rows } = await app.db.query(`select tag_id from tag_metadata where status='deleted'`);
      deletedTags.clear();
      for (const r of rows) deletedTags.add(Number(r.tag_id));
      lastDeletedRefresh = Date.now();
    } catch (err) {
      app.log.warn({ err }, 'telemetry-ingest: failed to refresh deleted tags cache');
    }
  }
  await refreshDeletedTags(true);
  const deletedInterval = setInterval(() => { refreshDeletedTags().catch(()=>{}); }, 10_000);
  app.addHook('onClose', async () => { clearInterval(deletedInterval); });

  function classifyValue(v) {
    if (v === null || v === undefined) return { v_num: null, v_text: null, v_json: null };
    const t = typeof v;
    if (t === 'number') {
      if (!Number.isFinite(v)) return { v_num: null, v_text: String(v), v_json: null };
      return { v_num: v, v_text: null, v_json: null };
    }
    if (t === 'boolean') return { v_num: v ? 1 : 0, v_text: null, v_json: null };
    if (t === 'string') {
      // small strings only; longer still fine (TOAST) but acceptable for MVP
      return { v_num: null, v_text: v, v_json: null };
    }
    // object / array
    try { return { v_num: null, v_text: null, v_json: v }; } catch { return { v_num: null, v_text: '[unserializable]', v_json: null }; }
  }

  async function flush() {
    if (flushing) return;
    if (!batch.length) return;
    flushing = true;
    const rows = batch.splice(0, batch.length);
    lastFlush = Date.now();
    try {
      const t0 = Date.now();
      
      // Deduplicate rows by (connection_id, tag_id, ts) - keep the last occurrence
      const dedupMap = new Map();
      for (const r of rows) {
        const key = `${r.connection_id}|${r.tag_id}|${r.ts}`;
        dedupMap.set(key, r); // later values overwrite earlier ones
      }
      const uniqueRows = Array.from(dedupMap.values());
      
      const values = [];
      const params = [];
      let i = 1;
      for (const r of uniqueRows) {
        values.push(`($${i++}, $${i++}, to_timestamp($${i++} / 1000.0), $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(r.connection_id, r.tag_id, r.ts, r.quality, r.v_num, r.v_text, r.v_json ? JSON.stringify(r.v_json) : null);
      }
      const sql = `INSERT INTO tag_values (connection_id, tag_id, ts, quality, v_num, v_text, v_json) VALUES ${values.join(',')} 
                   ON CONFLICT (connection_id, tag_id, ts) DO UPDATE SET 
                   quality = EXCLUDED.quality, v_num = EXCLUDED.v_num, v_text = EXCLUDED.v_text, v_json = EXCLUDED.v_json`;
      await tsdb.query(sql, params);
      metrics.totalRows += uniqueRows.length;
      metrics.lastFlushCount = uniqueRows.length;
      metrics.lastFlushMs = Date.now() - t0;
      metrics.lastFlushAt = new Date().toISOString();
      // Only log every 100th flush or slow flushes (>100ms) to reduce log noise
      if (metrics.flushCount % 100 === 0 || metrics.lastFlushMs > 100) {
        app.log.info({ count: uniqueRows.length, ms: metrics.lastFlushMs, totalFlushes: metrics.flushCount, dropped: rows.length - uniqueRows.length }, 'telemetry-ingest flush');
      }
    } catch (err) {
      app.log.error({ err }, 'telemetry-ingest flush failed');
    } finally {
      flushing = false;
    }
  }

  function maybeFlush() {
    if (batch.length >= MAX_BATCH) { flush(); return; }
    const age = Date.now() - lastFlush;
    if (age >= MAX_AGE_MS) flush();
  }

  // periodic safety timer
  const interval = setInterval(maybeFlush, 50);
  app.addHook('onClose', async () => { clearInterval(interval); try { await flush(); } catch {} });

  // Subscribe
  try {
    const sub = nats._rawSub ? nats._rawSub(subject) : null; // fallback if private helper available
    if (!sub && nats?.healthy()) {
      // Use public NATS client under app.nats (not directly exposed). We stored only wrapper.
      // Instead, extend wrapper for raw subscribe if missing.
      // For MVP, patch by accessing internal nc via closure not exposed -> skip advanced handling.
    }
  } catch {}

  // Fallback: recreate subscription using underlying nc if we can (not exposed). So add a simple method to wrapper if absent.
  if (typeof nats.subscribe !== 'function') {
    app.log.warn('telemetry-ingest: nats.subscribe API not available');
    return;
  }

  const sc = { decode: (d) => { try { return JSON.parse(Buffer.from(d).toString('utf8')); } catch { return null; } } };

  try {
    const sub = await nats.subscribe(subject, (msg) => {
      try {
        const obj = typeof msg === 'object' && msg?.connection_id ? msg : sc.decode(msg.data || msg);
        if (!obj || !obj.connection_id || obj.tag_id == null || obj.ts == null) return;
        // Skip if tag is currently deleted (ensure periodic refresh keeps cache fresh)
        if (deletedTags.has(Number(obj.tag_id))) {
          metrics.skippedDeleted++;
          return; // silently drop
        }
        const { v_num, v_text, v_json } = classifyValue(obj.v);
        
        // Convert timestamp to Unix timestamp (milliseconds since epoch)
        // obj.ts can be either ISO string or number
        let tsMs;
        if (typeof obj.ts === 'string') {
          tsMs = Date.parse(obj.ts); // ISO string to milliseconds
        } else {
          tsMs = Number(obj.ts); // Already a number
        }
        
        // Validate timestamp is not NaN
        if (isNaN(tsMs)) {
          app.log.warn({ ts: obj.ts, connection_id: obj.connection_id, tag_id: obj.tag_id }, 'Invalid timestamp received, using current time');
          tsMs = Date.now();
        }
        
        batch.push({ connection_id: String(obj.connection_id), tag_id: Number(obj.tag_id), ts: tsMs, quality: obj.q == null ? null : Number(obj.q), v_num, v_text, v_json });
        maybeFlush();
      } catch {}
    });
    if (sub) app.log.info({ subject }, 'telemetry-ingest subscribed');
  } catch (err) {
    app.log.error({ err }, 'telemetry-ingest failed to subscribe');
  }
});
