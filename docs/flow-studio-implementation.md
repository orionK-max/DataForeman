# Flow Studio Implementation

**Status**: ✅ **Phase 1 Complete** (2025-11-16)  
**Version**: v0.2 (MVP with manual trigger, JavaScript scripts, linear flows, internal tags)

> This document describes the Flow Studio architecture and implementation. Phase 1 (MVP) is complete and production-ready.

---

## 1. Core Architecture

### Data Flow
```
PLC → Connectivity → NATS → [Flow Studio] → Internal Tags → NATS → Ingestor → TimescaleDB
                                   ↓
                            Existing Job System
                                   ↓
                            Script Execution (isolated)
```

### Service Integration
- **No new microservice** - integrate into existing `core` service
- Script execution uses existing **Job system** for scheduling and tracking
- Scripts run in **isolated worker process** (extend existing job workers with script execution capability)

---

## 2. Database Schema

**Status**: ✅ **Implemented** in `core/migrations/002_seed_data.sql`

All Flow Studio tables have been added to the existing migration file.

### New Tables

```sql
-- Flows (main definition)
flows (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES users(id),
  folder_id uuid,  -- integrate with existing folder system
  deployed boolean DEFAULT false,
  shared boolean DEFAULT false,  -- shared flows visible to all users
  definition jsonb NOT NULL,  -- nodes, connections, settings
  static_data jsonb,  -- flow-scoped persistent state
  created_at timestamptz,
  updated_at timestamptz
);
CREATE INDEX idx_flows_owner ON flows(owner_user_id);
CREATE INDEX idx_flows_shared ON flows(shared) WHERE shared = true;

-- Flow execution history
flow_executions (
  id uuid PRIMARY KEY,
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  trigger_node_id text,  -- which trigger node started this execution
  started_at timestamptz,
  completed_at timestamptz,
  status text,  -- 'running', 'success', 'error', 'cancelled'
  node_outputs jsonb,  -- debugging: output of each node
  error_log jsonb,
  execution_time_ms integer
);
CREATE INDEX idx_flow_executions_flow_id_started ON flow_executions(flow_id, started_at DESC);

-- Tag-Flow dependencies (cross-reference)
flow_tag_dependencies (
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  tag_id integer REFERENCES tag_metadata(tag_id) ON DELETE CASCADE,
  node_id text,  -- which node in the flow references this tag
  dependency_type text,  -- 'input', 'output'
  PRIMARY KEY (flow_id, tag_id, node_id, dependency_type)
);
CREATE INDEX idx_flow_tag_deps_tag ON flow_tag_dependencies(tag_id);
CREATE INDEX idx_flow_tag_deps_flow ON flow_tag_dependencies(flow_id);
```

**Note**: Triggers are nodes within the flow definition, not a separate table. Each flow can have one or more trigger nodes that determine when it executes.

### Extended Columns in Existing Tables

```sql
-- Extend tag_metadata for internal tags
-- Use existing driver_type column, add 'INTERNAL' to the enum
ALTER TABLE tag_metadata DROP CONSTRAINT tag_metadata_driver_type_check;
ALTER TABLE tag_metadata ADD CONSTRAINT tag_metadata_driver_type_check 
  CHECK (driver_type IN ('EIP', 'OPCUA', 'S7', 'MQTT', 'SYSTEM', 'INTERNAL'));

-- Note: tag_metadata already has 'shared' column for consistency with flows
-- Note: Reuse existing 'is_subscribed' column for internal tags:
--   - PLC tags: is_subscribed = poll from PLC AND save to DB
--   - Internal tags: is_subscribed = save to DB (no polling needed)
-- Note: Reuse existing 'on_change_enabled' and related columns for save triggers:
--   - on_change_enabled = true: Save on value change (default for internal tags)
--   - on_change_enabled = false: Save at interval based on poll_group_id
--   - on_change_deadband: Threshold for "change" detection
--   - on_change_heartbeat_ms: Max time between saves even if no change
-- Note: source_flow_id and source_node_id NOT needed - use flow_tag_dependencies table to track writers
```

**Internal Tag Identification**:
- PLC tags: `driver_type IN ('EIP', 'OPCUA', 'S7', 'MQTT')`
- System tags: `driver_type = 'SYSTEM'`
- Internal tags: `driver_type = 'INTERNAL'` (user-created via tag creation dialogue (Connectivity/Tags/Internal))
- Internal tag writers tracked via `flow_tag_dependencies` table (supports multiple flows writing to same tag)

**Internal Tag Persistence Model (matches PLC tag workflow)**:
- Internal tags created with `is_subscribed = false` (default): Tag exists in tag table, **Phase 1**: latest value in TimescaleDB, **Phase 2**: value in memory cache only
- User selects tag(s) in Connectivity/Tags/Internal table and clicks "Save" button
- Configure save trigger:
  - **On Change** (default): Set `is_subscribed = true`, `on_change_enabled = true`
  - **Interval**: Set `is_subscribed = true`, `on_change_enabled = false`, assign to appropriate `poll_group_id` (1s, 5s, 1m, etc.)
