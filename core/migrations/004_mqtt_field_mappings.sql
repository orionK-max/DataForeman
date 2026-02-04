-- Migration: Add MQTT field mapping tables
-- Purpose: Enable mapping MQTT JSON fields to DataForeman tags

-- Add message buffer size column to subscriptions
ALTER TABLE mqtt_subscriptions 
  ADD COLUMN IF NOT EXISTS message_buffer_size INTEGER DEFAULT 100;

-- Create message buffer table for temporary storage
CREATE TABLE IF NOT EXISTS mqtt_message_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES mqtt_subscriptions(id) ON DELETE CASCADE,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  qos integer NOT NULL DEFAULT 0,
  retained boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_subscription ON mqtt_message_buffer(subscription_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_topic ON mqtt_message_buffer(topic);
CREATE INDEX IF NOT EXISTS idx_mqtt_message_buffer_received_at ON mqtt_message_buffer(received_at);

-- Create field mappings table
CREATE TABLE IF NOT EXISTS mqtt_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES mqtt_subscriptions(id) ON DELETE CASCADE,
  topic text NOT NULL,
  field_path text NOT NULL,
  tag_name text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('real', 'int', 'text', 'bool', 'json')),
  tag_id integer REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  type_strictness text DEFAULT 'coerce' CHECK (type_strictness IN ('strict', 'coerce')),
  on_failure text DEFAULT 'skip' CHECK (on_failure IN ('skip', 'default')),
  default_value text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(subscription_id, topic, field_path),
  UNIQUE(subscription_id, tag_name),
  UNIQUE(tag_id)
);

CREATE INDEX IF NOT EXISTS idx_mqtt_field_mappings_sub ON mqtt_field_mappings(subscription_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_field_mappings_tag ON mqtt_field_mappings(tag_id);
