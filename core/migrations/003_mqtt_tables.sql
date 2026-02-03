-- =====================================================
-- MQTT/Sparkplug B Support
-- Migration 003 - MQTT Tables
-- =====================================================

-- Add MQTT connection type to connections table CHECK constraint
-- First, remove the old constraint
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_type_check;
-- Then add the new one with MQTT included
ALTER TABLE connections ADD CONSTRAINT connections_type_check 
  CHECK (type IN ('opcua-client', 'opcua-server', 's7', 'eip', 'system', 'mqtt'));

-- Add MQTT to driver_type CHECK constraint in tag_metadata
-- First check if there are any existing values that would violate the new constraint
DO $$
BEGIN
  -- Check if there are any driver_types not in the new list
  IF EXISTS (
    SELECT 1 FROM tag_metadata 
    WHERE driver_type NOT IN ('EIP', 'OPCUA', 'S7', 'SYSTEM', 'INTERNAL', 'MQTT')
  ) THEN
    RAISE NOTICE 'Found existing driver_type values not in new constraint. Leaving constraint as-is.';
  ELSE
    -- Safe to update the constraint
    ALTER TABLE tag_metadata DROP CONSTRAINT IF EXISTS tag_metadata_driver_type_check;
    ALTER TABLE tag_metadata ADD CONSTRAINT tag_metadata_driver_type_check 
      CHECK (driver_type IN ('EIP', 'OPCUA', 'S7', 'SYSTEM', 'INTERNAL', 'MQTT'));
    RAISE NOTICE 'Updated tag_metadata driver_type constraint to include MQTT';
  END IF;
END $$;

