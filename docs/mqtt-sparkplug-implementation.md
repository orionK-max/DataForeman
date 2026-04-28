# MQTT and Sparkplug B Implementation

## Overview

DataForeman includes comprehensive MQTT support with bidirectional communication capabilities:
- **Receive data** from MQTT brokers via subscriptions
- **Publish data** to MQTT topics from DataForeman tags
- **Sparkplug B protocol** support for IIoT unified namespace
- **Embedded nanoMQ broker** for internal messaging

This implementation enables DataForeman to serve as the core of a unified namespace architecture, collecting data from multiple sources and publishing it to MQTT for consumption by other systems.

## Architecture

### Components

1. **nanoMQ Broker** (`docker-compose.yml`)
   - Embedded MQTT 3.1.1 and MQTT 5.0 broker
   - Ports: 1883 (MQTT), 8883 (MQTTS), 8081 (WebSocket), 8001 (HTTP API)
   - Auth webhook integration with DataForeman core
   - Management REST API for monitoring

2. **Core API** (`core/src/routes/mqtt.js`)
   - REST endpoints for connections, subscriptions, and publishers
   - CRUD operations with permission checks
   - Sparkplug discovery tracking
   - Broker status and client monitoring

3. **Connectivity Service** (`connectivity/src/drivers/mqtt.mjs`)
   - MQTT client driver with subscribe and publish capabilities
   - Sparkplug B Birth/Data/Death message handling
   - Connection management and auto-reconnect
   - Tag-to-topic mapping for publishers

4. **Frontend UI** (`front/src/components/connectivity/`)
   - Connection management interface
   - Subscription configuration forms
   - Publisher setup with tag mapping
   - Real-time broker status monitoring

## Features

### 1. MQTT Connections

Configure connections to MQTT brokers:

```javascript
{
  name: "Production Broker",
  broker_host: "mqtt.example.com",  // Use "localhost" for internal nanoMQ
  broker_port: 1883,
  protocol: "mqtt",  // or "sparkplug"
  username: "user",
  password: "pass",
  use_tls: true,
  clean_session: true
}
```

**Internal Broker**: Use `broker_host: "localhost"` and `broker_port: 1883` to connect to the embedded nanoMQ broker.

### 2. Subscriptions (Receive Data)

Subscribe to MQTT topics and write values to DataForeman tags:

```javascript
{
  connection_id: "conn-123",
  topic: "sensors/+/temperature",  // MQTT wildcards supported
  qos: 1,
  payload_format: "json",  // "json", "raw", or "sparkplug"
  tag_prefix: "mqtt.sensors",
  value_path: "$.value",  // JSONPath for extracting value
  timestamp_path: "$.timestamp",
  quality_path: "$.quality"
}
```

**Supported Payload Formats:**
- **JSON**: Parse JSON payloads with JSONPath selectors
- **Raw**: Direct value mapping (string/number)
- **Sparkplug B**: Decode Sparkplug Birth/Data/Death messages

### 3. Publishers (Send Data)

Publish DataForeman tag values to MQTT topics:

```javascript
{
  connection_id: "conn-123",
  name: "Temperature Publisher",
  publish_mode: "on_change",  // "on_change", "interval", or "both"
  interval_ms: 1000,  // For interval/both modes
  payload_format: "json",  // "json", "raw", or "sparkplug"
  payload_template: '{"device":"sensor1"}',  // Optional JSON template
  enabled: true,
  mappings: [{
    tag_id: "tag-456",
    mqtt_topic: "devices/sensor1/temperature",
    qos: 1,
    retain: false,
    value_transform: "value * 1.8 + 32"  // Optional JS expression
  }]
}
```

**Publish Modes:**
- **on_change**: Publish only when tag value changes
- **interval**: Publish at fixed intervals regardless of value
- **both**: Publish on change AND at intervals

