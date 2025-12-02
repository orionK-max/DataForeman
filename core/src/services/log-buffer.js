/**
 * Log Buffer for Flow Execution Logs
 * Batches log writes to database to avoid performance impact
 */

export class LogBuffer {
  constructor(db, nats = null, batchSize = 50, flushInterval = 100) {
    this.db = db;
    this.nats = nats;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.buffer = [];
    this.timer = null;
    this.flushing = false;
    this.sequenceCounter = 0; // High-resolution sequence for ordering
  }

  /**
   * Generate high-resolution timestamp
   * Returns ISO timestamp with microseconds for precise ordering
   */
  getHighResTimestamp() {
    const hrtime = process.hrtime.bigint();
    const microseconds = Number(hrtime / 1000n); // Convert to microseconds
    const milliseconds = Math.floor(microseconds / 1000);
    const microRemainder = microseconds % 1000;
    
    const date = new Date(milliseconds);
    const isoBase = date.toISOString();
    // Insert microseconds before the 'Z'
    // Format: 2025-12-01T23:06:50.689123Z
    return isoBase.replace('Z', String(microRemainder).padStart(3, '0') + 'Z');
  }

  /**
   * Add log entry to buffer
   * @param {Object} log - Log entry
   * @param {string} log.execution_id - Execution UUID
   * @param {string} log.flow_id - Flow UUID
   * @param {string} [log.node_id] - Node ID (optional for system logs)
   * @param {string} log.log_level - 'debug', 'info', 'warn', 'error'
   * @param {string} log.message - Log message
   * @param {Date} [log.timestamp] - Log timestamp (defaults to now with microseconds)
   * @param {Object} [log.metadata] - Additional metadata
   */
  add(log) {
    // Use high-resolution timestamp if not provided
    const timestamp = log.timestamp || this.getHighResTimestamp();
    
    this.buffer.push({
      execution_id: log.execution_id,
      flow_id: log.flow_id,
      node_id: log.node_id || null,
      log_level: log.log_level,
      message: log.message,
      timestamp: timestamp,
      metadata: log.metadata || null
    });

    // Auto-flush if batch size reached
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      // Start timer for delayed flush
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Flush buffer to database
   * @returns {Promise<number>} Number of logs written
   */
  async flush() {
    if (this.buffer.length === 0 || this.flushing) return 0;

    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Move buffer to local variable
    const logsToWrite = this.buffer.splice(0);
    this.flushing = true;

    try {
      if (logsToWrite.length === 0) return 0;

      // Build bulk insert query
      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      for (const log of logsToWrite) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );
        values.push(
          log.execution_id,
          log.flow_id,
          log.node_id,
          log.log_level,
          log.message,
          log.timestamp,
          log.metadata ? JSON.stringify(log.metadata) : null
        );
      }

      const query = `
        INSERT INTO flow_execution_logs 
        (execution_id, flow_id, node_id, log_level, message, timestamp, metadata)
        VALUES ${placeholders.join(', ')}
      `;

      await this.db.query(query, values);

      // Publish logs to NATS for live updates
      if (this.nats && this.nats.healthy && this.nats.healthy()) {
        for (const log of logsToWrite) {
          try {
            await this.nats.publish(`df.logs.${log.flow_id}`, {
              execution_id: log.execution_id,
              flow_id: log.flow_id,
              node_id: log.node_id,
              log_level: log.log_level,
              message: log.message,
              timestamp: typeof log.timestamp === 'string' ? log.timestamp : log.timestamp.toISOString(),
              metadata: log.metadata
            });
          } catch (natsError) {
            console.warn('Failed to publish log to NATS:', natsError);
          }
        }
      }

      return logsToWrite.length;
    } catch (error) {
      // Log error but don't throw - we don't want logging failures to break execution
      console.error('Failed to flush log buffer:', error);
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Ensure all buffered logs are written
   * Call this before execution completes
   */
  async finalize() {
    await this.flush();
  }
}