- Ingestor persists to TimescaleDB only when `is_subscribed = true`
- **Phase 1**: Current value read from TimescaleDB (temporary); **Phase 2**: Current value in memory cache regardless of `is_subscribed`
- User clicks "Stop Saving" to disable: Shows warning dialog, then sets `is_subscribed = false` and deletes historical data
- Saved tags appear in "Saved Tags" table

### Sharing Model

**Flows**:
- `shared = false` (default): Only owner can view/edit/execute
- `shared = true`: All users can view and execute; only owner can edit/delete
- Owner can toggle sharing via UI

**Internal Tags** (System-Wide Shared Resources):
- **All internal tags are automatically visible to all users** (like PLC tags)
- No individual ownership - they are system-wide resources
- Access controlled by feature permissions (`connectivity.tags:read`)
- Any user with permissions can read internal tag values
- Internal tags are created automatically by flow tag-output nodes
- Multiple flows can write to the same internal tag
- Tag metadata shows which flows write to the tag (via `flow_tag_dependencies`)
- Users can enable/disable saving to TimescaleDB (Save/Stop Saving buttons)

**Permissions**:
- View flow: `flows:read` permission + (owner OR shared=true)
- Edit flow: `flows:update` permission + owner only
- Execute flow: `flows:execute` permission + (owner OR shared=true)
- Delete flow: `flows:delete` permission + owner only
- View internal tags: `connectivity.tags:read` permission (all users with permission see all internal tags)
- Modify internal tags: `connectivity.tags:update` permission (change name, units, description)

---

## 3. Node Type System

**Status**: ✅ **Implemented** in Phase 1

### Node Definition Schema
```json
{
  "id": "node-uuid",
  "type": "math|filter|script-js|script-py|tag-input|tag-output",
  "name": "User-visible name",
  "typeVersion": 1,
  "position": [x, y],
  "disabled": false,
  "parameters": {
    // Type-specific config
  }
}
```

### Built-in Node Types (Phase 1)

**Status**: ✅ **Migrated to Class-Based Architecture** (Nov 2025)

All nodes now use class-based implementation extending `BaseNode`:

**Triggers**:
- `trigger-manual` - Manual execution button in UI (ManualTriggerNode)

**Tag I/O**:
- `tag-input` - Read tag values from DB/memory (TagInputNode)
- `tag-output` - Write to internal tags via NATS (TagOutputNode)

**Math** (Unified):
- `math` - 8 operations: add, subtract, multiply, divide, average, min, max, custom formula (MathNode)
  - Supports 2+ dynamic inputs
  - Number validation with skipInvalid option
  - Safe formula evaluation with Math functions

**Comparison** (Unified):
- `comparison` - 6 operators: gt, lt, gte, lte, eq, neq (ComparisonNode)
  - Two-input comparison
  - Optional tolerance for equality (Number.EPSILON default)
  - Quality threshold checking (min 64)

**Scripts**:
- `script-js` - VM-based JavaScript execution (JavaScriptNode)
  - APIs: $input, $tags, $flow, $fs
  - Configurable timeout and error handling
  - Async/await support

**Architecture**:
- **Class-Based Execution**: All nodes use NodeRegistry for consistent execution
- **Legacy Removed** (Nov 2025): Switch-based execution code has been removed
- **6 Nodes Registered**: trigger-manual, tag-input, tag-output, math, comparison, script-js
- **Location**: `core/src/nodes/` organized by category (triggers/, tags/, math/, comparison/, scripts/)
- **Registry**: `core/src/nodes/base/NodeRegistry.js` singleton pattern

**Phase 1 Constraints**:
- All nodes have exactly 1 output port (simple linear flows)
- Only manual trigger (scheduled/event triggers in Phase 2)
- Complex routing/branching deferred to Phase 2
- Python scripts deferred to Phase 2

**Node Connection Rules**:
- Trigger nodes have no input, only output
- Must have at least one trigger node per flow
- Trigger nodes must be at the start of execution chain

### Node Type Versioning
- Store `typeVersion` with each node instance
- When schema changes, increment version, maintain backward compatibility
- Migration helper: `migrateNodeParameters(oldVersion, newVersion, params)`

---

## 4. Script Execution Architecture

**Status**: ✅ **Implemented** - Sandboxed JavaScript execution with filesystem access controls

### Execution Model
```
Core Service (API)
  ↓
Job System (existing)
  ↓
Script Worker Process (new)
  ├─ JavaScript: Node.js vm.createContext()
  └─ Python: subprocess with timeout
```

### Worker Implementation
**Location**: `core/src/workers/flow-execution-worker.mjs`

**Features**:
- Extends existing job worker pattern
- Handles `flow-execution` job type
- For script nodes: spawns isolated context, enforces timeout
- Returns: `{ success, output, error, executionTimeMs }`
- Integrates with existing job status tracking

### Sandboxing Constraints

