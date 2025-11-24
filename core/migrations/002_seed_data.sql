-- =====================================================
-- DataForeman Seed Data
-- Seed Migration for Initial Installation
-- =====================================================

-- =====================================================
-- System User for System Charts
-- =====================================================

-- Create the system user (used for system-owned charts and resources)
INSERT INTO users (id, email, display_name, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@dataforeman.local',
  'System',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- System Connection for System Charts
-- =====================================================

-- Insert the System connection for monitoring
INSERT INTO connections (name, type, enabled, is_system_connection)
VALUES ('System', 'system', true, true)
ON CONFLICT (name) DO NOTHING;

-- Create system metric tags
INSERT INTO tag_metadata (
  connection_id, 
  driver_type, 
  tag_path, 
  tag_name, 
  data_type, 
  is_subscribed, 
  status,
  metadata
) 
SELECT 
  c.id,
  'SYSTEM',
  metric.tag_path,
  metric.tag_name,
  'REAL',
  true,
  'active',
  '{"source": "system_metrics"}'::jsonb
FROM connections c
CROSS JOIN (VALUES
  ('cpu_load1', 'CPU Load (1min)'),
  ('cpu_cap', 'CPU Capacity'),
  ('cpu_pct', 'CPU Usage %'),
  ('cpu_host_pct', 'CPU Host %'),
  ('mem_used_bytes', 'Memory Used (bytes)'),
  ('mem_limit_bytes', 'Memory Limit (bytes)'),
  ('mem_pct', 'Memory Usage %'),
  ('disk_used_bytes', 'Disk Used (bytes)'),
  ('disk_size_bytes', 'Disk Size (bytes)'),
  ('disk_pct', 'Disk Usage %'),
  ('net_rx_bps', 'Network RX (bps)'),
  ('net_tx_bps', 'Network TX (bps)'),
  ('last_flush_count', 'Last Flush Count'),
  ('last_flush_ms', 'Last Flush Time (ms)'),
  ('connectivity_groups', 'Connectivity Groups'),
  ('worst_eff_ms', 'Worst Efficiency (ms)'),
  ('worst_target_ms', 'Worst Target (ms)'),
  ('worst_eff_ratio', 'Worst Efficiency Ratio'),
  ('total_lock_wait_ms', 'Total Lock Wait (ms)')
) AS metric(tag_path, tag_name)
WHERE c.name = 'System'
ON CONFLICT (connection_id, tag_path, driver_type) DO UPDATE
SET 
  tag_name = EXCLUDED.tag_name,
  is_subscribed = true,
  status = 'active',
  updated_at = now();

-- =====================================================
-- System Charts
-- =====================================================
-- Note: System charts are created programmatically by the application
-- and do not need to be seeded via migration

-- =====================================================
-- Flow Studio Tables (Phase 1 - v0.4)
-- =====================================================

-- Flows (workflow definitions)
CREATE TABLE IF NOT EXISTS flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  folder_id uuid,
  deployed boolean DEFAULT false,
  shared boolean DEFAULT false,
  test_mode boolean DEFAULT false,
  test_disable_writes boolean DEFAULT false,
  test_auto_exit boolean DEFAULT false,
  test_auto_exit_minutes integer DEFAULT 5,
  execution_mode varchar(20) DEFAULT 'continuous',
  scan_rate_ms integer DEFAULT 1000,
  logs_enabled boolean DEFAULT false,
  logs_retention_days integer DEFAULT 30,
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

CREATE INDEX IF NOT EXISTS idx_flows_owner ON flows(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_flows_shared ON flows(shared) WHERE shared = true;
CREATE INDEX IF NOT EXISTS idx_flows_test_mode ON flows(test_mode) WHERE test_mode = true;

-- Flow execution history
CREATE TABLE IF NOT EXISTS flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  trigger_node_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  node_outputs jsonb DEFAULT '{}'::jsonb,
  error_log jsonb DEFAULT '[]'::jsonb,
  execution_time_ms integer
);

CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id_started ON flow_executions(flow_id, started_at DESC);

-- Flow sessions (continuous execution tracking)
CREATE TABLE IF NOT EXISTS flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL CHECK (status IN ('active', 'stopped', 'error', 'stalled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  last_scan_at timestamptz,
  scan_count bigint DEFAULT 0 NOT NULL,
  error_message text,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow ON flow_sessions(flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_status ON flow_sessions(status, last_scan_at);

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

-- Note: Internal tags are system-wide shared resources (like PLC tags)
-- - All internal tags visible to all users with connectivity.tags:read permission
-- - No individual ownership (unlike flows which have owner_user_id)
-- - Multiple flows can write to the same internal tag
-- - Access controlled by feature permissions, not per-tag ownership
-- - Tag metadata shows which flows write to each tag via flow_tag_dependencies table
--
-- To query internal tags:
--   SELECT * FROM tag_metadata WHERE driver_type = 'INTERNAL'
-- To see which flows write to a tag:
--   SELECT f.* FROM flows f
--   JOIN flow_tag_dependencies ftd ON ftd.flow_id = f.id
--   WHERE ftd.tag_id = $tag_id AND ftd.dependency_type = 'output'

-- Note: Flow permissions are managed through the user_permissions table
-- Admins can grant users CRUD access to the 'flows' feature through the UI
-- No default permissions are seeded here - admin assigns them as needed

-- =====================================================
-- End of Seed Data
-- =====================================================
