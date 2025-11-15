# Database Migration Guide# Database Migration Guide# Database Migration Guide



## Overview



DataForeman uses `node-pg-migrate` for database schema management. Migrations run automatically when the `core` service starts via the `start.sh` script.## Overview## Overview



## ⚠️ Important: Message Schema Validation



**If your migration changes fields that are sent via NATS messages** (connection configs, telemetry data, status updates), you MUST update the JSON schemas in `spec/connectivity/schemas/`.DataForeman uses `node-pg-migrate` for PostgreSQL schema management. Migrations run automatically when the `core` service starts via the `start.sh` script.DataForeman uses `node-pg-migrate` for database schema management. Migrations run automatically when the `core` service starts via the `start.sh` script.



These schemas are actively used at runtime to validate messages between services. See [spec/connectivity/SCHEMA_MAINTENANCE.md](../spec/connectivity/SCHEMA_MAINTENANCE.md) for details.



**Common changes requiring schema updates:**## ⚠️ Important: Message Schema Validation## ⚠️ Important: Message Schema Validation

- Renaming database columns used in messages (e.g., `conn_id` → `connection_id`)

- Adding/removing fields in connection configs

- Changing telemetry message structure

**If your migration changes fields that are sent via NATS messages** (connection configs, telemetry data, status updates), you MUST update the JSON schemas in `spec/connectivity/schemas/`.**If your migration changes fields that are sent via NATS messages** (connection configs, telemetry data, status updates), you MUST update the JSON schemas in `spec/connectivity/schemas/`.

## Migration Files

DataForeman uses **two separate migration directories** for different databases:

### PostgreSQL Migrations (core/migrations/)

```
core/migrations/
├── .gitkeep
├── 001_schema.sql      # Complete database schema (all tables)
└── 002_seed_data.sql   # Initial seed data
```

### TimescaleDB Migrations (core/migrations-tsdb/)

```
core/migrations-tsdb/
└── 001_timescale_schema.sql   # Time-series tables with hypertables
```

## Migration Strategy

DataForeman uses a **per-release migration approach** aligned with the git workflow:

### Beta Phase (v0.x.y - Current)

- **One migration per release version** (e.g., `003_v0.2_release.sql`, `004_v0.3_release.sql`)
- During development between releases, the in-progress migration **can be modified**
- Reset dev database when modifying: `docker compose down -v postgres && docker compose up -d`
- **Migration naming**: `XXX_v0.Y_release.sql` where 0.Y matches the git tag version
- Example: `003_v0.2_release.sql` corresponds to git tag `v0.2.0`

### Stable Release (v1.0+)

- **Baseline migrations are locked** - never modify existing migrations
- All new changes require **new migration files**
- Continue one migration per release for clean version history
- Each migration must be tagged with the corresponding release version in git
- **Migration naming**: `XXX_vX.Y_release.sql` (e.g., `010_v1.1_release.sql`)

### Current Baseline (v0.1)

#### 001_schema.sql
Creates the complete database schema in a single migration:
- All tables defined in one file for consistency
- Uses `CREATE TABLE IF NOT EXISTS` for idempotency
- Includes proper foreign key relationships and indexes
- Creates approximately 20 tables covering all application features

#### 002_seed_data.sql
Inserts essential seed data:
- System user (UUID: 00000000-0000-0000-0000-000000000000)
- System connection for monitoring
- Default units of measure
- Uses `ON CONFLICT DO NOTHING` for safe re-runs

**Important**: During beta (v0.x.y), in-progress migrations can be modified. After v1.0 stable release, all migration files will be **permanently locked** and should never be modified.

## Tables Created by PostgreSQL Migrations

### Authentication & Authorization

- **users**: User accounts with email, display name, and active status
- **auth_identities**: Authentication credentials (bcrypt password hashes)
- **roles**: User roles (admin, viewer, etc.)
- **user_roles**: User-to-role assignments (many-to-many)
- **user_permissions**: Individual permission overrides for users
- **sessions**: Active user sessions with refresh tokens



### Data Collection Infrastructure (CRITICAL for connectivity service)- **002_seed_data.sql**: Inserts essential seed data## Critical Migrations for Fresh Installation

- **connections**: Data source connections (PLCs, databases, APIs, etc.)

