-- Migration: Fix execution_id to be nullable for continuous execution logs
-- Version: 0.3.1
-- Description: Make execution_id nullable in flow_execution_logs to support continuous execution mode

-- Drop the foreign key constraint
ALTER TABLE flow_execution_logs 
  DROP CONSTRAINT IF EXISTS flow_execution_logs_execution_id_fkey;

-- Make execution_id nullable and re-add the foreign key
ALTER TABLE flow_execution_logs 
  ALTER COLUMN execution_id DROP NOT NULL;

-- Re-add foreign key constraint
ALTER TABLE flow_execution_logs 
  ADD CONSTRAINT flow_execution_logs_execution_id_fkey 
  FOREIGN KEY (execution_id) REFERENCES flow_executions(id) ON DELETE CASCADE;

-- Update comment to clarify nullable behavior
COMMENT ON COLUMN flow_execution_logs.execution_id IS 'Reference to the execution that generated this log (NULL for continuous execution mode)';
