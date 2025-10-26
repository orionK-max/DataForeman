import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { connect as natsConnect, StringCodec } from 'nats';
import { Pool } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import pino from 'pino';

// File logging with reopen on SIGHUP
const level = process.env.LOG_LEVEL || 'info';
const filePath = process.env.LOG_FILE || '/var/log/ingestor/ingestor.current';
const fileDest = pino.destination({ dest: filePath, mkdir: true, sync: false });
process.on('SIGHUP', () => { try { fileDest.reopen(); } catch {} });
const log = pino({ level }, fileDest);
process.on('SIGHUP', () => { try { log.info('SIGHUP received: log destination reopened'); } catch {} });
const NATS_URL = process.env.NATS_URL || 'nats://nats:4222';
const PGHOST = process.env.TSDB_HOST || 'tsdb';
const PGPORT = Number(process.env.TSDB_PORT || 5432);
const PGUSER = process.env.TSDB_USER || 'tsdb';
const PGPASSWORD = process.env.TSDB_PASSWORD || 'tsdb';
const PGDATABASE = process.env.TSDB_DATABASE || 'telemetry';

const pool = new Pool({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: PGDATABASE });

const sc = StringCodec();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addMetaSchema({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://json-schema.org/draft/2020-12/schema' });

function loadSchemas() {
  const candidates = [
    '/app/spec/connectivity/schemas',
    resolve(dirname(new URL(import.meta.url).pathname), '../../spec/connectivity/schemas')
  ];
  for (const dir of candidates) {
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.schema.json')) continue;
        const p = resolve(dir, file);
        const obj = JSON.parse(readFileSync(p, 'utf8'));
        const idConst = obj?.properties?.schema?.const;
        if (idConst) ajv.addSchema(obj, idConst);
      }
      return;
    } catch {}
  }
}
loadSchemas();

const validateBatch = ajv.getSchema('telemetry.batch@v1');

function mapPointRows(batch) {
  const { source, points } = batch;
  const connection_id = source.connection_id;
  const rows = [];
  for (const p of points) {
    const ts = p.ts || batch.ts;
    let v_numeric = null, v_text = null, v_bool = null;
    if (typeof p.v === 'number') v_numeric = p.v;
    else if (typeof p.v === 'string') v_text = p.v;
    else if (typeof p.v === 'boolean') v_bool = p.v;
    rows.push({ ts, connection_id, tag_id: p.tag_id, v_numeric, v_text, v_bool, q: p.q ?? null, src_ts: p.src_ts ?? null });
  }
  return rows;
}

