# Flow Studio Library System

## Overview

DataForeman's Library System enables developers to create, distribute, and install custom node libraries for Flow Studio. This extensibility mechanism allows organizations to:

- Package proprietary business logic as reusable nodes
- Distribute specialized industrial protocol handlers
- Share custom PLC code generation capabilities
- Extend Flow Studio functionality without modifying core code

## Architecture

### Components

1. **LibraryManager** (`core/src/nodes/base/LibraryManager.js`)
   - Singleton service managing library lifecycle
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

6. **Frontend UI** (`front/src/pages/LibraryManager.jsx`)
   - Administrative interface for library management
   - Upload, enable, disable, delete operations
   - Library details and status display

## Library Structure

### Required Files

```
my-library/
├── library.manifest.json    # Library metadata and configuration
├── index.js                 # Entry point for node registration
└── nodes/                   # Node implementation files
    ├── MyCustomNode.js
    └── AnotherNode.js
```

### Manifest Format

The `library.manifest.json` file defines library metadata:

```json
{
  "id": "my-library",
  "name": "My Custom Library",
  "version": "1.0.0",
  "description": "Custom nodes for specific industrial use case",
  "author": "Company Name",
  "license": "Proprietary",
  "dataforemanVersion": ">=0.1.0",
  "nodes": [
    {
      "type": "my-node",
      "file": "nodes/MyCustomNode.js",
      "name": "My Custom Node"
    }
  ]
}
```

**Manifest Fields:**
- `id` (required): Unique identifier (used as library namespace)
- `name` (required): Human-readable library name
- `version` (required): Semantic version string
- `description` (optional): Brief description of library purpose
- `author` (optional): Library author/organization
- `license` (optional): License type
- `dataforemanVersion` (required): Compatible DataForeman version range
- `nodes` (required): Array of node definitions

**Node Definition:**
- `type` (required): Node type identifier (combined with library ID as `libraryId:type`)
- `file` (required): Relative path to node implementation
- `name` (required): Display name for the node

### Entry Point (index.js)

The `index.js` file registers all library nodes:

```javascript
import MyCustomNode from './nodes/MyCustomNode.js';
import AnotherNode from './nodes/AnotherNode.js';

export function registerNodes(registry, libraryId) {
  console.log(`[${libraryId}] Registering nodes...`);
  
  const myCustomNode = new MyCustomNode();
  registry.register(`${libraryId}:my-custom`, myCustomNode, { library: libraryId });
  
  const anotherNode = new AnotherNode();
  registry.register(`${libraryId}:another`, anotherNode, { library: libraryId });
  
  console.log(`[${libraryId}] Registered ${2} nodes`);
}
```

**Key Points:**
- Must export a `registerNodes(registry, libraryId)` function
- Node types must be prefixed with `libraryId:` (e.g., `my-library:my-custom`)
- Pass `{ library: libraryId }` option to `registry.register()`

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

## Creating a Library

### Step 1: Development

1. Create library directory structure
2. Write node implementations following schema requirements
3. Create manifest with library metadata
4. Implement `registerNodes()` in index.js
5. Test nodes locally before packaging

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

## Installing a Library

### Via Web UI (Recommended)

1. Navigate to **Admin → Libraries**
2. Click **Upload Library** button
3. Select your `.zip` file
4. Library will be uploaded, validated, and loaded
5. Restart core service for changes to take effect

### Via API

**Upload Library:**
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

## Managing Libraries

### List Libraries

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

### node_libraries Table

The `node_libraries` table stores library state:

```sql
CREATE TABLE node_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id text UNIQUE NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  enabled boolean DEFAULT true,
  installed_at timestamp DEFAULT CURRENT_TIMESTAMP,
  last_loaded_at timestamp,
  load_errors text
);

CREATE INDEX idx_node_libraries_enabled ON node_libraries(enabled) WHERE enabled = true;
CREATE INDEX idx_node_libraries_installed ON node_libraries(installed_at DESC);
```

### flow_library_dependencies Table

The `flow_library_dependencies` table tracks which flows use which libraries:

```sql
CREATE TABLE flow_library_dependencies (
  flow_id uuid REFERENCES flows(id) ON DELETE CASCADE,
  library_id text NOT NULL,
  node_id text NOT NULL,
  node_type text NOT NULL,
  PRIMARY KEY (flow_id, library_id, node_id)
);

CREATE INDEX idx_flow_library_deps_library ON flow_library_dependencies(library_id);
CREATE INDEX idx_flow_library_deps_flow ON flow_library_dependencies(flow_id);
```

**Purpose:** Prevents accidental deletion of libraries in use, enables impact analysis.

**Updated:** Dependencies are tracked automatically when flows are saved/deployed.

## Hot-Reload Technology

**Problem Solved:** Restarting the core service would cause data loss in the historin (data ingestor) and disrupt active flow sessions.

**Solution:** Libraries now support hot-reload, which means:

