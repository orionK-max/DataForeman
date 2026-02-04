import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { createServer } from 'http';
import { connect, StringCodec } from 'nats';
import pino from 'pino';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { OPCUAClientDriver } from './drivers/opcuaClient.mjs';
import { OPCUAServerDriver } from './drivers/opcuaServer.mjs';
import { S7Driver } from './drivers/s7.mjs';
import { EIPPyComm3Driver } from './drivers/eip-pycomm3.mjs';
import { MQTTDriver } from './drivers/mqtt.mjs';
import { DatabaseHelper } from './db-helper.mjs';

// Logger setup - write to both file and stdout (docker logs)
const level = process.env.LOG_LEVEL || 'info';
const filePath = process.env.LOG_FILE || '/var/log/connectivity/connectivity.current';
const fileDest = pino.destination({ dest: filePath, mkdir: true, sync: false });
process.on('SIGHUP', () => {
  try { fileDest.reopen(); } catch {}
});
const streams = [
  { stream: fileDest },
  { stream: process.stdout }
];
const log = pino({ level }, pino.multistream(streams));
// Confirm log reopen on SIGHUP by emitting a line
process.on('SIGHUP', () => {
  try { log.info('SIGHUP received: log destination reopened'); } catch {}
});

// Config
const NATS_URL = process.env.NATS_URL || 'nats://nats:4222';
const SERVICE_ID = process.env.SERVICE_ID || 'connectivity-1';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3100', 10);

// Global state
let natsConnected = false;
const connections = new Map(); // connId -> { driver, config }
const activeOps = new Map(); // connId -> count
let dbHelper = null;
let pollGroupsCache = new Map(); // group_id -> { name, poll_rate_ms, ... }
// Lightweight per-connection stats window for live rates
const connStats = new Map(); // connId -> { wStart: ms, count: number, bytes: number, errors: number, last_seen_ts: string|null }
// Connection tracking by host for CIP connection monitoring
const activeConnectionsByHost = new Map(); // host -> Set<connection_id>
// Periodic reconciliation interval (ms) for pruning deleted/unsubscribed tags that may linger in drivers
const TAG_RECONCILE_INTERVAL_MS = parseInt(process.env.TAG_RECONCILE_INTERVAL_MS || '60000', 10);
let lastTagReconcile = 0;

// Connection tracker functions
function registerConnection(host, connectionId) {
  if (!activeConnectionsByHost.has(host)) {
    activeConnectionsByHost.set(host, new Set());
  }
  activeConnectionsByHost.get(host).add(connectionId);
  log.debug({ host, connectionId, totalForHost: activeConnectionsByHost.get(host).size }, 'Registered connection to host');
}

function unregisterConnection(host, connectionId) {
  const connections = activeConnectionsByHost.get(host);
  if (connections) {
    connections.delete(connectionId);
    if (connections.size === 0) {
      activeConnectionsByHost.delete(host);
    }
    log.debug({ host, connectionId, remainingForHost: connections.size }, 'Unregistered connection from host');
  }
}

function getActiveConnectionCount(host) {
  return activeConnectionsByHost.get(host)?.size || 0;
}

function ensureConnStats(id) {
  let s = connStats.get(id);
  if (!s) {
    s = { wStart: Date.now(), count: 0, bytes: 0, errors: 0, last_seen_ts: null };
    connStats.set(id, s);
  }
  return s;
}

function observeDataAndMaybePublish(nc, id, byteLen, tsIso) {
  const s = ensureConnStats(id);
  s.count += 1;
  s.bytes += Math.max(0, Number(byteLen || 0));
  if (tsIso) s.last_seen_ts = tsIso;
  const now = Date.now();
  const dt = (now - s.wStart) / 1000;
  if (dt >= 1) {
    // Compute instantaneous rates over the window and publish
    const rps = s.count / dt;
    const bps = (s.bytes * 8) / dt; // bits per second
    const stats = {
      rps: Math.round(rps),
      bps: Math.round(bps),
      errors: s.errors | 0,
      last_seen_ts: s.last_seen_ts || new Date().toISOString()
    };
    // Attach polling metrics if available
    try {
      const conn = connections.get(id);
      const metrics = conn?.driver?.getMetrics?.();
      if (metrics && typeof metrics === 'object') stats.polling = metrics;
    } catch {}
    try { publishStatus(nc, id, 'connected', undefined, stats); } catch {}
    // Reset window but keep last_seen_ts
    s.wStart = now;
    s.count = 0;
    s.bytes = 0;
    s.errors = 0;
  }
}