**Value Transforms:**
Apply JavaScript expressions to transform values before publishing:
```javascript
value_transform: "value * 1.8 + 32"  // Celsius to Fahrenheit
value_transform: "Math.round(value * 100) / 100"  // Round to 2 decimals
value_transform: "value > 100 ? 'HIGH' : 'NORMAL'"  // Conditional
```

### 4. Sparkplug B Support

Full Sparkplug B v1.0 specification support:

**Birth Certificates:**
- Automatically captured and stored in `sparkplug_discovery`
- Includes all metrics with names, types, and values
- Used for device discovery and metric mapping

**Data Messages:**
- Parsed and written to DataForeman tags
- Maintains sequence numbers
- Validates Birth-before-Data requirement

**Death Certificates:**
- Marks devices as offline
- Tracks last seen timestamps

**Topics:**
- `spBv1.0/{group_id}/NBIRTH/{edge_node_id}` - Node Birth
- `spBv1.0/{group_id}/NDATA/{edge_node_id}` - Node Data
- `spBv1.0/{group_id}/DBIRTH/{edge_node_id}/{device_id}` - Device Birth
- `spBv1.0/{group_id}/DDATA/{edge_node_id}/{device_id}` - Device Data
- `spBv1.0/{group_id}/NDEATH/{edge_node_id}` - Node Death

## API Endpoints

### Connections

- `GET /api/mqtt/connections` - List all connections
- `GET /api/mqtt/connections/:id` - Get connection details
- `POST /api/mqtt/connections` - Create connection
- `PUT /api/mqtt/connections/:id` - Update connection
- `DELETE /api/mqtt/connections/:id` - Delete connection

### Subscriptions

- `GET /api/mqtt/subscriptions` - List all subscriptions
- `GET /api/mqtt/subscriptions/:id` - Get subscription details
- `POST /api/mqtt/subscriptions` - Create subscription
- `PUT /api/mqtt/subscriptions/:id` - Update subscription
- `DELETE /api/mqtt/subscriptions/:id` - Delete subscription

### Publishers

- `GET /api/mqtt/publishers` - List all publishers
- `GET /api/mqtt/publishers/:id` - Get publisher with mappings
- `POST /api/mqtt/publishers` - Create publisher
- `PUT /api/mqtt/publishers/:id` - Update publisher
- `DELETE /api/mqtt/publishers/:id` - Delete publisher
- `POST /api/mqtt/publishers/:id/mappings` - Add tag mapping
- `DELETE /api/mqtt/publishers/:id/mappings/:mappingId` - Remove mapping

### Discovery

- `GET /api/mqtt/discovery/sparkplug` - List discovered Sparkplug devices

### Broker Management

- `GET /api/mqtt/status` - nanoMQ broker status
- `GET /api/mqtt/clients` - Connected MQTT clients
- `GET /api/mqtt/topics` - Active topics with subscriber counts

## Usage Examples

### Example 1: Subscribe to Temperature Sensors

1. Create MQTT connection to external broker
2. Create subscription:
   - Topic: `factory/sensors/+/temperature`
   - Format: JSON
   - Tag prefix: `mqtt.factory.sensors`
   - Value path: `$.value`

Result: Messages on `factory/sensors/line1/temperature` create tag `mqtt.factory.sensors.line1.temperature`

### Example 2: Publish Production Metrics

1. Create tags for production metrics (items_count, reject_count, etc.)
2. Create publisher with interval mode (every 5 seconds)
3. Add mappings for each tag to appropriate topics
4. Enable publisher

Result: Tags are published to MQTT every 5 seconds for consumption by MES/ERP systems

### Example 3: Sparkplug Unified Namespace

1. Create internal MQTT connection (nanoMQ broker)
2. Create subscription for Sparkplug Birth messages: `spBv1.0/+/NBIRTH/+`
3. Auto-discover edge nodes and devices
4. Map discovered metrics to DataForeman tags
5. Create publishers to republish critical metrics to external systems

Result: DataForeman serves as unified namespace hub, normalizing data from multiple Sparkplug sources

## Data Flow

### Receiving Data (Subscriptions)