**JavaScript (vm module)**:
```javascript
const context = {
  $input: inputValue,
  $tags: {
    get: (tagName) => fetchTagValue(tagName),
    history: (tagName, duration) => fetchHistory(tagName, duration)
  },
  $flow: { state: flowStaticData },
  $fs: {
    // Limited filesystem access for self-hosted environment
    readFile: (path) => safeReadFile(path, allowedPaths),
    writeFile: (path, content) => safeWriteFile(path, content, allowedPaths),
    readDir: (path) => safeReadDir(path, allowedPaths),
    exists: (path) => safeExists(path, allowedPaths),
    stat: (path) => safeStat(path, allowedPaths)
  },
  console: { log: captureLog },
  Math, Date, JSON, // Safe globals
  // BLOCKED: require, process (except allowed APIs), __dirname, global
};
vm.runInContext(userCode, vm.createContext(context), { timeout: 10000 });
```

**Python (Phase 2)**:
```python
# Deferred to Phase 2
# Will use subprocess with resource limits similar to JS approach
# $fs API will be available via Python functions with same restrictions
```

### Filesystem Access Implementation

**Rationale**: Self-hosted environment with no internet access allows safe filesystem operations for processing external data files (CSV, JSON, logs, etc.).

**Security Approach**:
```javascript
// Configuration (environment variable or config file)
const ALLOWED_FS_PATHS = process.env.FLOW_ALLOWED_PATHS?.split(':') || [
  '/data/files',
  '/var/dataforeman/uploads',
  '/mnt/shared'
];

// Safe wrapper functions
function safeReadFile(requestedPath, allowedPaths) {
  const canonical = path.resolve(requestedPath);
  
  // Validate path is within allowed directories
  const isAllowed = allowedPaths.some(allowed => 
    canonical.startsWith(path.resolve(allowed))
  );
  
  if (!isAllowed) {
    throw new Error(`Access denied: ${requestedPath} not in allowed paths`);
  }
  
  // Additional checks
  if (!fs.existsSync(canonical)) {
    throw new Error(`File not found: ${requestedPath}`);
  }
  
  const stats = fs.statSync(canonical);
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${requestedPath}`);
  }
  
  // Size limit: 10MB per file
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error(`File too large: ${requestedPath} exceeds 10MB`);
  }
  
  return fs.readFileSync(canonical, 'utf8');
}

// Similar wrappers for writeFile, readDir, exists, stat
// NO support for: unlink (delete), chmod, exec, symlink
```

**Configuration**:
- Environment variable: `FLOW_ALLOWED_PATHS=/data/files:/mnt/shared:/var/uploads`
- Settings UI in admin panel to manage allowed paths
- Paths validated on server startup
- Docker volume mounts for external file access

**Usage Example**:
```javascript
// In flow script node
const csvData = $fs.readFile('/data/files/production-report.csv');
const lines = csvData.split('\n');
const values = lines.map(line => parseFloat(line.split(',')[2]));
const average = values.reduce((a,b) => a+b) / values.length;

$fs.writeFile('/data/files/results.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  average: average,
  count: values.length
}));