async function copyRows(client, rows) {
  if (!rows.length) return;
  const sql = `COPY telemetry_points (ts, connection_id, tag_id, v_numeric, v_text, v_bool, q, src_ts) FROM STDIN WITH (FORMAT csv, NULL '')`;
  const stream = client.query(copyFrom(sql));
  const toCSV = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replaceAll('"', '""') + '"';
    return s;
  };
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        for (const r of rows) {
          const line = [r.ts, r.connection_id, r.tag_id, r.v_numeric, r.v_text, r.v_bool, r.q, r.src_ts].map(toCSV).join(',') + '\n';
          if (!stream.write(line)) {
            await new Promise((res) => stream.once('drain', res));
          }
        }
        stream.end();
      } catch (e) {
        stream.destroy(e);
      }
    })();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function main() {
  log.info({ NATS_URL, PGHOST, PGPORT, PGDATABASE }, 'Ingestor starting');
  const nc = await natsConnect({ servers: NATS_URL, name: 'ingestor' });
  log.info('Connected to NATS');

  const subject = 'df.telemetry.batch.v1';
  const BATCH_MAX = Number(process.env.BATCH_MAX || 5000);
  const FLUSH_MS = Number(process.env.FLUSH_MS || 100);
  const PULL_MAX = Number(process.env.PULL_MAX || 256);

  let acc = [];
  let pend = [];
  let lastFlush = Date.now();
  let inflight = 0;

  const flush = async () => {
    if (!acc.length) return;
    const rows = acc; const msgs = pend;
    acc = []; pend = [];
    const started = Date.now();
    let client;
    try {
      client = await pool.connect();
      try {
        await copyRows(client, rows);
        const dur = Date.now() - started;
        log.debug({ n: rows.length, ms: dur }, 'copyRows');
        // Ack all messages covered by this flush
        await Promise.allSettled(msgs.map((m) => m.ack()));
      } catch (e) {
        log.error({ err: e }, 'copyRows failed; falling back per-row');
        try {
          await client.query('BEGIN');
          const text = `INSERT INTO telemetry_points (ts, connection_id, tag_id, v_numeric, v_text, v_bool, q, src_ts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
          for (const r of rows) await client.query(text, [r.ts, r.connection_id, r.tag_id, r.v_numeric, r.v_text, r.v_bool, r.q, r.src_ts]);
          await client.query('COMMIT');
          await Promise.allSettled(msgs.map((m) => m.ack()));
        } catch (e2) {
          try { await client.query('ROLLBACK'); } catch {}
          // NAK messages so they can be redelivered
          await Promise.allSettled(msgs.map((m) => m.nak()));
          throw e2;
        }
      }
    } catch (connErr) {
      // Couldn't get a DB connection at all; NAK so JS retains the messages
      log.error({ err: connErr }, 'DB connect failed; NAK pending messages');
      await Promise.allSettled(msgs.map((m) => m.nak()));
      throw connErr;
    } finally {
      try { if (client) client.release(); } catch {}
    }
  };

    const useJS = process.env.JETSTREAM === '1';
    const maybeFlush = async () => {
      const now = Date.now();
      if (acc.length >= BATCH_MAX || now - lastFlush >= FLUSH_MS) {
        await flush();
        lastFlush = now;
      }
    };
    if (useJS) {
      // JetStream context and pull consumer
      const js = nc.jetstream();
      const jsm = await nc.jetstreamManager();
      const stream = 'DF_TELEMETRY';
      // Ensure stream exists
      try { await jsm.streams.info(stream); } catch { await jsm.streams.add({ name: stream, subjects: [subject], retention: 'limits', max_age: 0 }); }
      const durable = process.env.JS_DURABLE || 'ingestor';
      try {
        const info = await jsm.consumers.info(stream, durable);
        const cfg = info.config || {};
        const pushStyle = !!cfg.deliver_subject;
        const wrongFilter = cfg.filter_subject && cfg.filter_subject !== subject;
        const notExplicit = cfg.ack_policy && String(cfg.ack_policy).toLowerCase() !== 'explicit';
        if (pushStyle || wrongFilter || notExplicit) {
          await jsm.consumers.delete(stream, durable);
          await jsm.consumers.add(stream, { durable_name: durable, ack_policy: 'explicit', ack_wait: 30000, max_ack_pending: 8192, max_deliver: -1, filter_subject: subject });
        }
      } catch {
        await jsm.consumers.add(stream, { durable_name: durable, ack_policy: 'explicit', ack_wait: 30000, max_ack_pending: 8192, max_deliver: -1, filter_subject: subject });
      }
      const consumer = await js.consumers.get(stream, durable);
  (async function fetchLoop() {
        while (true) {
          try {
    // NATS nats.js requires expires to be strictly greater than 1000ms; use a safer floor
    const exp = Math.max(2000, FLUSH_MS * 10);
            const iter = await consumer.fetch({ batch: PULL_MAX, expires: exp });
            for await (const m of iter) {
              try {
                const obj = JSON.parse(sc.decode(m.data));
                if (validateBatch && !validateBatch(obj)) { log.warn({ errors: validateBatch.errors }, 'Invalid telemetry batch'); m.term(); continue; }
                const rows = mapPointRows(obj);
                acc.push(...rows);
                pend.push(m);
                await maybeFlush();
              } catch (err) { log.error({ err }, 'Failed to process message'); try { await m.nak(); } catch {} }
            }
            await maybeFlush();
      } catch (e) { log.warn({ err: e }, 'fetch error'); await new Promise((r) => setTimeout(r, 500)); }
        }
      })();
    } else {
      // Core NATS subscribe (no persistence); still batched/COPY
      nc.subscribe(subject, {
        callback: async (err, m) => {
          if (err) { log.error({ err }, 'sub error'); return; }
          try {
            const obj = JSON.parse(sc.decode(m.data));
            if (validateBatch && !validateBatch(obj)) { log.warn({ errors: validateBatch.errors }, 'Invalid telemetry batch'); return; }
            const rows = mapPointRows(obj);
            acc.push(...rows);
            await maybeFlush();
          } catch (e) { log.error({ err: e }, 'process error'); }
        }
      });
    }

  // Periodic flush to ensure small residual batches are written
  setInterval(() => { flush().catch((e) => log.warn({ err: e }, 'periodic flush failed')); }, FLUSH_MS);
}

main().catch((e) => { log.error({ err: e }, 'Fatal'); process.exit(1); });
