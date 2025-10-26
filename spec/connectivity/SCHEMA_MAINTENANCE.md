# Schema Maintenance Guide

## Important: Keep Schemas in Sync with Code

The JSON schemas in this directory are **actively used at runtime** for message validation in production. They are not just documentation.

### Where Schemas Are Used

1. **Connectivity Service** (`connectivity/src/index-multirate.mjs`)
   - Loads schemas on startup
   - Validates outgoing telemetry messages

2. **Core Service** (`core/src/services/nats.js`)
   - Loads schemas on startup  
   - Validates outgoing connectivity config messages
   - Logs warnings for invalid messages

3. **Ingestor Service** (`ingestor/src/index.mjs`)
   - Loads schemas on startup
   - **Silently discards** invalid telemetry batches
   - Critical: Invalid messages are dropped, not processed!

### Critical Rule

**WHENEVER YOU CHANGE MESSAGE FORMATS IN CODE, UPDATE THE SCHEMAS IMMEDIATELY**

If schemas don't match the actual message format:
- Messages will fail validation
- Data may be silently discarded (especially in ingestor)
- No errors will be thrown, just logged warnings
- Your system will appear to work but data won't flow

### Common Changes That Require Schema Updates

1. **Database Schema Changes**
   - Renaming columns (e.g., `conn_id` → `connection_id`)
   - Adding/removing fields
   - Changing data types

2. **Message Format Changes**
   - Adding new fields to NATS messages
   - Changing field names in telemetry batches
   - Modifying connection config structure

3. **Driver Updates**
   - Adding new driver types to enum lists
   - Changing driver-specific options

### How to Update Schemas

1. **Update the `.schema.json` file** in `spec/connectivity/schemas/`
2. **Update the corresponding fixture** in `spec/connectivity/fixtures/`
3. **Run validation**: `cd tools/schema-validate && npm test`
4. **Rebuild affected services** to reload schemas
5. **Check logs** for validation warnings after deployment

### Schema Files and Their Purpose

- `connectivity.config.v1.schema.json` - Connection configuration messages (Core → Connectivity)
- `connectivity.status.v1.schema.json` - Connection status updates (Connectivity → Core/UI)
- `telemetry.batch.v1.schema.json` - Telemetry data batches (Connectivity → Ingestor)
- `telemetry.write.v1.schema.json` - Write requests to PLCs (Core/UI → Connectivity)

### Recent Fixes (December 2024)

- **telemetry.batch.v1.schema.json**: Changed `source.conn_id` → `source.connection_id` to match actual implementation
- **telemetry-batch.json fixture**: Updated to use `connection_id`

This change was needed because the connectivity service sends `connection_id` in telemetry messages, matching the database column name.

### Testing

Before committing schema changes:

```bash
# Validate all fixtures against schemas
cd tools/schema-validate
npm install
node index.mjs

# Check that services still start without errors
docker compose build connectivity core ingestor
docker compose up -d

# Check logs for validation warnings
docker compose logs connectivity | grep -i validation
docker compose logs ingestor | grep -i "invalid\|validation"
```

### Validation Behavior

The validation is **defensive** - if schemas fail to load, services continue without validation. However, when schemas are loaded:

- **Core**: Logs warnings but still sends messages
- **Connectivity**: Loads schemas but currently doesn't validate outgoing messages strictly
- **Ingestor**: **Drops invalid messages** - this is the critical one!

### Migration Notes

When adding new database migrations that change message formats:

1. Add a comment in the migration file referencing this document
2. Update schemas in the same commit as the migration
3. Document the change in this file's "Recent Fixes" section

Example migration comment:
```javascript
// IMPORTANT: If this migration changes message fields used in NATS,
// update schemas in spec/connectivity/schemas/
// See spec/connectivity/SCHEMA_MAINTENANCE.md
```