// Initialize database helper with retry logic
async function initDatabase() {
  const maxRetries = 30; // Try for up to 30 seconds
  const retryDelay = 1000; // 1 second between retries
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      dbHelper = new DatabaseHelper();
      
      // Test connection
      const healthy = await dbHelper.isHealthy();
      if (!healthy) {
        throw new Error('Database health check failed');
      }
      
      // Load poll groups for multirate support
      const pollGroups = await dbHelper.getPollGroups();
      pollGroupsCache.clear();
      for (const group of pollGroups) {
        pollGroupsCache.set(group.group_id, group);
      }
      log.info({ 
        multirate: true,
        pollGroups: pollGroups.length,
        attempts: attempt
      }, 'Database initialized with multi-rate support');
      
      return true;
    } catch (err) {
      const isLastAttempt = attempt >= maxRetries;
      const errMsg = String(err?.message || err);
      
      // Check if it's a "table does not exist" error (migrations not complete)
      const isMigrationPending = errMsg.includes('does not exist') || errMsg.includes('relation');
      
      if (isLastAttempt) {
        log.error({ 
          err: errMsg, 
          attempts: attempt 
        }, 'Database initialization failed after max retries');
        throw err; // Multi-rate mode requires database
      }
      
      if (isMigrationPending) {
        log.warn({ 
          err: errMsg, 
          attempt, 
          maxRetries,
          nextRetryIn: retryDelay
        }, 'Database not ready (migrations may be running), retrying...');
      } else {
        log.error({ 
          err: errMsg, 
          attempt, 
          maxRetries 
        }, 'Database initialization failed, retrying...');
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

// Schema loader (unchanged)
const root = resolve(dirname(new URL(import.meta.url).pathname), '../spec/connectivity');
const schemaDir = resolve(root, 'schemas');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addMetaSchema({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://json-schema.org/draft/2020-12/schema' });
const schemas = {};
for (const file of readdirSync(schemaDir)) {
  if (!file.endsWith('.schema.json')) continue;
  const p = resolve(schemaDir, file);
  const obj = JSON.parse(readFileSync(p, 'utf8'));
  const idConst = obj?.properties?.schema?.const;
  if (!idConst) throw new Error(`Schema missing properties.schema.const: ${file}`);
  schemas[idConst] = obj;
  ajv.addSchema(obj, idConst);
}

const sc = StringCodec();

// Helper functions (unchanged)
function beginOp(nc, id) {
  const n = (activeOps.get(id) || 0) + 1;
  activeOps.set(id, n);
  if (n === 1) {
    publishStatus(nc, id, 'connected').catch(()=>{});
  }
}

function endOp(nc, id) {
  const cur = activeOps.get(id) || 0;
  const n = cur - 1 <= 0 ? 0 : cur - 1;
  activeOps.set(id, n);
  if (n === 0) {
    publishStatus(nc, id, 'disconnected').catch(()=>{});
  }
}

function nowIso() {
  return new Date().toISOString();
}

function validateOrNull(payload) {
  const key = payload?.schema;
  const validate = key && ajv.getSchema(key);
  if (!validate) return { ok: false, errors: [{ message: `unknown schema ${key}` }] };
  const ok = validate(payload);
  return ok ? { ok: true } : { ok: false, errors: validate.errors };
}

async function publishStatus(nc, id, state, reason = undefined, stats = undefined) {
  const subject = `df.connectivity.status.v1.${id}`;
  const msg = { schema: 'connectivity.status@v1', ts: nowIso(), id, state };
  if (reason) msg.reason = reason;
  // On errors, increment error counter so the next stats publish reflects it
  if (state === 'error') {
    try { ensureConnStats(id).errors += 1; } catch {}
  }
  if (stats) msg.stats = stats;
  nc.publish(subject, sc.encode(JSON.stringify(msg)));
}

async function publishTelemetryBatch(nc, connId, points) {
  if (!points || points.length === 0) return;
  const payload = {
    schema: 'telemetry.batch@v1',
    ts: nowIso(),
    source: { connection_id: connId, driver: 'connectivity' },
    points,
  };
  nc.publish('df.telemetry.batch.v1', sc.encode(JSON.stringify(payload)));
}

function emitTelemetry(nc, connId, pt) {
  const topic = `df.telemetry.raw.${connId}`;
  // Send raw telemetry data directly (the format expected by simple ingestor)
  const payload = {
    connection_id: connId,
    tag_id: pt.tag_id,
    ts: pt.ts,
    v: pt.v,
    q: pt.q
  };
  log.info({ topic, payload }, 'Publishing telemetry to NATS');
  const enc = sc.encode(JSON.stringify(payload));
  // Observe payload size to estimate throughput and publish periodic stats
  try { observeDataAndMaybePublish(nc, connId, enc.byteLength ?? enc.length, pt.ts); } catch {}
  nc.publish(topic, enc);
}

// EIP driver initialization with multi-rate support
async function initEIPDriver(id, config, nc) {
  return await initEIPMultiRateDriver(id, config, nc);
}

async function initEIPMultiRateDriver(id, config, nc) {
  log.info({ connectionId: id, host: config.host }, 'Initializing EIP PyComm3 driver');
  
  const driver = new EIPPyComm3Driver({
    host: config.host,
    slot: config.driver_opts?.slot ?? 0,
    timeoutMs: config.driver_opts?.timeout_ms ?? 5000,
    maxTagsPerGroup: config.max_tags_per_group ?? 500,
    maxConcurrentConnections: config.max_concurrent_connections ?? 8,
  });

  driver.onData(async (pt) => {
    try { emitTelemetry(nc, id, pt); } catch {}
  });

  // Update poll groups from database
  const pollGroups = Array.from(pollGroupsCache.values());
  driver.updatePollGroups(pollGroups);

  // Connect to PLC
  await driver.connect();
  
  // Register connection to host for tracking
  registerConnection(config.host, id);

  // Get subscribed tags for this connection
  const tagMetadata = await dbHelper.getTagMetadataByConnection(id);
  
  if (tagMetadata.length > 0) {
    // Group tags by poll group
    const tagsByPollGroup = {};
    for (const tag of tagMetadata) {
      const groupId = tag.poll_group_id;
      if (!tagsByPollGroup[groupId]) {
        tagsByPollGroup[groupId] = [];
      }
      tagsByPollGroup[groupId].push(tag);
    }

    // Configure driver with multi-rate polling
    await driver.updateTagSubscriptions(tagsByPollGroup);
    
    log.info({ 
      connectionId: id,
      pollGroups: Object.keys(tagsByPollGroup).length,
      totalTags: tagMetadata.length 
    }, 'EIP multi-rate driver configured');
  } else {
    log.info({ connectionId: id }, 'EIP multi-rate driver connected with no tags');
  }

  return driver;
}

// Load enabled connections from database on startup
async function loadEnabledConnections(nc) {
  if (!dbHelper) {
    log.warn('Database helper not available, skipping connection loading');
    return;
  }
  
  try {
    log.info('Loading enabled connections from database');
    
    // Get all enabled connections from connections table with config_data
    const { rows } = await dbHelper.query(
      `SELECT id, name, type, enabled, config_data 
       FROM connections
       WHERE deleted_at IS NULL 
       AND enabled = true
       ORDER BY name`
    );
    
    let loadedCount = 0;
    for (const row of rows) {
      try {
        const config = { 
          id: row.id, 
          name: row.name, 
          type: row.type,
          enabled: row.enabled, 
          ...(row.config_data || {}) 
        };
        if (config && config.id && config.enabled) {
          await handleConfigUpdate(nc, { conn: config });
          loadedCount++;
          log.info({ connectionId: config.id, name: config.name, type: config.type }, 'Loaded connection from database');
        }
      } catch (err) {
        log.warn({ 
          connectionId: row.id, 
          err: String(err?.message || err) 
        }, 'Failed to load connection from database');
      }
    }
    
    log.info({ connections: loadedCount }, 'Completed loading enabled connections from database');
  } catch (err) {
    log.error({ err: String(err?.message || err) }, 'Failed to load enabled connections from database');
  }
}

// Enhanced configuration handler
async function handleConfigUpdate(nc, data) {
  // Handle explicit delete operations first
  if (data.op === 'delete' && data.id) {
    const id = data.id;
    const existing = connections.get(id);
    if (existing) {
      log.info({ connectionId: id }, 'Deleting connection via explicit delete operation');
      try { await existing.driver.disconnect(); } catch {}
      // Unregister connection from host tracking
      if (existing.config?.host) {
        unregisterConnection(existing.config.host, id);
      }
      connections.delete(id);
      await publishStatus(nc, id, 'deleted');
    }
    return;
  }
  
  if (!data?.conn) return;
  
  const id = data.conn.id;
  if (!id) return;

  try {
    const existing = connections.get(id);
    // Normalize type to handle hyphen/underscore variants
    const rawType = String(data.conn.type || '').toLowerCase();
    const normType = rawType.replace(/_/g, '-');

    if (data.conn.type !== normType) {
      // keep original for persistence, but use normalized for routing
      data.conn = { ...data.conn, type: normType };
    }

    if (!data.conn.enabled) {
      if (existing) {
        try { await existing.driver.disconnect(); } catch {}
        // Unregister connection from host tracking
        if (existing.config?.host) {
          unregisterConnection(existing.config.host, id);
        }
        connections.delete(id);
        await publishStatus(nc, id, 'disabled');
      }
      return;
    }

    // Handle different driver types
    if (data.conn.type === 'eip') {
      await handleEIPConfigUpdate(nc, id, data.conn, existing);
    } else if (data.conn.type === 'opcua-client') {
      await handleOPCUAConfigUpdate(nc, id, data.conn, existing);
    } else if (data.conn.type === 'opcua-server') {
      await handleOPCUAConfigUpdate(nc, id, data.conn, existing);
    } else if (data.conn.type === 's7') {
      await handleS7ConfigUpdate(nc, id, data.conn, existing);
    } else if (data.conn.type === 'mqtt') {
      await handleMQTTConfigUpdate(nc, id, data.conn, existing);
    } else {
      log.warn({ 
        connectionId: id, 
        type: data.conn.type,
        name: data.conn.name,
        host: data.conn.host,
        port: data.conn.port,
        supportedTypes: ['eip', 'opcua-client', 'opcua-server', 's7', 'mqtt']
      }, 'Unsupported driver type - connection config will be ignored');
    }
  } catch (err) {
    log.error({ connectionId: id, err: String(err?.message || err) }, 'Config update failed');
    await publishStatus(nc, id, 'error', err.message);
  }
}

async function handleEIPConfigUpdate(nc, id, config, existing) {
  log.info({ connectionId: id }, 'Handling EIP config update');
  
  try {
    if (existing) {
      log.info({ connectionId: id }, 'Updating existing EIP driver');
      await existing.driver.updateConfig({
        samplingMs: config.driver_opts?.sampling_ms,
        timeout: config.driver_opts?.timeout_ms
      });
      
      // Refresh tag subscriptions from database (important for poll group updates)
      log.info({ connectionId: id }, 'Refreshing EIP tag subscriptions from database');
      const tagMetadata = await dbHelper.getTagMetadataByConnection(id);
      
      if (tagMetadata.length > 0) {
        // Group tags by poll group
        const tagsByPollGroup = {};
        for (const tag of tagMetadata) {
          const groupId = tag.poll_group_id;
          if (!tagsByPollGroup[groupId]) {
            tagsByPollGroup[groupId] = [];
          }
          tagsByPollGroup[groupId].push(tag);
        }

        // Update poll groups from database (in case they changed)
        const pollGroups = Array.from(pollGroupsCache.values());
        existing.driver.updatePollGroups(pollGroups);
        
        // Update driver with refreshed multi-rate polling configuration
        await existing.driver.updateTagSubscriptions(tagsByPollGroup);
        
        log.info({ 
          connectionId: id,
          pollGroups: Object.keys(tagsByPollGroup).length,
          totalTags: tagMetadata.length 
        }, 'EIP multi-rate driver tag subscriptions refreshed');
      } else {
        log.info({ connectionId: id }, 'EIP driver has no tags to subscribe to');
        // Clear subscriptions if no tags are configured
        await existing.driver.updateTagSubscriptions({});
      }
    } else {
      log.info({ connectionId: id }, 'Creating new EIP driver');
      const driver = await initEIPDriver(id, config, nc);
      connections.set(id, { driver, config });
      beginOp(nc, id);
      await publishStatus(nc, id, 'connected');
    }
  } catch (error) {
    log.error({ connectionId: id, err: String(error?.message || error) }, 'EIP config update failed');
    await publishStatus(nc, id, 'error', error.message);
  }
}

async function handleOPCUAConfigUpdate(nc, id, config, existing) {
  log.info({ connectionId: id }, 'Handling OPCUA config update');
  
  try {
    if (!existing) {
      const driver = new OPCUAClientDriver({
        endpoint: config.endpoint,
        auth: config.auth || {},
        samplingMs: config.driver_opts?.sampling_ms ?? 1000,
        deadband: config.driver_opts?.deadband ?? 0,
        queueSize: config.driver_opts?.queue_size || 10,
        security_strategy: config.driver_opts?.security_strategy || 'none_first',
      });
      driver.onData(async (pt) => { try { emitTelemetry(nc, id, pt); } catch {} });
      
      // Add to connections Map immediately so delete operations can find it
      connections.set(id, { driver, config, connecting: true });
      
      // Attempt connection asynchronously - don't block message processing
      driver.connect()
        .then(async () => {
          // Check if connection was deleted while connecting
          const current = connections.get(id);
          if (!current || driver._aborted) {
            log.info({ connectionId: id }, 'Connection was deleted during connect attempt');
            try { await driver.disconnect(); } catch {}
            connections.delete(id);
            // Don't publish any status - delete handler already published 'deleted'
            return;
          }
          
          // Update to mark connection complete
          connections.set(id, { driver, config, connecting: false });
          beginOp(nc, id);
          await publishStatus(nc, id, 'connected');

          // Poll groups and tags
          const pollGroups = Array.from(pollGroupsCache.values());
          driver.updatePollGroups?.(pollGroups);
          const tagMetadata = await dbHelper.getTagMetadataByConnection(id);
          // Build tag map
          driver.tagMap = Object.fromEntries(tagMetadata.map(t => [t.tag_id, t.tag_path]));
          const tagsByPollGroup = groupTagsByPollGroup(tagMetadata);
          await driver.updateTagSubscriptions?.(tagsByPollGroup);
        })
        .catch(async (error) => {
          log.error({ connectionId: id, err: String(error?.message || error) }, 'OPCUA config update failed');
          // Don't delete from Map yet if aborted - delete handler will do it
          // For non-abort errors, keep in Map so delete message can clean it up properly
          if (!driver._aborted) {
            await publishStatus(nc, id, 'error', error.message);
            // Keep in Map but mark as failed so delete handler can find it
            const current = connections.get(id);
            if (current) {
              connections.set(id, { ...current, failed: true });
            }
          }
        });
      
      // Return immediately without awaiting connection
      return;
    } else {
      // Refresh tag subscriptions from database (important for poll group updates)
      log.info({ connectionId: id }, 'Refreshing OPCUA tag subscriptions from database');
  const tagMetadata = await dbHelper.getTagMetadataByConnection(id);
      
      // Update poll groups from database
      const pollGroups = Array.from(pollGroupsCache.values());
      existing.driver.updatePollGroups?.(pollGroups);
      
      // Build tag map
      existing.driver.tagMap = Object.fromEntries(tagMetadata.map(t => [t.tag_id, t.tag_path]));
      const tagsByPollGroup = groupTagsByPollGroup(tagMetadata);
      await existing.driver.updateTagSubscriptions?.(tagsByPollGroup);
      
      log.info({ 
        connectionId: id,
        pollGroups: Object.keys(tagsByPollGroup).length,
        totalTags: tagMetadata.length 
      }, 'OPCUA tag subscriptions refreshed');
      
      await publishStatus(nc, id, 'connected');
    }
  } catch (e) {
    log.error({ connectionId: id, err: String(e?.message || e) }, 'OPCUA config update failed');
    await publishStatus(nc, id, 'error', e.message);
  }
}

async function handleS7ConfigUpdate(nc, id, config, existing) {
  log.info({ connectionId: id }, 'Handling S7 config update');
  
  try {
    if (!existing) {
      const driver = new S7Driver({
        host: config.host,
        rack: config.driver_opts?.rack ?? 0,
        slot: config.driver_opts?.slot ?? 1,
        samplingMs: config.driver_opts?.sampling_ms ?? 1000,
      });
  driver.onData(async (pt) => { try { emitTelemetry(nc, id, pt); } catch {} });
      connections.set(id, { driver, config });
      beginOp(nc, id);
      await publishStatus(nc, id, 'connected');

      const pollGroups = Array.from(pollGroupsCache.values());
      driver.updatePollGroups?.(pollGroups);
  await driver.connect();
      const tagMetadata = await dbHelper.getTagMetadataByConnection(id);
  driver.tagMap = Object.fromEntries(tagMetadata.map(t => [t.tag_id, t.tag_path]));
      const tagsByPollGroup = groupTagsByPollGroup(tagMetadata);
      await driver.updateTagSubscriptions?.(tagsByPollGroup);
    } else {
      // Refresh tag subscriptions from database (important for poll group updates)
      log.info({ connectionId: id }, 'Refreshing S7 tag subscriptions from database');
      const tagMetadata = await dbHelper.getTagMetadataByConnection(id);
      
      // Update poll groups from database
      const pollGroups = Array.from(pollGroupsCache.values());
      existing.driver.updatePollGroups?.(pollGroups);
      
      // Build tag map
      existing.driver.tagMap = Object.fromEntries(tagMetadata.map(t => [t.tag_id, t.tag_path]));
      const tagsByPollGroup = groupTagsByPollGroup(tagMetadata);
      await existing.driver.updateTagSubscriptions?.(tagsByPollGroup);
      
      log.info({ 
        connectionId: id,
        pollGroups: Object.keys(tagsByPollGroup).length,
        totalTags: tagMetadata.length 
      }, 'S7 tag subscriptions refreshed');
      
      await publishStatus(nc, id, 'connected');
    }
  } catch (e) {
    log.error({ connectionId: id, err: String(e?.message || e) }, 'S7 config update failed');
    await publishStatus(nc, id, 'error', e.message);
  }
}

async function handleMQTTConfigUpdate(nc, id, config, existing) {
  log.info({ connectionId: id }, 'Handling MQTT config update');
  
  try {
    if (!existing) {
      // Fetch MQTT connection configuration from database
      const mqttConfigResult = await dbHelper.query(
        `SELECT * FROM mqtt_connections WHERE connection_id = $1`,
        [id]
      );

      if (mqttConfigResult.rows.length === 0) {
        log.warn({ connectionId: id }, 'MQTT connection config not found in database');
        await publishStatus(nc, id, 'error', 'MQTT configuration not found');
        return;
      }

      const mqttConfig = mqttConfigResult.rows[0];
      const driver = new MQTTDriver(log, dbHelper);

      // Set up data handler to emit telemetry
      driver.setDataHandler(async (data) => {
        try {
          // Emit telemetry via NATS using the format expected by emitTelemetry
          const telemetryData = {
            ts: data.timestamp,
            v: data.value,
            q: data.quality,
            connection_id: id
          };
          
          // Support both tagPath (legacy) and tagId (field mapping) modes
          if (data.tagId) {
            telemetryData.tag_id = data.tagId;
          } else if (data.tagPath) {
            telemetryData.tag_path = data.tagPath;
          }
          
          emitTelemetry(nc, id, telemetryData);
        } catch (err) {
          log.error({ err, connectionId: id }, 'Failed to emit MQTT telemetry');
        }
      });

      // Set up Sparkplug birth handler for discovery
      driver.setBirthHandler(async (birthData) => {
        try {
          // Store birth certificate in sparkplug_discovery table
          await dbHelper.query(
            `INSERT INTO sparkplug_discovery 
             (connection_id, group_id, edge_node_id, device_id, birth_payload, metrics, seq_num, is_online, last_birth_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (connection_id, group_id, edge_node_id, device_id)
             DO UPDATE SET 
               birth_payload = EXCLUDED.birth_payload,
               metrics = EXCLUDED.metrics,
               seq_num = EXCLUDED.seq_num,
               is_online = true,
               last_birth_at = EXCLUDED.last_birth_at,
               last_seen_at = now()`,
            [
              id,
              birthData.groupId,
              birthData.edgeNodeId,
              birthData.deviceId || null,
              JSON.stringify(birthData.payload),
              JSON.stringify(birthData.payload.metrics || []),
              birthData.payload.seq || 0,
              true,
              birthData.timestamp
            ]
          );
          log.info({ 
            connectionId: id, 
            groupId: birthData.groupId, 
            edgeNodeId: birthData.edgeNodeId,
            deviceId: birthData.deviceId,
            metrics: birthData.payload.metrics?.length 
          }, 'Stored Sparkplug Birth certificate');
        } catch (err) {
          log.error({ err, connectionId: id }, 'Failed to store Sparkplug Birth certificate');
        }
      });

      // Set up Sparkplug death handler
      driver.setDeathHandler(async (deathData) => {
        try {
          // Update sparkplug_discovery to mark as offline
          await dbHelper.query(
            `UPDATE sparkplug_discovery
             SET is_online = false, last_death_at = $1, last_seen_at = now()
             WHERE connection_id = $2 AND group_id = $3 AND edge_node_id = $4 AND device_id IS NOT DISTINCT FROM $5`,
            [
              deathData.timestamp,
              id,
              deathData.groupId,
              deathData.edgeNodeId,
              deathData.deviceId || null
            ]
          );
          log.warn({ 
            connectionId: id, 
            groupId: deathData.groupId, 
            edgeNodeId: deathData.edgeNodeId,
            deviceId: deathData.deviceId
          }, 'Marked Sparkplug node/device as offline');
        } catch (err) {
          log.error({ err, connectionId: id }, 'Failed to update Sparkplug Death status');
        }
      });

      // Add to connections Map immediately
      connections.set(id, { driver, config, connecting: true });
      
      // Connect to MQTT broker
      await driver.connect(id, mqttConfig);
      
      // Load and subscribe to topics
      await driver.loadSubscriptions();
      
      // Load field mappings
      await driver.loadFieldMappings();
      
      // Load and start publishers
      const publishers = await driver.loadPublishers();
      for (const pub of publishers) {
        if (pub.publish_mode === 'interval' || pub.publish_mode === 'both') {
          driver.startIntervalPublishing(pub.id);
        }
      }
      
      // Update connection status
      connections.set(id, { driver, config, connecting: false });
      beginOp(nc, id);
      await publishStatus(nc, id, 'connected');
      
      log.info({ 
        connectionId: id, 
        broker: `${mqttConfig.broker_host}:${mqttConfig.broker_port}`,
        protocol: mqttConfig.protocol,
        subscriptions: driver.subscriptions.size,
        publishers: driver.publishers.size
      }, 'MQTT connection established');

    } else {
      // Refresh subscriptions and publishers for existing connection
      log.info({ connectionId: id }, 'Refreshing MQTT subscriptions and publishers from database');
      
      // Stop existing interval publishers
      for (const [publisherId, _] of existing.driver.publishers) {
        existing.driver.stopIntervalPublishing(publisherId);
      }
      
      await existing.driver.loadSubscriptions();
      
      // Reload field mappings
      await existing.driver.loadFieldMappings();
      
      // Reload and restart publishers
      const publishers = await existing.driver.loadPublishers();
      for (const pub of publishers) {
        if (pub.publish_mode === 'interval' || pub.publish_mode === 'both') {
          existing.driver.startIntervalPublishing(pub.id);
        }
      }
      
      await publishStatus(nc, id, 'connected');
    }
  } catch (err) {
    log.error({ connectionId: id, err: String(err?.message || err) }, 'MQTT config update failed');
    await publishStatus(nc, id, 'error', err.message);
  }
}

// Listen for tag subscription changes
async function handleTagSubscriptionChange(nc, message) {
  if (!dbHelper) return;
  
  try {
    const data = JSON.parse(sc.decode(message.data));
    const connectionId = data.connection_id;
    const operation = data.op || 'unknown';
    
    log.info({ connectionId, operation }, 'Received tag subscription change notification');
    
  const existing = connections.get(connectionId);
  if (!existing) return;

  // Fast-path for tag_removed: delete a single tag from driver without full reload when supported
  if (operation === 'tag_removed' && data.removed_tag_id != null && existing.driver?.removeTag) {
    try {
      await existing.driver.removeTag(data.removed_tag_id);
      log.info({ connectionId, tagId: data.removed_tag_id }, 'Fast-removed tag from driver after deletion');
      return; // skip full reload
    } catch (e) {
      log.warn({ connectionId, tagId: data.removed_tag_id, err: String(e?.message || e) }, 'Fast remove failed; falling back to full reload');
    }
  }

  const tagMetadata = await dbHelper.getTagMetadataByConnection(connectionId);
  // Update tag map for drivers that use direct maps (OPCUA, S7)
  if (existing.driver && 'tagMap' in existing.driver) {
    try { existing.driver.tagMap = Object.fromEntries(tagMetadata.map(t => [t.tag_id, t.tag_path])); } catch {}
  }
  const tagsByPollGroup = groupTagsByPollGroup(tagMetadata);
  await existing.driver.updateTagSubscriptions?.(tagsByPollGroup);
  log.info({ connectionId, operation, pollGroups: Object.keys(tagsByPollGroup).length, totalTags: tagMetadata.length }, 'Updated tag subscriptions for connection');
    
  } catch (err) {
    log.error({ err: String(err?.message || err) }, 'Tag subscription change handling failed');
  }
}

function groupTagsByPollGroup(tagMetadata) {
  const tagsByPollGroup = {};
  for (const tag of tagMetadata || []) {
    const groupId = tag.poll_group_id;
    if (!tagsByPollGroup[groupId]) tagsByPollGroup[groupId] = [];
    tagsByPollGroup[groupId].push(tag);
  }
  return tagsByPollGroup;
}

// Main function
async function main() {
  log.info({
    service: SERVICE_ID,
    host: HOST,
    port: PORT
  }, 'Connectivity service starting');

  // Initialize database for multi-rate support
  await initDatabase();
  log.info('Database initialization completed - proceeding to NATS');

  // NATS connection
  const nc = await connect({ servers: [NATS_URL] });
  natsConnected = true;
  log.info({ url: NATS_URL }, 'Connected to NATS');

  // Load and start enabled connections from database
  await loadEnabledConnections(nc);

  // Subscribe to configuration updates
  const configSub = nc.subscribe('df.connectivity.config.v1');
  log.info('Config subscription created');
  (async () => {
    log.info('Starting config subscription loop');
    for await (const m of configSub) {
      try {
        const data = JSON.parse(sc.decode(m.data));
        log.info({ data }, 'Received config update via NATS');
        await handleConfigUpdate(nc, data);
      } catch (err) {
        log.error({ err: String(err?.message || err) }, 'Config message processing failed');
      }
    }
  })();

  // Subscribe to tag subscription changes
  const tagSub = nc.subscribe('df.connectivity.tags.changed.v1');
  log.info('Tag subscription created');
  (async () => {
    log.info('Starting tag subscription loop');
    for await (const m of tagSub) {
      await handleTagSubscriptionChange(nc, m);
    }
  })();

  // Subscribe to tag value changes for MQTT publishers
  const telemetrySub = nc.subscribe('df.telemetry.v1.>');
  log.info('Telemetry subscription created for MQTT publishers');
  (async () => {
    log.info('Starting telemetry listener for MQTT publishers');
    for await (const m of telemetrySub) {
      try {
        const data = JSON.parse(sc.decode(m.data));
        
        // Check if this is a tag value update
        if (!data.tag_id || data.value === undefined) continue;
        
        // Find all MQTT connections that might have publishers for this tag
        for (const [connId, entry] of connections.entries()) {
          if (entry.config?.type === 'mqtt' && entry.driver) {
            await entry.driver.onTagValueChange(data.tag_id, data.value, data.timestamp);
          }
        }
      } catch (err) {
        log.error({ err }, 'Error handling telemetry for MQTT publishers');
      }
    }
  })();

  // Subscribe to field mapping reload requests
  const fieldMappingSub = nc.subscribe('df.connectivity.reload-field-mappings.v1');
  log.info('Field mapping reload subscription created');
  (async () => {
    log.info('Starting field mapping reload listener');
    for await (const m of fieldMappingSub) {
      try {
        const data = JSON.parse(sc.decode(m.data));
        const { subscription_id, connection_id } = data;
        
        // Find the MQTT connection for this subscription
        for (const [connId, entry] of connections.entries()) {
          if (entry.config?.type === 'mqtt' && entry.driver) {
            // If connection_id specified, only reload for that connection
            if (connection_id && connId !== connection_id) continue;
            
            // Reload field mappings for this MQTT driver
            await entry.driver.reloadFieldMappings();
            log.info({ 
              connectionId: connId, 
              subscription_id 
            }, 'Reloaded field mappings');
          }
        }
      } catch (err) {
        log.error({ err }, 'Error handling field mapping reload');
      }
    }
  })();

  // Lightweight periodic reconciliation loop (best-effort) to ensure drivers drop deleted/unsubscribed tags.
  setInterval(async () => {
    const now = Date.now();
    if (now - lastTagReconcile < TAG_RECONCILE_INTERVAL_MS) return;
    lastTagReconcile = now;
    const startTime = Date.now();
    let totalChecked = 0;
    let totalRemoved = 0;
    try {
      if (!dbHelper) return;
      // Fetch all currently subscribed tags from DB
      const active = await dbHelper.getAllSubscribedTags();
      const activeKey = new Set(active.map(t => `${t.connection_id}:${t.tag_id}`));
      log.debug({ activeTagCount: active.length, connectionCount: connections.size }, 'Tag reconciliation started');
      for (const [connId, entry] of connections.entries()) {
        const drv = entry.driver;
        if (!drv) continue;
        const removeFn = drv.removeTag?.bind(drv);
        const tagsList = drv.listActiveTagIds ? await drv.listActiveTagIds() : Object.keys(drv.tagMap || {}).map(Number).filter(n => Number.isFinite(n));
        totalChecked += tagsList.length;
        for (const tid of tagsList) {
          if (!activeKey.has(`${connId}:${tid}`)) {
            if (removeFn) {
              try { 
                await removeFn(tid); 
                totalRemoved++;
                log.info({ connectionId: connId, tagId: tid }, 'Reconciled lingering deleted/unsubscribed tag from driver'); 
              } catch (e) { 
                log.warn({ connectionId: connId, tagId: tid, err: String(e?.message || e) }, 'Reconcile remove failed'); 
              }
            }
          }
        }
      }
      const elapsed = Date.now() - startTime;
      if (totalRemoved > 0 || elapsed > 1000) {
        log.info({ 
          tagsChecked: totalChecked, 
          tagsRemoved: totalRemoved, 
          durationMs: elapsed,
          connectionCount: connections.size
        }, 'Tag reconciliation completed');
      }
    } catch (e) {
      log.warn({ err: String(e?.message || e), durationMs: Date.now() - startTime }, 'Periodic tag reconciliation failed');
    }
  }, Math.min(TAG_RECONCILE_INTERVAL_MS, 30_000));

  // EIP device discovery : df.connectivity.eip.discover.v1
  const subEipDiscover = nc.subscribe('df.connectivity.eip.discover.v1');
  log.info({ subject: 'df.connectivity.eip.discover.v1' }, 'Subscribed to EIP discovery NATS subject');
  (async () => {
    log.info('Starting EIP discovery subscription loop');
    for await (const m of subEipDiscover) {
      log.info({ subject: m.subject }, 'EIP discovery request received');
      try {
        let opts = { broadcast_address: '255.255.255.255' };
        try { if (m.data?.length) opts = JSON.parse(sc.decode(m.data)) || opts; } catch {}
        
        // Create temporary driver for discovery (no connection needed)
        const tempDriver = new EIPPyComm3Driver({ host: '0.0.0.0', slot: 0 });
        
        log.info({ broadcastAddress: opts.broadcast_address }, 'Starting device discovery');
        const devices = await tempDriver.discoverDevices(opts.broadcast_address);
        
        log.info({ deviceCount: devices.length }, 'Device discovery complete');
        m.respond(sc.encode(JSON.stringify({ devices })));
      } catch (err) {
        log.error({ err: String(err?.message || err) }, 'EIP discovery failed');
        m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err), devices: [] })));
      }
    }
  })();

  // EIP device identification : df.connectivity.eip.identify.v1
  const subEipIdentify = nc.subscribe('df.connectivity.eip.identify.v1');
  log.info({ subject: 'df.connectivity.eip.identify.v1' }, 'Subscribed to EIP identify NATS subject');
  (async () => {
    log.info('Starting EIP identify subscription loop');
    for await (const m of subEipIdentify) {
      log.info({ subject: m.subject }, 'EIP identify request received');
      try {
        let opts = {};
        try { if (m.data?.length) opts = JSON.parse(sc.decode(m.data)) || {}; } catch {}
        
        if (!opts.ip_address) {
          m.respond(sc.encode(JSON.stringify({ error: 'missing ip_address' })));
          continue;
        }
        
        // Create temporary driver for identification
        const tempDriver = new EIPPyComm3Driver({ host: '0.0.0.0', slot: 0 });
        
        log.info({ ipAddress: opts.ip_address }, 'Identifying device');
        const device = await tempDriver.identifyDevice(opts.ip_address);
        
        log.info({ device }, 'Device identified');
        m.respond(sc.encode(JSON.stringify(device)));
      } catch (err) {
        log.error({ err: String(err?.message || err) }, 'EIP identify failed');
        m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err) })));
      }
    }
  })();

  // EIP rack configuration : df.connectivity.eip.rack-config.v1
  const subEipRackConfig = nc.subscribe('df.connectivity.eip.rack-config.v1');
  log.info({ subject: 'df.connectivity.eip.rack-config.v1' }, 'Subscribed to EIP rack config NATS subject');
  (async () => {
    log.info('Starting EIP rack config subscription loop');
    for await (const m of subEipRackConfig) {
      log.info({ subject: m.subject }, 'EIP rack config request received');
      try {
        let opts = {};
        try { if (m.data?.length) opts = JSON.parse(sc.decode(m.data)) || {}; } catch {}
        
        if (!opts.ip_address) {
          m.respond(sc.encode(JSON.stringify({ error: 'missing ip_address' })));
          continue;
        }
        
        // Create temporary driver for rack enumeration
        const tempDriver = new EIPPyComm3Driver({ host: '0.0.0.0', slot: 0 });
        
        log.info({ ipAddress: opts.ip_address, slot: opts.slot || 0 }, 'Getting rack configuration');
        const rackConfig = await tempDriver.getRackConfiguration(opts.ip_address, opts.slot || 0);
        
        log.info({ type: rackConfig.type, moduleCount: rackConfig.module_count || 1 }, 'Rack configuration retrieved');
        m.respond(sc.encode(JSON.stringify(rackConfig)));
      } catch (err) {
        log.error({ err: String(err?.message || err) }, 'EIP rack config failed');
        m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err) })));
      }
    }
  })();

  // EIP connection status : df.connectivity.eip.status.v1.<id>
  const subEipStatus = nc.subscribe('df.connectivity.eip.status.v1.*');
  log.info({ subject: 'df.connectivity.eip.status.v1.*' }, 'Subscribed to EIP status NATS subject');
  (async () => {
    log.info('Starting EIP status subscription loop');
    for await (const m of subEipStatus) {
      const connId = m.subject.split('.').pop();
      log.info({ connId, subject: m.subject }, 'EIP status request received');
      try {
        const c = connections.get(connId);
        if (!c) {
          m.respond(sc.encode(JSON.stringify({ error: 'connection not found' })));
          continue;
        }
        
        if (c.config.type !== 'eip') {
          m.respond(sc.encode(JSON.stringify({ error: 'not an EIP connection' })));
          continue;
        }
        
        // Get connection status from driver
        const status = await c.driver.getConnectionStatus();
        
        // Add our tracking information
        const activeCount = getActiveConnectionCount(c.config.host);
        const enhancedStatus = {
          ...status,
          dataforeman_connections: activeCount,
          host: c.config.host
        };
        
        log.info({ connId, status: enhancedStatus }, 'EIP status retrieved');
        m.respond(sc.encode(JSON.stringify(enhancedStatus)));
      } catch (err) {
        log.error({ connId, err: String(err?.message || err) }, 'EIP status query failed');
        m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err) })));
      }
    }
  })();

  // EIP tag list browse (list available tags) : df.connectivity.eip.tags.v1.<id>
  const subEipTags = nc.subscribe('df.connectivity.eip.tags.v1.*');
  log.info({ subject: 'df.connectivity.eip.tags.v1.*' }, 'Subscribed to EIP tags NATS subject');
  (async () => {
    log.info('Starting EIP tags subscription loop');
    for await (const m of subEipTags) {
      const connId = m.subject.split('.').pop();
      log.info({ connId, subject: m.subject }, 'EIP tags request received');
      try {
        let c = connections.get(connId);
        if (!c) { 
          log.warn({ 
            connId, 
            availableConnections: Array.from(connections.keys()),
            connectionCount: connections.size
          }, 'EIP tags on unknown connection - attempting to load from database'); 
          
          // Try to load connection from database before giving up
          if (dbHelper) {
            try {
              const configResult = await dbHelper.query(
                `SELECT id, name, enabled, config_data 
                 FROM connections
                 WHERE id = $1 AND deleted_at IS NULL`,
                [connId]
              );
              
              if (configResult.rows.length > 0 && configResult.rows[0].enabled) {
                const row = configResult.rows[0];
                const config = { id: row.id, name: row.name, enabled: row.enabled, ...(row.config_data || {}) };
                log.info({ connId, name: config.name, type: config.type }, 'Found connection config in database - creating connection');
                
                // Create the connection immediately
                await handleConfigUpdate(nc, { conn: config });
                
                // Retry getting the connection
                c = connections.get(connId);
                if (!c) {
                  log.warn({ connId }, 'Failed to create connection despite database config');
                  m.respond(sc.encode(JSON.stringify({ error: 'not_found' }))); 
                  continue;
                }
                log.info({ connId }, 'Successfully created connection from database config');
              } else {
                log.warn({ connId }, 'No enabled connection config found in database');
                m.respond(sc.encode(JSON.stringify({ error: 'not_found' }))); 
                continue;
              }
            } catch (err) {
              log.error({ connId, err: String(err?.message || err) }, 'Failed to load connection from database');
              m.respond(sc.encode(JSON.stringify({ error: 'not_found' }))); 
              continue;
            }
          } else {
            m.respond(sc.encode(JSON.stringify({ error: 'not_found' }))); 
            continue;
          }
        }
        log.info({ connId }, 'Found connection for EIP tags request');
        if (c.config.type !== 'eip') { log.warn({ connId, type: c.config.type }, 'EIP tags called on non-EIP connection'); m.respond(sc.encode(JSON.stringify({ error: 'unsupported' }))); continue; }
        let opts = {};
        try { if (m.data?.length) opts = JSON.parse(sc.decode(m.data)) || {}; } catch {}
        log.info({ connId, opts }, 'EIP tags processing options');
        const started = Date.now();
        let resp;
  // Do not change connection status during tag list/snapshot operations; keep real driver status
        if (opts.action === 'snapshot.create' || opts.action === 'create') {
          // ensure fresh tag cache if requested
          const listRes = await c.driver.listTags({ refresh: !!opts.refresh, returnRaw: true, program: opts.program || '*' });
          const snapResult = await c.driver.createSnapshot();
          resp = { 
            snapshot: snapResult.snapshot_id,
            total: snapResult.total,
            programs: snapResult.programs
          };
        } else if (opts.action === 'snapshot.page') {
          resp = c.driver.pageSnapshot({ snapshotId: opts.snapshot, scope: opts.scope || opts.program || 'controller', page: opts.page || 1, limit: opts.limit, search: opts.search || '' });
        } else if (opts.action === 'snapshot.delete') {
          resp = c.driver.deleteSnapshot(opts.snapshot);
        } else if (opts.action === 'snapshot.heartbeat') {
          // Keep snapshot alive while user is actively working with it
          resp = c.driver.heartbeatSnapshot(opts.snapshot);
        } else if (opts.action === 'resolve_types') {
          // Resolve data types for specific tag names
          resp = await c.driver.resolveTagTypes(opts.tag_names || []);
        } else {
          const listRes = await c.driver.listTags({ search: opts.search, limit: opts.limit, refresh: !!opts.refresh, returnRaw: !!opts.raw, paginate: true, page: opts.page, program: opts.program || '*' });
          if (Array.isArray(listRes)) {
            resp = { items: listRes, programs: [] };
          } else {
            resp = { items: listRes.items || [], hasMore: listRes.hasMore, total: listRes.total, totalFiltered: listRes.totalFiltered, page: listRes.page, totalPages: listRes.totalPages, programs: listRes.programs || [] };
            if (listRes.raw) resp.raw = listRes.raw;
          }
        }
        const tookMs = Date.now() - started;
        log.info({ connId, action: opts.action || 'list', count: resp.items ? resp.items.length : (resp.snapshot?1:0), tookMs }, 'EIP tag list handled');
        log.info({ connId, response: resp }, 'EIP tags response data');
        m.respond(sc.encode(JSON.stringify(resp)));
  // Keep existing status; do not override with 'disconnected'
      } catch (err) {
        log.error({ connId, err: String(err?.message || err), stack: err?.stack }, 'EIP tag list error');
        try { m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err) }))); } catch (respErr) {
          log.error({ connId, respErr: String(respErr?.message || respErr) }, 'Failed to respond with error');
        }
        // On error, publish error state (overriding transient connected)
        try { await publishStatus(nc, connId, 'error', String(err?.message || err)); } catch {}
      }
    }
  })();

  // OPC UA browse: df.connectivity.browse.v1.<id>
  const subOpcBrowse = nc.subscribe('df.connectivity.browse.v1.*');
  log.info({ subject: 'df.connectivity.browse.v1.*' }, 'Subscribed to OPC UA browse NATS subject');
  (async () => {
    log.info('Starting OPC UA browse subscription loop');
    for await (const m of subOpcBrowse) {
      const connId = m.subject.split('.').pop();
      log.info({ connId, subject: m.subject }, 'OPC UA browse request received');
      try {
        let c = connections.get(connId);
        if (!c) {
          log.warn({ connId }, 'OPC UA browse on unknown connection - attempting to load from database');
          if (dbHelper) {
            try {
              const configResult = await dbHelper.query(
                `SELECT id, name, enabled, config_data, type
                 FROM connections
                 WHERE id = $1 AND deleted_at IS NULL`,
                [connId]
              );
              if (configResult.rows.length > 0) {
                const row = configResult.rows[0];
                const config = { id: row.id, name: row.name, type: row.type, enabled: true, ...(row.config_data || {}) };
                await handleConfigUpdate(nc, { conn: config });
                c = connections.get(connId);
              }
            } catch (err) {
              log.error({ connId, err: String(err?.message || err) }, 'Failed to load OPC UA connection from database');
            }
          }
        }
        if (!c) { m.respond(sc.encode(JSON.stringify({ error: 'not_found' }))); continue; }
        if (c.config.type !== 'opcua-client') { m.respond(sc.encode(JSON.stringify({ error: 'unsupported' }))); continue; }
        // Parse payload
        let opts = {};
        try { if (m.data?.length) opts = JSON.parse(sc.decode(m.data)) || {}; } catch {}
        // Ensure connected/session
        try { if (!c.driver?.session) await c.driver.connect(); } catch {}
        const node = opts.node || undefined;
        const started = Date.now();
        const items = await c.driver.browse(node);
        const tookMs = Date.now() - started;
        log.info({ connId, node: node || 'RootFolder', count: Array.isArray(items) ? items.length : 0, tookMs }, 'OPC UA browse handled');
        m.respond(sc.encode(JSON.stringify({ items })));
      } catch (err) {
        log.error({ connId, err: String(err?.message || err) }, 'OPC UA browse error');
        try { m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err) }))); } catch {}
      }
    }
  })();

  // OPC UA attributes: df.connectivity.attr.v1.<id>
  const subOpcAttr = nc.subscribe('df.connectivity.attr.v1.*');

  // Apply live tuning changes from core config
  const subConfigChanged = nc.subscribe('df.config.changed.v1');
  (async () => {
    for await (const m of subConfigChanged) {
      try {
        const raw = sc.decode(m.data);
        let msg = {};
        try { msg = JSON.parse(raw); } catch { msg = {}; }
        const keys = Array.isArray(msg.keys) ? msg.keys : [];
        const vals = (msg && msg.values && typeof msg.values === 'object') ? msg.values : {};
        // Map config keys to EIP tuning options
        const tuning = {};
        if ('eip.max_taggroup_size' in vals) tuning.MAX = Number(vals['eip.max_taggroup_size']);
        if ('eip.fallback_taggroup_size' in vals) tuning.FALLBACK = Number(vals['eip.fallback_taggroup_size']);
        // Accept both correctly spelled and legacy misspelled key just in case
        if ('eip.taggroup_byte_budget' in vals) tuning.BYTE_BUDGET = Number(vals['eip.taggroup_byte_budget']);
        if (tuning.BYTE_BUDGET == null && 'eip.taggroub_byte_budget' in vals) tuning.BYTE_BUDGET = Number(vals['eip.taggroub_byte_budget']);
        if ('eip.fallback_byte_budget' in vals) tuning.FB_BYTE_BUDGET = Number(vals['eip.fallback_byte_budget']);
        if ('eip.tag_overhead_bytes' in vals) tuning.OVERHEAD = Number(vals['eip.tag_overhead_bytes']);
        if ('eip.shard_budget_frac' in vals) tuning.BUDGET_FRAC = Number(vals['eip.shard_budget_frac']);
        if ('eip.min_shards_per_tick' in vals) tuning.MIN_SHARDS = Number(vals['eip.min_shards_per_tick']);
        const has = Object.keys(tuning).length > 0;
        if (!has) continue;
        // Apply to all active EIP drivers
        for (const [connId, c] of connections.entries()) {
          try {
            if (c?.config?.type === 'eip' && c?.driver?.updateTuning) {
              const res = c.driver.updateTuning(tuning);
              log.info({ connectionId: connId, tuning: res.after }, 'Applied EIP tuning from config.changed');
            }
          } catch (e) {
            log.warn({ connectionId: connId, err: String(e?.message || e) }, 'Failed to apply EIP tuning');
          }
        }
      } catch (e) {
        log.warn({ err: String(e?.message || e) }, 'Failed to process df.config.changed.v1');
      }
    }
  })();
  log.info({ subject: 'df.connectivity.attr.v1.*' }, 'Subscribed to OPC UA attributes NATS subject');
  (async () => {
    log.info('Starting OPC UA attributes subscription loop');
    for await (const m of subOpcAttr) {
      const connId = m.subject.split('.').pop();
      log.info({ connId, subject: m.subject }, 'OPC UA attributes request received');
      try {
        let c = connections.get(connId);
        if (!c) {
          if (dbHelper) {
            try {
              const configResult = await dbHelper.query(
                `SELECT id, name, enabled, config_data 
                 FROM connections
                 WHERE id = $1 AND deleted_at IS NULL`,
                [connId]
              );
              if (configResult.rows.length > 0) {
                const row = configResult.rows[0];
                const config = { id: row.id, name: row.name, enabled: true, ...(row.config_data || {}) };
                await handleConfigUpdate(nc, { conn: config });
                c = connections.get(connId);
              }
            } catch (err) {
              log.error({ connId, err: String(err?.message || err) }, 'Failed to load OPC UA connection from database');
            }
          }
        }
        if (!c) { m.respond(sc.encode(JSON.stringify({ error: 'not_found' }))); continue; }
        if (c.config.type !== 'opcua-client') { m.respond(sc.encode(JSON.stringify({ error: 'unsupported' }))); continue; }
        // Parse payload
        let opts = {};
        try { if (m.data?.length) opts = JSON.parse(sc.decode(m.data)) || {}; } catch {}
        const node = opts.node;
        if (!node) { m.respond(sc.encode(JSON.stringify({ error: 'missing_node' }))); continue; }
        // Ensure connected/session
        try { if (!c.driver?.session) await c.driver.connect(); } catch {}
        const started = Date.now();
        const item = await c.driver.getAttributes(node);
        const tookMs = Date.now() - started;
        log.info({ connId, node, tookMs }, 'OPC UA attributes handled');
        m.respond(sc.encode(JSON.stringify({ item })));
      } catch (err) {
        log.error({ connId, err: String(err?.message || err) }, 'OPC UA attributes error');
        try { m.respond(sc.encode(JSON.stringify({ error: String(err?.message || err) }))); } catch {}
      }
    }
  })();

  // Health check endpoint
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      const health = {
        service: SERVICE_ID,
        nats: natsConnected,
        connections: connections.size,
        multirate: true,
        database: dbHelper ? true : false,
        timestamp: nowIso()
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } else if (req.url === '/debug/log') {
      // Emit a one-off log line to validate logging target
      log.info({ ts: nowIso() }, 'debug: manual log endpoint hit');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, HOST, () => {
    log.info({ host: HOST, port: PORT }, 'Health server listening');
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log.info('SIGTERM received, shutting down gracefully');
    try {
      for (const [id, conn] of connections) {
        try { await conn.driver.disconnect(); } catch {}
      }
      if (dbHelper) await dbHelper.close();
      await nc.close();
      server.close();
    } catch (err) {
      log.error({ err: String(err?.message || err) }, 'Shutdown error');
    }
    process.exit(0);
  });

  log.info('Connectivity service ready');
}

main().catch((err) => {
  log.fatal({ err: String(err?.message || err) }, 'Service startup failed');
  process.exit(1);
});
