// Capacity Calculator Background Job
// Calculates disk capacity estimation and stores in system_settings
// Runs every 15 minutes or when triggered by tag operations

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
    
    // Get ingestion rate for tag_values: count rows from last 24 hours
    const ingestRateResult = await db.query(`
      SELECT 
        COUNT(*) as row_count,
        EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) as time_span_seconds
      FROM tag_values
      WHERE ts >= NOW() - INTERVAL '24 hours'
    `);
    
    const rowCount = Number(ingestRateResult.rows[0]?.row_count || 0);
    const timeSpanSeconds = Number(ingestRateResult.rows[0]?.time_span_seconds || 0);
    
    // Get ingestion rate for system_metrics: count rows from last 24 hours
    const sysMetricsRateResult = await db.query(`
      SELECT 
        COUNT(*) as row_count,
        EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) as time_span_seconds
      FROM system_metrics
      WHERE ts >= NOW() - INTERVAL '24 hours'
    `).catch(() => ({ rows: [{ row_count: 0, time_span_seconds: 0 }] })); // Fallback if table doesn't exist
    
    const sysMetricsRowCount = Number(sysMetricsRateResult.rows[0]?.row_count || 0);
    const sysMetricsTimeSpan = Number(sysMetricsRateResult.rows[0]?.time_span_seconds || 0);
    
    // Calculate average bytes per row (estimate based on table structure)
    // tag_values: ts(8) + connection_id(16) + tag_id(4) + quality(2) + v_num(8) + v_text(avg ~50) + v_json(avg ~100) + overhead(~30)
    // Conservative estimate: ~200 bytes/row average
    const TAG_VALUES_BYTES_PER_ROW = 200;
    
    // system_metrics: tag_id(4) + ts(8) + v_num(8) + overhead(~24)
    // Smaller table, estimate: ~44 bytes/row average
    const SYS_METRICS_BYTES_PER_ROW = 44;
    
    // Calculate ingestion rate for tag_values
    let bytesPerDay = null;
    let sysMetricsBytesPerDay = null;
    let daysRemaining = null;
    let steadyStateBytes = null;
    let daysUntilSteadyState = null;
    let mode = 'unknown'; // 'steady_state', 'growth', 'unknown'
    
    if (rowCount > 0 && timeSpanSeconds > 0) {
      const rowsPerSecond = rowCount / timeSpanSeconds;
      const rowsPerDay = rowsPerSecond * 86400; // 86400 seconds in a day
      bytesPerDay = rowsPerDay * TAG_VALUES_BYTES_PER_ROW;
    }
    
    // Calculate ingestion rate for system_metrics
    if (sysMetricsRowCount > 0 && sysMetricsTimeSpan > 0) {
      const rowsPerSecond = sysMetricsRowCount / sysMetricsTimeSpan;
      const rowsPerDay = rowsPerSecond * 86400;
      sysMetricsBytesPerDay = rowsPerDay * SYS_METRICS_BYTES_PER_ROW;
    }
    
    // Combine both tables for total growth rate
    const totalBytesPerDay = (bytesPerDay || 0) + (sysMetricsBytesPerDay || 0);
    
    if (totalBytesPerDay > 0) {
      // If retention policy is active, data will reach steady state
      if (retentionDays && retentionDays > 0) {
        // Steady state size = retention_days * bytes_per_day (for tag_values)
        const tagValuesSteadyState = retentionDays * (bytesPerDay || 0);
        // Add system_metrics steady state (uses its own retention policy)
        const sysMetricsSteadyState = (sysMetricsRetentionDays || 30) * (sysMetricsBytesPerDay || 0);
        steadyStateBytes = tagValuesSteadyState + sysMetricsSteadyState;
        
        if (dbSizeBytes >= steadyStateBytes * 0.95) {
          // Already at steady state (within 5% of target)
          mode = 'steady_state';
          daysRemaining = null; // Infinite - data won't grow beyond this
        } else {
          // Still growing towards steady state
          mode = 'growth';
          const bytesUntilSteadyState = steadyStateBytes - dbSizeBytes;
          daysUntilSteadyState = Math.ceil(bytesUntilSteadyState / totalBytesPerDay);
        }
      } else {
        // No retention policy on tag_values - will grow indefinitely
        mode = 'growth';
        
        // Try to get available disk space from system settings (set by /diag/resources once)
        try {
          const diskResult = await app.db.query(`
            SELECT value FROM system_settings WHERE key = $1
          `, ['capacity.disk_avail_bytes']);
          const availBytes = Number(diskResult.rows[0]?.value);
          if (availBytes && totalBytesPerDay > 0) {
            daysRemaining = Math.floor(availBytes / totalBytesPerDay);
          }
        } catch {}
      }
    }
    
    const capacityEstimate = {
      db_size_bytes: dbSizeBytes,
      rows_last_24h: rowCount,
      system_metrics_rows_last_24h: sysMetricsRowCount,
      estimated_bytes_per_day: bytesPerDay,
      system_metrics_bytes_per_day: sysMetricsBytesPerDay,
      total_bytes_per_day: totalBytesPerDay,
      days_remaining: daysRemaining,
      retention_days: retentionDays,
      system_metrics_retention_days: sysMetricsRetentionDays,
      steady_state_bytes: steadyStateBytes,
      days_until_steady_state: daysUntilSteadyState,
      mode: mode,
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
      daysRemaining 
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
