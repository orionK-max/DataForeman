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
-- End of Seed Data
-- =====================================================
