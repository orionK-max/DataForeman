-- =====================================================
-- MQTT Device Topics Tracking
-- Migration 007
-- =====================================================
-- Tracks which topics each device has published to.
-- Populated via NanoMQ ACL webhook (acl_req) which fires
-- on every PUBLISH with {clientid, topic, access=2}.

CREATE TABLE IF NOT EXISTS mqtt_device_topics (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    uuid        NOT NULL REFERENCES mqtt_devices(id) ON DELETE CASCADE,
  topic        TEXT        NOT NULL,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_device_topics_device
  ON mqtt_device_topics(device_id);
