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
    
    // Get ingestion rate: count rows and total size from last 24 hours
    const ingestRateResult = await db.query(`
      SELECT 
        COUNT(*) as row_count,
        EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) as time_span_seconds
      FROM tag_values
      WHERE ts >= NOW() - INTERVAL '24 hours'
    `);
    
    const rowCount = Number(ingestRateResult.rows[0]?.row_count || 0);
    const timeSpanSeconds = Number(ingestRateResult.rows[0]?.time_span_seconds || 0);
    
    // Calculate average bytes per row (estimate based on table structure)
    // Each row: ts(8) + connection_id(16) + tag_id(4) + quality(2) + v_num(8) + v_text(avg ~50) + v_json(avg ~100) + overhead(~30)
    // Conservative estimate: ~200 bytes/row average
    const BYTES_PER_ROW = 200;
    
    // Calculate ingestion rate
    let bytesPerDay = null;
    let daysRemaining = null;
    let steadyStateBytes = null;
    let daysUntilSteadyState = null;
    let mode = 'unknown'; // 'steady_state', 'growth', 'unknown'
    
    if (rowCount > 0 && timeSpanSeconds > 0) {
      const rowsPerSecond = rowCount / timeSpanSeconds;
      const rowsPerDay = rowsPerSecond * 86400; // 86400 seconds in a day
      bytesPerDay = rowsPerDay * BYTES_PER_ROW;
      
      // If retention policy is active, data will reach steady state
      if (retentionDays && retentionDays > 0) {
        // Steady state size = retention_days * bytes_per_day
        steadyStateBytes = retentionDays * bytesPerDay;
        
        if (dbSizeBytes >= steadyStateBytes * 0.95) {
          // Already at steady state (within 5% of target)
          mode = 'steady_state';
          daysRemaining = null; // Infinite - data won't grow beyond this
        } else {
          // Still growing towards steady state
          mode = 'growth';
          const bytesUntilSteadyState = steadyStateBytes - dbSizeBytes;
          daysUntilSteadyState = Math.ceil(bytesUntilSteadyState / bytesPerDay);
        }
      } else {
        // No retention policy - will grow indefinitely
        mode = 'growth';
        
        // Try to get available disk space from system settings (set by /diag/resources once)
        try {
          const diskResult = await app.db.query(`
            SELECT value FROM system_settings WHERE key = $1
          `, ['capacity.disk_avail_bytes']);
          const availBytes = Number(diskResult.rows[0]?.value);
          if (availBytes && bytesPerDay > 0) {
            daysRemaining = Math.floor(availBytes / bytesPerDay);
          }
        } catch {}
      }
    }
    
    const capacityEstimate = {
      db_size_bytes: dbSizeBytes,
      rows_last_24h: rowCount,
      estimated_bytes_per_day: bytesPerDay,
      days_remaining: daysRemaining,
      retention_days: retentionDays,
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
      bytesPerDay, 
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
