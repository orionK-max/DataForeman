// Flow Session Manager
// Manages long-running continuous flow execution sessions

import crypto from 'crypto';
import { ensureFlowResourceTags, writeFlowResourceMetrics } from './flow-resource-metrics.js';

/**
 * FlowSession class manages a continuous flow execution session.
 * Creates session record in database, starts scan executor, tracks scan count,
 * and handles graceful shutdown.
 */
export class FlowSession {
  // Static registry to track active sessions by flow ID
  static activeSessions = new Map();

  constructor(flow, context, ScanExecutor) {
    this.flow = flow;
    this.context = context;
    this.ScanExecutorClass = ScanExecutor;
    this.sessionId = null;
    this.scanExecutor = null;
    this.isRunning = false;
    this.scanCountUpdateInterval = null;
    this.flowResourceTagIds = null; // Tag IDs for resource metrics
    this.app = context.app;
    this.log = this.app.log.child({ flowId: flow.id });
  }

  /**
   * Start the flow session
   * Creates database record and starts scan executor
   */
  async start() {
    try {
      // Create session record in database (metadata only - no metrics)
      const scanRateMs = this.flow.scan_rate_ms || 1000;
      const { rows } = await this.app.db.query(
        `INSERT INTO flow_sessions 
         (flow_id, status, started_at, config)
         VALUES ($1, 'active', now(), $2)
         RETURNING *`,
        [this.flow.id, { scanRateMs }]
      );

      const session = rows[0];
      this.sessionId = session.id;
      this.isRunning = true;

      this.log = this.app.log.child({ flowId: this.flow.id, sessionId: this.sessionId });
      this.log.info({ scanRateMs }, 'Flow session started');

      // Ensure flow resource tags exist if save_usage_data is enabled
      if (this.flow.save_usage_data !== false) {
        this.flowResourceTagIds = await ensureFlowResourceTags(this.app, this.flow);
      }

      // Create scan executor
      const executionContext = {
        ...this.context,
        session,
        sessionId: this.sessionId
      };

      this.scanExecutor = new this.ScanExecutorClass(this.flow, executionContext);
      
      // Set up metrics update callback to write to system_metrics (TimescaleDB)
      this.scanExecutor.onMetricsUpdate = async (metrics) => {
        // Write to system_metrics table if save_usage_data is enabled
        if (this.flow.save_usage_data !== false && this.flowResourceTagIds) {
          await writeFlowResourceMetrics(this.app, this.flowResourceTagIds, metrics);
        }
      };
      
      await this.scanExecutor.start();

      // Register this session in the static registry
      FlowSession.activeSessions.set(this.flow.id, this);

      return this.sessionId;
    } catch (error) {
      this.log.error({ error }, 'Failed to start flow session');
      await this.handleError(error.message);
      throw error;
    }
  }

  /**
   * Stop the flow session gracefully
   */
  async stop(reason = 'stopped') {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    try {
      // Stop scan executor
      if (this.scanExecutor) {
        this.scanExecutor.stop();
      }

      // Get final scan count for logging
      const totalScans = this.scanExecutor?.scanCycle || 0;

      // Update session record with final status (no metrics - they're in TimescaleDB)
      await this.app.db.query(
        `UPDATE flow_sessions
         SET status = $1,
             stopped_at = now(),
             updated_at = now()
         WHERE id = $2`,
        [
          reason === 'error' ? 'error' : 'stopped',
          this.sessionId
        ]
      );

      this.log.info({ 
        reason, 
        totalScans
      }, 'Flow session stopped');
      
      // Unregister from static registry
      FlowSession.activeSessions.delete(this.flow.id);
    } catch (error) {
      this.log.error({ error }, 'Error stopping flow session');
    }
  }

  /**
   * Handle session error
   */
  async handleError(errorMessage) {
    this.isRunning = false;

    try {
      if (this.sessionId) {
        await this.app.db.query(
          `UPDATE flow_sessions
           SET status = 'error',
               error_message = $1,
               stopped_at = now(),
               updated_at = now()
           WHERE id = $2`,
          [errorMessage, this.sessionId]
        );
      }

      this.log.error({ errorMessage }, 'Flow session encountered error');
    } catch (error) {
      this.log.error({ error }, 'Failed to record session error');
    }
  }

  /**
   * Get current session status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      flowId: this.flow.id,
      isRunning: this.isRunning,
      scanCycle: this.scanExecutor?.scanCycle || 0,
      scanRateMs: this.flow.scan_rate_ms || 1000
    };
  }

  /**
   * Static method to stop session by flow ID
   */
  static async stopSessionByFlowId(flowId) {
    const session = FlowSession.activeSessions.get(flowId);
    if (session) {
      await session.stop('undeployed');
      return true;
    }
    return false;
  }

  /**
   * Static method to stop all active sessions (for graceful shutdown)
   */
  static async stopAllActiveSessions(app) {
    const log = app.log.child({ mod: 'flow_session' });
    
    try {
      const { rows } = await app.db.query(
        `UPDATE flow_sessions
         SET status = 'stopped',
             stopped_at = now(),
             updated_at = now()
         WHERE status = 'active'
         RETURNING id, flow_id`
      );

      if (rows.length > 0) {
        log.info({ count: rows.length }, 'Stopped all active flow sessions on shutdown');
      }

      return rows.length;
    } catch (error) {
      log.error({ error }, 'Failed to stop active sessions on shutdown');
      return 0;
    }
  }
}
