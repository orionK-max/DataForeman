-- =====================================================
-- MQTT Device Status + System Connections
-- Migration 005 - Consolidated
-- =====================================================

-- This migration consolidates the prior development migrations:
-- 005_mqtt_system_connections.sql
-- 006_mqtt_device_timeout.sql
-- 007_mqtt_subscription_device_link.sql
-- 008_mqtt_buffer_device_id.sql
-- 009_connections_name_unique_active.sql

-- =====================================================
-- System connection support on mqtt_connections
-- =====================================================

ALTER TABLE mqtt_connections
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mqtt_connections_system
  ON mqtt_connections(is_system)
  WHERE is_system = true;

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
    -- Only allow updating these fields for system connections: username, password, enabled
    IF (
      OLD.broker_host IS DISTINCT FROM NEW.broker_host OR
      OLD.broker_port IS DISTINCT FROM NEW.broker_port OR
      OLD.protocol IS DISTINCT FROM NEW.protocol OR
      OLD.client_id_prefix IS DISTINCT FROM NEW.client_id_prefix OR
      OLD.connection_id IS DISTINCT FROM NEW.connection_id
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
-- Device credentials (MVP)
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_device_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL UNIQUE,
  username text UNIQUE NOT NULL,
  credential_hash text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_device_creds_username
  ON mqtt_device_credentials(username)
  WHERE enabled = true;

CREATE OR REPLACE FUNCTION update_mqtt_device_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mqtt_device_credentials_updated_at ON mqtt_device_credentials;
CREATE TRIGGER trigger_mqtt_device_credentials_updated_at
  BEFORE UPDATE ON mqtt_device_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_mqtt_device_credentials_timestamp();

-- Global setting for MQTT authentication (jsonb)
INSERT INTO system_settings (key, value, updated_at)
VALUES (
  'mqtt_require_auth',
  'false'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- Device timeout configuration
-- =====================================================

ALTER TABLE mqtt_device_credentials
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 600;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mqtt_device_timeout_check'
  ) THEN
    ALTER TABLE mqtt_device_credentials
      ADD CONSTRAINT mqtt_device_timeout_check
      CHECK (timeout_seconds > 0 AND timeout_seconds <= 86400); -- Max 24 hours
  END IF;
END $$;

-- =====================================================
-- Link subscriptions and buffered messages to device credentials
-- =====================================================

ALTER TABLE mqtt_subscriptions
  ADD COLUMN IF NOT EXISTS device_credential_id UUID
    REFERENCES mqtt_device_credentials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mqtt_subscriptions_device_credential
  ON mqtt_subscriptions(device_credential_id)
  WHERE device_credential_id IS NOT NULL;

COMMENT ON COLUMN mqtt_subscriptions.device_credential_id IS
'Links subscription to device credential for internal broker. Used for message filtering and status tracking.';

ALTER TABLE mqtt_message_buffer
  ADD COLUMN IF NOT EXISTS device_id UUID
    REFERENCES mqtt_device_credentials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_device_id
  ON mqtt_message_buffer(device_id);

CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_device_time
  ON mqtt_message_buffer(device_id, received_at DESC);

COMMENT ON COLUMN mqtt_message_buffer.device_id IS
'Links message to device credential for status tracking and filtering';

-- =====================================================
-- Allow reusing connection names after soft delete
-- =====================================================

ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_name_active
  ON connections(name)
  WHERE deleted_at IS NULL;