- **poll_groups**: Tag polling groups - **REQUIRED by connectivity service**  - System user (UUID: 00000000-0000-0000-0000-000000000000)

- **tag_metadata**: Tag configuration and metadata - **REQUIRED by connectivity service**

- **units_of_measure**: Units of measure for tags (meters, PSI, °C, etc.)  - System connection for monitoring### 001_init.cjs (REQUIRED - Run First)



### Visualization & Analytics  - Default units of measure**Purpose**: Creates all foundational tables needed by the system

- **chart_configs**: Chart configurations (trend charts, bar charts, etc.)

- **dashboard_configs**: Dashboard layouts  - Uses `ON CONFLICT DO NOTHING` for safe re-runs

- **chart_folders**: Hierarchical chart organization

- **dashboard_folders**: Hierarchical dashboard organization**Tables Created**:



### System ManagementThis approach is simpler than incremental migrations and ensures consistent schema across fresh installations.- `users` - User accounts

- **system_settings**: Application-wide settings (key-value store)

- **audit_events**: Audit log for user actions- `auth_identities` - Authentication credentials

- **jobs**: Background job tracking and status

## Tables Created by 001_schema.sql- `roles` - User roles (viewer, admin)

### EIP/CIP Driver Cache

- **eip_device_cache**: EtherNet/IP device capability cache- `user_roles` - User-to-role mapping

- **eip_tag_cache**: EtherNet/IP tag discovery cache

### Authentication & Authorization- `sessions` - Refresh tokens/sessions

## Tables Created by TimescaleDB Migrations

- **users**: User accounts with email, display name, and active status- `audit_events` - Audit trail

### Time-Series Data

- **auth_identities**: Authentication credentials (bcrypt password hashes)- `config_items` - **CRITICAL**: Stores connectivity configurations

**tag_values** - Tag readings over time

```sql- **roles**: User roles (admin, viewer, etc.)

CREATE TABLE tag_values (

    ts timestamptz NOT NULL,           -- Timestamp- **user_roles**: User-to-role assignments (many-to-many)**Seeds**:

    connection_id uuid NOT NULL,        -- Source connection

    tag_id integer NOT NULL,            -- Tag identifier- **user_permissions**: Individual permission overrides for users- Creates `admin` and `viewer` roles

    quality smallint,                   -- Data quality indicator

    v_num double precision,             -- Numeric value- **sessions**: Active user sessions with refresh tokens- Creates default `admin@example.com` user

    v_text text,                        -- Text value

    v_json jsonb,                       -- JSON value- Assigns admin role to default user

    PRIMARY KEY (connection_id, tag_id, ts)

);### Data Collection Infrastructure (CRITICAL for connectivity service)

```

- Converted to TimescaleDB hypertable- **connections**: Data source connections (PLCs, databases, APIs, etc.)**Why Critical**: The `config_items` table is required by the connectivity service to store connection configurations. Without this table, connectivity service will fail to start.

- Partitioned by time (1-day chunks)

- Optimized indexes for time-descending queries- **poll_groups**: Tag polling groups - **REQUIRED by connectivity service**

- Supports numeric, text, and JSON values

- **tag_metadata**: Tag configuration and metadata - **REQUIRED by connectivity service**### 002_auth.cjs

**system_metrics** - Internal monitoring data

```sql- **units_of_measure**: Units of measure for tags (meters, PSI, °C, etc.)**Purpose**: Backwards compatibility only (no-op on fresh installs)

CREATE TABLE system_metrics (

    ts timestamptz NOT NULL,

    metric_name text NOT NULL,

    value double precision NOT NULL,### Visualization & AnalyticsAll tables previously created by this migration are now created by `001_init.cjs`. This migration is kept only for existing installations that already ran it.

    labels jsonb DEFAULT '{}'::jsonb,

    ingested_at timestamptz DEFAULT now()- **chart_configs**: Chart configurations (trend charts, bar charts, etc.)

);

```- **dashboard_configs**: Dashboard layouts### 003_config_items.sql

- Converted to TimescaleDB hypertable

- 1-day chunk intervals- **chart_folders**: Hierarchical chart organization**Purpose**: Ensures `config_items` table exists with proper schema

- Stores DataForeman internal metrics

