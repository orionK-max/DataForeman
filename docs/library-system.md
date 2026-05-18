# DataForeman Extension & Library System

## Overview

DataForeman's Extension System enables developers to create, distribute, and install **installable modules** that can extend any part of the platform — not just Flow Studio nodes. This mechanism allows organizations to:

- Package proprietary business logic as reusable flow nodes
- Distribute specialized industrial protocol handlers
- Add entirely new features (pages, API endpoints, job workers, chart integrations)
- Bundle heavy optional capabilities (e.g., AI forecasting, ML anomaly detection) that not every user needs
- Share custom PLC code generation capabilities
- Extend platform functionality without modifying core code

There are two module types:

| Type | Key | Purpose |
|------|-----|---------|
| **Library** | `type: "node-library"` | Provides new Flow Studio nodes only |
| **Extension** | `type: "extension"` | Can provide nodes, API routes, job workers, and frontend UI |

Forecast, advanced analytics, and other large optional capabilities should be packaged as **extensions**.

---

## Roadmap: What Needs to Be Built

The current system is functional for node libraries but needs additional infrastructure to support full extensions. Below is the outstanding work list — update status as work progresses.

### Agreed Extension Install Flow

When a user installs an extension that requires a sidecar Docker service:

1. Extension ZIP uploaded via **Admin → Libraries**
2. DF installs the extension (nodes, API routes, job workers registered)
3. DF writes `EXTENSION_<NAME>_ENABLED=true` to the `# Extensions` section of `.env`
4. DF shells out: `docker compose --profile <name> up -d` (Docker socket already mounted — same mechanism as Diagnostics page service restart)
5. Library Manager shows download/startup progress via health URL polling
6. On first install, UI shows: *"Starting for the first time may take several minutes while the service image downloads."*
7. Extension appears in **Diagnostics page** service list (dynamically, based on installed extensions — not hardcoded)
8. On uninstall: DF stops the container and removes the `.env` flag

**Prerequisites in `docker-compose.yml` (done at release time, not by user):**
- Each first-party extension service pre-declared with a Docker Compose profile (e.g., `profiles: ["forecast"]`)
- Service is invisible and never started until the extension is installed
- No user edits to `docker-compose.yml` ever required

### Backend

| # | Task | Status | Notes |
|---|------|--------|-------|
| B1 | Expose DF version via API (`GET /api/version`) | 🔲 TODO | Extensions need this to validate compatibility on install |
| B2 | Enforce `requirements.dataforemanVersion` semver in `LibraryManager` | 🔲 TODO | Field exists, check is `// TODO` (logs only). Use `semver` package. |
| B3 | `registerJobHandler(type, fn)` hook on `app` object | 🔲 TODO | Extensions must be able to register custom job worker types from their `routes.js`. Currently the `handlers` Map in `jobs.js` is closed. |
| B4 | On extension install: write `.env` flag + start Docker profile via `child_process` | 🔲 TODO | Uses same `docker` shell-out as Diagnostics restart. On uninstall: stop container + remove flag. |
| B5 | Service health check polling after install | 🔲 TODO | Ping `requires.services[].healthUrl` after install; surface status in Library Manager. Show first-time download warning if service takes >10s. |
| B6 | Diagnostics page: dynamic service list from installed extensions | 🔲 TODO | Currently hardcoded `['ingestor', 'connectivity', 'broker']`. Should include installed extension services dynamically. |

### Frontend

| # | Task | Status | Notes |
|---|------|--------|-------|
| F1 | React lazy component loader for extension pages | 🔲 TODO | `PluginRegistry` resolves `componentUrl` to `/api/extensions/{id}/assets/...` but there's no actual React lazy-loader consuming it. Extensions can't render pages yet. |
| F2 | UI slot injection system | 🔲 TODO | Named injection points in existing UI pages (e.g., Chart Composer settings tabs, sidebar sections) where extensions can register React components. Without this, extensions can only add top-level sidebar pages. |
| F3 | Sidecar service status badge in Library Manager UI | 🔲 TODO | Depends on B5. Show green/red health indicator + first-time download warning per extension. |

### Manifest

| # | Task | Status | Notes |
|---|------|--------|-------|
| M1 | Add `requires.services[]` to manifest schema | 🔲 TODO | Example: `"services": [{ "name": "forecast", "profile": "forecast", "healthUrl": "http://forecast:8100/health" }]` |
| M2 | Update `validateManifest()` to accept new fields | 🔲 TODO | Extend validation in `LibraryManager.validateManifest()` |

