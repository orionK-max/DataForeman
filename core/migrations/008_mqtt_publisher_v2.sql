-- 008_mqtt_publisher_v2.sql
-- Redesign MQTT publisher schema to support template-based payloads.
-- Publishers now have a single mqtt_topic and a payload_template with
-- {{ConnectionName|tag_path}} tokens instead of N per-tag mappings.

-- Add new columns to mqtt_publishers
ALTER TABLE mqtt_publishers ADD COLUMN IF NOT EXISTS mqtt_topic text;
ALTER TABLE mqtt_publishers ADD COLUMN IF NOT EXISTS qos integer NOT NULL DEFAULT 0 CHECK (qos IN (0,1,2));
ALTER TABLE mqtt_publishers ADD COLUMN IF NOT EXISTS retain boolean NOT NULL DEFAULT false;
ALTER TABLE mqtt_publishers ADD COLUMN IF NOT EXISTS min_interval_ms integer NOT NULL DEFAULT 500;

-- Token-resolution table: maps each {{token}} in the template to a resolved tag_id.
-- Populated at save time; used at publish time to batch-read from runtimeState cache.
CREATE TABLE IF NOT EXISTS mqtt_publisher_tag_refs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id   uuid        NOT NULL REFERENCES mqtt_publishers(id) ON DELETE CASCADE,
  token_key      text        NOT NULL,  -- "ConnectionName|tag_path" (the content inside {{ }})
  tag_id         integer     REFERENCES tag_metadata(tag_id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(publisher_id, token_key)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_pub_tag_refs_publisher ON mqtt_publisher_tag_refs(publisher_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_pub_tag_refs_tag       ON mqtt_publisher_tag_refs(tag_id);