```
MQTT Broker → Connectivity Driver → Parse Message → Extract Values → 
Emit Telemetry (NATS) → Ingestor Service → TimescaleDB (tag_values)
```

### Publishing Data (Publishers)

```
Tag Value Change → Telemetry (NATS) → Connectivity Driver → 
Check Publishers → Transform Value → Format Payload → Publish to MQTT Topic
```

### Configuration Updates

```
UI/API Change → Core API → Database → NATS Config Message → 
Connectivity Service → Reload Connections/Subscriptions/Publishers
```

## Security

### Authentication

- nanoMQ uses webhook authentication with DataForeman core
- Credentials validated against `users` table
- Permission checks: `mqtt:read`, `mqtt:update`, `mqtt:delete`, `mqtt:create`

### TLS Support

Configure TLS for external brokers:
```javascript
{
  use_tls: true,
  tls_verify_cert: true,
  tls_ca_cert: "-----BEGIN CERTIFICATE-----\n...",
  tls_client_cert: "...",  // Optional
  tls_client_key: "..."    // Optional
}
```

## Performance Considerations

### Publishers

- **on_change mode**: Most efficient, only publishes when values change
- **interval mode**: Predictable load, good for polling-based systems
- **both mode**: Maximum data availability but higher bandwidth

### Subscriptions

- Use specific topics instead of wildcards when possible
- QoS 0 for non-critical data to reduce overhead
- QoS 1 for important data requiring acknowledgment
- QoS 2 rarely needed (exactly-once delivery)

### Connection Pooling

- Reuse connections for multiple subscriptions/publishers
- Internal nanoMQ connection can handle thousands of topics
- External connections limited by broker configuration

## Troubleshooting

### Connection Issues

Check connectivity service logs:
```bash
docker compose logs connectivity -f
```

Verify broker status:
```bash
curl http://localhost:8001/api/v1/brokers
```

### No Messages Received

1. Check subscription is enabled
2. Verify topic pattern matches incoming messages
3. Check MQTT client connected: `GET /api/mqtt/clients`
4. Verify payload format matches actual messages

### Publisher Not Working

1. Check publisher is enabled
2. Verify tag mappings are correct
3. Check tag values are changing (for on_change mode)
4. Review connectivity logs for publish errors
5. Subscribe to topics with mosquitto_sub to verify messages

### Sparkplug Issues

1. Verify Birth certificate received and stored in `sparkplug_discovery`
2. Check sequence numbers are incrementing
3. Ensure Data messages follow Birth messages
4. Verify metric names match between Birth and Data

## Best Practices

1. **Use Internal Broker for High Throughput**: nanoMQ embedded broker for local subscriptions/publishers
2. **Tag Naming Convention**: Use prefixes to organize MQTT tags (e.g., `mqtt.factory.line1.`)
3. **Quality of Service**: Start with QoS 0, increase only if needed
4. **Payload Formats**: JSON for flexibility, Raw for simplicity, Sparkplug for interoperability
5. **Publisher Intervals**: Balance between data freshness and bandwidth (1-10 seconds typical)
6. **Monitoring**: Regularly check broker status and client connections
7. **Cleanup**: Remove unused subscriptions/publishers to reduce load

## Future Enhancements

Potential improvements for future releases:

- [ ] MQTT 5.0 specific features (user properties, request-response)
- [ ] Publisher templates for common patterns
- [ ] Bulk tag mapping import/export
- [ ] Historical data republishing
- [ ] MQTT bridge configuration for broker-to-broker
- [ ] Advanced Sparkplug features (device commands, rebirth requests)
- [ ] Publisher batching for efficiency
- [ ] Custom payload encoders (Protobuf, Avro)

## References

- [MQTT 3.1.1 Specification](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html)
- [Sparkplug B Specification](https://sparkplug.eclipse.org/)
- [nanoMQ Documentation](https://nanomq.io/docs/en/latest/)

---

**Version**: 0.2.0  
**Last Updated**: January 2025  
**Maintainer**: DataForeman Team
