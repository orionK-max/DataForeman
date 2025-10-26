import { connect as natsConnect, StringCodec } from 'nats';
import { Pool } from 'pg';
import pino from 'pino';

// File logging with reopen on SIGHUP + Docker stdout
const level = process.env.LOG_LEVEL || 'info';
const filePath = process.env.LOG_FILE || '/var/log/ingestor/ingestor.current';
const fileDest = pino.destination({ dest: filePath, mkdir: true, sync: false });
process.on('SIGHUP', () => { try { fileDest.reopen(); } catch {} });
// Write to both file and stdout (docker logs)
const streams = [
  { stream: fileDest },
  { stream: process.stdout }
];
const log = pino({ level }, pino.multistream(streams));
process.on('SIGHUP', () => { try { log.info('SIGHUP received: log destination reopened'); } catch {} });
const NATS_URL = process.env.NATS_URL || 'nats://nats:4222';
const PGHOST = process.env.TSDB_HOST || 'tsdb';
const PGPORT = Number(process.env.TSDB_PORT || 5432);
const PGUSER = process.env.TSDB_USER || 'tsdb';
const PGPASSWORD = process.env.TSDB_PASSWORD || 'tsdb';
const PGDATABASE = process.env.TSDB_DATABASE || 'telemetry';

const pool = new Pool({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: PGDATABASE });
const sc = StringCodec();

// Metrics tracking
let messageCount = 0;
let errorCount = 0;
let lastMetricsLog = Date.now();
const METRICS_INTERVAL_MS = 60000; // Log metrics every minute

function mapRawTelemetry(raw) {
  // raw: { connection_id, tag_id, ts, v, q }
  const ts = new Date(raw.ts).toISOString();
  let v_num = null, v_text = null;
  if (typeof raw.v === 'number') v_num = raw.v;
  else if (typeof raw.v === 'string') v_text = raw.v;
  else if (typeof raw.v === 'boolean') v_num = raw.v ? 1 : 0; // Store boolean as number
  return {
    ts,
    connection_id: raw.connection_id,
    tag_id: raw.tag_id,
    v_num,
    v_text,
    quality: raw.q ?? null
  };
}

function logMetricsIfNeeded() {
  const now = Date.now();
  if (now - lastMetricsLog >= METRICS_INTERVAL_MS) {
    const elapsed = (now - lastMetricsLog) / 1000;
    const rate = messageCount / elapsed;
    log.info({ 
      messages_processed: messageCount,
      errors: errorCount,
      rate_per_sec: Math.round(rate * 100) / 100,
      db_pool_total: pool.totalCount,
      db_pool_idle: pool.idleCount,
      db_pool_active: pool.totalCount - pool.idleCount,
      db_pool_waiting: pool.waitingCount
    }, 'ingestor metrics');
    messageCount = 0;
    errorCount = 0;
    lastMetricsLog = now;
  }
}

async function insertRow(row) {
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    attempt++;
    let client;
    try {
      client = await pool.connect();
      const text = `INSERT INTO tag_values (ts, connection_id, tag_id, v_num, v_text, quality)
                    VALUES ($1,$2,$3,$4,$5,$6)
                    ON CONFLICT (connection_id, tag_id, ts)
                    DO UPDATE SET v_num = EXCLUDED.v_num,
                                  v_text = EXCLUDED.v_text,
                                  quality = EXCLUDED.quality`;
      await client.query(text, [row.ts, row.connection_id, row.tag_id, row.v_num, row.v_text, row.quality]);
      log.debug({ connection_id: row.connection_id, tag_id: row.tag_id, v: row.v_num ?? row.v_text }, 'Telemetry written to DB');
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        const backoff = Math.min(500 * attempt, 1500);
        log.warn({ err: e, attempt }, 'insertRow failed; retrying');
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      } else {
        throw e;
      }
    } finally {
      try { client?.release(); } catch {}
    }
  }
  throw lastErr || new Error('insertRow failed');
}

async function main() {
  log.info({ NATS_URL, PGHOST, PGPORT, PGDATABASE }, 'Ingestor starting');
  log.info('Testing database connection...');
  let connected = false;
  let attempt = 0;
  while (!connected) {
    attempt++;
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      log.info('Database connection OK');
      connected = true;
    } catch (e) {
      const delay = Math.min(1000 * attempt, 10000);
      log.warn({ err: e, attempt, delay }, 'Database connection failed; will retry');
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  log.info('Connecting to NATS...');
  const nc = await natsConnect({ servers: NATS_URL, name: 'ingestor' });
  log.info('Connected to NATS');

  log.info('Setting up raw telemetry subscription...');
  nc.subscribe('df.telemetry.raw.*', {
    callback: async (err, m) => {
      if (err) {
        log.error({ err }, 'Raw telemetry subscription error');
        errorCount++;
        return;
      }
      try {
        log.debug({ subject: m.subject }, 'Received raw telemetry message');
        const obj = JSON.parse(sc.decode(m.data));
        log.debug({ data: obj }, 'Parsed raw telemetry data');
        const row = mapRawTelemetry(obj);
        await insertRow(row);
        messageCount++;
        logMetricsIfNeeded();
      } catch (e) {
        log.error({ err: e, subject: m?.subject }, 'Raw telemetry processing error');
        errorCount++;
      }
    }
  });

  log.info('Ingestor ready and listening for raw telemetry messages');

  const shutdown = async (signal) => {
    log.info({ signal }, 'Shutting down');
    try { await nc?.drain(); } catch (e) {}
    try { await pool.end(); } catch (e) {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  log.error({ err: e }, 'Fatal error in ingestor');
  process.exit(1);
});
