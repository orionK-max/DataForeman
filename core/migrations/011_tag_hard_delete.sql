-- Migration 011: Hard-delete soft-deleted tags and remove is_deleted flag
-- Previously, deleted tags were kept as rows with status='deleted'.
-- Going forward, tags are physically removed once their tag_values data has been purged.
--
-- All FK references to tag_metadata(tag_id) already have ON DELETE CASCADE (or SET NULL
-- for mqtt_publisher_tag_refs), so the DELETE cascades cleanly with no orphan risk.

-- Step 1: Hard-delete all rows that were already fully soft-deleted.
-- Cascades handle: flow_tag_dependencies, mqtt_publisher_mappings,
--   sparkplug_metric_mappings, mqtt_field_mappings (CASCADE),
--   mqtt_publisher_tag_refs (SET NULL).
DELETE FROM tag_metadata WHERE status = 'deleted';

-- Step 2: Drop the index that existed solely to support is_deleted queries.
DROP INDEX IF EXISTS idx_tag_metadata_deleted;

-- Step 3: Drop the is_deleted column — no longer needed.
ALTER TABLE tag_metadata DROP COLUMN IF EXISTS is_deleted;
