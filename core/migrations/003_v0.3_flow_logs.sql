-- Migration: Flow Execution Logs
-- Version: 0.3
-- Description: Add table for storing flow execution logs with retention policy support

-- Create flow_execution_logs table
CREATE TABLE IF NOT EXISTS flow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES flow_executions(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_id TEXT,
  log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_execution 
  ON flow_execution_logs(execution_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_flow 
  ON flow_execution_logs(flow_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_level 
  ON flow_execution_logs(log_level);

CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_created_cleanup
  ON flow_execution_logs(flow_id, created_at);

-- Add log retention configuration to flows table
ALTER TABLE flows ADD COLUMN IF NOT EXISTS logs_enabled BOOLEAN DEFAULT false;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS logs_retention_days INTEGER DEFAULT 30 
  CHECK (logs_retention_days > 0 AND logs_retention_days <= 365);

-- Add comments
COMMENT ON TABLE flow_execution_logs IS 'Stores detailed logs from flow executions for debugging and monitoring';
COMMENT ON COLUMN flow_execution_logs.execution_id IS 'Reference to the execution that generated this log';
COMMENT ON COLUMN flow_execution_logs.flow_id IS 'Flow that generated this log (denormalized for efficient cleanup)';
COMMENT ON COLUMN flow_execution_logs.node_id IS 'Node that generated this log, null for system logs';
COMMENT ON COLUMN flow_execution_logs.log_level IS 'Severity level: debug, info, warn, error';
COMMENT ON COLUMN flow_execution_logs.message IS 'Log message text';
COMMENT ON COLUMN flow_execution_logs.timestamp IS 'When the log was generated during execution';
COMMENT ON COLUMN flow_execution_logs.metadata IS 'Additional context as JSON (e.g., error stack, node data)';

COMMENT ON COLUMN flows.logs_enabled IS 'Enable persistent log storage for this flow (deployed flows only)';
COMMENT ON COLUMN flows.logs_retention_days IS 'Number of days to retain logs before automatic deletion (1-365)';
