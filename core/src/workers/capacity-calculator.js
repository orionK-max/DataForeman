// Capacity Calculator Background Job
// Calculates disk capacity estimation and stores in system_settings
// Runs every 15 minutes or when triggered by tag operations

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

// Disk usage thresholds (%) shared with the front-end Disk Capacity card/bar and the
// service status banner.
const DISK_WARNING_PCT = 80;
const DISK_ERROR_PCT = 90;

function diskStatusForPct(pct) {
  if (pct == null) return null;
  if (pct >= DISK_ERROR_PCT) return 'error';
  if (pct >= DISK_WARNING_PCT) return 'warning';
  return 'ok';
}

// Get the real disk size/used/avail for the primary data mount, mirroring the logic used
// by GET /diag/resources so both endpoints agree on which filesystem is "the" disk.
async function getPrimaryDisk() {
  const wantPaths = ['/', '/app', '/app/logs', '/var/log'];
  const existing = [];
  for (const p of wantPaths) {
    try { await access(p, constants.R_OK); existing.push(p); } catch {}
  }
  if (!existing.length) return null;
  try {
    const { stdout } = await execFileAsync('df', ['-P', '-k', ...existing]);
    const disks = [];
    const lines = (stdout || '').trim().split(/\r?\n/);
    for (const line of lines.slice(1)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        const sizeK = Number(parts[1]);
        const usedK = Number(parts[2]);
        const availK = Number(parts[3]);
        const mount = parts[5];
        if (Number.isFinite(sizeK) && Number.isFinite(usedK)) {
          disks.push({
            mount,
            size_bytes: sizeK * 1024,
            used_bytes: usedK * 1024,
            avail_bytes: Number.isFinite(availK) ? availK * 1024 : null,
          });
        }
      }
    }
    const byMount = new Map();
    for (const d of disks) {
      const cur = byMount.get(d.mount);
      if (!cur || Number(d.size_bytes || 0) > Number(cur.size_bytes || 0)) byMount.set(d.mount, d);
    }
    const uniqueMounts = Array.from(byMount.values());
    let primary = uniqueMounts.find((d) => d.mount === '/app') || uniqueMounts.find((d) => d.mount === '/');
    if (!primary && uniqueMounts.length) {
      primary = uniqueMounts.reduce((a, b) => (Number(a.size_bytes || 0) >= Number(b.size_bytes || 0) ? a : b));
    }
    return primary || null;
  } catch {
    return null;
  }
}