- **dashboard_folders**: Hierarchical dashboard organization

## Critical Dependencies

Uses `CREATE TABLE IF NOT EXISTS` so it won't fail if the table was already created by `001_init.cjs`.

### Connectivity Service Requirements

### System Management

The connectivity service **requires** these tables to start:

- `poll_groups` (in PostgreSQL db)- **system_settings**: Application-wide settings (key-value store)### 004_tag_values.sql

- `tag_metadata` (in PostgreSQL db)

- `connections` (in PostgreSQL db)- **audit_events**: Audit log for user actions**Purpose**: Creates time-series data table in TimescaleDB

- `tag_values` (in TimescaleDB tsdb)

- **jobs**: Background job tracking and status

**What happens if missing**:

```**Tables Created**:

Error: relation "poll_groups" does not exist

Error: relation "tag_metadata" does not exist### EIP/CIP Driver Cache- `tag_values` - Stores telemetry data points

Error: relation "connections" does not exist

```- **eip_device_cache**: EtherNet/IP device capability cache- Converts to TimescaleDB hypertable if extension is available



The connectivity service will crash on startup if any of these tables are missing.- **eip_tag_cache**: EtherNet/IP tag discovery cache



## Fresh Installation Process**Note**: This creates the table in the main PostgreSQL database, but the application uses TimescaleDB (separate `tsdb` container) for storing tag values.



When installing DataForeman on a new machine:## Critical Dependencies



1. **Start databases first**:### 005_poll_groups.sql + 005_poll_groups.cjs

   ```bash

   docker compose up -d db tsdb nats### Connectivity Service Requirements**Purpose**: Creates poll groups for multi-rate polling

   ```



2. **Start core service** (runs migrations automatically):

   ```bashThe connectivity service **requires** these tables to start:**Tables Created**:

   docker compose up -d core

   ```- `poll_groups`- `poll_groups` - Predefined polling rate groups (1-10)

   

   The `core/start.sh` script will:- `tag_metadata`

   - Wait for PostgreSQL to be ready

   - Run migrations on PostgreSQL (`core/migrations/`)- `connections`**Seeds**: Creates 10 poll groups from "Ultra Fast" (50ms) to "Custom" (30s)

   - Wait for TimescaleDB to be ready

   - Run migrations on TimescaleDB (`core/migrations-tsdb/`)

   - Start the core API server

**What happens if missing**:**Why Critical**: Required by connectivity service and tag_metadata table (foreign key constraint).

3. **Verify migrations**:

   ```

   **PostgreSQL tables**:

   ```bashError: relation "poll_groups" does not exist### 006_tag_metadata.sql + 006_tag_metadata.cjs

   docker compose exec db psql -U postgres -d dataforeman -c "\dt"

   ```Error: relation "tag_metadata" does not exist**Purpose**: Creates tag metadata table

   

   **PostgreSQL migration history**:Error: relation "connections" does not exist

   ```bash

   docker compose exec db psql -U postgres -d dataforeman -c "SELECT * FROM pgmigrations ORDER BY id;"```**Tables Created**:

   ```

   - `tag_metadata` - Static information about tags (name, type, poll group, etc.)

   **TimescaleDB tables**:

   ```bashThe connectivity service will crash on startup if any of these tables are missing. These are all created by `001_schema.sql`.- Foreign key to `poll_groups`

   docker compose exec tsdb psql -U tsdb -d telemetry -c "\dt"

   ```- Trigger for automatic `updated_at` timestamp

   

   **TimescaleDB migration history**:## Fresh Installation Process

   ```bash

   docker compose exec tsdb psql -U tsdb -d telemetry -c "SELECT * FROM pgmigrations ORDER BY id;"**Why Critical**: Required by connectivity service to load tag configurations and subscriptions.

   ```

When installing DataForeman on a new machine:

4. **Start remaining services**:

   ```bash## Fresh Installation Process

   docker compose up -d

   ```1. **Start databases first**:



## Verifying Migration Success   ```bashWhen installing DataForeman on a new machine:



### PostgreSQL Database (db container)   docker compose up -d db tsdb nats



