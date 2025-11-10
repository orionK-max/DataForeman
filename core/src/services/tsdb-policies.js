// TimescaleDB retention & compression policies manager
// Reads values from the generic /config table and applies policies to the tag_values hypertable

import fp from 'fastify-plugin';

async function getConfigValue(app, key, defaultVal) {
    try {
      const { rows } = await app.db.query('select value from system_settings where key=$1', [String(key)]);
    const v = rows?.[0]?.value;
    if (v == null) return defaultVal;
    // value is stored as jsonb; allow numbers or strings
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : defaultVal;
    }
    // if object like { value: 30 }
    const n = Number(v?.value);
    return Number.isFinite(n) ? n : defaultVal;
  } catch {
    return defaultVal;
  }
}

async function extensionAvailable(app) {
  try {
    const { rows } = await app.tsdb.query("SELECT 1 FROM pg_extension WHERE extname='timescaledb'");
    return rows && rows.length > 0;
  } catch {
    return false;
  }
}

async function applyPolicies(app) {
  const log = app.log || console;
  log.info('tsdb-policies: applyPolicies called');
  
  const tsdb = app.tsdb || app.db; // prefer tsdb; fallback to core db if unified
  if (!tsdb) { log.warn('tsdb-policies: no tsdb/db handle'); return; }

  // Require TimescaleDB
  const ok = await extensionAvailable(app);
  if (!ok) { log.warn('tsdb-policies: timescaledb extension not found; skipping'); return; }

  // Read config values with defaults
  const retentionDays = await getConfigValue(app, 'historian.retention_days', 30);
  const compressionDays = await getConfigValue(app, 'historian.compression_days', 7);
  const systemMetricsRetentionDays = await getConfigValue(app, 'system_metrics.retention_days', 30);

  // Clamp and ensure compression < retention
  const rDays = Math.max(1, Math.floor(Number(retentionDays) || 30));
  let cDays = Math.max(1, Math.floor(Number(compressionDays) || 7));
  if (cDays >= rDays) cDays = Math.max(1, Math.floor(rDays / 2));
  const sysMetricsRDays = Math.max(1, Math.floor(Number(systemMetricsRetentionDays) || 30));

  // Apply policies idempotently: remove existing and add fresh with new intervals
  const sql = `DO $$
  BEGIN
    -- Ensure hypertable exists before policies (ignore errors otherwise)
    BEGIN
      PERFORM 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'tag_values';
    EXCEPTION WHEN OTHERS THEN
      -- if inspection fails, proceed anyway
      NULL;
    END;

    -- Enable compression and set recommended order/segment (if supported)
    BEGIN
      EXECUTE 'ALTER TABLE tag_values SET (timescaledb.compress, timescaledb.compress_orderby = ''ts DESC'', timescaledb.compress_segmentby = ''connection_id, tag_id'')';
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: try basic enable only
      BEGIN
        EXECUTE 'ALTER TABLE tag_values SET (timescaledb.compress)';
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END;

    -- Remove and (re)add retention policy
    BEGIN
      PERFORM remove_retention_policy('tag_values');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      PERFORM add_retention_policy('tag_values', INTERVAL '${rDays} days');
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Remove and (re)add compression policy
    BEGIN
      PERFORM remove_compression_policy('tag_values');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      PERFORM add_compression_policy('tag_values', INTERVAL '${cDays} days');
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Apply retention policy for system_metrics hypertable
    BEGIN
      PERFORM 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'system_metrics';
      -- If system_metrics hypertable exists, apply retention policy
      BEGIN
        PERFORM remove_retention_policy('system_metrics');
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        PERFORM add_retention_policy('system_metrics', INTERVAL '${sysMetricsRDays} days');
      EXCEPTION WHEN OTHERS THEN NULL; END;
    EXCEPTION WHEN OTHERS THEN
      -- Hypertable doesn't exist yet, skip
      NULL;
    END;
  END$$;`;

  try {
    await tsdb.query(sql);
    log.info({ 
      tag_values: { retentionDays: rDays, compressionDays: cDays },
      system_metrics: { retentionDays: sysMetricsRDays }
    }, 'tsdb-policies: applied');
  } catch (err) {
    log.error({ err }, 'tsdb-policies: apply failed');
  }
}

export const tsdbPoliciesPlugin = fp(async function (app) {
  // Expose a method so routes (e.g., /config) can trigger apply after saving
  app.decorate('applyTsdbPolicies', async () => { await applyPolicies(app); });

  // Best-effort apply on startup
  try { 
    await applyPolicies(app); 
  } catch (err) {
    app.log.error({ err, service: 'tsdb-policies' }, 'Failed to apply TimescaleDB policies on startup');
  }
});

export { applyPolicies as _applyTsdbPoliciesImpl };
