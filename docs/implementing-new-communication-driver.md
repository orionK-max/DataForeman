# Implementing a New Communication Driver

This guide covers everything needed to add a new communication driver to DataForeman and ensure data flows correctly from devices to the database.

## Overview

The data flow for a communication driver is:
1. **Driver** (connectivity service) → collects data from devices
2. **NATS** → message bus for telemetry
3. **Core Ingestor** → processes and validates data
4. **TimescaleDB** → stores time-series data

## 1. Driver Implementation

### Location
Create your driver in: `connectivity/src/drivers/your-driver.mjs`

### Required Methods

```javascript
export class YourDriver {
  constructor(log, dbHelper) {
    this.log = log;
    this.dbHelper = dbHelper;
    this.connectionId = null;
    this.config = null;
    this.dataHandler = null; // Will be set by connectivity service
  }

  /**
   * Set the data handler callback
   * This will be called by the connectivity service
   */
  setDataHandler(handler) {
    this.dataHandler = handler;
  }

  /**
   * Initialize the driver with connection configuration
   */
  async init(connectionId, config) {
    this.connectionId = connectionId;
    this.config = config;
    
    // Connect to your device/protocol
    // Set up subscriptions, polling, etc.
  }

  /**
   * Start collecting data
   */
  async start() {
    // Begin data collection
  }

  /**
   * Stop collecting data
   */
  async stop() {
    // Clean up connections
  }

  /**
   * Update configuration (called when config changes)
   */
  async updateConfig(config) {
    this.config = config;
    // Apply config changes
  }
}
```

### Emitting Data

When you receive data from your device, emit it using the data handler:

```javascript
// Inside your driver when data is received
if (this.dataHandler) {
  this.dataHandler({
    tagId: tagId,        // REQUIRED: numeric tag ID from tag_metadata table
    value: value,        // REQUIRED: the actual value (any type)
    timestamp: ts,       // REQUIRED: ISO 8601 string or Unix timestamp in ms
    quality: quality,    // REQUIRED: numeric (0=GOOD) or string ("GOOD", "BAD", etc.)
    topic: topic,        // OPTIONAL: for MQTT-like protocols
    raw: rawMessage      // OPTIONAL: original message for debugging
  });
}
```

## 2. Data Structure Requirements

### Critical Fields

The data object passed to `dataHandler` must have:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tagId` | number | YES | Tag ID from `tag_metadata.tag_id` |
| `value` | any | YES | The actual value to store |
| `timestamp` | string/number | YES | ISO 8601 string or Unix ms |
| `quality` | number/string | YES | Quality indicator |

### Timestamp Format

**Accepted formats:**
- ISO 8601 string: `"2026-02-03T22:44:48.898Z"`
- Unix timestamp (milliseconds): `1770158688898`

**Do NOT use:**
- Unix timestamp in seconds (will be treated as year 1970)
- Date objects (convert to string or number first)

### Quality Values

**Numeric (preferred):**
- `0` = GOOD
- `1` = BAD
- `2` = UNCERTAIN
- `3` = ERROR

**String (automatically converted):**
- `"GOOD"` → 0
- `"BAD"` → 1
- `"UNCERTAIN"` → 2
- `"ERROR"` → 3

**Important:** Core ingestion will convert string quality to numeric. If you send a numeric quality, it must be a valid smallint.

## 3. Connectivity Service Integration

### Register Your Driver

In `connectivity/src/index-multirate.mjs`, add your driver initialization:

```javascript
import { YourDriver } from './drivers/your-driver.mjs';

// In the connection initialization section
async function initYourDriver(id, config, nc) {
  log.info({ connectionId: id }, 'Initializing Your driver');
  
  const driver = new YourDriver(log, dbHelper);

  // Set up data handler to emit telemetry via NATS
  driver.setDataHandler(async (data) => {
    try {
      // Convert to the format expected by emitTelemetry
      const telemetryData = {
        ts: data.timestamp,      // timestamp field
        v: data.value,           // value field
        q: data.quality,         // quality field
        connection_id: id
      };
      
      // Support tag_id (field mapping) or tag_path (legacy)
      if (data.tagId) {
        telemetryData.tag_id = data.tagId;
      } else if (data.tagPath) {
        telemetryData.tag_path = data.tagPath;
      }
      
      emitTelemetry(nc, id, telemetryData);
    } catch (err) {
      log.error({ err, connectionId: id }, 'Failed to emit telemetry');
    }
  });

  await driver.init(id, config);
  await driver.start();
  
  return driver;
}