After migrations run, you should see these tables in the `dataforeman` database:   ```1. **Start databases first**:



```bash   ```bash

docker compose exec db psql -U postgres -d dataforeman -c "

SELECT table_name 2. **Start core service** (runs migrations automatically):   docker compose up -d db tsdb nats

FROM information_schema.tables 

WHERE table_schema = 'public'    ```bash   ```

ORDER BY table_name;"

```   docker compose up -d core



Expected tables (19 total):   ```2. **Start core service** (runs migrations automatically):

- audit_events

- auth_identities      ```bash

- chart_configs

- chart_folders   The `core/start.sh` script will:   docker compose up -d core

- connections ✓ CRITICAL

- dashboard_configs   - Wait for PostgreSQL to be ready   ```

- dashboard_folders

- eip_device_cache   - Run `node-pg-migrate up` to apply all migrations   

- eip_tag_cache

- jobs   - Start the core API server   The `core/start.sh` script will:

- pgmigrations (created by node-pg-migrate)

- poll_groups ✓ CRITICAL   - Wait for PostgreSQL to be ready

- roles

- sessions3. **Verify migrations**:   - Run `node-pg-migrate up` to apply all migrations

- system_settings

- tag_metadata ✓ CRITICAL   ```bash   - Start the core API server

- units_of_measure

- user_permissions   # Check PostgreSQL tables

- user_roles

- users   docker compose exec db psql -U postgres -d dataforeman -c "\dt"3. **Verify migrations**:



### TimescaleDB Database (tsdb container)      ```bash



```bash   # Check migration history   # Check PostgreSQL tables

docker compose exec tsdb psql -U tsdb -d telemetry -c "

SELECT table_name    docker compose exec db psql -U postgres -d dataforeman -c "SELECT * FROM pgmigrations ORDER BY id;"   docker compose exec db psql -U postgres -d dataforeman -c "\dt"

FROM information_schema.tables 

WHERE table_schema = 'public'    ```   

ORDER BY table_name;"

```   # Check migration history



Expected tables (3 total):4. **Start remaining services**:   docker compose exec db psql -U postgres -d dataforeman -c "SELECT * FROM pgmigrations ORDER BY id;"

- pgmigrations (created by node-pg-migrate)

- system_metrics   ```bash   ```

- tag_values ✓ CRITICAL

   docker compose up -d

## Common Issues

   ```4. **Start remaining services**:

### Issue: connectivity service fails with "relation does not exist" errors

   ```bash

**Symptom**: Logs show errors like:

```## Verifying Migration Success   docker compose up -d

relation "poll_groups" does not exist

relation "tag_metadata" does not exist   ```

relation "connections" does not exist

relation "tag_values" does not existAfter migrations run, you should see these tables in the `dataforeman` database:

```

## Testing Fresh Installation

**Cause**: Migrations did not run or failed on one or both databases

```sql

**Solution**:

-- Check for critical tablesA test script is provided to verify the migration process works correctly:

1. Check core service logs for migration errors:

   ```bashdocker compose exec db psql -U postgres -d dataforeman -c "

   docker compose logs core | grep -i migration

   ```SELECT table_name ```bash



2. Manually run PostgreSQL migrations:FROM information_schema.tables ./test-fresh-install.sh

   ```bash

   docker compose exec core npx node-pg-migrate \WHERE table_schema = 'public' ```

     -m migrations \

     -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE upORDER BY table_name;"

   ```

```**WARNING**: This script will:

3. Manually run TimescaleDB migrations:

   ```bash- Stop all containers

   docker compose exec core npx node-pg-migrate \

     -m migrations-tsdb \Expected tables (19 total):- **DELETE all database volumes** (removes all data)

     -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE up

   ```- audit_events- Start fresh databases



4. Verify tables exist in both databases (see commands above)- auth_identities- Run migrations



### Issue: Migrations hang or timeout- chart_configs- Verify all tables were created



**Symptom**: `core` service waits indefinitely for database- chart_folders



**Cause**: Database not ready or connection variables incorrect- connectionsOnly run this on a development/test environment!



**Solution**:- dashboard_configs



1. Check both databases are running:- dashboard_folders## Common Issues

   ```bash

   docker compose ps db tsdb- eip_device_cache

   ```

- eip_tag_cache### Issue: connectivity service fails with "relation does not exist" errors

