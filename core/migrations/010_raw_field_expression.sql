-- Migration 010: Add value_expression to mqtt_field_mappings for raw payload support
-- Raw payloads (non-JSON) use a JS expression to extract individual field values.
-- e.g. payload.split(',')[1] for CSV, payload.match(/KEY=([^;]+)/)?.[1] for key-value strings

-- Add the expression column (nullable - only used for raw payload subscriptions)
ALTER TABLE mqtt_field_mappings
  ADD COLUMN IF NOT EXISTS value_expression text;

-- The existing unique constraint (subscription_id, topic, field_path) prevents multiple
-- raw field mappings on the same topic (they all use field_path = '_raw').
-- Drop it and rely solely on (subscription_id, tag_name) for uniqueness, which already exists.
ALTER TABLE mqtt_field_mappings
  DROP CONSTRAINT IF EXISTS mqtt_field_mappings_subscription_id_topic_field_path_key;