// Add to the connection type switch
async function handleYourDriverConfigUpdate(id, conn, nc) {
  try {
    const existing = drivers.get(id);
    
    if (existing) {
      // Update existing driver
      await existing.updateConfig(conn);
    } else {
      // Create new driver
      const driver = await initYourDriver(id, conn, nc);
      drivers.set(id, driver);
    }
  } catch (err) {
    log.error({ err, connectionId: id }, 'Failed to handle driver config');
  }
}
```

### NATS Telemetry Format

The `emitTelemetry` function expects this format:

```javascript
{
  connection_id: "uuid-string",
  tag_id: 123,              // numeric
  ts: "2026-02-03T...",     // ISO string or Unix ms
  v: <any>,                 // the value (will be classified as v_num, v_text, or v_json)
  q: 0                      // numeric quality
}
```

**Field naming is critical:**
- Use `ts` not `timestamp`
- Use `v` not `value`
- Use `q` not `quality`

These short field names match the NATS message format expected by core ingestion.

### NATS Configuration Schema

**CRITICAL:** When adding a new driver type, you must update the NATS configuration schema to include your driver type.

**File to update:** `spec/connectivity/schemas/connectivity.config.v1.schema.json`

**Add your driver type to the enum:**

```json
{
  "properties": {
    "conn": {
      "properties": {
        "type": { 
          "type": "string", 
          "enum": ["opcua-client", "opcua-server", "s7", "eip", "mqtt", "your-driver"]
        }
      }
    }
  }
}
```

**Why this is needed:**
- Core service validates NATS config messages against this schema
- Without your driver type in the schema, config updates will fail validation
- Validation failures cause connectivity service to not receive configuration changes
- This results in 20-30 second delays (waiting for periodic reconciliation)

**Symptoms of missing schema update:**
- Connection enable/disable works instantly
- Subscription/tag enable/disable takes 20-30 seconds
- Core logs show: `"NATS publish validation failed"` with `"must be equal to one of the allowed values"`

**After updating:**
1. Rebuild core service: `docker compose build core && docker compose up -d core`
2. Test config changes - they should apply instantly

### Proper NATS Notification Pattern

**CRITICAL:** When publishing configuration changes to NATS, always send full connection data.

**WRONG - Causes delays:**
```javascript
// This only triggers reload during 60-second reconciliation cycle
const configData = {
  schema: 'connectivity.config@v1',
  ts: new Date().toISOString(),
  op: 'upsert',
  conn: { id: connectionId, type: 'your-driver' }  // Missing enabled field!
};
```

**CORRECT - Triggers immediate reload:**
```javascript
// Fetch full connection data
const connData = await db.query(
  'SELECT name, type, enabled FROM connections WHERE id = $1', 
  [connectionId]
);

const configData = {
  schema: 'connectivity.config@v1',
  ts: new Date().toISOString(),
  op: 'upsert',
  conn: {
    id: connectionId,
    ...connData.rows[0]  // Includes enabled field
  }
};
```

**Why this matters:**
- Connectivity service checks the `enabled` field to immediately disconnect/reconnect
- Without `enabled` field, it relies on periodic reconciliation (60 seconds)
- Connection updates work fast because they include full data
- Subscription/tag updates can be slow if they only send `{ id, type }`

**Example from MQTT implementation:**
See `core/src/routes/mqtt.js` - both connection updates (line ~520) and subscription updates (line ~730) now fetch and send full connection data for instant response.

## 4. Core Ingestion

The core service automatically processes messages on NATS topic: `df.telemetry.raw.*`

### Ingestion Flow

1. **Receive from NATS**: Core subscribes to `df.telemetry.raw.*`
2. **Validate**: Check for required fields (connection_id, tag_id, ts)
3. **Classify Value**: Determine if value is numeric, text, or JSON
4. **Convert Quality**: Map string quality to numeric
5. **Batch**: Add to batch for efficient bulk insert
6. **Flush**: Insert to TimescaleDB every 50ms or when batch reaches size threshold

### Value Classification

The ingestion service automatically classifies values:

```javascript
// Numeric values → stored in v_num column
{ v: 123.45 }          → v_num: 123.45, v_text: null, v_json: null