2. Verify environment variables in `docker-compose.yml` or `.env` file:

   - jobs

   **PostgreSQL**:

   - PGHOST=db- pgmigrations (created by node-pg-migrate)**Symptom**: Logs show errors like:

   - PGPORT=5432

   - PGUSER=postgres- poll_groups ✓ CRITICAL```

   - PGPASSWORD=[your-password]

   - PGDATABASE=dataforeman- rolesrelation "config_items" does not exist

   

   **TimescaleDB**:- sessionsrelation "poll_groups" does not exist

   - TSDB_HOST=tsdb

   - TSDB_PORT=5432- system_settingsrelation "tag_metadata" does not exist

   - TSDB_USER=tsdb

   - TSDB_PASSWORD=tsdb- tag_metadata ✓ CRITICAL```

   - TSDB_DATABASE=telemetry

- units_of_measure

3. Check database logs:

   ```bash- user_permissions**Cause**: Migrations did not run or failed

   docker compose logs db

   docker compose logs tsdb- user_roles

   ```

- users**Solution**:

### Issue: TimescaleDB migration fails with "function create_hypertable does not exist"

1. Check core service logs for migration errors:

**Symptom**: Migration `001_timescale_schema.sql` fails

## Common Issues   ```bash

**Cause**: TimescaleDB extension not loaded

   docker compose logs core | grep -i migration

**Solution**:

### Issue: connectivity service fails with "relation does not exist" errors   ```

1. Verify TimescaleDB container is running:

   ```bash

   docker compose ps tsdb

   ```**Symptom**: Logs show errors like:2. Manually run migrations:



2. Check if TimescaleDB extension is available:```   ```bash

   ```bash

   docker compose exec tsdb psql -U tsdb -d telemetry -c "SELECT * FROM pg_available_extensions WHERE name='timescaledb';"relation "poll_groups" does not exist   docker compose exec core npx node-pg-migrate -m migrations -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up

   ```

relation "tag_metadata" does not exist   ```

3. If using a different PostgreSQL image instead of `timescale/timescaledb`, you'll need to install the extension or switch to the TimescaleDB image.

relation "connections" does not exist

### Issue: Migration shows as run but tables don't exist

```3. Verify tables exist:

**Symptom**: `pgmigrations` table shows migrations ran, but tables like `users` or `tag_values` don't exist

   ```bash

**Cause**: Migration file was empty when first executed, or migration failed silently

**Cause**: Migrations did not run or failed   docker compose exec db psql -U postgres -d dataforeman -c "\dt"

**Solution**:

   ```

1. Check migration file content:

   ```bash**Solution**:

   cat core/migrations/001_schema.sql | head -50

   cat core/migrations-tsdb/001_timescale_schema.sql | head -501. Check core service logs for migration errors:### Issue: 001_init migration shows as run but tables don't exist

   ```

   ```bash

2. If file has content but tables don't exist, manually re-run (⚠️ DEVELOPMENT ONLY):

   ```bash   docker compose logs core | grep -i migration**Symptom**: `pgmigrations` table shows `001_init` ran, but `config_items`, `users`, etc. don't exist

   # PostgreSQL

   docker compose exec core npx node-pg-migrate \   ```

     -m migrations \

     -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE down**Cause**: The `001_init.cjs` file was empty when it first ran

   docker compose exec core npx node-pg-migrate \

     -m migrations \2. Manually run migrations:

     -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up

      ```bash**Solution**:

   # TimescaleDB

   docker compose exec core npx node-pg-migrate \   docker compose exec core npx node-pg-migrate -m migrations -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up1. Check if this is an old installation:

     -m migrations-tsdb \

     -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE down   ```   ```bash

   docker compose exec core npx node-pg-migrate \

     -m migrations-tsdb \   docker compose exec db psql -U postgres -d dataforeman -c "SELECT run_on FROM pgmigrations WHERE name='001_init';"

     -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE up

   ```3. Verify tables exist:   ```



   **WARNING**: This will drop and recreate all tables! Only do this on fresh installations with no data.   ```bash



## TimescaleDB Integration   docker compose exec db psql -U postgres -d dataforeman -c "\dt"2. If run_on date is before October 7, 2025, you have an old installation with the empty migration



DataForeman uses **two separate database instances**:   ```



| Database | Container | Port | Purpose | Migrations |3. The system should still work because `002_auth.cjs` created the tables. No action needed unless you're doing a fresh install.