return average;
```

---

## 5. Flow Execution Engine

**Status**: ✅ **Implemented** with class-based architecture

**Implementation Details**:
- File: `core/src/services/flow-executor.js`
- **Class-Based Execution**: All nodes execute via `NodeRegistry` (legacy code removed Nov 2025)
- Graph validation with cycle detection
- Topological sort for execution order
- Tag dependency tracking via `flow_tag_dependencies` table
- Concurrent execution via jobs system (configurable `MAX_CONCURRENT_JOBS`)

**Node Architecture**:
- **Base Classes**: `BaseNode` (abstract), `NodeExecutionContext`, `NodeRegistry`
- **Registered Nodes**: All 6 core nodes (trigger-manual, tag-input, tag-output, math, comparison, script-js)
- **Location**: `core/src/nodes/` organized by category
- **Registration**: `core/src/nodes/index.js` registers all nodes at startup

**Load Test Results** (2025-11-16):

| Flows | Success Rate | Avg Queue Time | Avg Execution | Throughput |
|-------|--------------|----------------|---------------|------------|
| 20    | 100% (20/20) | 879ms          | 84ms          | 15.42/s    |
| 30    | 100% (30/30) | 1114ms         | 135ms         | 17.11/s    |
| 50    | 100% (50/50) | 706ms          | 115ms         | 32.49/s    |

---

### Execution Steps
1. **Trigger fires** → Identify which trigger node was activated (manual button click)
2. **Create job** → Insert into `jobs` table with flow_id and trigger_node_id
3. **Job worker picks up** → Load flow definition
4. **Validate graph** → Check for cycles, missing connections, ensure trigger node exists
5. **Build execution context** → Fetch current tag values
6. **Find execution start** → Locate trigger node(s) in the graph
7. **Topological sort** → Order nodes by dependencies starting from trigger
8. **Execute nodes sequentially**:
   - Built-in nodes: inline execution
   - Script nodes: create child job, await result
9. **Write outputs** → Update memory cache and publish internal tag updates to NATS (with `is_subscribed` flag)
10. **Store execution record** → Save to `flow_executions` for debugging

### Cancellation Support
- Use `AbortController` pattern
- Job can be cancelled via API: `POST /flows/{id}/executions/{execId}/cancel`
- Script workers check abort signal every 100ms

### Error Handling
**Per-node configuration**: `onError: 'stop' | 'skip'`
- `stop`: Halt flow execution, mark as failed
- `skip`: Continue with null output, log warning

### Quality Propagation
- **Default behavior**: If input tag has bad quality, output inherits bad quality automatically
- **Script nodes**: Can override quality in return value: `return { value: 42, quality: 'good' }`
- **Quality codes**: Use same system as PLC tags (0=bad, 192=good, etc.)

---

## 6. API Endpoints

**Status**: ✅ **All Phase 1 endpoints implemented** in `core/src/routes/flows.js`

**Implemented Endpoints**:

### Flow Management
```
GET    /flows                    # List flows (owner's + shared)
POST   /flows                    # Create flow
GET    /flows/:id                # Get flow definition (owner or shared)
PUT    /flows/:id                # Update flow (owner only)
DELETE /flows/:id                # Delete flow (owner only)
POST   /flows/:id/deploy         # Deploy flow (activate) (owner only)
POST   /flows/:id/undeploy       # Undeploy flow (owner only)
PUT    /flows/:id/sharing        # Toggle shared flag (owner only)
```

### Execution
```
POST   /flows/:id/run            # Manual trigger (owner or shared)
GET    /flows/:id/executions     # Execution history (owner or shared)
GET    /flows/:id/executions/:execId  # Execution details (owner or shared)
POST   /flows/:id/executions/:execId/cancel  # Cancel running execution (owner only)
```

### Cross-References
```
GET    /tags/:id/flows           # Flows using this tag (input or output)
GET    /flows/:id/tags           # Tags used by this flow (input or output)
GET    /tags/internal            # List all internal tags (user's + shared)
GET    /tags/:id/writers         # Flows that write to this tag (dependency_type='output')
```

### Filesystem Configuration (Admin Only)
```
GET    /admin/flows/allowed-paths     # Get allowed filesystem paths
POST   /admin/flows/allowed-paths     # Add allowed path
DELETE /admin/flows/allowed-paths/:id # Remove allowed path
PUT    /admin/flows/allowed-paths     # Update allowed paths (batch)
```

**Permission**: `flows.config:update` (admin only)

**Request/Response**:
```json
// GET response
{
  "allowedPaths": [
    { "id": 1, "path": "/data/files", "description": "Production data files" },
    { "id": 2, "path": "/mnt/shared", "description": "Network share" }
  ]
}

// POST request
{
  "path": "/var/dataforeman/uploads",
  "description": "User uploaded files"
}
```

---

## 7. Frontend (React Flow)

**Status**: ✅ **Phase 1 UI Complete** - Flow editor, browser, and internal tags integration

**Implemented Components**:
- `FlowEditor.jsx` - Visual flow editor with React Flow
- `FlowBrowser.jsx` - Flow management interface
- Internal tags tab in Connectivity page
- Node configuration panels
- Execution history viewer

**Key Features**:
- Drag-and-drop node creation
- Visual node connections
- Real-time execution with "Test Run" button
- Flow deployment toggle
- Execution history with node outputs

---

### Libraries
- **React Flow** - Canvas and graph editing
- **Monaco Editor** - Script editing with syntax highlighting
- **MUI** - Consistent styling with existing UI

### Key Components
```
FlowEditor/
  ├─ Canvas.jsx           # React Flow canvas
  ├─ NodePalette.jsx      # Drag-drop node library (includes trigger nodes)
  ├─ NodeConfig.jsx       # Side panel for selected node
  ├─ FlowSettings.jsx     # Flow metadata (name, description, sharing)
  ├─ ExecutionHistory.jsx # Debug view
  └─ ScriptEditor.jsx     # Monaco-based code editor

FlowBrowser/
  ├─ FlowList.jsx         # Browse flows (My Flows / Shared Flows tabs)
  └─ FlowCard.jsx         # Flow preview card with owner/shared badge