// String values → stored in v_text column  
{ v: "hello" }         → v_num: null, v_text: "hello", v_json: null

// Objects/Arrays → stored in v_json column
{ v: {temp: 20} }      → v_num: null, v_text: null, v_json: '{"temp":20}'
```

## 5. Database Schema

### Tag Metadata Table

Tags must be registered in the `tag_metadata` table:

```sql
INSERT INTO tag_metadata (
  tag_id,           -- Auto-incrementing serial
  connection_id,    -- UUID of your connection
  tag_name,         -- Human-readable name
  tag_path,         -- Optional: hierarchical path
  driver_type,      -- 'your-driver-name'
  data_type,        -- 'real', 'int', 'text', 'bool', etc.
  is_subscribed     -- true to enable data collection
) VALUES (...);
```

### TimescaleDB Tag Values

Data is stored in the `tag_values` hypertable:

```sql
CREATE TABLE tag_values (
  connection_id uuid NOT NULL,
  tag_id integer NOT NULL,
  ts timestamptz NOT NULL,
  quality smallint,           -- 0=GOOD, 1=BAD, etc.
  v_num double precision,     -- For numeric values
  v_text text,                -- For string values
  v_json jsonb,               -- For object/array values
  PRIMARY KEY (connection_id, tag_id, ts)
);
```

**Important constraints:**
- `quality` is `smallint` - must be a valid integer or NULL
- Only ONE of v_num/v_text/v_json should be non-NULL per row
- `ts` must be a valid timestamp (not NaN or invalid date)

## 6. API Endpoints

### Connection Management

Create API routes in `core/src/routes/your-driver.js`:

```javascript
export default async function yourDriverRoutes(app, opts) {
  // Get connections
  app.get('/your-driver/connections', async (request, reply) => {
    const result = await app.db.query(
      `SELECT * FROM connections WHERE driver_type = 'your-driver' AND enabled = true`
    );
    return result.rows;
  });

  // Create connection
  app.post('/your-driver/connections', async (request, reply) => {
    const { name, host, port, ...config } = request.body;
    
    const result = await app.db.query(
      `INSERT INTO connections (name, driver_type, config, enabled)
       VALUES ($1, $2, $3, true) RETURNING *`,
      [name, 'your-driver', { host, port, ...config }]
    );
    
    // Publish config to connectivity service via NATS
    app.nats.publish('df.connectivity.config.v1', {
      action: 'update',
      conn: result.rows[0]
    });
    
    return result.rows[0];
  });

  // Get tags for connection
  app.get('/your-driver/tags/:connectionId', async (request, reply) => {
    const result = await app.db.query(
      `SELECT * FROM tag_metadata 
       WHERE connection_id = $1 AND driver_type = 'your-driver'`,
      [request.params.connectionId]
    );
    return result.rows;
  });
}
```

### Tag Creation

When creating tags, ensure proper driver_type:

```javascript
app.post('/your-driver/tags', async (request, reply) => {
  const { connection_id, tag_name, data_type } = request.body;
  
  const result = await app.db.query(
    `INSERT INTO tag_metadata (
      connection_id, tag_name, driver_type, data_type, is_subscribed
    ) VALUES ($1, $2, 'your-driver', $3, true) RETURNING *`,
    [connection_id, tag_name, data_type]
  );
  
  return result.rows[0];
});
```

## 7. Configuration via NATS

### Publishing Config Updates

When connection config changes, publish to NATS:

```javascript
app.nats.publish('df.connectivity.config.v1', {
  action: 'update',  // or 'delete'
  conn: {
    id: connectionId,
    name: 'Connection Name',
    type: 'your-driver',
    enabled: true,
    config: {
      // Your driver-specific config
      host: '192.168.1.100',
      port: 502,
      // ...
    }
  }
});
```

### Handling Config in Connectivity Service

In `connectivity/src/index-multirate.mjs`:

```javascript
// Subscribe to config updates
nats.subscribe('df.connectivity.config.v1', (msg) => {
  const { action, conn } = msg;
  
  if (conn.type === 'your-driver') {
    if (action === 'update') {
      handleYourDriverConfigUpdate(conn.id, conn, nc);
    } else if (action === 'delete') {
      const driver = drivers.get(conn.id);
      if (driver) {
        driver.stop();
        drivers.delete(conn.id);
      }
    }
  }
});
```

## 8. Type Validation

If your driver supports field mapping (like MQTT), implement type validation:

```javascript
validateAndConvertType(value, dataType, strictness = 'coerce') {
  // Normalize type names (map DB types to validation types)
  const normalizedType = {
    'int': 'integer',
    'bigint': 'integer',
    'real': 'number',
    'float': 'number',
    'double': 'number',
    'numeric': 'number',
    'text': 'string',
    'varchar': 'string',
    'bool': 'boolean'
  }[dataType] || dataType;

  if (strictness === 'ignore') {
    return { valid: true, value };
  }

  if (value === null || value === undefined) {
    return { valid: false, error: 'Value is null or undefined' };
  }

  // Check if type matches
  const currentType = typeof value;
  if (
    (normalizedType === 'string' && currentType === 'string') ||
    (normalizedType === 'boolean' && currentType === 'boolean') ||
    (normalizedType === 'number' && currentType === 'number') ||
    (normalizedType === 'integer' && Number.isInteger(value))
  ) {
    return { valid: true, value };
  }

  // Convert if coerce mode
  if (strictness === 'coerce') {
    try {
      switch (normalizedType) {
        case 'string':
          return { valid: true, value: String(value) };
        case 'number':
          const num = Number(value);
          if (isNaN(num)) return { valid: false, error: 'Cannot convert to number' };
          return { valid: true, value: num };
        case 'integer':
          const int = parseInt(value, 10);
          if (isNaN(int)) return { valid: false, error: 'Cannot convert to integer' };
          return { valid: true, value: int };
        case 'boolean':
          if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (['true', '1', 'yes', 'on'].includes(lower)) return { valid: true, value: true };
            if (['false', '0', 'no', 'off'].includes(lower)) return { valid: true, value: false };
          }
          return { valid: true, value: Boolean(value) };
        default:
          return { valid: false, error: `Unknown type: ${normalizedType}` };
      }
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  return { valid: false, error: `Type mismatch: expected ${normalizedType}` };
}
```

## 9. Common Pitfalls

### ❌ Wrong Field Names

```javascript
// WRONG - core ingestion won't recognize these
this.dataHandler({
  tagId: 123,
  timestamp: '2026-02-03...',  // Should be 'timestamp' for driver → handler
  value: 100,                   // Should be 'value' for driver → handler
  quality: 0
});

// But in connectivity service handler, convert to:
emitTelemetry(nc, id, {
  tag_id: 123,
  ts: '2026-02-03...',    // SHORT names for NATS
  v: 100,
  q: 0
});
```

### ❌ Invalid Quality Values

```javascript
// WRONG - will cause NaN error
quality: "GOOD"  // If you forget to convert in connectivity handler

// RIGHT - convert to numeric before NATS
quality: 0  // or use quality map
```

### ❌ Timestamp Issues

```javascript
// WRONG - seconds instead of milliseconds
ts: Date.now() / 1000  // Will be interpreted as 1970

// RIGHT
ts: Date.now()  // milliseconds
// OR
ts: new Date().toISOString()  // ISO string
```

### ❌ Missing tag_id

```javascript
// WRONG - tag_id is required
emitTelemetry(nc, id, {
  connection_id: id,
  ts: Date.now(),
  v: 100,
  q: 0
  // Missing tag_id!
});

// RIGHT
emitTelemetry(nc, id, {
  connection_id: id,
  tag_id: 123,  // Must be present
  ts: Date.now(),
  v: 100,
  q: 0
});
```

## 10. Testing Checklist

- [ ] Driver initializes without errors
- [ ] Driver connects to device/protocol
- [ ] Data handler is called with correct structure
- [ ] Connectivity logs show "Publishing telemetry to NATS"
- [ ] Core logs show "Received telemetry message" 
- [ ] Core logs show "Added to batch"
- [ ] Core logs show "Flushing batch to TimescaleDB"
- [ ] No "flush failed" errors in core logs
- [ ] Data appears in `tag_values` table with correct timestamp
- [ ] Quality values are numeric (0 for GOOD)
- [ ] Values are in correct column (v_num/v_text/v_json)
- [ ] Chart queries return data for tags
- [ ] Frontend displays data correctly

## 11. Debugging

### Enable Detailed Logging

In connectivity service, add logging:

```javascript
this.log.info({ tagId, value, timestamp, quality }, 'Emitting tag value');
```

In `connectivity/src/index-multirate.mjs`, temporarily change `log.debug` to `log.info`:

```javascript
// In emitTelemetry function
log.info({ topic, payload }, 'Publishing telemetry to NATS');
```

### Check NATS Messages

View NATS messages being published:

```bash
docker compose logs --tail=100 connectivity | grep "Publishing telemetry"
```

### Check Core Ingestion

View messages being received and processed:

```bash
docker compose logs --tail=100 core | grep "Received telemetry"
docker compose logs --tail=100 core | grep "Added to batch"
docker compose logs --tail=100 core | grep "Flushing batch"
```

### Check Database

Verify data is being written:

```bash
docker compose exec -T tsdb psql -U tsdb -d telemetry -c \
  "SELECT tag_id, ts, v_num, v_text, quality 
   FROM tag_values 
   WHERE tag_id = <your_tag_id> 
   ORDER BY ts DESC LIMIT 10;"
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid input syntax for type smallint: "NaN"` | Quality is NaN | Convert quality to numeric before publishing |
| `column "tag_id" is null` | Missing tag_id in telemetry | Ensure tag_id is set in telemetry data |
| `invalid input syntax for type timestamp` | Invalid timestamp format | Use ISO string or Unix ms |
| `No "Added to batch" logs` | Validation failing in core | Check that all required fields are present |
| `Data not in DB` | Batch not flushing | Wait 50ms or check for flush errors |

## 12. Example: Complete Simple Driver

```javascript
// connectivity/src/drivers/simple-poller.mjs
export class SimplePollerDriver {
  constructor(log, dbHelper) {
    this.log = log;
    this.dbHelper = dbHelper;
    this.dataHandler = null;
    this.interval = null;
  }

  setDataHandler(handler) {
    this.dataHandler = handler;
  }

  async init(connectionId, config) {
    this.connectionId = connectionId;
    this.config = config;
    this.log.info({ connectionId }, 'SimplePoller initialized');
  }

  async start() {
    // Poll every second
    this.interval = setInterval(() => {
      this.poll();
    }, 1000);
  }

  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async poll() {
    // Get list of tags to poll
    const tags = await this.dbHelper.query(
      `SELECT tag_id, tag_path, data_type 
       FROM tag_metadata 
       WHERE connection_id = $1 AND is_subscribed = true`,
      [this.connectionId]
    );

    for (const tag of tags.rows) {
      // Simulate reading value
      const value = Math.random() * 100;
      
      // Emit the value
      if (this.dataHandler) {
        this.dataHandler({
          tagId: tag.tag_id,
          value: value,
          timestamp: new Date().toISOString(),
          quality: 0  // GOOD
        });
      }
    }
  }

  async updateConfig(config) {
    this.config = config;
    // Restart polling if needed
    await this.stop();
    await this.start();
  }
}
```

## Summary

To add a new communication driver:

1. **Create driver class** in `connectivity/src/drivers/`
2. **Implement required methods**: init, start, stop, setDataHandler
3. **Emit data** with correct structure: tagId, value, timestamp, quality
4. **Register in connectivity service** with data handler that converts to NATS format
5. **Use short field names** for NATS: ts, v, q (not timestamp, value, quality)
6. **Ensure quality is numeric** (0=GOOD) before publishing to NATS
7. **Create API routes** in core for connection/tag management
8. **Test thoroughly** using logs and database queries

The data flow is: **Driver → dataHandler → NATS → Core Ingestor → TimescaleDB**

Each step has specific format requirements - follow them exactly to ensure data flows correctly through the entire system.
