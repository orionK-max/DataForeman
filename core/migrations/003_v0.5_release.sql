-- =====================================================
-- Release v0.5.0 Migration
-- Consolidates migrations 003–011 from develop cycle
-- =====================================================

-- =====================================================
-- 1. Update constraints on existing tables
-- =====================================================

-- Add 'mqtt' to connections.type allowed values
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_type_check;
ALTER TABLE connections ADD CONSTRAINT connections_type_check
  CHECK (type IN ('opcua-client', 'opcua-server', 's7', 'eip', 'system', 'mqtt'));

-- Add 'MQTT' to tag_metadata.driver_type allowed values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tag_metadata
    WHERE driver_type NOT IN ('EIP', 'OPCUA', 'S7', 'SYSTEM', 'INTERNAL', 'MQTT')
  ) THEN
    RAISE NOTICE 'Found existing driver_type values not in new constraint. Leaving constraint as-is.';
  ELSE
    ALTER TABLE tag_metadata DROP CONSTRAINT IF EXISTS tag_metadata_driver_type_check;
    ALTER TABLE tag_metadata ADD CONSTRAINT tag_metadata_driver_type_check
      CHECK (driver_type IN ('EIP', 'OPCUA', 'S7', 'SYSTEM', 'INTERNAL', 'MQTT'));
    RAISE NOTICE 'Updated tag_metadata driver_type constraint to include MQTT';
  END IF;
END $$;

-- Allow reusing connection names after soft-delete (unique only on active rows)
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_name_active
  ON connections(name)
  WHERE deleted_at IS NULL;

-- =====================================================
-- 2. tag_metadata cleanup
-- =====================================================

-- Hard-delete any rows that were already soft-deleted
-- Cascades handle: flow_tag_dependencies, mqtt_publisher_mappings,
-- sparkplug_metric_mappings, mqtt_field_mappings (CASCADE),
-- mqtt_publisher_tag_refs (SET NULL).
DELETE FROM tag_metadata WHERE status = 'deleted';

-- Drop legacy soft-delete index and column
DROP INDEX IF EXISTS idx_tag_metadata_deleted;
ALTER TABLE tag_metadata DROP COLUMN IF EXISTS is_deleted;

-- Rename duplicate tag names before adding uniqueness constraint
DO $$
DECLARE
  rec      RECORD;
  dup_id   INTEGER;
  suffix   INTEGER;
  new_name TEXT;