```

### State Management
- Use existing context pattern (similar to charts/dashboards)
- Local state: Current flow definition (nodes, connections)
- Server sync: Debounced auto-save to draft
- Deploy: Explicit user action, validates before activation
- Sharing toggle: Available in flow settings, updates flow and all internal tags

---

## 8. Development Phases

**Phase 1 Status**: ✅ **COMPLETE** (2025-11-16)

### Phase 1: MVP (v0.2) - ✅ Complete

### Phase 1: MVP (v0.2)
**Goal**: Demonstrate basic flow execution with script nodes

**Scope**:
- ✅ Database schema and migrations
- ✅ Flow CRUD API with sharing support
- ✅ Trigger node (manual only)
- ✅ Tag input/output nodes (single output)
- ✅ Math nodes (add, subtract, multiply, divide)
- ✅ Comparison nodes (>, <, ==, !=)
- ✅ Script nodes (JavaScript only)
- ✅ Flow execution worker with JS sandboxing
- ✅ Basic React Flow editor (linear flows)
- ✅ Flow settings panel (name, description, sharing toggle)
- ✅ Flow browser with My Flows / Shared Flows tabs
- ✅ Internal tags created via:
  - Tag creation dialog in Connectivity/Tags/Internal tab
  - OR tag-output node "Create New" option in flow editor
- ✅ Internal tag type selection (float, int, bool, string)
- ✅ Internal tag initial value configuration (optional)
- ✅ Internal tag table (Connectivity/Tags/Internal) with columns: name, type, saved status, save trigger, written by flows
- ✅ "Save" button workflow (matches PLC tags):
  - Select internal tag(s) from table
  - Click "Save" → Configure save trigger (On Change / Interval)
  - System sets `is_subscribed = true`
- ✅ "Stop Saving" button with warning dialog about data deletion
- ✅ Save trigger configuration: On Change (default) or Interval (1s, 5s, 1m, etc.)
- ✅ Tag-input nodes read from TimescaleDB (**temporary** - Phase 2 will add memory cache)
- ✅ Ingestor respects is_subscribed flag (only persists when true)
- ✅ Internal tag sharing (inherits from flow)
- ✅ Tag browser shows internal tags with all writing flows and save trigger
- ✅ Support multiple flows writing to same internal tag (tracked via flow_tag_dependencies)
- ✅ Manual execution via trigger node
- ✅ View last execution result
- ✅ Quality propagation rules
- ✅ Flow validation (require trigger node, check connectivity)
- ✅ Permission checks (owner vs. shared access)
- ✅ Limited filesystem access via `$fs` API:
  - ✅ Configurable allowed paths (environment variable)
  - ✅ Path traversal prevention
  - ✅ Read/write operations (readFile, writeFile, readDir, exists, stat)
  - ✅ 10MB file size limit
  - ✅ No delete/execute operations
  - ✅ Admin API for managing allowed paths (backend only)

**Explicitly Deferred to Phase 2**:
- Admin UI for managing allowed filesystem paths (backend API exists)
- Scheduled trigger nodes (cron-like)
- Event trigger nodes (on tag change, on condition)
- Python script support
- Execution history retention (>1 run)
- Filter/statistics nodes (moving average, rate of change)
- Multi-output nodes (branching/routing)
- Flow versioning/rollback

### Phase 2: Production-Ready (v0.3)
**Scope**:
- ⬜ **Admin UI for managing allowed filesystem paths** (backend API already exists)
  - Frontend interface for viewing/adding/removing allowed paths
  - Only accessible to users with `flows.config:update` permission
  - Integrates with existing admin panel
- ⬜ **Memory cache for tag values** (Redis or in-memory Map/LRU cache)
  - Current implementation reads from TimescaleDB (4-6ms latency)
  - Memory cache will reduce to <1ms and eliminate DB load during execution
  - Ingestor updates cache on tag value changes
  - Tag-input nodes read from cache instead of DB
- ⬜ Scheduled trigger nodes (cron-like timing)
- ⬜ Event trigger nodes (on tag change, on condition)
- ⬜ Python script support
- ⬜ Execution history (last 100 runs)
- ⬜ Filter nodes (moving average, rate of change, statistics)
- ⬜ Flow versioning (rollback to previous deploy)
- ⬜ Multi-output nodes (branching, routing, switch)
- ⬜ Error output ports (route errors separately)

### Phase 3: Advanced (v0.4+)
**Scope**:
- Whitelisted npm packages in JS scripts
- State/latch nodes for persistent logic
- Flow templates library
- Import/export flows
- Flow debugging tools (breakpoints, step-through)
- Performance optimizations for high-frequency executions

---

## 9. Security & Performance

### Sandboxing (Critical)
- ✅ Scripts NEVER run in core process
- ✅ No network access from scripts
- ✅ Limited filesystem access via `$fs` API:
  - **Configurable allowed paths** (set via environment variable or config file)
  - **Path traversal prevention** (canonical path validation)
  - **Read/write operations** restricted to allowed directories
  - **Default allowed paths**: `/data/files/`, `/var/dataforeman/uploads/`
  - **Operations**: readFile, writeFile, readDir, exists, stat (no delete/execute)
- ✅ Timeout enforcement (kill after 10s default)
- ✅ Memory limits (256MB per script)
- ✅ Rate limiting (max 10 concurrent scripts per user)

### Performance Considerations
- **Flow execution**: Target <100ms for simple flows (no scripts)
- **Script execution**: User-defined, but enforce 10s timeout
- **Scalability**: 1000 flows, 100 executions/minute (initial target)
- **Database**: Index on `flow_executions.flow_id` and `started_at`

### Monitoring
- Track execution metrics: `flow_executions.execution_time_ms`
- Alert on repeated failures: >10 errors in 1 hour = auto-disable flow
- Expose metrics: `/metrics` endpoint (Prometheus format)

---

## 10. Testing Strategy

### Unit Tests
- Node execution logic (each node type, including triggers)
- Graph validation (cycle detection, orphan nodes, missing trigger)
- Sandbox enforcement (attempt dangerous operations)
- Trigger node identification and execution

### Integration Tests
- End-to-end flow execution
- NATS message handling
- Tag value writing

### Manual Testing
- Create flow in UI with trigger node
- Set flow metadata (name, description)
- Toggle sharing on/off
- Deploy and activate trigger manually (click button on trigger node)
- Create internal tag via tag-output node
- Verify internal tag inherits sharing from flow
- Verify shared flows appear in other users' flow browser
- Verify other users can execute but not edit shared flows
- Verify internal tags from shared flows appear in tag browser
- Test script timeout and error handling
- Verify flows without trigger nodes are rejected

---

## 11. Migration Path

### Database Migration
**Development Stage Approach**: Modify existing migration file `core/migrations/002_seed_data.sql` to add flow engine schema.

**Rationale**: No deployed instances exist, so we can safely modify the existing migration rather than creating a new versioned migration file. This keeps the schema consolidated during active development.

**Content to Add**:
- Create all flow tables with sharing support
- Extend `driver_type` enum to include 'INTERNAL' and 'MQTT'
- Add `node_id` column to `flow_tag_dependencies` table
- Add permissions: `flows:read`, `flows:update`, `flows:delete`, `flows:execute`, `flows.config:update`
- Add trigger to auto-update internal tag sharing when flow sharing changes
- Note: Reuse existing `is_subscribed` column for internal tag persistence (no new column needed)

**When to create versioned migration**: Once we have a deployed instance (even for internal testing), switch to creating new migration files (e.g., `003_v0.2_flows.sql`) following the beta migration strategy documented in `docs/database-migrations.md`.

### Backward Compatibility
- Existing tags unaffected (existing `driver_type` values, `is_subscribed` retains current meaning)
- No breaking changes to existing APIs
- Flow feature is opt-in (users must explicitly create flows)
- Internal tags integrate seamlessly with existing tag system (charts, alarms, dashboards)
- Tag queries can filter by `driver_type = 'INTERNAL'` to show only internal tags
- **Phase 1**: Tag-input reads from TimescaleDB (temporary, reliable, 4-6ms latency)
- **Phase 2**: Memory cache will serve current values for all tags (PLC and internal, <1ms)
- Multiple flows can write to the same internal tag (tracked via `flow_tag_dependencies`)
- Ingestor already checks `is_subscribed` - no changes needed for internal tag support

---

## 12. Documentation Plan

### User Documentation
- **Flow Editor Guide** - How to create and edit flows
- **Flow Sharing** - How to share flows with other users (flows can be shared; internal tags are system-wide)
- **Node Reference** - Each node type's parameters and behavior
- **Internal Tags** - How tag-output nodes create internal tags (system-wide shared resources)
- **Script API Reference** - Available context (`$tags`, `$input`, etc.)
- **Flow Browser** - Finding and using shared flows

### Developer Documentation
- **Architecture Overview** - This document
- **Adding New Node Types** - How to extend the system
- **Script Sandboxing** - Security constraints and API
- **Debugging Flows** - Using execution history

---

## 13. Internal Tag Architecture Details

### System-Wide Shared Model
**Internal tags are system-wide resources, similar to PLC tags:**
- All internal tags visible to all users with `connectivity.tags:read` permission
- No individual ownership (unlike flows which have owners)
- Access controlled by feature permissions, not per-tag ownership
- Multiple flows (from different users) can write to the same internal tag
- Tag metadata shows which flows write to each tag

### Tag Creation and Storage
**Workflow matches PLC tag pattern - create first, then save to enable DB persistence:**

**Option A: User manually creates internal tag** (Connectivity/Tags/Internal tab):
1. Click "Create Tag" button
2. Configure: name, type (float/int/bool/string), initial value, units, description
3. Tag created in `tag_metadata` with `driver_type = 'INTERNAL'`, `connection_id = System`
4. Tag appears in tag table immediately (with `is_subscribed = false`)
5. **Phase 1**: Latest value stored in TimescaleDB (temporary); **Phase 2**: Current value in memory cache (Redis or in-memory)

**Option B: Flow automatically creates internal tag** (tag-output node in flow):
1. User configures tag-output node in flow editor with "Create New Tag" option
2. When flow first executes, tag is auto-created in `tag_metadata`
3. Tag created with `is_subscribed = false` by default
4. User can later enable saving via Tags UI

**Step 2: User enables DB persistence** (same as PLC tags):
1. Navigate to Connectivity/Tags/Internal tab
2. Select one or more internal tags from tag table
3. Click "Save Selected" button
4. Configure save trigger:
   - **On Change** (default) - Save to DB whenever value changes
   - **Interval** - Save at fixed time intervals (e.g., every 1s, 5s, 1m)
5. System sets `is_subscribed = true` for selected tags
6. Tags now persist to TimescaleDB according to save trigger

**Step 3: Flow writes to tag**:
1. Flow executes and tag-output node produces value
2. Insert/update row in `flow_tag_dependencies` with `dependency_type = 'output'` and `node_id`
3. Multiple flows can write to same tag (multiple rows in dependencies table)
4. All users can see which flows write to each tag (via "Written By" column in Tags UI)

**Note**: Internal tags work exactly like PLC tags - visible to all users, create in tag table first (manually or automatically), optionally enable saving later.

### Data Flow for Internal Tags
```
Flow execution → tag-output node produces value
  ↓