|----------|-----------|------|---------|------------|

| PostgreSQL | `db` | 5432 | Metadata, config, auth | `core/migrations/` |### Issue: Migrations hang or timeout

| TimescaleDB | `tsdb` | 5433 | Time-series tag data | `core/migrations-tsdb/` |

### Issue: Duplicate migrations in pgmigrations table

### Why Separate Databases?

**Symptom**: `core` service waits indefinitely for database

- **Performance**: TimescaleDB is optimized for time-series data with hypertables and automatic partitioning

- **Scalability**: Time-series data can grow unbounded; separate database allows independent scaling**Symptom**: Multiple entries with same name (e.g., two `005_poll_groups` entries)

- **Backup strategy**: Different backup strategies for metadata (full backups) vs time-series (retention policies)

- **Query optimization**: Different index strategies and query patterns**Cause**: PostgreSQL not ready or connection variables incorrect



### Migration Execution**Cause**: Migrations were run multiple times or migration system was reset



Both databases are migrated automatically by `core/start.sh`:**Solution**:



1. **PostgreSQL migrations** run first:1. Check database is running:**Solution**: This is harmless if tables exist. The duplicate entries can be ignored.

   ```bash

   npx node-pg-migrate -m migrations \   ```bash

     -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up

   ```   docker compose ps db## Migration Order Dependencies



2. **TimescaleDB migrations** run second:   ```

   ```bash

   npx node-pg-migrate -m migrations-tsdb \```

     -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE up

   ```2. Verify environment variables in `docker-compose.yml` or `.env` file:001_init.cjs (MUST RUN FIRST)



Both use separate `pgmigrations` tracking tables in their respective databases.   - PGHOST=db  ↓



## Manual Migration Commands   - PGPORT=5432  Creates: users, roles, auth_identities, sessions, config_items



### Run all pending migrations   - PGUSER=postgres  ↓



**PostgreSQL (metadata database)**:   - PGPASSWORD=[your-password]002_auth.cjs (no-op on fresh installs)

```bash

docker compose exec core npx node-pg-migrate \   - PGDATABASE=dataforeman  ↓

  -m migrations \

  -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE \003_config_items.sql (idempotent - adds updated_at if missing)

  up

```3. Check PostgreSQL logs:  ↓



**TimescaleDB (time-series database)**:   ```bash004_tag_values.sql (creates tag_values in PostgreSQL)

```bash

docker compose exec core npx node-pg-migrate \   docker compose logs db  ↓

  -m migrations-tsdb \

  -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE \   ```005_poll_groups.sql/cjs (creates poll_groups - REQUIRED for connectivity)

  up

```  ↓



### Create a new migration### Issue: Migration shows as run but tables don't exist006_tag_metadata.sql/cjs (creates tag_metadata - REQUIRED for connectivity)



**For PostgreSQL (metadata tables)**:  ↓

```bash

docker compose exec core npx node-pg-migrate \**Symptom**: `pgmigrations` table shows migrations ran, but tables like `users` or `poll_groups` don't exist007+ (additional features)

  -m migrations \

  create my-new-migration```

```

**Cause**: Migration file was empty when first executed, or migration failed silently

**For TimescaleDB (time-series tables)**:

```bash## TimescaleDB Migrations

docker compose exec core npx node-pg-migrate \

  -m migrations-tsdb \**Solution**:

  create my-new-timeseries-table

```1. Check migration file content:The main PostgreSQL database stores metadata and configuration. Time-series data is stored in a separate TimescaleDB instance (the `tsdb` container).



This creates a new migration file with timestamp prefix in the respective directory.   ```bash



### Check migration status   cat core/migrations/001_schema.sql | head -50Currently, TimescaleDB table creation happens via manual SQL in migration `004_tag_values.sql`, but the actual `tag_values` table used by the connectivity service is in the `tsdb` database, not the main `db` database.



**PostgreSQL migrations**:   ```

```bash

docker compose exec db psql -U postgres -d dataforeman -c "## Manual Migration Commands

SELECT id, name, run_on 

FROM pgmigrations 2. If file has content but tables don't exist, manually re-run:

ORDER BY id;"

```   ```bash### Run all pending migrations



