-- =====================================================
-- DataForeman Complete Database Schema
-- Initial Installation Migration
-- =====================================================
-- This migration creates the complete database schema for a fresh installation.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- TimescaleDB extension
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    RAISE NOTICE 'TimescaleDB extension not available';
  ELSE
    CREATE EXTENSION IF NOT EXISTS timescaledb;
  END IF;
END$$;

-- =====================================================
-- Authentication & Authorization
-- =====================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    display_name text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auth identities (local auth, extendable to OAuth/SAML)
CREATE TABLE IF NOT EXISTS auth_identities (
    id serial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_user_id text NOT NULL,
    secret_hash text,
    failed_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(provider, provider_user_id)
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE(user_id, role_id)
);

-- User permissions (granular CRUD access control)
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature text NOT NULL,
    can_create boolean DEFAULT false,
    can_read boolean DEFAULT false,
    can_update boolean DEFAULT false,
    can_delete boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_feature ON user_permissions(feature);

-- Sessions (refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
    id serial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti uuid NOT NULL UNIQUE,
    refresh_hash text NOT NULL,
    user_agent text,
    ip inet,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by_jti uuid,
    last_activity_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_active_idx ON sessions(user_id) WHERE revoked_at IS NULL;

-- =====================================================
-- Audit & Logging
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_events (
    id serial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    action text NOT NULL,
    outcome text NOT NULL, -- success | failure | info
    actor_user_id uuid REFERENCES users(id),
    ip inet,
    target_type text,
    target_id text,
    metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events(ts);

-- =====================================================
-- Configuration & Connectivity
-- =====================================================

-- System-wide settings (key-value store)
CREATE TABLE IF NOT EXISTS system_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Connections table (for connectivity service)
CREATE TABLE IF NOT EXISTS connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    type text NOT NULL CHECK (type IN ('opcua-client', 'opcua-server', 's7', 'eip', 'system')),
    enabled boolean NOT NULL DEFAULT true,
    config_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_system_connection boolean NOT NULL DEFAULT false,
    max_tags_per_group integer DEFAULT 500,
    max_concurrent_connections integer DEFAULT 8,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(type);
CREATE INDEX IF NOT EXISTS idx_connections_enabled ON connections(enabled);
CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
CREATE INDEX IF NOT EXISTS idx_connections_deleted_at ON connections(deleted_at) WHERE deleted_at IS NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_connections_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_connections_updated_at
    BEFORE UPDATE ON connections
    FOR EACH ROW
    EXECUTE FUNCTION update_connections_timestamp();

-- =====================================================
-- Tag Management & Metadata
-- =====================================================

-- Units of measure (must be before tag_metadata due to FK)
CREATE TABLE IF NOT EXISTS units_of_measure (
    id serial PRIMARY KEY,
    name varchar(100) NOT NULL UNIQUE,
    symbol varchar(20) NOT NULL,
    category varchar(50) NOT NULL,
    is_system boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_category ON units_of_measure(category);
CREATE INDEX IF NOT EXISTS idx_units_is_system ON units_of_measure(is_system);

-- Poll groups for multi-rate polling (must be before tag_metadata due to FK)
CREATE TABLE IF NOT EXISTS poll_groups (
    group_id integer PRIMARY KEY,
    name varchar(50) NOT NULL,
    poll_rate_ms integer NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE(poll_rate_ms),
    UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_poll_groups_rate ON poll_groups(poll_rate_ms);
CREATE INDEX IF NOT EXISTS idx_poll_groups_active ON poll_groups(is_active, poll_rate_ms);

-- Seed predefined poll groups
INSERT INTO poll_groups (group_id, name, poll_rate_ms, description) VALUES
(1,  'Ultra Fast',    50,    'Critical real-time control (50ms)'),
(2,  'Very Fast',     100,   'High-speed monitoring (100ms)'),
(3,  'Fast',          250,   'Fast process control (250ms)'),
(4,  'Normal',        500,   'Standard monitoring (500ms)'),
(5,  'Standard',      1000,  'Default polling rate (1s)'),
(6,  'Slow',          2000,  'Slow changing values (2s)'),
(7,  'Very Slow',     5000,  'Infrequent updates (5s)'),
(8,  'Diagnostic',    10000, 'Equipment diagnostics (10s)'),
(9,  'Minute',    60000, 'Per minute polling (1min)'),
(10, 'Custom',        30000, 'Custom/flexible rate (30s)')
ON CONFLICT (group_id) DO NOTHING;

-- Tag metadata
CREATE TABLE IF NOT EXISTS tag_metadata (
    tag_id serial PRIMARY KEY,
    connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    driver_type text NOT NULL CHECK (driver_type IN ('EIP', 'OPCUA', 'S7', 'SYSTEM')),
    tag_path text NOT NULL,
    tag_name text,
    is_subscribed boolean NOT NULL DEFAULT false,
    is_deleted boolean NOT NULL DEFAULT false,
    status text, -- active | pending_delete | deleting | deleted
    original_subscribed boolean,
    delete_job_id integer,
    delete_started_at timestamptz,
    deleted_at timestamptz,
    poll_group_id integer NOT NULL DEFAULT 5 REFERENCES poll_groups(group_id),
    data_type text,
    unit_id integer REFERENCES units_of_measure(id) ON DELETE SET NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    -- Write on change configuration
    on_change_enabled boolean NOT NULL DEFAULT false,
    on_change_deadband real DEFAULT 0.0,
    on_change_deadband_type varchar(20) DEFAULT 'absolute' CHECK (on_change_deadband_type IN ('absolute', 'percent')),
    on_change_heartbeat_ms integer DEFAULT 60000,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_tag_metadata_unique_tag UNIQUE(connection_id, tag_path, driver_type)
);

CREATE INDEX IF NOT EXISTS idx_tag_metadata_connection ON tag_metadata(connection_id);
CREATE INDEX IF NOT EXISTS idx_tag_metadata_conn_driver ON tag_metadata(connection_id, driver_type, is_subscribed);
CREATE INDEX IF NOT EXISTS idx_tag_metadata_subscribed ON tag_metadata(connection_id, is_subscribed) WHERE is_subscribed = true;
CREATE INDEX IF NOT EXISTS idx_tag_metadata_deleted ON tag_metadata(is_deleted) WHERE is_deleted = true;
CREATE INDEX IF NOT EXISTS idx_tag_metadata_poll_group ON tag_metadata(connection_id, poll_group_id) WHERE is_subscribed = true;
CREATE INDEX IF NOT EXISTS idx_tag_metadata_delete_job ON tag_metadata(delete_job_id);
CREATE INDEX IF NOT EXISTS idx_tag_metadata_status ON tag_metadata(connection_id, status);
CREATE INDEX IF NOT EXISTS idx_tag_metadata_unit ON tag_metadata(unit_id);
CREATE INDEX IF NOT EXISTS idx_tag_metadata_on_change ON tag_metadata(connection_id, on_change_enabled) WHERE on_change_enabled = true AND is_subscribed = true;

-- Add comments for write on change columns
COMMENT ON COLUMN tag_metadata.on_change_enabled IS 'Enable write on change to prevent saving unchanged values to database';
COMMENT ON COLUMN tag_metadata.on_change_deadband IS 'Deadband value for numeric comparisons. For absolute: minimum change required. For percent: percentage change required (0-100)';
COMMENT ON COLUMN tag_metadata.on_change_deadband_type IS 'Type of deadband: "absolute" for fixed value difference, "percent" for percentage-based difference';
COMMENT ON COLUMN tag_metadata.on_change_heartbeat_ms IS 'Force publish value after this interval (milliseconds) even if unchanged. Provides heartbeat for monitoring. NULL = never force publish';

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tag_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tag_metadata_updated_at ON tag_metadata;
CREATE TRIGGER trigger_tag_metadata_updated_at
    BEFORE UPDATE ON tag_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_tag_metadata_timestamp();

-- =====================================================
-- Background Jobs
-- =====================================================

CREATE TABLE IF NOT EXISTS jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL, -- e.g. delete_tags, purge_points
    status text NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelling | cancelled
    params jsonb, -- user-supplied payload
    progress jsonb, -- arbitrary progress object { pct, message, counts... }
    result jsonb, -- success result payload
    error text, -- error message (truncated) if failed
    cancellation_requested boolean NOT NULL DEFAULT false,
    started_at timestamptz,
    finished_at timestamptz,
    completed_at timestamptz, -- preferred field (finished_at is legacy)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    worker_id text, -- worker id that claimed the job
    attempt integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 1,
    run_at timestamptz, -- time when eligible to be picked up; null => immediately
    last_heartbeat_at timestamptz -- updated periodically while running
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs(worker_id);
CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs(status, run_at, created_at) WHERE status='queued';
CREATE INDEX IF NOT EXISTS jobs_running_idx ON jobs(status, last_heartbeat_at) WHERE status='running';

-- =====================================================
-- Charts & Dashboards
-- =====================================================

-- Chart configurations
CREATE TABLE IF NOT EXISTS chart_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    folder_id uuid,
    name text NOT NULL,
    description text,
    chart_type text NOT NULL DEFAULT 'line',
    is_system_chart boolean NOT NULL DEFAULT false,
    is_deleted boolean NOT NULL DEFAULT false,
    is_shared boolean NOT NULL DEFAULT false,
    -- Time mode fields from migration 015
    time_mode text NOT NULL DEFAULT 'fixed' CHECK (time_mode IN ('fixed', 'rolling', 'shifted')),
    time_duration bigint, -- Duration in milliseconds for rolling/shifted windows
    time_offset bigint DEFAULT 0, -- Offset in milliseconds from now for shifted mode
    live_enabled boolean NOT NULL DEFAULT false, -- Default state for Live toggle
    show_time_badge boolean NOT NULL DEFAULT true, -- Whether to display time mode badge
    -- Original time fields from migration 010
    time_from timestamptz,
    time_to timestamptz,
    -- Legacy field for backward compatibility
    time_range_ms bigint,
    options jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_configs_user ON chart_configs(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_chart_configs_system ON chart_configs(is_system_chart) WHERE is_system_chart = true AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_chart_configs_folder ON chart_configs(folder_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_chart_configs_shared ON chart_configs(is_shared) WHERE is_shared = true AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_chart_configs_updated ON chart_configs(updated_at DESC);

-- Dashboard configurations
CREATE TABLE IF NOT EXISTS dashboard_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id uuid,
    name varchar(120) NOT NULL,
    description text,
    is_shared boolean NOT NULL DEFAULT false,
    is_deleted boolean NOT NULL DEFAULT false,
    layout jsonb NOT NULL DEFAULT '{}'::jsonb,
    options jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_configs_user ON dashboard_configs(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_folder ON dashboard_configs(folder_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_shared ON dashboard_configs(is_shared) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_created ON dashboard_configs(created_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_updated ON dashboard_configs(updated_at);

-- Dashboard folders
CREATE TABLE IF NOT EXISTS dashboard_folders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    parent_folder_id uuid REFERENCES dashboard_folders(id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_folders_user ON dashboard_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_folders_parent ON dashboard_folders(parent_folder_id);

-- Chart folders (for organizing saved charts)
CREATE TABLE IF NOT EXISTS chart_folders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    parent_folder_id uuid REFERENCES chart_folders(id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_folders_user ON chart_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_chart_folders_parent ON chart_folders(parent_folder_id);

-- Flow folders (for organizing flows)
CREATE TABLE IF NOT EXISTS flow_folders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    parent_folder_id uuid REFERENCES flow_folders(id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_folders_user ON flow_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_folders_parent ON flow_folders(parent_folder_id);

-- =====================================================
-- Seed Data
-- =====================================================

-- Insert default roles
INSERT INTO roles(name) VALUES ('viewer') ON CONFLICT DO NOTHING;
INSERT INTO roles(name) VALUES ('admin') ON CONFLICT DO NOTHING;

-- Insert default admin user
INSERT INTO users(email, display_name, is_active) 
VALUES ('admin@example.com', 'Admin', true)
ON CONFLICT (email) DO NOTHING;

-- Assign admin role to admin user
INSERT INTO user_roles(user_id, role_id)
SELECT u.id, r.id 
FROM users u 
JOIN roles r ON r.name='admin' 
WHERE u.email='admin@example.com'
ON CONFLICT DO NOTHING;

-- Grant all permissions to first user (by created_at)
INSERT INTO user_permissions (user_id, feature, can_create, can_read, can_update, can_delete)
SELECT u.id, f.feature, true, true, true, true
FROM (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) u
CROSS JOIN (
    VALUES 
        ('dashboards'),
        ('connectivity.devices'),
        ('connectivity.tags'),
        ('connectivity.poll_groups'),
        ('connectivity.units'),
        ('connectivity.internal_tags'),
        ('chart_composer'),
        ('diagnostics'),
        ('diagnostic.system'),
        ('diagnostic.capacity'),
        ('diagnostic.logs'),
        ('diagnostic.network'),
        ('users'),
        ('permissions'),
        ('jobs'),
        ('logs'),
        ('flows'),
        ('configuration')
) AS f(feature)
ON CONFLICT (user_id, feature) DO NOTHING;

-- Insert comprehensive units of measure (from migration 016)
INSERT INTO units_of_measure (name, symbol, category, is_system) VALUES
-- Temperature
('Degrees Celsius', '°C', 'Temperature', true),
('Degrees Fahrenheit', '°F', 'Temperature', true),
('Kelvin', 'K', 'Temperature', true),
-- Pressure
('Pascal', 'Pa', 'Pressure', true),
('Kilopascal', 'kPa', 'Pressure', true),
('Bar', 'bar', 'Pressure', true),
('Millibar', 'mbar', 'Pressure', true),
('PSI', 'psi', 'Pressure', true),
('Atmosphere', 'atm', 'Pressure', true),
-- Flow
('Liters per second', 'L/s', 'Flow', true),
('Liters per minute', 'L/min', 'Flow', true),
('Cubic meters per hour', 'm³/h', 'Flow', true),
('Cubic feet per minute', 'CFM', 'Flow', true),
('Gallons per minute', 'GPM', 'Flow', true),
-- Level/Distance
('Millimeter', 'mm', 'Level', true),
('Centimeter', 'cm', 'Level', true),
('Meter', 'm', 'Level', true),
('Inch', 'in', 'Level', true),
('Foot', 'ft', 'Level', true),
('Percent', '%', 'Level', true),
-- Electrical
('Volt', 'V', 'Electrical', true),
('Millivolt', 'mV', 'Electrical', true),
('Ampere', 'A', 'Electrical', true),
('Milliampere', 'mA', 'Electrical', true),
('Watt', 'W', 'Electrical', true),
('Kilowatt', 'kW', 'Electrical', true),
('Megawatt', 'MW', 'Electrical', true),
('Volt-Ampere', 'VA', 'Electrical', true),
('Kilovolt-Ampere', 'kVA', 'Electrical', true),
('Ohm', 'Ω', 'Electrical', true),
('Hertz', 'Hz', 'Electrical', true),
-- Speed/Velocity
('Meters per second', 'm/s', 'Speed', true),
('Kilometers per hour', 'km/h', 'Speed', true),
('Miles per hour', 'mph', 'Speed', true),
('RPM', 'rpm', 'Speed', true),
-- Mass/Weight
('Gram', 'g', 'Mass', true),
('Kilogram', 'kg', 'Mass', true),
('Tonne', 't', 'Mass', true),
('Pound', 'lb', 'Mass', true),
('Ounce', 'oz', 'Mass', true),
-- Volume
('Milliliter', 'mL', 'Volume', true),
('Liter', 'L', 'Volume', true),
('Cubic meter', 'm³', 'Volume', true),
('Gallon', 'gal', 'Volume', true),
('Cubic foot', 'ft³', 'Volume', true),
-- Time
('Second', 's', 'Time', true),
('Minute', 'min', 'Time', true),
('Hour', 'h', 'Time', true),
-- Dimensionless
('Count', 'count', 'Dimensionless', true),
('Boolean', 'bool', 'Dimensionless', true),
('Percentage', '%', 'Dimensionless', true),
('Parts per million', 'ppm', 'Dimensionless', true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- EtherNet/IP Device & Tag Discovery Caching
-- =====================================================

-- Device discovery cache (for network scans)
CREATE TABLE IF NOT EXISTS eip_device_cache (
    host text PRIMARY KEY,
    vendor text,
    product_name text,
    product_code integer,
    serial text,
    revision_major integer,
    revision_minor integer,
    max_cip_connections integer DEFAULT 8,
    product_family text,
    discovered_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eip_device_cache_last_seen ON eip_device_cache(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_eip_device_cache_product ON eip_device_cache(product_name);

-- Tag browsing cache (for faster UI loading, 30s TTL)
CREATE TABLE IF NOT EXISTS eip_tag_cache (
    connection_id uuid REFERENCES connections(id) ON DELETE CASCADE,
    tag_path text,
    tag_name text,
    data_type text,
    data_type_name text,
    tag_type text CHECK (tag_type IN ('atomic', 'struct')),
    dimensions integer[],
    external_access text,
    program text,
    is_alias boolean DEFAULT false,
    instance_id integer,
    cached_at timestamptz DEFAULT now(),
    PRIMARY KEY (connection_id, tag_path)
);

CREATE INDEX IF NOT EXISTS idx_eip_tag_cache_conn ON eip_tag_cache(connection_id);
CREATE INDEX IF NOT EXISTS idx_eip_tag_cache_name ON eip_tag_cache(tag_name);
CREATE INDEX IF NOT EXISTS idx_eip_tag_cache_program ON eip_tag_cache(program);
CREATE INDEX IF NOT EXISTS idx_eip_tag_cache_cached_at ON eip_tag_cache(cached_at);

-- =====================================================
-- Flow Studio (Phase 1)
-- =====================================================

-- Flows (workflow definitions)
CREATE TABLE IF NOT EXISTS flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES flow_folders(id) ON DELETE SET NULL,
  deployed boolean DEFAULT false,
  shared boolean DEFAULT false,
  test_mode boolean DEFAULT false,
  test_disable_writes boolean DEFAULT false,
  test_auto_exit boolean DEFAULT false,
  test_auto_exit_minutes integer DEFAULT 5,
  execution_mode varchar(20) DEFAULT 'continuous',
  scan_rate_ms integer DEFAULT 1000,
  live_values_use_scan_rate boolean DEFAULT false,
  logs_enabled boolean DEFAULT false,
  logs_retention_days integer DEFAULT 30 CHECK (logs_retention_days > 0 AND logs_retention_days <= 365),
  save_usage_data boolean DEFAULT true,
  exposed_parameters jsonb DEFAULT '[]'::jsonb,
  resource_chart_id uuid REFERENCES chart_configs(id) ON DELETE SET NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  static_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN flows.test_mode IS 'When true, flow is temporarily deployed for testing. Manual triggers work but writes can be disabled.';
COMMENT ON COLUMN flows.test_disable_writes IS 'When true in test mode, tag-output nodes will not write values.';
COMMENT ON COLUMN flows.test_auto_exit IS 'When true in test mode, automatically exit test mode after timeout period expires.';
COMMENT ON COLUMN flows.test_auto_exit_minutes IS 'Duration in minutes before auto-exiting test mode (default: 5 minutes).';
COMMENT ON COLUMN flows.execution_mode IS 'Execution mode: continuous (default) for scan-based loops, manual for one-time execution.';
COMMENT ON COLUMN flows.scan_rate_ms IS 'Time between scan cycles in milliseconds (100-60000ms). Default: 1000ms (1 second).';
COMMENT ON COLUMN flows.live_values_use_scan_rate IS 'When true, Live Values display updates at scan rate instead of default 1 second';
COMMENT ON COLUMN flows.logs_enabled IS 'Enable persistent log storage for this flow (deployed flows only)';
COMMENT ON COLUMN flows.logs_retention_days IS 'Number of days to retain logs before automatic deletion (1-365)';
COMMENT ON COLUMN flows.save_usage_data IS 'Save resource usage metrics (CPU, memory, scan duration) as system tags for charting';
COMMENT ON COLUMN flows.exposed_parameters IS 'Array of parameter definitions exposed for runtime configuration. Each parameter maps to a node property.';
COMMENT ON COLUMN flows.resource_chart_id IS 'Reference to the system chart displaying resource monitoring metrics for this flow';

CREATE INDEX IF NOT EXISTS idx_flows_owner ON flows(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_flows_folder ON flows(folder_id);
CREATE INDEX IF NOT EXISTS idx_flows_shared ON flows(shared) WHERE shared = true;
CREATE INDEX IF NOT EXISTS idx_flows_test_mode ON flows(test_mode) WHERE test_mode = true;

-- Flow execution history
CREATE TABLE IF NOT EXISTS flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  trigger_node_id text, -- Optional: node ID that triggered execution (for auditing)
  runtime_parameters jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  node_outputs jsonb DEFAULT '{}'::jsonb,
  error_log jsonb DEFAULT '[]'::jsonb,
  execution_time_ms integer
);

COMMENT ON COLUMN flow_executions.runtime_parameters IS 'Actual parameter values provided at execution time (for parameterized flows)';

CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id_started ON flow_executions(flow_id, started_at DESC);

-- Flow execution logs
CREATE TABLE IF NOT EXISTS flow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES flow_executions(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_id TEXT,
  log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE flow_execution_logs IS 'Stores detailed logs from flow executions for debugging and monitoring';
COMMENT ON COLUMN flow_execution_logs.execution_id IS 'Reference to the execution that generated this log (NULL for continuous execution mode)';
COMMENT ON COLUMN flow_execution_logs.flow_id IS 'Flow that generated this log (denormalized for efficient cleanup)';
COMMENT ON COLUMN flow_execution_logs.node_id IS 'Node that generated this log, null for system logs';
COMMENT ON COLUMN flow_execution_logs.log_level IS 'Severity level: debug, info, warn, error';
COMMENT ON COLUMN flow_execution_logs.message IS 'Log message text';
COMMENT ON COLUMN flow_execution_logs.timestamp IS 'When the log was generated during execution';
COMMENT ON COLUMN flow_execution_logs.metadata IS 'Additional context as JSON (e.g., error stack, node data)';

CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_execution ON flow_execution_logs(execution_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_flow ON flow_execution_logs(flow_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_level ON flow_execution_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_created_cleanup ON flow_execution_logs(flow_id, created_at);

-- Flow sessions (continuous execution tracking)
-- Flow Sessions
-- Stores metadata about flow execution sessions (no time-series metrics)
-- All real-time metrics are:
-- 1. Calculated in-memory by ScanExecutor
-- 2. Exposed via /api/flows/resources/active from session manager
-- 3. Saved to TimescaleDB system_metrics table for historical analysis
CREATE TABLE IF NOT EXISTS flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL CHECK (status IN ('active', 'stopped', 'error', 'stalled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  error_message text,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow ON flow_sessions(flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_status ON flow_sessions(status, started_at DESC);

-- Tag-Flow dependencies (cross-reference)
CREATE TABLE IF NOT EXISTS flow_tag_dependencies (
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  tag_id integer REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  node_id text NOT NULL,
  dependency_type text NOT NULL CHECK (dependency_type IN ('input', 'output')),
  PRIMARY KEY (flow_id, tag_id, node_id, dependency_type)
);

CREATE INDEX IF NOT EXISTS idx_flow_tag_deps_tag ON flow_tag_dependencies(tag_id);
CREATE INDEX IF NOT EXISTS idx_flow_tag_deps_flow ON flow_tag_dependencies(flow_id);

-- Extend driver_type enum for internal tags
DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE tag_metadata DROP CONSTRAINT IF EXISTS tag_metadata_driver_type_check;
  
  -- Add new constraint with INTERNAL and MQTT
  ALTER TABLE tag_metadata ADD CONSTRAINT tag_metadata_driver_type_check 
    CHECK (driver_type IN ('EIP', 'OPCUA', 'S7', 'MQTT', 'SYSTEM', 'INTERNAL'));
END$$;

-- =====================================================
-- Node Libraries (Flow Studio Phase 2)
-- =====================================================

-- Installed node libraries (imported/uploaded packages)
CREATE TABLE IF NOT EXISTS node_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id text UNIQUE NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  enabled boolean DEFAULT true,
  installed_at timestamptz NOT NULL DEFAULT now(),
  installed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  last_loaded_at timestamptz,
  load_errors text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE node_libraries IS 'Tracks installed node libraries for Flow Studio';
COMMENT ON COLUMN node_libraries.library_id IS 'Unique identifier from manifest (e.g., "plc", "custom-nodes")';
COMMENT ON COLUMN node_libraries.name IS 'Human-readable library name';
COMMENT ON COLUMN node_libraries.version IS 'Semantic version string';
COMMENT ON COLUMN node_libraries.manifest IS 'Complete manifest.json content including nodeTypes, requirements, etc.';
COMMENT ON COLUMN node_libraries.enabled IS 'Whether library is active (disabled libraries do not load)';
COMMENT ON COLUMN node_libraries.installed_by IS 'User who uploaded/installed the library';
COMMENT ON COLUMN node_libraries.last_loaded_at IS 'Last successful load time';
COMMENT ON COLUMN node_libraries.load_errors IS 'Error messages from most recent load attempt';

CREATE INDEX IF NOT EXISTS idx_node_libraries_enabled ON node_libraries(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_node_libraries_installed_at ON node_libraries(installed_at DESC);

-- Flow library dependencies - track which flows use nodes from which libraries
CREATE TABLE IF NOT EXISTS flow_library_dependencies (
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  library_id text NOT NULL,
  node_id text NOT NULL,
  node_type text NOT NULL,
  PRIMARY KEY (flow_id, library_id, node_id)
);

-- Dynamic category/section registration
-- Tracks categories and sections that should appear in the node palette
-- Built from core nodes + library nodes at runtime
CREATE TABLE IF NOT EXISTS node_categories (
  category_key text PRIMARY KEY,
  display_name text NOT NULL,
  icon text NOT NULL DEFAULT '📦',
  description text,
  display_order integer NOT NULL DEFAULT 99,
  is_core boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS node_sections (
  category_key text NOT NULL,
  section_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 99,
  is_core boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_key, section_key),
  FOREIGN KEY (category_key) REFERENCES node_categories(category_key) ON DELETE CASCADE
);

COMMENT ON TABLE node_categories IS 'Dynamic node palette categories - built from core + libraries';
COMMENT ON TABLE node_sections IS 'Dynamic node palette sections within categories';
COMMENT ON COLUMN node_categories.is_core IS 'True for built-in categories, false for library-added';
COMMENT ON COLUMN node_sections.is_core IS 'True for built-in sections, false for library-added';

CREATE INDEX IF NOT EXISTS idx_node_categories_order ON node_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_node_sections_order ON node_sections(category_key, display_order);

COMMENT ON TABLE flow_library_dependencies IS 'Tracks which flows use nodes from external libraries';
COMMENT ON COLUMN flow_library_dependencies.library_id IS 'Library identifier (e.g., "test-library")';
COMMENT ON COLUMN flow_library_dependencies.node_id IS 'Node instance ID in the flow';
COMMENT ON COLUMN flow_library_dependencies.node_type IS 'Full node type (e.g., "test-library:hello-world")';

CREATE INDEX IF NOT EXISTS idx_flow_library_deps_library ON flow_library_dependencies(library_id);
CREATE INDEX IF NOT EXISTS idx_flow_library_deps_flow ON flow_library_dependencies(flow_id);

-- =====================================================
-- End of Schema Migration
-- =====================================================