**Phase 2**: Update memory cache (always)
**Phase 1**: Write to TimescaleDB (temporary)
  ↓
Publish to NATS with metadata: {value, quality, timestamp, tag_id, is_subscribed}
  ↓
Ingestor receives message:
  - If is_subscribed = true → Write to TimescaleDB
  - If is_subscribed = false → Skip database write (Phase 1: already in DB; Phase 2: cache only)
```

### Tag Access Patterns
- **Current value**: **Phase 1**: Query TimescaleDB (4-6ms); **Phase 2**: Read from memory cache (<1ms)
- **Historical data**: Query TimescaleDB (only available if `is_subscribed = true`)
- **Charts**: Can display unsaved tags (**Phase 1**: from DB; **Phase 2**: live only, no history)
- **Other flows**: Can read unsaved tags via `tag-input` nodes (**Phase 1**: from DB; **Phase 2**: from memory cache)
- **Visibility**: All users with `connectivity.tags:read` see all internal tags
- **"Saved Tags" table**: Shows only tags with `is_subscribed = true`

### is_subscribed Toggle Behavior
**Same workflow as PLC tags - use "Save" button in tag table:**

**Enabling database storage (is_subscribed false → true):**
1. Select internal tag(s) in tag table (Connectivity/Tags/Internal)
2. Click "Save" button or use context menu
3. Configure save trigger: **On Change** (default) or **Interval** (1s, 5s, 1m, etc.)
4. System sets `is_subscribed = true`
5. Start persisting values to TimescaleDB from this point forward
6. No historical data before this point (tag didn't exist in DB before)
7. Tag appears in "Saved Tags" table

**Disabling database storage (is_subscribed true → false):**
1. Select internal tag(s) in tag table
2. Click "Stop Saving" button or use context menu
3. **Warning dialog**: "Stopping database storage will DELETE ALL historical data for selected tag(s). Current values will remain accessible in real-time. Continue?"
4. If user confirms: 
   - Set `is_subscribed = false`
   - Delete all TimescaleDB records for this tag (using Jobs)
   - Tag removed from "Saved Tags" table
   - **Phase 1**: Latest value remains in DB; **Phase 2**: Current value still in memory cache

### Visual Indicators
**Tag-Output Node in Flow Editor:**
- Icon: 💾 (solid) = `is_subscribed = true`
- Icon: 💾 (grayed/dashed) = `is_subscribed = false`
- Border: Solid accent color = saved, Dashed = unsaved

**Tag Browser:**
```
Internal Tags (Connectivity/Tags/Internal):
┌────────────────────────────────────────────────────────────────────┐
│ ☐ Name              Type   Saved  Save Trigger  Written By        │
├────────────────────────────────────────────────────────────────────┤
│ ☐ daily_total       float  ✓      On Change     Production Calc   │
│ ☐ temp_buffer       float  ✗      -             Temp Avg, Zone Mon│
│ ☐ alarm_status      bool   ✓      Interval(5s)  Safety Monitor    │
└────────────────────────────────────────────────────────────────────┘