1. **Install/Upload:** Library is saved to filesystem/database, then immediately loaded into NodeRegistry
2. **Enable:** Library is activated in database and hot-loaded into memory
3. **Disable:** Library is deactivated in database and hot-unloaded from memory
4. **Delete:** Library is removed from database/filesystem and hot-unloaded

**How It Works:**
- Node.js dynamic `import()` allows loading modules at runtime
- NodeRegistry tracks which nodes belong to which library
- `unregisterLibraryNodes()` removes all nodes from a library
- `loadLibrary()` loads library and registers its nodes
- All operations happen in-memory without process restart

**Benefits:**
- ✅ No data loss in historin/ingestor
- ✅ No disruption to running flows
- ✅ Instant library management
- ✅ Safe for production environments

**Limitations:**
- Module caching: Node.js caches imports, but we work around this by clearing NodeRegistry
- Memory: Old library code may remain in memory until garbage collected (minimal impact)

## Permissions

Library management requires admin permissions:

- **Upload/Install:** `flows.libraries:update`
- **List/View:** `flows.libraries:read`
- **Enable/Disable:** `flows.libraries:update`
- **Delete:** `flows.libraries:delete`

Default admin role has all permissions. Configure via permission system.

## API Reference

### GET /api/flows/libraries
List all installed libraries.

**Permissions:** `flows.libraries:read`

**Response:** Array of library objects

### GET /api/flows/libraries/:id
Get details for specific library.

**Permissions:** `flows.libraries:read`

**Response:** Library object with full manifest

### POST /api/flows/libraries/upload
Upload and install new library.

**Permissions:** `flows.libraries:update`

**Body:** Multipart form data with `file` field

**Response:** Installation result with library ID

### POST /api/flows/libraries/:id/enable
Enable a library.

**Permissions:** `flows.libraries:update`

**Response:** Success message

### POST /api/flows/libraries/:id/disable
Disable a library.

**Permissions:** `flows.libraries:update`

**Response:** Success message

### DELETE /api/flows/libraries/:id
Delete a library.

**Permissions:** `flows.libraries:delete`

**Query Parameters:**
- `force` (optional): Set to `true` to delete even if library is in use

**Response:** Success message with affected flow count

**Safety:** Returns 409 error if library is in use (unless `force=true`)

### GET /api/flows/libraries/:id/usage
Get flows that use this library.

**Permissions:** `flows.libraries:read`

**Response:** List of flows with node details

## Best Practices

### Development

1. **Start Simple:** Create minimal test library before complex implementations
2. **Validate Early:** Test schema validation before packaging
3. **Version Carefully:** Use semantic versioning for compatibility tracking
4. **Document Nodes:** Provide clear descriptions and property documentation
5. **Error Handling:** Implement robust error handling in `execute()` methods

### Distribution

1. **Test Thoroughly:** Validate all functionality before distribution
2. **Obfuscate Wisely:** Test obfuscated code, don't break functionality
3. **Version Dependencies:** Specify compatible DataForeman versions accurately
4. **Include Examples:** Provide sample flows demonstrating node usage
5. **Support Users:** Document installation and configuration steps
6. **Check Impact:** Before updates, check which flows use your library

### Maintenance

1. **Check Usage:** Use `GET /api/flows/libraries/:id/usage` before major changes
2. **Coordinate Updates:** Notify users before breaking changes
3. **Version Carefully:** Use semantic versioning for compatibility
4. **Migration Path:** Provide upgrade instructions for breaking changes
5. **Backup First:** Users should backup flows before library updates

### Security

1. **Code Review:** Review third-party libraries before installation
2. **Trust Sources:** Only install libraries from trusted developers
3. **Backup First:** Backup system before installing new libraries
4. **Test Isolated:** Test in non-production environment first
5. **Monitor Logs:** Watch for errors or suspicious behavior after installation
6. **Track Usage:** Use usage API to understand library dependencies before deletion

## Limitations

1. **~~Restart Required~~** ✅ **SOLVED**: Libraries now support hot-reload - no restart needed!
2. **No Versioning:** Cannot install multiple versions of same library simultaneously
3. **No Dependencies:** Libraries cannot declare dependencies on other libraries
4. **Frontend Generic:** Library nodes use generic rendering (no custom React components yet)

## Future Enhancements

Planned improvements to the library system:

- ✅ **Hot Reload:** Load/unload libraries without restart (IMPLEMENTED!)
- **Version Management:** Install and switch between library versions
- **Dependency Resolution:** Declare and automatically install library dependencies
- **License Enforcement:** Built-in licensing and activation system
- **Marketplace:** Central repository for sharing and discovering libraries
- **Custom Rendering:** Support for custom React components in library nodes
- **Auto-Update:** Check for and install library updates automatically

## Example: Complete Library

See `temp/test-library/` for a complete working example including:
- Proper manifest structure
- Node implementation
- Registration code
- Schema-compliant node definition

## Support

For questions or issues:
- Review logs: `docker compose logs core | grep LibraryManager`
- Check schema documentation: `docs/flow-node-schema.md`
- Validate against test library: `temp/test-library/`
- Report bugs via GitHub issues
