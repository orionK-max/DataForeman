// Shared NATS subject names for core <-> flow-executor RuntimeStateStore sync.
// Kept in their own tiny module (no side effects) so both core/src/executor/index.js (the forked
// child) and core/src/services/flow-executor-manager.js (in core's main process) can import them
// without either one accidentally pulling in the other's bootstrap code.
export const SUBJECT_OUTPUTS = 'df.flow.executor.outputs.v1';   // executor -> core (live view)
export const SUBJECT_TRIGGER = 'df.flow.executor.trigger.v1';   // core -> executor (manual trigger button)
