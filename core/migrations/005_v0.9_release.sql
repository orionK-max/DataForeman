-- v0.9 release migration

-- Lower the default execution-log retention for new flows from 30 to 1 day.
-- Flow execution logs are written every scan cycle when enabled, so a 30-day default let
-- high-frequency flows accumulate tens of millions of rows (tens of GB) before the retention
-- cleanup job ever kicked in. This only changes the default for newly created flows; existing
-- flows keep whatever logs_retention_days value they already have.
ALTER TABLE flows ALTER COLUMN logs_retention_days SET DEFAULT 1;