BEGIN
  FOR rec IN
    SELECT connection_id, tag_name, array_agg(tag_id ORDER BY tag_id) AS ids
    FROM tag_metadata
    WHERE tag_name IS NOT NULL
    GROUP BY connection_id, tag_name
    HAVING COUNT(*) > 1
  LOOP
    FOR i IN 2..array_length(rec.ids, 1) LOOP
      dup_id := rec.ids[i];
      suffix := 1;
      LOOP
        suffix := suffix + 1;
        new_name := rec.tag_name || ' (' || suffix || ')';
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM tag_metadata
          WHERE connection_id = rec.connection_id
            AND tag_name = new_name
        );
      END LOOP;
      UPDATE tag_metadata SET tag_name = new_name WHERE tag_id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- Enforce unique tag names per connection (NULLs are still allowed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_name_per_connection
  ON tag_metadata (connection_id, tag_name)
  WHERE tag_name IS NOT NULL;

-- =====================================================
-- 3. MQTT Connection configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_connections (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     uuid        NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  broker_type       text        CHECK (broker_type IN ('internal', 'external')), -- Deprecated: use broker_host='localhost' for internal
  broker_host       text        NOT NULL,
  broker_port       integer     NOT NULL,
  protocol          text        NOT NULL CHECK (protocol IN ('mqtt', 'sparkplug')),
  use_tls           boolean     NOT NULL DEFAULT false,
  tls_ca_cert       text,
  tls_client_cert   text,
  tls_client_key    text,
  tls_verify_cert   boolean     NOT NULL DEFAULT true,
  username          text,
  password          text,       -- Should be encrypted at application level
  client_id_prefix  text        DEFAULT 'dataforeman',
  keep_alive        integer     DEFAULT 60,
  clean_session     boolean     NOT NULL DEFAULT true,
  reconnect_period  integer     DEFAULT 5000,
  connect_timeout   integer     DEFAULT 30000,
  is_system         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mqtt_connection UNIQUE(connection_id)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_connections_connection ON mqtt_connections(connection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_connections_protocol   ON mqtt_connections(protocol);
CREATE INDEX IF NOT EXISTS idx_mqtt_connections_system
  ON mqtt_connections(is_system)
  WHERE is_system = true;

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

-- Protect system connections from modification/deletion
CREATE OR REPLACE FUNCTION prevent_system_connection_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'Cannot delete system connection';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mqtt_connections_no_delete_system ON mqtt_connections;
CREATE TRIGGER mqtt_connections_no_delete_system
  BEFORE DELETE ON mqtt_connections
  FOR EACH ROW EXECUTE FUNCTION prevent_system_connection_delete();

CREATE OR REPLACE FUNCTION prevent_system_connection_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true AND NEW.is_system = true THEN
    IF (
      OLD.broker_host       IS DISTINCT FROM NEW.broker_host       OR
      OLD.broker_port       IS DISTINCT FROM NEW.broker_port       OR
      OLD.protocol          IS DISTINCT FROM NEW.protocol          OR
      OLD.client_id_prefix  IS DISTINCT FROM NEW.client_id_prefix  OR
      OLD.connection_id     IS DISTINCT FROM NEW.connection_id
    ) THEN
      RAISE EXCEPTION 'Cannot modify critical system connection properties';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mqtt_connections_no_update_system ON mqtt_connections;
CREATE TRIGGER mqtt_connections_no_update_system
  BEFORE UPDATE ON mqtt_connections
  FOR EACH ROW EXECUTE FUNCTION prevent_system_connection_update();

-- =====================================================
-- 4. MQTT Subscriptions
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_subscriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id       uuid        NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  topic               text        NOT NULL,
  qos                 integer     NOT NULL DEFAULT 0 CHECK (qos IN (0, 1, 2)),
  tag_prefix          text,
  payload_format      text        NOT NULL DEFAULT 'json' CHECK (payload_format IN ('json', 'raw', 'sparkplug')),
  value_path          text,
  timestamp_path      text,
  quality_path        text,
  enabled             boolean     NOT NULL DEFAULT true,
  message_buffer_size integer     DEFAULT 100,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mqtt_sub_topic UNIQUE(connection_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_connection ON mqtt_subscriptions(connection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_enabled   ON mqtt_subscriptions(connection_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_topic     ON mqtt_subscriptions(topic);

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
-- 5. MQTT Message Buffer
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_message_buffer (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES mqtt_subscriptions(id) ON DELETE CASCADE,
  topic           text        NOT NULL,
  payload         jsonb       NOT NULL,
  qos             integer     NOT NULL DEFAULT 0,
  retained        boolean     NOT NULL DEFAULT false,
  received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_subscription ON mqtt_message_buffer(subscription_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_topic        ON mqtt_message_buffer(topic);
CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_received_at  ON mqtt_message_buffer(received_at);

-- =====================================================
-- 6. MQTT Field Mappings
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_field_mappings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES mqtt_subscriptions(id) ON DELETE CASCADE,
  topic           text        NOT NULL,
  field_path      text        NOT NULL,
  tag_name        text        NOT NULL,
  data_type       text        NOT NULL CHECK (data_type IN ('real', 'int', 'text', 'bool', 'json')),
  tag_id          integer     REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  enabled         boolean     DEFAULT true,
  type_strictness text        DEFAULT 'coerce' CHECK (type_strictness IN ('strict', 'coerce')),
  on_failure      text        DEFAULT 'skip'   CHECK (on_failure IN ('skip', 'default')),
  default_value   text,
  value_expression text,
  created_at      timestamptz DEFAULT NOW(),
  updated_at      timestamptz DEFAULT NOW(),
  UNIQUE(subscription_id, tag_name),
  UNIQUE(tag_id)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_field_mappings_sub ON mqtt_field_mappings(subscription_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_field_mappings_tag ON mqtt_field_mappings(tag_id);

-- =====================================================
-- 7. MQTT Publishers
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_publishers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id    uuid        NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  publish_mode     text        NOT NULL CHECK (publish_mode IN ('on_change', 'interval', 'both')),
  interval_ms      integer,
  payload_format   text        NOT NULL DEFAULT 'json' CHECK (payload_format IN ('json', 'raw', 'sparkplug')),
  payload_template text,
  mqtt_topic       text,
  qos              integer     NOT NULL DEFAULT 0 CHECK (qos IN (0, 1, 2)),
  retain           boolean     NOT NULL DEFAULT false,
  min_interval_ms  integer     NOT NULL DEFAULT 500,
  enabled          boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mqtt_publisher_interval CHECK (
    (publish_mode = 'on_change' AND interval_ms IS NULL) OR
    (publish_mode = 'interval'  AND interval_ms IS NOT NULL) OR
    (publish_mode = 'both'      AND interval_ms IS NOT NULL)
  ),
  CONSTRAINT uq_mqtt_publisher_name UNIQUE(connection_id, name)
);

COMMENT ON COLUMN mqtt_publishers.payload_template IS
  'Payload body with {{tag_id:N}} tokens substituted at publish time. Display form uses {{ConnectionName|TagName}}.';

CREATE INDEX IF NOT EXISTS idx_mqtt_publishers_connection ON mqtt_publishers(connection_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_publishers_enabled    ON mqtt_publishers(connection_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_mqtt_publishers_mode       ON mqtt_publishers(publish_mode);

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
-- 8. MQTT Publisher Mappings (legacy, kept for reference)
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_publisher_mappings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id     uuid        NOT NULL REFERENCES mqtt_publishers(id) ON DELETE CASCADE,
  tag_id           integer     NOT NULL REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  mqtt_topic       text        NOT NULL,
  retain           boolean     NOT NULL DEFAULT false,
  qos              integer     NOT NULL DEFAULT 0 CHECK (qos IN (0, 1, 2)),
  value_transform  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mqtt_pub_mapping UNIQUE(publisher_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_pub_mappings_publisher ON mqtt_publisher_mappings(publisher_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_pub_mappings_tag       ON mqtt_publisher_mappings(tag_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_pub_mappings_topic     ON mqtt_publisher_mappings(mqtt_topic);

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
-- 9. MQTT Publisher Tag References
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_publisher_tag_refs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid        NOT NULL REFERENCES mqtt_publishers(id) ON DELETE CASCADE,
  token_key    text        NOT NULL,
  tag_id       integer     REFERENCES tag_metadata(tag_id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(publisher_id, token_key)
);

COMMENT ON COLUMN mqtt_publisher_tag_refs.token_key IS
  'Stored as "tag_id:N" matching tokens {{tag_id:N}} in payload_template.';

CREATE INDEX IF NOT EXISTS idx_mqtt_pub_tag_refs_publisher ON mqtt_publisher_tag_refs(publisher_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_pub_tag_refs_tag       ON mqtt_publisher_tag_refs(tag_id);

-- =====================================================
-- 10. Sparkplug B Configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS sparkplug_configs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id     uuid        NOT NULL REFERENCES mqtt_publishers(id) ON DELETE CASCADE,
  group_id         text        NOT NULL,
  edge_node_id     text        NOT NULL,
  device_id        text,
  auto_birth       boolean     NOT NULL DEFAULT true,
  birth_debounce_ms integer    DEFAULT 1000,
  death_timeout_ms  integer    DEFAULT 5000,
  seq_num          integer     NOT NULL DEFAULT 0,
  last_birth_at    timestamptz,
  last_death_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sparkplug_config UNIQUE(publisher_id)
);

CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_publisher ON sparkplug_configs(publisher_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_group     ON sparkplug_configs(group_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_node      ON sparkplug_configs(group_id, edge_node_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_configs_device    ON sparkplug_configs(group_id, edge_node_id, device_id);

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
-- 11. Sparkplug Metric Mappings
-- =====================================================

CREATE TABLE IF NOT EXISTS sparkplug_metric_mappings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sparkplug_config_id uuid        NOT NULL REFERENCES sparkplug_configs(id) ON DELETE CASCADE,
  tag_id              integer     NOT NULL REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  metric_name         text        NOT NULL,
  data_type           text,
  engineering_units   text,
  include_in_birth    boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sparkplug_metric UNIQUE(sparkplug_config_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_sparkplug_metrics_config ON sparkplug_metric_mappings(sparkplug_config_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_metrics_tag    ON sparkplug_metric_mappings(tag_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_metrics_name   ON sparkplug_metric_mappings(metric_name);

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
-- 12. Sparkplug Discovery Cache
-- =====================================================

CREATE TABLE IF NOT EXISTS sparkplug_discovery (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid        NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  group_id      text        NOT NULL,
  edge_node_id  text        NOT NULL,
  device_id     text,
  birth_payload jsonb       NOT NULL,
  metrics       jsonb       NOT NULL,
  seq_num       integer     NOT NULL DEFAULT 0,
  is_online     boolean     NOT NULL DEFAULT true,
  last_birth_at timestamptz NOT NULL DEFAULT now(),
  last_death_at timestamptz,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sparkplug_discovery UNIQUE(connection_id, group_id, edge_node_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_connection ON sparkplug_discovery(connection_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_group      ON sparkplug_discovery(group_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_node       ON sparkplug_discovery(group_id, edge_node_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_device     ON sparkplug_discovery(group_id, edge_node_id, device_id);
CREATE INDEX IF NOT EXISTS idx_sparkplug_discovery_online     ON sparkplug_discovery(connection_id, is_online) WHERE is_online = true;

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

-- =====================================================
-- 13. MQTT Credential Groups (device authentication)
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_credential_groups (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  username         TEXT        NOT NULL UNIQUE,
  credential_hash  TEXT        NOT NULL,
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  timeout_seconds  INTEGER     NOT NULL DEFAULT 600,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_credential_groups_username
  ON mqtt_credential_groups(username)
  WHERE enabled = true;

CREATE OR REPLACE FUNCTION update_mqtt_credential_groups_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mqtt_credential_groups_updated_at
  BEFORE UPDATE ON mqtt_credential_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_mqtt_credential_groups_timestamp();

-- =====================================================
-- 14. MQTT Devices (auto-registered via broker client_id)
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_devices (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT        UNIQUE NOT NULL,
  credential_group_id UUID        NOT NULL REFERENCES mqtt_credential_groups(id) ON DELETE CASCADE,
  display_name        TEXT,
  enabled             BOOLEAN     NOT NULL DEFAULT true,
  first_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_devices_client_id ON mqtt_devices(client_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_devices_group     ON mqtt_devices(credential_group_id);

CREATE OR REPLACE FUNCTION update_mqtt_devices_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mqtt_devices_updated_at
  BEFORE UPDATE ON mqtt_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_mqtt_devices_timestamp();

-- =====================================================
-- 15. MQTT Device Topics
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_device_topics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  uuid        NOT NULL REFERENCES mqtt_devices(id) ON DELETE CASCADE,
  topic      TEXT        NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_device_topics_device ON mqtt_device_topics(device_id);

-- =====================================================
-- 16. Seed data
-- =====================================================

-- Global MQTT authentication toggle (defaults to disabled)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('mqtt_require_auth', 'false'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;
