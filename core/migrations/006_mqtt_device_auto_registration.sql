-- =====================================================
-- MQTT Device Auto-Registration
-- Migration 006
-- =====================================================
-- Redesigns device identity:
--   Old: one credential entry per device (device_name unique, one device per cred)
--   New: credential groups (shared username/password) + auto-registered
--        devices identified by broker client_id (many devices per cred group)

-- =====================================================
-- 1. Drop FK columns and stale indexes (idempotent)
-- =====================================================

ALTER TABLE mqtt_subscriptions DROP COLUMN IF EXISTS device_credential_id;
ALTER TABLE mqtt_message_buffer DROP COLUMN IF EXISTS device_id;

DROP INDEX IF EXISTS idx_mqtt_device_creds_username;
DROP INDEX IF EXISTS idx_mqtt_subscriptions_device_credential;
DROP INDEX IF EXISTS idx_mqtt_message_buffer_device_id;
DROP INDEX IF EXISTS idx_mqtt_message_buffer_device_time;

-- =====================================================
-- 2. Rename mqtt_device_credentials → mqtt_credential_groups
--    (skipped on fresh installs where the table doesn't exist yet;
--     skipped on re-runs where it is already renamed)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'mqtt_device_credentials'
  ) THEN
    -- Clear incompatible rows before structural changes
    DELETE FROM mqtt_device_credentials;

    -- Rename device_name → name if the old column still exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mqtt_device_credentials' AND column_name = 'device_name'
    ) THEN
      ALTER TABLE mqtt_device_credentials RENAME COLUMN device_name TO name;
    END IF;

    ALTER TABLE mqtt_device_credentials RENAME TO mqtt_credential_groups;
  END IF;
END;
$$;

-- =====================================================
-- 3. Create mqtt_credential_groups (fresh-install path)
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

DROP TRIGGER IF EXISTS trigger_mqtt_device_credentials_updated_at ON mqtt_credential_groups;
DROP TRIGGER IF EXISTS trigger_mqtt_credential_groups_updated_at  ON mqtt_credential_groups;

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

CREATE INDEX IF NOT EXISTS idx_mqtt_credential_groups_username
  ON mqtt_credential_groups(username)
  WHERE enabled = true;

-- =====================================================
-- 4. Create mqtt_devices for auto-registered devices
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_devices (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            TEXT        UNIQUE NOT NULL,
  credential_group_id  UUID        NOT NULL REFERENCES mqtt_credential_groups(id) ON DELETE CASCADE,
  display_name         TEXT,
  enabled              BOOLEAN     NOT NULL DEFAULT true,
  first_seen           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_devices_client_id
  ON mqtt_devices(client_id);

CREATE INDEX IF NOT EXISTS idx_mqtt_devices_group
  ON mqtt_devices(credential_group_id);

DROP TRIGGER IF EXISTS trigger_mqtt_devices_updated_at ON mqtt_devices;

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