[Create Tag]  [Save Selected]  [Stop Saving]  [Delete]

Actions:
- Create Tag → Opens dialog to create new internal tag
- Save Selected → Enable DB persistence for selected tags (configure On Change/Interval)
- Stop Saving → Disable DB persistence (with warning about data deletion)
- Click on tag → Shows all flows that write to it (from flow_tag_dependencies)
```

### Tag-Output Node Configuration UI
```
┌─────────────────────────────────────┐
│ Tag Output Node                     │
├─────────────────────────────────────┤
│ Select Existing Tag:                │
│ [calculated_pressure         ▼]    │
│                                     │
│ - OR -                              │
│                                     │
│ Create New Internal Tag:            │
│ Tag Name: [new_tag_name          ]  │
│ Type:     [float ▼]                 │
│ Initial:  [0.0                   ]  │
│ Units:    [PSI                   ]  │
│ Desc:     [Tag description       ]  │
│                                     │
│ Note: Database saving is configured │
│ in the tag table (Connectivity/Tags)│
│ using the "Save" button.            │
└─────────────────────────────────────┘

Workflow:
1. User can select existing internal tag OR create new one from flow editor
2. Tag created with is_subscribed = false (not saved to DB)
3. Tag appears in Connectivity/Tags/Internal table
4. User later selects tag and clicks "Save" to enable DB persistence
5. Configure save trigger: On Change (default) or Interval
```

### Memory Cache Implementation

**Status**: ⬜ **Deferred to Phase 2**

**Current Implementation (Phase 1)**:
- Tag-input nodes query TimescaleDB directly for latest tag values
- Adds 4-6ms latency per tag read
- Works reliably but not optimal for high-frequency flows
- See code comment in `core/src/services/flow-executor.js` (tag-input case)

**Planned Implementation (Phase 2)**:
**Technology**: Redis or in-memory cache (Node.js Map/LRU)
**Structure**:
```javascript
{
  "tag:<tag_id>": {
    value: 42.5,
    quality: 192,
    timestamp: "2025-11-15T10:30:00Z",
    type: "float"
  }
}
```

**Benefits**:
- Reduce tag read latency from 4-6ms to <1ms
- Eliminate DB load during flow execution
- Support real-time tag access for all flows
- Enable unsaved internal tags (memory-only)

**Cache invalidation**: TTL = 5 minutes (refresh on every update)

---

## 14. Summary

This implementation integrates flow engine cleanly into DataForeman's existing architecture:
- Uses existing job system for execution
- Extends existing tag metadata (no separate "internal tag" system)
- Follows established patterns (JSONB storage, permissions, API style)
- Prioritizes security (sandboxed script execution)
- Delivers incrementally (MVP → Production → Advanced)
- **Internal tags behave like PLC tags** with opt-in persistence model
- **Phase 1 uses direct DB queries** for tag values (temporary, works reliably)
- **Phase 2 will add memory cache** for <1ms tag access and real-time performance
- **User controls database storage** with clear warnings about data loss
- **Limited filesystem access** for processing external data files (self-hosted safety)

## 15. Phase 1 Completion Summary (2025-11-16)

### What Was Delivered

**Backend (100% Complete)**:
- ✅ Database schema (flows, flow_executions, flow_tag_dependencies)
- ✅ Flow CRUD API (12 endpoints including Test Run)
- ✅ Tag cross-reference API (internal tags, writers tracking)
- ✅ Flow execution engine with concurrent job processing
- ✅ Script sandbox (JavaScript with filesystem access controls)
- ✅ Admin filesystem configuration API

**Frontend (Core Features Complete)**:
- ✅ Visual flow editor (React Flow integration)
- ✅ Flow browser/management interface
- ✅ Internal tags UI (Connectivity page integration)
- ✅ Node configuration panels
- ✅ Execution history viewer
- ✅ Test Run functionality

**Performance & Testing**:
- ✅ Concurrent execution validated (20/30/50 flow load tests)
- ✅ Default concurrency: 20 jobs (configurable 1-100)
- ✅ Average execution time: 84-135ms per flow
- ✅ Throughput: 15-32 flows/second
- ✅ 100% success rate across all load tests
- ✅ Tag-input reads from TimescaleDB (4-6ms per tag, temporary solution)

**Key Implementation Notes**:
- Tag-input nodes currently query TimescaleDB for latest values
- This is a **temporary implementation** marked with TODO in code
- Works reliably but adds 4-6ms latency per tag read
- Phase 2 will add memory cache (Redis/in-memory) for <1ms access
- See `core/src/services/flow-executor.js` line 139-184 for details

**Key Files**:
- `core/src/services/flow-executor.js` - Execution engine
- `core/src/services/script-sandbox.js` - Sandboxed script execution
- `core/src/services/jobs.js` - Concurrent dispatcher
- `core/src/routes/flows.js` - Flow API endpoints
- `front/src/pages/FlowEditor.jsx` - Visual editor
- `front/src/pages/FlowBrowser.jsx` - Flow management
- `ops/test-concurrent-flows.cjs` - Load testing tool

### Configuration

**Environment Variables** (docker-compose.yml):
```yaml
MAX_CONCURRENT_JOBS: ${MAX_CONCURRENT_JOBS:-20}  # Job concurrency limit
FLOW_ALLOWED_PATHS: ${FLOW_ALLOWED_PATHS:-/data/files:/var/dataforeman}  # Filesystem access
```

### Next Steps (Phase 2+)

**High Priority**:
- **Admin UI for allowed filesystem paths** - Frontend for managing paths (backend API ready)
  - List current allowed paths with descriptions
  - Add new allowed paths with validation
  - Remove paths (with confirmation)
  - Admin-only access (`flows.config:update` permission)
  
- **Memory cache for tag values** - Reduce tag read latency from 4-6ms to <1ms
  - Implement Redis or in-memory Map/LRU cache
  - Update ingestor to populate cache on value changes
  - Modify tag-input node to read from cache instead of DB
  - Enable unsaved internal tags (memory-only, no DB persistence)

**Additional Enhancements**:
- Event-based triggers (tag value changes)
- Scheduled triggers (cron expressions)
- Python script support
- Advanced node types (filters, aggregations)
- Multi-output nodes and branching logic
- Flow debugging tools
- Performance analytics dashboard

