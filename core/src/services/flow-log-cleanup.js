import cleanupFlowLogs from '../jobs/log-cleanup-job.js';

/**
 * Flow Log Retention Scheduler
 * Runs the log cleanup job daily at 2 AM (configurable via env)
 */

export function startFlowLogCleanupScheduler(logger, db) {
  const log = logger || console;
  
  // Run daily at 2 AM by default, or use env variable for custom interval
  const intervalHours = Math.max(1, Number(process.env.FLOW_LOG_CLEANUP_INTERVAL_HOURS || 24));
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  // Calculate delay until next 2 AM (or run immediately if in dev mode)
  const isDev = process.env.NODE_ENV === 'development';
  const now = new Date();
  let initialDelay;
  
  if (isDev) {
    // In development, run after 30 seconds
    initialDelay = 30_000;
  } else {
    // In production, calculate time until 2 AM
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);
    
    // If 2 AM already passed today, schedule for tomorrow
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    
    initialDelay = next2AM - now;
  }
  
  log.info({ 
    intervalHours, 
    initialDelayMs: initialDelay,
    nextRun: new Date(Date.now() + initialDelay).toISOString()
  }, 'flow log cleanup scheduler initialized');
  
  // Run initial cleanup after delay
  setTimeout(async () => {
    try {
      const result = await cleanupFlowLogs(db);
      log.info(result, 'flow log cleanup completed');
    } catch (error) {
      log.error({ err: error }, 'flow log cleanup failed');
    }
    
    // Schedule periodic cleanup
    setInterval(async () => {
      try {
        const result = await cleanupFlowLogs(db);
        log.info(result, 'flow log cleanup completed');
      } catch (error) {
        log.error({ err: error }, 'flow log cleanup failed');
      }
    }, intervalMs).unref();
    
  }, initialDelay).unref();
}
