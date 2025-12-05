/**
 * Flow Resource Monitoring Routes
 * 
 * API endpoints for tracking and warning about flow resource usage.
 */

import { FlowSession } from '../services/flow-session.js';

export default async function flowResourceRoutes(app, opts) {
  /**
   * GET /api/flows/resources/active
   * 
   * Get resource usage for all active flow sessions.
   * Reads live metrics from in-memory session manager.
   * 
   * Returns array of:
   * {
   *   flowId, flowName, sessionId, scanCount,
   *   scanEfficiencyPercent, totalCycles, cyclesPerSecond, uptimeSeconds,
   *   memoryPeakMb, memoryAvgMb,
   *   scanDurationAvgMs, scanDurationMaxMs,
   *   warnings: [] // Array of warning messages
   * }
   */
  app.get('/api/flows/resources/active', async (req, reply) => {
    const userId = req.user?.sub;
    
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // Check permission
    const canRead = await app.permissions.can(userId, 'flows', 'read');
    if (!canRead) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      // Get active sessions from PostgreSQL (metadata only)
      const result = await app.db.query(
        `SELECT 
          fs.id as session_id,
          fs.flow_id,
          f.name as flow_name,
          fs.started_at,
          f.scan_rate_ms
        FROM flow_sessions fs
        JOIN flows f ON fs.flow_id = f.id
        WHERE fs.status = 'active'
        ORDER BY f.name ASC`,
        []
      );

      const flows = result.rows.map(row => {
        // Get live metrics from in-memory session
        const session = FlowSession.activeSessions.get(row.flow_id);
        
        let metrics = {
          scanCount: 0,
          scanEfficiencyPercent: 0,
          totalCycles: 0,
          cyclesPerSecond: 0,
          uptimeSeconds: 0,
          memoryPeakMb: 0,
          memoryAvgMb: 0,
          scanDurationAvgMs: 0,
          scanDurationMaxMs: 0
        };
        
        let lastScanAt = row.started_at;
        
        // Get live metrics from running session
        if (session && session.scanExecutor) {
          const liveMetrics = session.scanExecutor.getMetrics();
          metrics = {
            scanCount: session.scanExecutor.scanCycle || 0,
            scanEfficiencyPercent: liveMetrics.scanEfficiencyPercent,
            totalCycles: liveMetrics.totalCycles,
            cyclesPerSecond: liveMetrics.cyclesPerSecond,
            uptimeSeconds: liveMetrics.uptimeSeconds,
            memoryPeakMb: liveMetrics.memoryPeakMb,
            memoryAvgMb: liveMetrics.memoryAvgMb,
            scanDurationAvgMs: liveMetrics.scanDurationAvgMs,
            scanDurationMaxMs: liveMetrics.scanDurationMaxMs
          };
          // Calculate approximate last scan time
          lastScanAt = new Date();
        }
        
        const warnings = [];
        
        // Warning thresholds
        const EFFICIENCY_WARNING_PERCENT = 70; // Using 70% of scan rate
        const EFFICIENCY_CRITICAL_PERCENT = 90; // Using 90% of scan rate
        const MEMORY_WARNING_MB = 100;
        const MEMORY_CRITICAL_MB = 250;
        
        // Scan efficiency warnings (approaching scan rate = performance issue)
        if (metrics.scanEfficiencyPercent > EFFICIENCY_CRITICAL_PERCENT) {
          warnings.push({
            type: 'performance',
            severity: 'critical',
            message: `Flow is using ${metrics.scanEfficiencyPercent.toFixed(1)}% of scan rate capacity`
          });
        } else if (metrics.scanEfficiencyPercent > EFFICIENCY_WARNING_PERCENT) {
          warnings.push({
            type: 'performance',
            severity: 'warning',
            message: `Flow is using ${metrics.scanEfficiencyPercent.toFixed(1)}% of scan rate capacity`
          });
        }
        
        // Memory warnings
        if (metrics.memoryPeakMb > MEMORY_CRITICAL_MB) {
          warnings.push({
            type: 'memory',
            severity: 'critical',
            message: `Peak memory usage: ${metrics.memoryPeakMb}MB`
          });
        } else if (metrics.memoryPeakMb > MEMORY_WARNING_MB) {
          warnings.push({
            type: 'memory',
            severity: 'warning',
            message: `Peak memory usage: ${metrics.memoryPeakMb}MB`
          });
        }
        
        const scanRateMs = row.scan_rate_ms || 1000;
        
        return {
          sessionId: row.session_id,
          flowId: row.flow_id,
          flowName: row.flow_name,
          scanCount: metrics.scanCount,
          scanEfficiencyPercent: metrics.scanEfficiencyPercent,
          totalCycles: metrics.totalCycles,
          cyclesPerSecond: metrics.cyclesPerSecond,
          uptimeSeconds: metrics.uptimeSeconds,
          memoryPeakMb: metrics.memoryPeakMb,
          memoryAvgMb: metrics.memoryAvgMb,
          scanDurationAvgMs: metrics.scanDurationAvgMs,
          scanDurationMaxMs: metrics.scanDurationMaxMs,
          startedAt: row.started_at,
          lastScanAt: lastScanAt,
          scanRateMs: scanRateMs,
          warnings: warnings
        };
      });

      return reply.send({
        flows: flows,
        totalActive: flows.length,
        totalWarnings: flows.reduce((sum, f) => sum + f.warnings.length, 0)
      });
    } catch (error) {
      app.log.error({ error: error.message, stack: error.stack }, 'Failed to get flow resources');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/flows/resources/summary
   * 
   * Get aggregate resource usage summary across all active flows.
   * Reads live metrics from in-memory session manager.
   * 
   * Returns:
   * {
   *   totalCpuTimeMs, totalMemoryMb, avgScanDurationMs,
   *   flowCount, flowsWithWarnings
   * }
   */
  app.get('/api/flows/resources/summary', async (req, reply) => {
    const userId = req.user?.sub;
    
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const canRead = await app.permissions.can(userId, 'flows', 'read');
    if (!canRead) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      // Get active sessions from PostgreSQL
      const result = await app.db.query(
        `SELECT flow_id
        FROM flow_sessions
        WHERE status = 'active'`,
        []
      );

      let totalCpuTimeMs = 0;
      let totalMemoryPeakMb = 0;
      let totalMemoryAvgMb = 0;
      let maxScanDurationMs = 0;
      let scanDurationSum = 0;
      let scanDurationCount = 0;

      // Aggregate metrics from in-memory sessions
      for (const row of result.rows) {
        const session = FlowSession.activeSessions.get(row.flow_id);
        if (session && session.scanExecutor) {
          const metrics = session.scanExecutor.getMetrics();
          totalCpuTimeMs += metrics.cpuTimeMs;
          totalMemoryPeakMb += metrics.memoryPeakMb;
          totalMemoryAvgMb += metrics.memoryAvgMb;
          maxScanDurationMs = Math.max(maxScanDurationMs, metrics.scanDurationMaxMs);
          if (metrics.scanDurationAvgMs > 0) {
            scanDurationSum += metrics.scanDurationAvgMs;
            scanDurationCount++;
          }
        }
      }

      const avgScanDuration = scanDurationCount > 0 
        ? Math.round(scanDurationSum / scanDurationCount) 
        : 0;

      return reply.send({
        flowCount: result.rows.length,
        totalCpuTimeMs: Math.round(totalCpuTimeMs),
        totalMemoryPeakMb: Number(totalMemoryPeakMb.toFixed(2)),
        avgMemoryMb: result.rows.length > 0 ? Number((totalMemoryAvgMb / result.rows.length).toFixed(2)) : 0,
        avgScanDurationMs: avgScanDuration,
        maxScanDurationMs: Math.round(maxScanDurationMs)
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to get resource summary');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