### Future / Lower Priority

| # | Task | Status | Notes |
|---|------|--------|-------|
| F4 | Version management: install and switch between module versions | 🔲 TODO | Currently only one version per libraryId can exist simultaneously |
| F5 | Inter-module dependencies | 🔲 TODO | Modules declaring dependencies on other modules |
| F6 | Marketplace / central repository | 🔲 TODO | Central index for discovering and downloading modules |

---

## Architecture

### Components

1. **LibraryManager** (`core/src/nodes/base/LibraryManager.js`)
   - Singleton service managing module lifecycle
   - Handles discovery, validation, and dynamic loading
   - Integrates with database for persistence and state management
   - Registers library categories/sections dynamically on load
   - Coordinates with CategoryService for palette organization

2. **NodeRegistry** (`core/src/nodes/base/NodeRegistry.js`)
   - Enhanced with library metadata tracking
   - Associates nodes with their source library
   - Provides library-aware node queries

3. **CategoryService** (`core/src/services/CategoryService.js`)
   - Manages dynamic category/section registration
   - Initializes core categories from CategoryDefinitions
   - Auto-creates library categories with is_core=false
   - Cleans up empty library categories on uninstall

4. **Database Schema**
   - `node_libraries` table: Library metadata, manifest, enabled/disabled state
   - `node_categories` table: Dynamic category storage (core + library)
   - `node_sections` table: Dynamic section storage within categories
   - `flow_library_dependencies` table: Tracks which flows use library nodes

5. **API Endpoints** (`core/src/routes/libraries.js`)
   - RESTful API for library management
   - Multipart upload handling
   - Permission-based access control
   - Hot-reload support (no restart required)
   - Extension API routes registered at `/api/extensions/{libraryId}/`

6. **Frontend PluginRegistry** (`front/src/utils/PluginRegistry.js`)
   - Loaded at app startup from `GET /api/flows/libraries`
   - Registers sidebar items and routes from `uiExtensions[]` in manifest
   - Notifies subscribers when extensions change

7. **Frontend UI** (`front/src/pages/LibraryManager.jsx`)
   - Administrative interface for library management
   - Upload, enable, disable, delete operations
   - Library details and status display

## Module Structure

### Types

**Node Library** — adds flow nodes only:
```
my-library/
├── library.manifest.json
├── index.js                 # exports registerNodes()
└── nodes/
    ├── MyCustomNode.js
    └── AnotherNode.js
```

**Extension** — adds nodes, API routes, job workers, and/or frontend UI:
```
my-extension/
├── library.manifest.json
├── index.js                 # optional: exports registerNodes()
└── extension/
    └── routes.js            # optional: default export Fastify plugin
```

### Manifest Format

```json
{
  "schemaVersion": 1,
  "libraryId": "my-library",
  "name": "My Custom Library",
  "version": "1.0.0",
  "description": "Custom nodes for specific industrial use case",
  "author": "Company Name",
  "type": "node-library",

  "requirements": {
    "dataforemanVersion": ">=0.5.0",
    "nodeSchemaVersion": 1,
    "requiresSubscription": false
  },

  "provides": {
    "nodeTypes": ["my-library:my-custom", "my-library:another"]
  },

  "uiExtensions": [
    {
      "type": "sidebar-item",
      "title": "My Feature",
      "path": "/my-feature",
      "icon": "MyIcon",
      "feature": "flows",
      "componentUrl": "MyFeaturePage.js"
    }
  ],

  "metadata": {
    "tags": ["industrial", "custom"],
    "license": "MIT"
  }
}
```

**Key manifest fields:**
- `schemaVersion` (required): Must be `1`
- `libraryId` (required): Unique identifier, lowercase alphanumeric and hyphens only
- `name` (required): Human-readable name
- `version` (required): Semantic version string (e.g., `1.0.0`)
- `type`: `"node-library"` (default) or `"extension"`
- `requirements.dataforemanVersion`: Semver range for minimum compatible DF version (e.g., `">=0.5.0"`)
- `provides.nodeTypes`: Array of node type identifiers this module registers
- `uiExtensions`: Array of frontend extension points (sidebar items, pages)

**Planned manifest fields (not yet implemented — see roadmap):**
- `requirements.services`: Array of Docker sidecar services the extension depends on

### Entry Point (index.js)

The `index.js` file registers all library nodes:

```javascript
export async function registerNodes(registry, options = {}) {
  const library = options.library;
  const libraryId = library?.libraryId ?? 'my-library';
  const cacheBuster = `?t=${Date.now()}`;

  const { MyCustomNode } = await import(`./nodes/MyCustomNode.js${cacheBuster}`);
  const { AnotherNode } = await import(`./nodes/AnotherNode.js${cacheBuster}`);

  registry.register(`${libraryId}:my-custom`, MyCustomNode, { library });
  registry.register(`${libraryId}:another`, AnotherNode, { library });
}
```

### Extension Routes (extension/routes.js)

For `type: "extension"` modules, `extension/routes.js` is loaded as a Fastify plugin and mounted at `/api/extensions/{libraryId}/`. Use this to add API endpoints, serve frontend assets, or register job workers (once B3 is implemented).

```javascript
export default async function routes(app, options) {
  const { library, db } = options;

  app.get('/status', async (req, reply) => {
    return { status: 'ok', version: library.version };
  });

  // Serve frontend assets at /api/extensions/{id}/assets/
  app.get('/assets/:file', async (req, reply) => {
    // serve static files from extension/assets/
  });
}
```

### Node Implementation

Library nodes follow the same structure as built-in nodes:

```javascript
export default class MyCustomNode {
  constructor() {
    this.description = {
      schemaVersion: 1,
      name: 'my-custom',
      displayName: 'My Custom Node',
      version: 1,
      description: 'Performs custom business logic',
      
      category: 'UTILITY',      // See available categories below
      section: 'CUSTOM',        // Can use existing sections or custom names
      icon: '⚙️',
      color: '#2196F3',
      
      inputs: [
        {
          type: 'main',
          displayName: 'Input'
        }
      ],
      outputs: [
        {
          type: 'main',
          displayName: 'Output'
        }
      ],
      
      properties: [
        {
          name: 'myProperty',
          displayName: 'My Property',
          type: 'string',
          default: '',
          description: 'Configuration property'
        }
      ]
    };
  }

  async execute(context) {
    const { myProperty } = context.node.parameters;
    
    // Custom logic here
    const result = {
      value: `Processed: ${myProperty}`,
      quality: 192,
      timestamp: Date.now()
    };
    
    return { main: result };
  }
}
```

**Schema Requirements:**
- Must follow `FlowNodeSchema` validation (see `core/src/schemas/FlowNodeSchema.js`)
- `version` must be a positive integer (not a string)
- `inputs`/`outputs` require `type` (valid: main, trigger, number, string, boolean, object, array)
- `properties` require `name`, `displayName`, and `type`
- `category` and `section` control node palette organization (see below)
- See [Flow Node Schema Documentation](./flow-node-schema.md) for complete schema reference

**Available Categories and Sections:**

Your nodes will be organized in the Flow Studio palette based on the `category` and `section` you specify.

**Core Categories:**

| Category | Key | Icon | Sections | Description |
|----------|-----|------|----------|-------------|
| **Tag Operations** | `TAG_OPERATIONS` | 📊 | `BASIC`, `ADVANCED` | Read and write tag values |
| **Logic & Math** | `LOGIC_MATH` | 🔢 | `MATH`, `COMPARISON`, `CONTROL`, `ADVANCED` | Calculations, comparisons, and logic |
| **Communication** | `COMMUNICATION` | 📡 | `BASIC`, `DATABASE` | External integrations (HTTP, email, databases) |
| **Data Transform** | `DATA_TRANSFORM` | 🔄 | `BASIC` | Transform and manipulate data |
| **Utility** | `UTILITY` | 🛠️ | `BASIC` | Helper and utility nodes |
| **Other** | `OTHER` | 📦 | `BASIC` | Miscellaneous/uncategorized |

**Dynamic Category System:**

Libraries can extend the node palette by specifying custom categories and sections:

- **Use existing categories**: Add your nodes to core categories like `LOGIC_MATH` or `COMMUNICATION`
- **Create custom categories**: Specify any category key (e.g., `ROBOTICS`, `VISION`, `SAFETY`)
- **Create custom sections**: Add new sections to existing or custom categories (e.g., `TEST_SECTION`, `ADVANCED_VISION`)

**How it works:**
- Categories/sections are automatically created when your library is installed
- They appear in the node browser only while your library is active
- When your library is uninstalled, empty categories/sections are automatically removed
- No core code modification required - everything is dynamic and database-driven

**Example - Using existing category:**
```javascript
category: 'COMMUNICATION',  // Use core category
section: 'BASIC',           // Use core section
```