**TimescaleDB migrations**:   docker compose exec core npx node-pg-migrate -m migrations -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE down```bash

```bash

docker compose exec tsdb psql -U tsdb -d telemetry -c "   docker compose exec core npx node-pg-migrate -m migrations -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE updocker compose exec core npx node-pg-migrate -m migrations -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up

SELECT id, name, run_on 

FROM pgmigrations    ``````

ORDER BY id;"

```



### Rollback last migration   **WARNING**: This will drop and recreate all tables! Only do this on fresh installations with no data.### Create a new migration



**PostgreSQL**:```bash

```bash

docker compose exec core npx node-pg-migrate \## TimescaleDB Integrationdocker compose exec core npx node-pg-migrate -m migrations create migration-name

  -m migrations \

  -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE \```

  down

```The main PostgreSQL database (`db` container) stores metadata and configuration. Time-series tag data is stored in a separate TimescaleDB instance (`tsdb` container).



**TimescaleDB**:### Rollback last migration

```bash

docker compose exec core npx node-pg-migrate \The `001_schema.sql` migration attempts to enable the TimescaleDB extension if available:```bash

  -m migrations-tsdb \

  -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE \docker compose exec core npx node-pg-migrate -m migrations -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE down

  down

``````sql```



**WARNING**: Rollbacks can cause data loss. Only use on development environments.DO $$



## Best Practices for Future MigrationsBEGIN### Check migration status



1. **Always use IF NOT EXISTS** in CREATE statements for idempotency  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN```bash

2. **Test on fresh database** before deploying to production

3. **Never modify existing migrations** that have been run in production    RAISE NOTICE 'TimescaleDB extension not available, skipping';docker compose exec db psql -U postgres -d dataforeman -c "SELECT * FROM pgmigrations ORDER BY id;"

4. **Use transactions** (migrations run in transactions by default)

5. **Document breaking changes** in migration comments  ELSE```

6. **Update NATS schemas** if changing message-related fields (see spec/connectivity/SCHEMA_MAINTENANCE.md)

7. **Prefer SQL over JavaScript** for simple schema changes    CREATE EXTENSION IF NOT EXISTS timescaledb;

8. **Include rollback migrations** when possible (down migrations)

9. **Choose the right database**:  END IF;## Best Practices

   - PostgreSQL (`migrations/`) for metadata, configuration, relationships

   - TimescaleDB (`migrations-tsdb/`) for time-series data, metrics, eventsEND$$;



## Adding New Tables```1. **Always use IF NOT EXISTS** in SQL migrations to ensure idempotency



### For Metadata Tables (PostgreSQL)2. **Test migrations on fresh database** before deploying



When adding a new configuration or metadata table:This is safe to run on PostgreSQL instances without TimescaleDB installed.3. **Never modify existing migrations** that have been run in production



1. Create a new migration file:4. **Use transactions** (migrations run in transactions by default)

   ```bash

   docker compose exec core npx node-pg-migrate -m migrations create add-my-new-table## Manual Migration Commands5. **Include down migrations** for rollback capability

   ```

6. **Document dependencies** in migration comments

2. Edit the generated file in `core/migrations/`:

   ```sql### Run all pending migrations

   -- Up migration

   CREATE TABLE IF NOT EXISTS my_new_table (**PostgreSQL (metadata database)**:

     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),```bash

     name text NOT NULL,docker compose exec core npx node-pg-migrate \

     created_at timestamp with time zone DEFAULT now()  -m migrations \

   );  -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE \

  up

   -- Down migration (for rollback)```

   DROP TABLE IF EXISTS my_new_table;

   ```**TimescaleDB (time-series database)**:

```bash

3. Restart core service to apply:docker compose exec core npx node-pg-migrate \

   ```bash  -m migrations-tsdb \

   docker compose restart core  -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE \

   ```  up

```

### For Time-Series Tables (TimescaleDB)

### Create a new migration

When adding a new hypertable for time-series data:

**For PostgreSQL (metadata tables)**:

1. Create a new migration file:```bash

   ```bashdocker compose exec core npx node-pg-migrate \

   docker compose exec core npx node-pg-migrate -m migrations-tsdb create add-my-timeseries-table  -m migrations \

   ```  create my-new-migration

```