-- =====================================================
-- MQTT Connections Configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  broker_type text CHECK (broker_type IN ('internal', 'external')), -- Deprecated: use broker_host='localhost' for internal
  broker_host text NOT NULL,
  broker_port integer NOT NULL,
  protocol text NOT NULL CHECK (protocol IN ('mqtt', 'sparkplug')),
  use_tls boolean NOT NULL DEFAULT false,
  tls_ca_cert text,
  tls_client_cert text,
  tls_client_key text,
  tls_verify_cert boolean NOT NULL DEFAULT true,
  username text,
  password text, -- Should be encrypted at application level
  client_id_prefix text DEFAULT 'dataforeman',
  keep_alive integer DEFAULT 60,
  clean_session boolean NOT NULL DEFAULT true,
  reconnect_period integer DEFAULT 5000,
  connect_timeout integer DEFAULT 30000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mqtt_connection UNIQUE(connection_id)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_connections_connection ON mqtt_connections(connection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_connections_protocol ON mqtt_connections(protocol);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_mqtt_connections_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mqtt_connections_updated_at
    BEFORE UPDATE ON mqtt_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_mqtt_connections_timestamp();

-- =====================================================
-- MQTT Subscriptions
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  topic text NOT NULL,
  qos integer NOT NULL DEFAULT 0 CHECK (qos IN (0, 1, 2)),
  tag_prefix text,
  payload_format text NOT NULL DEFAULT 'json' CHECK (payload_format IN ('json', 'raw', 'sparkplug')),
  value_path text, -- JSON path for extracting value from JSON payload (e.g., "$.temperature")
  timestamp_path text, -- JSON path for timestamp (optional)
  quality_path text, -- JSON path for quality indicator (optional)
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mqtt_sub_topic UNIQUE(connection_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_connection ON mqtt_subscriptions(connection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_enabled ON mqtt_subscriptions(connection_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_topic ON mqtt_subscriptions(topic);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_mqtt_subscriptions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mqtt_subscriptions_updated_at
    BEFORE UPDATE ON mqtt_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_mqtt_subscriptions_timestamp();

-- =====================================================
-- MQTT Publishers
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  name text NOT NULL,
  publish_mode text NOT NULL CHECK (publish_mode IN ('on_change', 'interval', 'both')),
  interval_ms integer,
  payload_format text NOT NULL DEFAULT 'json' CHECK (payload_format IN ('json', 'raw', 'sparkplug')),
  payload_template text, -- Template for formatting payload (e.g., '{"value": {{value}}, "timestamp": {{timestamp}}}')
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mqtt_publisher_interval CHECK (
    (publish_mode = 'on_change' AND interval_ms IS NULL) OR
    (publish_mode = 'interval' AND interval_ms IS NOT NULL) OR
    (publish_mode = 'both' AND interval_ms IS NOT NULL)
  ),
  CONSTRAINT uq_mqtt_publisher_name UNIQUE(connection_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_publishers_connection ON mqtt_publishers(connection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_publishers_enabled ON mqtt_publishers(connection_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_mqtt_publishers_mode ON mqtt_publishers(publish_mode);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_mqtt_publishers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mqtt_publishers_updated_at
    BEFORE UPDATE ON mqtt_publishers
    FOR EACH ROW
    EXECUTE FUNCTION update_mqtt_publishers_timestamp();

-- =====================================================
-- MQTT Publisher Mappings
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_publisher_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES mqtt_publishers(id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  mqtt_topic text NOT NULL,
  retain boolean NOT NULL DEFAULT false,
  qos integer NOT NULL DEFAULT 0 CHECK (qos IN (0, 1, 2)),
  value_transform text, -- Optional JavaScript expression for value transformation
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mqtt_pub_mapping UNIQUE(publisher_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_pub_mappings_publisher ON mqtt_publisher_mappings(publisher_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_pub_mappings_tag ON mqtt_publisher_mappings(tag_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_pub_mappings_topic ON mqtt_publisher_mappings(mqtt_topic);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_mqtt_publisher_mappings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mqtt_publisher_mappings_updated_at
    BEFORE UPDATE ON mqtt_publisher_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_mqtt_publisher_mappings_timestamp();

-- =====================================================
-- Sparkplug B Configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS sparkplug_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES mqtt_publishers(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  edge_node_id text NOT NULL,
  device_id text, -- NULL for node-level metrics
  auto_birth boolean NOT NULL DEFAULT true,
  birth_debounce_ms integer DEFAULT 1000,
  death_timeout_ms integer DEFAULT 5000,
  seq_num integer NOT NULL DEFAULT 0,
  last_birth_at timestamptz,
  last_death_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sparkplug_config UNIQUE(publisher_id)
);

CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_publisher ON sparkplug_configs(publisher_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_group ON sparkplug_configs(group_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_node ON sparkplug_configs(group_id, edge_node_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_device ON sparkplug_configs(group_id, edge_node_id, device_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_sparkplug_configs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sparkplug_configs_updated_at
    BEFORE UPDATE ON sparkplug_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_sparkplug_configs_timestamp();

-- =====================================================
-- Sparkplug Metric Mappings
-- =====================================================

CREATE TABLE IF NOT EXISTS sparkplug_metric_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sparkplug_config_id uuid NOT NULL REFERENCES sparkplug_configs(id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  data_type text, -- Sparkplug data type (Int8, Int16, Int32, Int64, UInt8, UInt16, UInt32, UInt64, Float, Double, Boolean, String, DateTime, Text)
  engineering_units text,
  include_in_birth boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sparkplug_metric UNIQUE(sparkplug_config_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_sparkplug_metrics_config ON sparkplug_metric_mappings(sparkplug_config_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_metrics_tag ON sparkplug_metric_mappings(tag_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_metrics_name ON sparkplug_metric_mappings(metric_name);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_sparkplug_metric_mappings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sparkplug_metric_mappings_updated_at
    BEFORE UPDATE ON sparkplug_metric_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_sparkplug_metric_mappings_timestamp();

-- =====================================================
-- Sparkplug Discovery Cache
-- =====================================================
-- Stores Birth certificate information for discovered Sparkplug nodes/devices

CREATE TABLE IF NOT EXISTS sparkplug_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  edge_node_id text NOT NULL,
  device_id text,
  birth_payload jsonb NOT NULL,
  metrics jsonb NOT NULL, -- Array of metric definitions from Birth certificate
  seq_num integer NOT NULL DEFAULT 0,
  is_online boolean NOT NULL DEFAULT true,
  last_birth_at timestamptz NOT NULL DEFAULT now(),
  last_death_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sparkplug_discovery UNIQUE(connection_id, group_id, edge_node_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_connection ON sparkplug_discovery(connection_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_group ON sparkplug_discovery(group_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_node ON sparkplug_discovery(group_id, edge_node_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_device ON sparkplug_discovery(group_id, edge_node_id, device_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_online ON sparkplug_discovery(connection_id, is_online) WHERE is_online = true;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_sparkplug_discovery_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sparkplug_discovery_updated_at
    BEFORE UPDATE ON sparkplug_discovery
    FOR EACH ROW
    EXECUTE FUNCTION update_sparkplug_discovery_timestamp();
