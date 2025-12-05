/**
 * Flow Resource Metrics Service
 * 
 * Manages system tags for flow resource monitoring and writes metrics to TimescaleDB.
 * Similar to system-metrics-sampler but for individual flow resource usage.
 */

/**
 * Ensure flow resource tags exist in database
 * Tags follow pattern: flow.{flow_id}.{metric_name}
 * 
 * @param {Object} app - Fastify app instance
 * @param {Object} flow - Flow object with id and name
 * @returns {Object} Map of metric names to tag_ids
 */
export async function ensureFlowResourceTags(app, flow) {
  const log = app.log.child({ svc: 'flow-resources', flowId: flow.id });
  
  try {
    // Get System connection
    const { rows: connRows } = await app.db.query(
      `SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true LIMIT 1`
    );
    
    if (!connRows.length) {
      log.error('System connection not found');
      return null;
    }
    
    const systemConnId = connRows[0].id;
    
    // Define flow resource metrics (using flow ID for uniqueness)
    const metrics = [
      { path: `flow.${flow.id}.scan_efficiency_pct`, name: `${flow.name} - Scan Efficiency (%)` },
      { path: `flow.${flow.id}.total_cycles`, name: `${flow.name} - Total Cycles` },
      { path: `flow.${flow.id}.cycles_per_second`, name: `${flow.name} - Cycles/Second` },
      { path: `flow.${flow.id}.uptime_seconds`, name: `${flow.name} - Uptime (seconds)` },
      { path: `flow.${flow.id}.memory_peak_mb`, name: `${flow.name} - Memory Peak (MB)` },
      { path: `flow.${flow.id}.memory_avg_mb`, name: `${flow.name} - Memory Avg (MB)` },
      { path: `flow.${flow.id}.scan_duration_ms`, name: `${flow.name} - Scan Duration (ms)` }
    ];
    
    const tagIds = {};
    
    // Create or update each metric tag
    for (const metric of metrics) {
      const { rows } = await app.db.query(
        `INSERT INTO tag_metadata (
          connection_id, 
          driver_type, 
          tag_path, 
          tag_name, 
          data_type, 
          is_subscribed, 
          status,
          metadata
        ) VALUES ($1, 'SYSTEM', $2, $3, 'REAL', true, 'active', $4)
        ON CONFLICT (connection_id, tag_path, driver_type) 
        DO UPDATE SET 
          tag_name = EXCLUDED.tag_name,
          is_subscribed = true,
          status = 'active',
          updated_at = now()
        RETURNING tag_id`,
        [
          systemConnId,
          metric.path,
          metric.name,
          JSON.stringify({ source: 'flow_resources', flow_id: flow.id })
        ]
      );
      
      if (rows.length) {
        const metricKey = metric.path.split('.').pop(); // Extract metric name
        tagIds[metricKey] = rows[0].tag_id;
      }
    }
    
    log.info({ tagIds }, 'Flow resource tags ensured');
    return tagIds;
  } catch (error) {
    log.error({ error }, 'Failed to ensure flow resource tags');
    return null;
  }
}

/**
 * Update flow resource tag names when flow name changes
 * Note: Tag paths use flow ID, so only display names need updating
 * 
 * @param {Object} app - Fastify app instance
 * @param {string} flowId - Flow ID
 * @param {string} oldName - Old flow name (unused, kept for compatibility)
 * @param {string} newName - New flow name
 */
export async function updateFlowResourceTagNames(app, flowId, oldName, newName) {
  const log = app.log.child({ svc: 'flow-resources', flowId });
  
  try {
    // Get System connection
    const { rows: connRows } = await app.db.query(
      `SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true LIMIT 1`
    );
    
    if (!connRows.length) {
      log.error('System connection not found');
      return;
    }
    
    const systemConnId = connRows[0].id;
    
    // Find all tags for this flow by UUID
    const { rows: tags } = await app.db.query(
      `SELECT tag_id, tag_path, tag_name 
       FROM tag_metadata 
       WHERE connection_id = $1 
         AND driver_type = 'SYSTEM'
         AND tag_path LIKE $2`,
      [systemConnId, `flow.${flowId}.%`]
    );
    
    // Update tag display names only (paths remain the same since they use UUID)
    for (const tag of tags) {
      const newTagName = tag.tag_name.replace(oldName, newName);
      
      await app.db.query(
        `UPDATE tag_metadata 
         SET tag_name = $1, updated_at = now()
         WHERE tag_id = $2`,
        [newTagName, tag.tag_id]
      );
    }
    
    log.info({ count: tags.length, oldName, newName }, 'Flow resource tag names updated');
  } catch (error) {
    log.error({ error, oldName, newName }, 'Failed to update flow resource tag names');
  }
}

