-- =====================================================
-- DataForeman Complete Database Schema
-- Initial Installation Migration
-- =====================================================
-- This migration creates the complete database schema for a fresh installation.
-- It combines all incremental migrations into a single, efficient schema definition.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- TimescaleDB extension (optional, only if available)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    RAISE NOTICE 'TimescaleDB extension not available, skipping';
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
(9,  'Hourly',        60000, 'Hourly statistics (1min)'),
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
    options jsonb NOT NULL DEFAULT '{}'::jsonb, -- Added in migration 017
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
-- End of Migration
-- =====================================================