**Example - Creating custom category and section:**
```javascript
category: 'ROBOTICS',       // New custom category
section: 'MOTION_CONTROL',  // New custom section
icon: '🤖'                  // Custom icon (optional)
```

**Note:** Core categories are defined in `core/src/nodes/base/CategoryDefinitions.js` and stored with `is_core=true`. Library categories are stored with `is_core=false` and managed dynamically by `CategoryService.js`.

## Creating a Module

### Step 1: Development

1. Create module directory structure
2. Write node implementations following schema requirements (if providing nodes)
3. Create `extension/routes.js` for API endpoints (if extension type)
4. Create manifest with module metadata
5. Implement `registerNodes()` in index.js (if providing nodes)
6. Test locally before packaging

### Step 2: Source Code Protection

Libraries are distributed as plain JavaScript by default. For proprietary code:

**Obfuscation (Recommended):**
```bash
npm install -g javascript-obfuscator
javascript-obfuscator nodes/ --output nodes-obfuscated/
# Replace original files with obfuscated versions
```

**Important:** 
- Obfuscate BEFORE creating distribution package
- Test obfuscated code to ensure functionality
- Keep unobfuscated source in secure location
- Distribution responsibility lies with library author

**Note:** Licensing/activation systems can be implemented within node code but are not enforced by the platform.

### Step 3: Packaging

Create a ZIP archive with all files at root level:

```bash
cd my-library
zip -r my-library.zip .
```

**Packaging Rules:**
- Files must be at root of ZIP (not nested in a directory)
- Include manifest, index.js, and all node files
- Verify archive structure: `unzip -l my-library.zip`

## Installing a Module

### Via Web UI (Recommended)

1. Navigate to **Admin → Libraries**
2. Click **Upload Library** button
3. Select your `.zip` file
4. Module will be uploaded, validated, and loaded
5. Restart core service for changes to take effect

### Via API

**Upload Module:**
```bash
curl -X POST http://localhost:8080/api/flows/libraries/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@my-library.zip"
```

**Response:**
```json
{
  "message": "Library installed and loaded",
  "libraryId": "my-library",
  "name": "My Custom Library",
  "version": "1.0.0"
}
```

Or if loading failed:
```json
{
  "message": "Library installed but failed to load",
  "libraryId": "my-library",
  "name": "My Custom Library",
  "version": "1.0.0",
  "loadError": "Schema validation failed..."
}
```

## Managing Modules

### List Modules

**API:**
```bash
curl http://localhost:8080/api/flows/libraries \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
[
  {
    "id": 1,
    "library_id": "my-library",
    "name": "My Custom Library",
    "version": "1.0.0",
    "manifest": { ... },
    "enabled": true,
    "installed_at": "2025-12-07T02:00:00.000Z",
    "last_loaded_at": "2025-12-07T02:15:00.000Z",
    "load_errors": null
  }
]
```

### Get Library Details

**API:**
```bash
curl http://localhost:8080/api/flows/libraries/my-library \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Enable/Disable Library

**Enable:**
```bash
curl -X POST http://localhost:8080/api/flows/libraries/my-library/enable \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Library is enabled in database and immediately hot-loaded into memory. **No restart required.**

**Disable:**
```bash
curl -X POST http://localhost:8080/api/flows/libraries/my-library/disable \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Library is disabled in database and immediately hot-unloaded from memory. **No restart required.**

**Note:** Hot-reload allows instant library management without data loss from restarting services.

### Delete Library

**API:**
```bash
curl -X DELETE http://localhost:8080/api/flows/libraries/my-library \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Safety Check:**

The system will prevent deletion if the library is in use by any flows:

```json
{
  "error": "Library is in use",
  "message": "Cannot delete library \"My Library\" because it is used by 3 flow(s)",
  "flowsUsing": [
    { "id": "...", "name": "Production Flow", "node_count": 2 },
    { "id": "...", "name": "Quality Check", "node_count": 1 }
  ],
  "hint": "Remove library nodes from these flows first, or use ?force=true to delete anyway"
}
```

**Force Delete:**

To delete a library even when it's in use (will break flows):