/**
 * Remove flow resource tags when flow is deleted or undeployed
 * 
 * @param {Object} app - Fastify app instance
 * @param {string} flowId - Flow ID
 */
export async function removeFlowResourceTags(app, flowId) {
  const log = app.log.child({ svc: 'flow-resources', flowId });
  
  try {
    // Get System connection
    const { rows: connRows } = await app.db.query(
      `SELECT id FROM connections WHERE name = 'System' AND is_system_connection = true LIMIT 1`
    );
    
    if (!connRows.length) {
      return;
    }
    
    const systemConnId = connRows[0].id;
    
    // Mark tags as deleted (soft delete for historical data integrity)
    const { rowCount } = await app.db.query(
      `UPDATE tag_metadata 
       SET is_subscribed = false, 
           status = 'deleted',
           deleted_at = now(),
           updated_at = now()
       WHERE connection_id = $1 
         AND driver_type = 'SYSTEM'
         AND tag_path LIKE $2`,
      [systemConnId, `flow.${flowId}.%`]
    );
    
    log.info({ count: rowCount }, 'Flow resource tags marked as deleted');
  } catch (error) {
    log.error({ error, flowId }, 'Failed to remove flow resource tags');
  }
}

/**
 * Write flow resource metrics to system_metrics table
 * 
 * @param {Object} app - Fastify app instance
 * @param {Object} tagIds - Map of metric names to tag IDs
 * @param {Object} metrics - Metrics object from ScanExecutor.getMetrics()
 * @param {Date} timestamp - Timestamp for the metrics (defaults to now)
 * @param {number} minWriteIntervalMs - Minimum interval between writes (default 100ms)
 */
export async function writeFlowResourceMetrics(app, tagIds, metrics, timestamp = new Date(), minWriteIntervalMs = 100) {
  if (!app.tsdb || !tagIds || !metrics) {
    return;
  }
  
  // Throttle writes to prevent excessive load from very fast flows
  const now = Date.now();
  const throttleKey = tagIds.scan_efficiency_pct || tagIds.total_cycles || Object.values(tagIds)[0];
  const lastWrite = writeFlowResourceMetrics._lastWrites?.get(throttleKey) || 0;
  if (now - lastWrite < minWriteIntervalMs) {
    return; // Skip write if called too soon
  }
  
  // Track last write time per flow (keyed by first tag_id)
  if (!writeFlowResourceMetrics._lastWrites) {
    writeFlowResourceMetrics._lastWrites = new Map();
  }
  writeFlowResourceMetrics._lastWrites.set(throttleKey, now);
  
  const log = app.log.child({ svc: 'flow-resources' });
  
  try {
    const metricValues = [
      { tag_id: tagIds.scan_efficiency_pct, value: metrics.scanEfficiencyPercent },
      { tag_id: tagIds.total_cycles, value: metrics.totalCycles },
      { tag_id: tagIds.cycles_per_second, value: metrics.cyclesPerSecond },
      { tag_id: tagIds.uptime_seconds, value: metrics.uptimeSeconds },
      { tag_id: tagIds.memory_peak_mb, value: metrics.memoryPeakMb },
      { tag_id: tagIds.memory_avg_mb, value: metrics.memoryAvgMb },
      { tag_id: tagIds.scan_duration_ms, value: metrics.scanDurationAvgMs }
    ];
    
    // Insert each metric
    for (const metric of metricValues) {
      if (metric.tag_id && metric.value !== null && metric.value !== undefined) {
        await app.tsdb.query(
          `INSERT INTO system_metrics (tag_id, ts, v_num) 
           VALUES ($1, $2, $3)
           ON CONFLICT (tag_id, ts) DO UPDATE SET v_num = EXCLUDED.v_num`,
          [metric.tag_id, timestamp, metric.value]
        );
      }
    }
  } catch (error) {
    log.warn({ error }, 'Failed to write flow resource metrics');
  }
}
