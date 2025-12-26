import fp from 'fastify-plugin';

/**
 * Flow Bootstrap Service
 * Ensures that all flows marked as 'deployed' are running after a system restart.
 * This service runs once on startup and checks for deployed flows that don't have
 * an active execution job or session.
 */
export const flowBootstrap = fp(async (app, opts = {}) => {
  const log = app.log.child({ mod: 'flow_bootstrap' });

  async function restartDeployedFlows(reason = 'startup') {
    try {
      // Query all flows that are marked as deployed
      // We only auto-restart 'continuous' flows that are 'deployed'
      // 'test_mode' flows are considered temporary and are not auto-restarted
      const { rows: deployedFlows } = await app.db.query(
        `SELECT id, name, scan_rate_ms, execution_mode 
         FROM flows 
         WHERE deployed = true 
           AND execution_mode = 'continuous'`
      );

      if (deployedFlows.length === 0) {
        log.info({ reason }, 'No deployed continuous flows to restart');
        return;
      }

      log.info({ count: deployedFlows.length, reason }, 'Checking deployed flows for restart');

      for (const flow of deployedFlows) {
        try {
          // Check if there's already an active session in memory
          // (Unlikely on startup, but good for manual triggers of this function)
          const { FlowSession } = await import('./flow-session.js');
          if (FlowSession.activeSessions.has(flow.id)) {
            log.debug({ flowId: flow.id, flowName: flow.name }, 'Flow already has an active session in memory');
            continue;
          }

          // Check if there's a queued or running job for this flow
          const { rows: existingJobs } = await app.db.query(
            `SELECT id FROM jobs 
             WHERE type = 'flow_execution' 
               AND status IN ('queued', 'running')
               AND (params->>'flow_id')::uuid = $1`,
            [flow.id]
          );

          if (existingJobs.length === 0) {
            // Initialize runtime state for the flow
            app.runtimeState.initFlow(flow.id);
            
            const scanRateMs = flow.scan_rate_ms || 1000;
            
            // Queue a new execution job
            await app.db.query(`
              INSERT INTO jobs (id, type, params, status, created_at, progress)
              VALUES (gen_random_uuid(), 'flow_execution', $1, 'queued', now(), '{"pct":0}'::jsonb)
            `, [JSON.stringify({ flow_id: flow.id, scanRateMs })]);
            
            log.info({ flowId: flow.id, flowName: flow.name }, 'Queued execution job for deployed flow');
          } else {
            log.debug({ flowId: flow.id, flowName: flow.name }, 'Execution job already exists for deployed flow');
          }
        } catch (err) {
          log.error({ err: err.message, flowId: flow.id, flowName: flow.name }, 'Failed to restart deployed flow');
        }
      }
    } catch (error) {
      log.error({ err: error.message }, 'Failed to query deployed flows for restart');
    }
  }

  // Expose helper for manual triggers if needed
  app.decorate('flowRestartAllDeployed', restartDeployedFlows);

  // Run on startup when the application is ready
  app.addHook('onReady', async () => {
    // Small delay to ensure other services (NATS, Connectivity) are fully initialized
    // and have had a chance to process their own startup logic
    setTimeout(async () => {
      await restartDeployedFlows('onReady');
    }, 2000);
  });
});

export default flowBootstrap;