export default async function capacityCalculator({ job, complete, fail, app }) {
  const log = app.log.child({ job: 'capacity_calculator', jobId: job.id });
  
  try {
    log.info('Starting capacity calculation');
    
    const db = app.tsdb || app.db;
    
    // Get retention policy settings
    const retentionResult = await app.db.query(`
      SELECT value FROM system_settings WHERE key = $1
    `, ['historian.retention_days']);
    const retentionDays = Number(retentionResult.rows[0]?.value) || null;
    
    // Get database size
    const dbSizeResult = await db.query(`
      SELECT pg_database_size(current_database()) as db_size_bytes
    `);
    const dbSizeBytes = Number(dbSizeResult.rows[0]?.db_size_bytes || 0);
    
    // Get system metrics retention policy
    const sysMetricsRetentionResult = await app.db.query(`
      SELECT value FROM system_settings WHERE key = $1
    `, ['system_metrics.retention_days']);
    const sysMetricsRetentionDays = Number(sysMetricsRetentionResult.rows[0]?.value) || null;
    
    // Get ingestion rate for tag_values: count rows from a short recent window rather than 24h,
    // so capacity estimates react to recent changes (e.g. a flow's scan rate or diagnostics
    // saving being toggled) within ~RATE_WINDOW_HOURS instead of taking up to a full day to
    // "roll off" the old rate from a trailing 24h average.
    const RATE_WINDOW_HOURS = 1;
    const ingestRateResult = await db.query(`
      SELECT 
        COUNT(*) as row_count,
        EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) as time_span_seconds
      FROM tag_values
      WHERE ts >= NOW() - INTERVAL '${RATE_WINDOW_HOURS} hours'
    `);
    
    const rowCount = Number(ingestRateResult.rows[0]?.row_count || 0);
    const timeSpanSeconds = Number(ingestRateResult.rows[0]?.time_span_seconds || 0);
    
    // Get ingestion rate for system_metrics: same short window
    const sysMetricsRateResult = await db.query(`
      SELECT 
        COUNT(*) as row_count,
        EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) as time_span_seconds
      FROM system_metrics
      WHERE ts >= NOW() - INTERVAL '${RATE_WINDOW_HOURS} hours'
    `).catch(() => ({ rows: [{ row_count: 0, time_span_seconds: 0 }] })); // Fallback if table doesn't exist
    
    const sysMetricsRowCount = Number(sysMetricsRateResult.rows[0]?.row_count || 0);
    const sysMetricsTimeSpan = Number(sysMetricsRateResult.rows[0]?.time_span_seconds || 0);

    // Get ingestion rate for flow_execution_logs (lives in the main app db, not TimescaleDB -
    // always query app.db here, not `db`). Retention for these is per-flow (flows.logs_retention_days),
    // not a single global setting, so steady-state is computed per-flow below and summed.
    //
    // flow_execution_logs has no plain index on `timestamp` alone (only (flow_id, timestamp) -
    // it's a regular table, not a hypertable, and can be very large), so a bare "WHERE timestamp
    // >= ..." forces a full table scan and can time out. Scoping to `flow_id = ANY(<all flow ids>)`
    // lets Postgres use that composite index instead (verified: ~150ms vs timeout on a 100M+ row
    // table) - same trick used in the breakdown route.
    const { rows: allFlows } = await app.db.query(`SELECT id, logs_retention_days FROM flows`);
    const allFlowIds = allFlows.map((f) => f.id);
    const retentionByFlowId = new Map(allFlows.map((f) => [f.id, Number(f.logs_retention_days) || 1]));

    let logsByFlowResult = { rows: [] };
    if (allFlowIds.length > 0) {
      logsByFlowResult = await app.db.query(
        `SELECT flow_id, COUNT(*) as row_count
         FROM flow_execution_logs
         WHERE flow_id = ANY($1::uuid[]) AND timestamp >= NOW() - INTERVAL '${RATE_WINDOW_HOURS} hours'
         GROUP BY flow_id`,
        [allFlowIds]
      ).catch(() => ({ rows: [] }));
    }
    const logsRowCount = logsByFlowResult.rows.reduce((sum, r) => sum + Number(r.row_count || 0), 0);
    // Rows are extrapolated against the fixed window duration (not an observed min/max span -
    // same approach the breakdown route uses) since we're no longer computing a global span here.
    const logsTimeSpan = logsRowCount > 0 ? RATE_WINDOW_HOURS * 3600 : 0;
    
    // Measure ACTUAL on-disk size per row instead of using a fixed byte estimate.
    // TimescaleDB compresses chunks older than the compression policy, which can shrink
    // storage by 90%+. A hardcoded "bytes per row" constant assumes everything stays
    // uncompressed, which massively overestimates the steady-state target size and makes
    // "days until steady state" get stuck forever (the DB actually reaches its real,
    // compressed steady-state size, but the calculation keeps comparing against an
    // inflated target it will never reach).
    async function getHypertableSize(tableName) {
      try {
        const r = await db.query(`SELECT hypertable_size($1::regclass) as size`, [tableName]);
        return Number(r.rows[0]?.size || 0);
      } catch {
        try {
          const r = await db.query(`SELECT pg_total_relation_size($1::regclass) as size`, [tableName]);
          return Number(r.rows[0]?.size || 0);
        } catch {
          return 0;
        }
      }
    }
    
    const tagValuesSizeBytes = await getHypertableSize('tag_values');
    const tagValuesTotalCount = await db.query(`SELECT count(*) as c FROM tag_values`)
      .then(r => Number(r.rows[0]?.c || 0)).catch(() => 0);
    const sysMetricsSizeBytes = await getHypertableSize('system_metrics');
    const sysMetricsTotalCount = await db.query(`SELECT count(*) as c FROM system_metrics`)
      .then(r => Number(r.rows[0]?.c || 0)).catch(() => 0);
    // flow_execution_logs is a plain (non-hypertable) table in the main app db
    const logsSizeBytes = await app.db.query(`SELECT pg_total_relation_size('flow_execution_logs') as size`)
      .then(r => Number(r.rows[0]?.size || 0)).catch(() => 0);
    // Approximate count from table statistics (pg_class.reltuples) instead of exact COUNT(*) -
    // this table has no covering index for a full scan and can grow into the 100M+ row range,
    // where COUNT(*) takes 10+ seconds. Good enough for a bytes-per-row estimate.
    const logsTotalCount = await app.db.query(`SELECT reltuples::bigint as c FROM pg_class WHERE relname = 'flow_execution_logs'`)
      .then(r => Number(r.rows[0]?.c || 0)).catch(() => 0);
    
    // Fallback constants only used if actual size/count can't be measured (e.g. empty table)
    const TAG_VALUES_BYTES_PER_ROW = (tagValuesSizeBytes > 0 && tagValuesTotalCount > 0)
      ? tagValuesSizeBytes / tagValuesTotalCount
      : 200;
    const SYS_METRICS_BYTES_PER_ROW = (sysMetricsSizeBytes > 0 && sysMetricsTotalCount > 0)
      ? sysMetricsSizeBytes / sysMetricsTotalCount
      : 44;
    const LOGS_BYTES_PER_ROW = (logsSizeBytes > 0 && logsTotalCount > 0)
      ? logsSizeBytes / logsTotalCount
      : 350;
    
    // Actual current data size, used for growth/steady-state comparisons instead of
    // pg_database_size which is dominated by these same tables anyway but could be skewed by
    // other unrelated tables. Includes flow_execution_logs since it's a real, often-substantial
    // consumer that grows the same way tag_values/system_metrics do.
    const dataSizeBytes = tagValuesSizeBytes + sysMetricsSizeBytes + logsSizeBytes;
    
    // Calculate ingestion rate for tag_values
    let bytesPerDay = null;
    let sysMetricsBytesPerDay = null;
    let rowsPerDay = null;
    let sysMetricsRowsPerDay = null;
    let daysRemaining = null;
    let steadyStateBytes = null;
    let daysUntilSteadyState = null;
    let mode = 'unknown'; // 'steady_state', 'growth', 'unknown'
    
    if (rowCount > 0 && timeSpanSeconds > 0) {
      const rowsPerSecond = rowCount / timeSpanSeconds;
      rowsPerDay = rowsPerSecond * 86400; // 86400 seconds in a day
      bytesPerDay = rowsPerDay * TAG_VALUES_BYTES_PER_ROW;
    }
    
    // Calculate ingestion rate for system_metrics
    if (sysMetricsRowCount > 0 && sysMetricsTimeSpan > 0) {
      const rowsPerSecond = sysMetricsRowCount / sysMetricsTimeSpan;
      sysMetricsRowsPerDay = rowsPerSecond * 86400;
      sysMetricsBytesPerDay = sysMetricsRowsPerDay * SYS_METRICS_BYTES_PER_ROW;
    }

    // Calculate ingestion rate + per-flow retention-weighted steady state for execution logs
    let logsBytesPerDay = null;
    let logsRowsPerDay = null;
    let logsSteadyStateBytes = 0;
    if (logsRowCount > 0 && logsTimeSpan > 0) {
      const rowsPerSecond = logsRowCount / logsTimeSpan;
      logsRowsPerDay = rowsPerSecond * 86400;
      logsBytesPerDay = logsRowsPerDay * LOGS_BYTES_PER_ROW;
    }
    if (logsByFlowResult.rows.length > 0 && logsTimeSpan > 0) {
      const windowSeconds = RATE_WINDOW_HOURS * 3600;
      for (const row of logsByFlowResult.rows) {
        const flowRowsPerDay = (Number(row.row_count) / windowSeconds) * 86400;
        const flowRetentionDays = retentionByFlowId.get(row.flow_id) || 1;
        logsSteadyStateBytes += flowRowsPerDay * LOGS_BYTES_PER_ROW * flowRetentionDays;
      }
    }
    
    // Combine tag_values + system_metrics + execution logs for total growth rate
    const totalBytesPerDay = (bytesPerDay || 0) + (sysMetricsBytesPerDay || 0) + (logsBytesPerDay || 0);
    
    if (totalBytesPerDay > 0) {
      // If retention policy is active, data will reach steady state
      if (retentionDays && retentionDays > 0) {
        // Steady state size = retention_days * bytes_per_day (for tag_values)
        const tagValuesSteadyState = retentionDays * (bytesPerDay || 0);
        // Add system_metrics steady state (uses its own retention policy)
        const sysMetricsSteadyState = (sysMetricsRetentionDays || 30) * (sysMetricsBytesPerDay || 0);
        // Execution logs use each flow's own logs_retention_days (already summed above), independent
        // of the historian retention policy - a flow can log at 1-day retention while tag_values keeps 30.
        steadyStateBytes = tagValuesSteadyState + sysMetricsSteadyState + logsSteadyStateBytes;
        
        if (dataSizeBytes >= steadyStateBytes * 0.95) {
          // Already at steady state (within 5% of target)
          mode = 'steady_state';
          daysRemaining = null; // Infinite - data won't grow beyond this
        } else {
          // Still growing towards steady state
          mode = 'growth';
          const bytesUntilSteadyState = steadyStateBytes - dataSizeBytes;
          daysUntilSteadyState = Math.ceil(bytesUntilSteadyState / totalBytesPerDay);
        }
      } else {
        // No retention policy on tag_values - will grow indefinitely
        mode = 'growth';
      }
    }
    
    // Real disk size/used/avail for the primary data mount, used to compute current disk
    // usage % and to project what disk usage % will be once data reaches steady state.
    const primaryDisk = await getPrimaryDisk();
    let diskSizeBytes = null;
    let diskUsedBytes = null;
    let diskAvailBytes = null;
    let diskPctUsed = null;
    let diskPctAtSteadyState = null;
    if (primaryDisk) {
      diskSizeBytes = primaryDisk.size_bytes;
      diskUsedBytes = primaryDisk.used_bytes;
      diskAvailBytes = primaryDisk.avail_bytes;
      const diskTotalBytes = diskUsedBytes + (diskAvailBytes || 0);
      if (diskTotalBytes > 0) {
        diskPctUsed = (diskUsedBytes / diskTotalBytes) * 100;
        
        // No retention policy set - use disk_avail_bytes as fallback for days remaining
        if (mode === 'growth' && !retentionDays && diskAvailBytes != null && totalBytesPerDay > 0) {
          daysRemaining = Math.floor(diskAvailBytes / totalBytesPerDay);
        }
        
        if (steadyStateBytes != null) {
          // Projected used bytes = everything else on disk (non-telemetry) + the steady-state
          // telemetry footprint. "Everything else" = current used bytes minus current telemetry
          // data size, assumed roughly constant over time.
          const nonDataUsedBytes = Math.max(0, diskUsedBytes - dataSizeBytes);
          const projectedUsedBytes = nonDataUsedBytes + steadyStateBytes;
          diskPctAtSteadyState = (projectedUsedBytes / diskTotalBytes) * 100;
        }
      }
    }
    const diskStatusNow = diskStatusForPct(diskPctUsed);
    const diskStatusAtSteadyState = diskStatusForPct(diskPctAtSteadyState);
    
    const capacityEstimate = {
      db_size_bytes: dbSizeBytes,
      data_size_bytes: dataSizeBytes,
      tag_values_size_bytes: tagValuesSizeBytes,
      system_metrics_size_bytes: sysMetricsSizeBytes,
      logs_size_bytes: logsSizeBytes,
      rows_last_24h: rowsPerDay != null ? Math.round(rowsPerDay) : rowCount,
      system_metrics_rows_last_24h: sysMetricsRowsPerDay != null ? Math.round(sysMetricsRowsPerDay) : sysMetricsRowCount,
      logs_rows_last_24h: logsRowsPerDay != null ? Math.round(logsRowsPerDay) : logsRowCount,
      rate_window_hours: RATE_WINDOW_HOURS,
      estimated_bytes_per_day: bytesPerDay,
      system_metrics_bytes_per_day: sysMetricsBytesPerDay,
      logs_bytes_per_day: logsBytesPerDay,
      logs_steady_state_bytes: logsSteadyStateBytes,
      total_bytes_per_day: totalBytesPerDay,
      days_remaining: daysRemaining,
      retention_days: retentionDays,
      system_metrics_retention_days: sysMetricsRetentionDays,
      steady_state_bytes: steadyStateBytes,
      days_until_steady_state: daysUntilSteadyState,
      mode: mode,
      disk_size_bytes: diskSizeBytes,
      disk_used_bytes: diskUsedBytes,
      disk_avail_bytes: diskAvailBytes,
      disk_pct_used: diskPctUsed,
      disk_pct_at_steady_state: diskPctAtSteadyState,
      disk_status: diskStatusNow,
      disk_status_at_steady_state: diskStatusAtSteadyState,
      disk_warning_pct: DISK_WARNING_PCT,
      disk_error_pct: DISK_ERROR_PCT,
      tag_values_bytes_per_row: TAG_VALUES_BYTES_PER_ROW,
      system_metrics_bytes_per_row: SYS_METRICS_BYTES_PER_ROW,
      logs_bytes_per_row: LOGS_BYTES_PER_ROW,
      calculated_at: new Date().toISOString(),
    };
    
    // Store result in system_settings
    await app.db.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, updated_at = NOW()
    `, ['capacity.last_calculation', JSON.stringify(capacityEstimate)]);
    
    log.info({ 
      dbSizeBytes, 
      rowCount, 
      sysMetricsRowCount,
      bytesPerDay, 
      sysMetricsBytesPerDay,
      totalBytesPerDay,
      mode, 
      daysRemaining,
      diskPctUsed,
      diskPctAtSteadyState,
    }, 'Capacity calculation completed');
    
    return complete(job.id, { 
      success: true, 
      capacity: capacityEstimate 
    });
    
  } catch (err) {
    log.error({ err }, 'Capacity calculation failed');
    return fail(job.id, err);
  }
}
