-- v0.9 release migration

-- Lower the default execution-log retention for new flows from 30 to 1 day.
-- Flow execution logs are written every scan cycle when enabled, so a 30-day default let
-- high-frequency flows accumulate tens of millions of rows (tens of GB) before the retention
-- cleanup job ever kicked in. This only changes the default for newly created flows; existing
-- flows keep whatever logs_retention_days value they already have.
ALTER TABLE flows ALTER COLUMN logs_retention_days SET DEFAULT 1;

-- Backfill chart_configs.folder_id / dashboard_configs.folder_id from the legacy options.folder_id
-- JSONB field. Both tables already had a real `folder_id` column (with its own index) since the
-- initial schema, but the folder service was writing/reading folder assignment through
-- options->>'folder_id' instead - which gets silently wiped out the next time the chart/dashboard
-- is fully re-saved (chart/dashboard editors rebuild `options` from scratch and don't know about
-- this key), causing charts to unexpectedly "jump back out" of their assigned folder. The folder
-- service now uses the real column directly; this backfills any assignments only recorded in the
-- old location so they aren't lost.
UPDATE chart_configs
SET folder_id = (options->>'folder_id')::uuid
WHERE folder_id IS NULL
  AND options->>'folder_id' IS NOT NULL
  AND options->>'folder_id' <> 'null';

UPDATE dashboard_configs
SET folder_id = (options->>'folder_id')::uuid
WHERE folder_id IS NULL
  AND options->>'folder_id' IS NOT NULL
  AND options->>'folder_id' <> 'null';
