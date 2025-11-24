/**
 * Log Cleanup Job
 * Deletes flow execution logs older than the retention period for each flow.
 * Can be run as a scheduled job or called directly.
 */

/**
 * Clean up flow logs based on retention settings
 * @param {Object} db - Database pool instance (app.db)
 * @returns {Object} Cleanup result
 */
export default async function cleanupFlowLogs(db) {
  const startTime = Date.now();
  let totalDeleted = 0;
  
  try {
    console.log('[Log Cleanup] Starting log cleanup job...');
    
    // Get all flows with logging enabled and their retention settings
    const flowsResult = await db.query(`
      SELECT id, name, logs_retention_days
      FROM flows
      WHERE logs_enabled = true
      ORDER BY id
    `);
    
    if (flowsResult.rows.length === 0) {
      console.log('[Log Cleanup] No flows with logging enabled. Nothing to clean up.');
      return { success: true, flowsProcessed: 0, logsDeleted: 0 };
    }
    
    console.log(`[Log Cleanup] Processing ${flowsResult.rows.length} flows with logging enabled...`);
    
    // Process each flow
    for (const flow of flowsResult.rows) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - flow.logs_retention_days);
        
        const deleteResult = await db.query(`
          DELETE FROM flow_execution_logs
          WHERE flow_id = $1
            AND timestamp < $2
        `, [flow.id, cutoffDate]);
        
        const deletedCount = deleteResult.rowCount || 0;
        totalDeleted += deletedCount;
        
        if (deletedCount > 0) {
          console.log(
            `[Log Cleanup] Flow "${flow.name}" (${flow.id}): ` +
            `Deleted ${deletedCount} logs older than ${flow.logs_retention_days} days`
          );
        }
      } catch (error) {
        console.error(
          `[Log Cleanup] Error processing flow ${flow.id} (${flow.name}):`,
          error.message
        );
        // Continue with other flows
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(
      `[Log Cleanup] Cleanup completed in ${duration}ms. ` +
      `Processed ${flowsResult.rows.length} flows, deleted ${totalDeleted} logs.`
    );
    
    return {
      success: true,
      flowsProcessed: flowsResult.rows.length,
      logsDeleted: totalDeleted,
      durationMs: duration
    };
    
  } catch (error) {
    console.error('[Log Cleanup] Fatal error during cleanup:', error);
    return {
      success: false,
      error: error.message,
      logsDeleted: totalDeleted
    };
  }
}