```bash
curl -X DELETE "http://localhost:8080/api/flows/libraries/my-library?force=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Note:** Deleting a library removes it from database and filesystem and hot-unloads it from memory. **No restart required.** Flows using deleted libraries will fail to execute.

### Check Library Usage

Before deleting, check which flows use the library:

**API:**
```bash
curl http://localhost:8080/api/flows/libraries/my-library/usage \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "libraryId": "my-library",
  "libraryName": "My Library",
  "version": "1.0.0",
  "usedByFlows": 2,
  "flows": [
    {
      "flowId": "...",
      "flowName": "Production Flow",
      "deployed": true,
      "ownerEmail": "user@example.com",
      "nodeCount": 2,
      "nodes": [
        { "node_id": "node-123", "node_type": "my-library:custom-node" },
        { "node_id": "node-456", "node_type": "my-library:another-node" }
      ]
    }
  ]
}
```

## Using Library Nodes

### In Flow Studio

1. Open any flow in Flow Studio
2. Click **Add Node** button or press `/`
3. Search for your node by name
4. Library nodes appear with their configured icon and description
5. Drag onto canvas like any other node

**Node Identification:**
- Node type format: `libraryId:node-type` (e.g., `my-library:my-custom`)
- Library attribution shown in node palette
- Full library metadata available via API

### In Flow Definitions

Library nodes are referenced by their full type identifier:

```json
{
  "nodes": [
    {
      "id": "node-123",
      "type": "my-library:my-custom",
      "parameters": {
        "myProperty": "value"
      }
    }
  ]
}
```

## Troubleshooting

### Library Upload Fails

**Issue:** Upload returns 400 error

**Causes:**
- Missing or invalid manifest file
- ZIP structure incorrect (files nested in directory)
- Invalid manifest JSON format
- Missing required manifest fields

**Solution:**
- Verify manifest.json is valid JSON
- Ensure files are at ZIP root: `unzip -l library.zip`
- Check all required manifest fields present
- Review error message in response

### Library Loads But Nodes Don't Work

**Issue:** Library shows as loaded but nodes malfunction or flows fail

**Causes:**
- Node schema validation errors
- Missing or incorrect `execute()` method
- Obfuscation broke functionality
- Missing dependencies
- **Flow uses library that was deleted**

**Solution:**
- Check `load_errors` field in library details
- Review core service logs: `docker compose logs core | grep library-id`
- Test unobfuscated version first
- Verify all imports resolve correctly
- Check if library exists: `GET /api/flows/libraries/:id`
- Check library usage before deletion: `GET /api/flows/libraries/:id/usage`

### Schema Validation Errors

**Issue:** `Schema validation failed for 'library:node'`

**Common Errors:**
- `version must be a positive integer` → Use `version: 1` not `version: "1.0.0"`
- `type is required` → Outputs missing `type` field
- `displayName is required` → Properties missing `displayName`
- `type "any" is not valid` → Use valid types: main, trigger, number, string, boolean, object, array

**Solution:**
- Review [Flow Node Schema](./flow-node-schema.md) documentation
- Compare against working example (test-library)
- Validate schema before packaging

### Nodes Don't Appear in Palette

**Issue:** Library loaded but nodes not visible in Flow Studio

**Causes:**
- Node not registered in `registerNodes()`
- Wrong node type prefix (missing `libraryId:`)
- Frontend rendering issue (React Flow warnings)

**Solution:**
- Verify `registerNodes()` calls `registry.register()` for all nodes
- Ensure node types use format: `${libraryId}:node-type`
- Check browser console for errors
- Restart core service after library changes

## Database Schema

- `node_libraries` — library metadata, manifest, enabled/disabled state, load errors
- `node_categories` / `node_sections` — dynamic palette categories (core + library-provided)
- `flow_library_dependencies` — tracks which flows use which library nodes; prevents accidental deletion

## Hot-Reload

Libraries support hot-reload — install, enable, disable, and delete without restarting the core service. Node.js dynamic `import()` loads/unloads modules at runtime; NodeRegistry tracks and removes nodes per library. Running flows and data ingest are not disrupted.

## Permissions

Library management requires admin permissions:

- **Upload/Install:** `flows.libraries:update`
- **List/View:** `flows.libraries:read`
- **Enable/Disable:** `flows.libraries:update`
- **Delete:** `flows.libraries:delete`

Default admin role has all permissions. Configure via permission system.

## Best Practices

- Only install modules from trusted sources; review code before installing
- Test in a non-production environment first
- Check library usage (`GET /api/flows/libraries/:id/usage`) before updates or deletions
- Back up flows before installing module updates with breaking changes
- Use semantic versioning in your own modules

## Example: Complete Module

See `temp/test-library/` for a working example including manifest, node implementation, and registration code.

## Support

- Logs: `docker compose logs core | grep LibraryManager`
- Schema reference: `docs/flow-node-schema.md`
- Example: `temp/test-library/`
