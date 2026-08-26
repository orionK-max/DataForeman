import cleanupFlowLogs from '../jobs/log-cleanup-job.js';

/**
 * Flow Log Retention Scheduler
 * Runs the log cleanup job shortly after startup, then periodically (every
 * FLOW_LOG_CLEANUP_INTERVAL_HOURS, default 24h).
 *
 * Previously this only ran once per calendar day at 2 AM (production) via a single setTimeout
 * computed from `next2AM - now` at startup. That's fragile in exactly the way it played out here:
 * every core restart recomputes "wait until next 2 AM" from scratch, so on a dev box restarted
 * often (or a host that sleeps overnight, pausing the timer) the job could go a very long time -
 * observed: 8+ months of un-pruned flow_execution_logs - without ever actually firing. Running
 * once shortly after startup (like log-retention.js already does for file logs) closes that gap.
 */
export function startFlowLogCleanupScheduler(logger, db) {
  const log = logger || console;

  const intervalHours = Math.max(1, Number(process.env.FLOW_LOG_CLEANUP_INTERVAL_HOURS || 24));
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const initialDelay = 30_000; // run shortly after startup, regardless of environment or time of day

  log.info({
    intervalHours,
    initialDelayMs: initialDelay,
    nextRun: new Date(Date.now() + initialDelay).toISOString()
  }, 'flow log cleanup scheduler initialized');

  const runOnce = async () => {
    try {
      const result = await cleanupFlowLogs(db);
      log.info(result, 'flow log cleanup completed');
    } catch (error) {
      log.error({ err: error }, 'flow log cleanup failed');
    }
  };

  setTimeout(() => {
    runOnce();
    setInterval(runOnce, intervalMs).unref();
  }, initialDelay).unref();
}

