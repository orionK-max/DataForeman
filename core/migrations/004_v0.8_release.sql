-- =====================================================
-- Release v0.8.0 Migration
-- Installable Connectivity Drivers framework (Phase 0)
-- See temp/installable-drivers-plan.md for full design context.
-- =====================================================

-- Registry of driver types provided by installed "connectivity-driver" extensions.
-- Populated/removed by core (LibraryManager/libraries.js) when such an extension is
-- installed/enabled/disabled/uninstalled. Consulted by:
--   - core: dynamic conn.type validation, generic POST /drivers/:id/rpc route
--   - connectivity: DriverManager reads this table directly (own DB connection) to build
--     its { type -> sidecar base URL } registry
-- Built-in drivers (opcua-client, opcua-server, s7, eip, mqtt) are NOT rows here — they
-- remain statically wired in the connectivity service and are unaffected by this table.
CREATE TABLE IF NOT EXISTS connectivity_driver_types (
  driver_type          text PRIMARY KEY,
  library_id           text NOT NULL REFERENCES node_libraries(library_id) ON DELETE CASCADE,
  rpc_subject_prefix   text NOT NULL,
  sidecar_service_name text NOT NULL,
  sidecar_health_url   text NOT NULL,
  sidecar_base_url     text NOT NULL,
  config_schema        jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE connectivity_driver_types IS 'Registry of installable connectivity driver types provided by installed extensions (installable-drivers framework, Phase 0). Built-in drivers are not rows here.';
COMMENT ON COLUMN connectivity_driver_types.driver_type IS 'Value stored in connections.type for connections using this driver (e.g. "tuya")';
COMMENT ON COLUMN connectivity_driver_types.library_id IS 'Owning extension, references node_libraries(library_id)';
COMMENT ON COLUMN connectivity_driver_types.rpc_subject_prefix IS 'NATS subject prefix for the generic RPC route, e.g. "df.connectivity.tuya"';
COMMENT ON COLUMN connectivity_driver_types.sidecar_service_name IS 'Docker Compose service name for the driver sidecar container';
COMMENT ON COLUMN connectivity_driver_types.sidecar_health_url IS 'Health check URL polled by the Library Manager UI';
COMMENT ON COLUMN connectivity_driver_types.sidecar_base_url IS 'Base URL connectivity uses to reach the sidecar''s Driver Plugin Protocol endpoints (e.g. http://tuya-driver:8200)';
COMMENT ON COLUMN connectivity_driver_types.config_schema IS 'JSON Schema describing this driver''s connection config fields (reserved for future generic form validation)';

CREATE INDEX IF NOT EXISTS idx_connectivity_driver_types_enabled ON connectivity_driver_types(enabled) WHERE enabled = true;

-- connections.type historically enforced a fixed CHECK constraint listing only the
-- built-in driver types (see 003_v0.5_release.sql). Installable driver types are dynamic
-- (added/removed at runtime as extensions are installed/uninstalled), so a static CHECK
-- constraint can no longer express valid values. Drop it; conn.type is now validated at
-- the application layer instead (core/src/routes/connectivity.js checks against the
-- built-in list unioned with enabled rows in connectivity_driver_types).
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_type_check;

-- Same reasoning applies to tag_metadata.driver_type (e.g. a Tuya driver registering tags
-- with driver_type='TUYA'). Drop the fixed CHECK constraint here too.
ALTER TABLE tag_metadata DROP CONSTRAINT IF EXISTS tag_metadata_driver_type_check;