2. Edit the generated file in `core/migrations-tsdb/`:

   ```sql**For TimescaleDB (time-series tables)**:

   -- Up migration```bash

   CREATE TABLE IF NOT EXISTS my_timeseries_data (docker compose exec core npx node-pg-migrate \

     ts timestamptz NOT NULL,  -m migrations-tsdb \

     device_id uuid NOT NULL,  create my-new-timeseries-table

     value double precision,```

     PRIMARY KEY (device_id, ts)

   );This creates a new migration file with timestamp prefix in the respective directory.



   -- Convert to hypertable### Check migration status

   SELECT create_hypertable('my_timeseries_data', 'ts', 

     chunk_time_interval => INTERVAL '1 day',**PostgreSQL migrations**:

     if_not_exists => TRUE```bash

   );docker compose exec db psql -U postgres -d dataforeman -c "

SELECT id, name, run_on 

   -- Add indexesFROM pgmigrations 

   CREATE INDEX IF NOT EXISTS idx_my_timeseries_ts ON my_timeseries_data (ts DESC);ORDER BY id;"

```

   -- Down migration (for rollback)

   DROP TABLE IF EXISTS my_timeseries_data;**TimescaleDB migrations**:

   ``````bash

docker compose exec tsdb psql -U tsdb -d telemetry -c "

3. Restart core service to apply:SELECT id, name, run_on 

   ```bashFROM pgmigrations 

   docker compose restart coreORDER BY id;"

   ``````



## Seed Data Strategy### Rollback last migration

```bash

Initial data that should exist in every installation goes in `002_seed_data.sql`:docker compose exec core npx node-pg-migrate \

  -m migrations \

- System accounts (e.g., system user for internal operations)  -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE \

- Default connections (e.g., System connection for monitoring)  down

- Essential reference data (e.g., common units of measure)```



User-specific data (like the admin account) should be created by the application on first run, not in migrations.**WARNING**: Rollbacks can cause data loss. Only use on development environments.



## Migration Execution Order## Best Practices for Future Migrations



Migrations execute in alphanumeric order by filename in each directory:1. **Always use IF NOT EXISTS** in CREATE statements for idempotency

2. **Test on fresh database** before deploying to production

**PostgreSQL** (`core/migrations/`):3. **Never modify existing migrations** that have been run in production

1. `001_schema.sql` - Creates all tables4. **Use transactions** (migrations run in transactions by default)

2. `002_seed_data.sql` - Inserts seed data5. **Document breaking changes** in migration comments

3. Future migrations (003+)6. **Update NATS schemas** if changing message-related fields (see spec/connectivity/SCHEMA_MAINTENANCE.md)

7. **Prefer SQL over JavaScript** for simple schema changes

**TimescaleDB** (`core/migrations-tsdb/`):8. **Include rollback migrations** when possible (down migrations)

1. `001_timescale_schema.sql` - Creates hypertables

2. Future migrations (002+)## Adding New Tables



The `pgmigrations` table in each database tracks which migrations have run to prevent duplicates.When adding a new table:


1. Create a new migration file:
   ```bash
   docker compose exec core npx node-pg-migrate -m migrations create add-my-new-table
   ```

2. Edit the generated file in `core/migrations/`:
   ```sql
   -- Up migration
   CREATE TABLE IF NOT EXISTS my_new_table (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     created_at timestamp with time zone DEFAULT now()
   );

   -- Down migration (for rollback)
   DROP TABLE IF EXISTS my_new_table;
   ```

3. Restart core service to apply:
   ```bash
   docker compose restart core
   ```

## Seed Data Strategy

Initial data that should exist in every installation goes in `002_seed_data.sql`:

- System accounts (e.g., system user for internal operations)
- Default connections (e.g., System connection for monitoring)
- Essential reference data (e.g., common units of measure)

User-specific data (like the admin account) should be created by the application on first run, not in migrations.

## Migration Execution Order

Migrations execute in alphanumeric order by filename:

1. `001_schema.sql` - Creates all tables
2. `002_seed_data.sql` - Inserts seed data

If you add new migrations, use timestamps or incremental numbers:
- `003_add_feature_x.sql`
- `004_add_feature_y.sql`

The `pgmigrations` table tracks which migrations have run to prevent duplicates.
