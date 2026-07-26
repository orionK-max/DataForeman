# DataForeman Extension & Library System

## Overview

DataForeman's Extension System enables developers to create, distribute, and install **installable modules** that extend any part of the platform — not just Flow Studio nodes. There are two module types:

| Type | Key | Purpose |
|------|-----|---------|
| **Library** | `type: "node-library"` | Provides new Flow Studio nodes only |
| **Extension** | `type: "extension"` | Nodes, API routes, job workers, and/or frontend UI |

All operations (install, enable, disable, update, delete) are **hot-reload** — no service restart required.

---

## Architecture

### Components

1. **LibraryManager** (`core/src/nodes/base/LibraryManager.js`)
   - Singleton managing module lifecycle (discovery, validation, dynamic loading)
   - On load: registers nodes, calls `activate(app)` for extensions, registers extension routes
   - Integrates with DB for persistence and state management

2. **NodeRegistry** (`core/src/nodes/base/NodeRegistry.js`)
   - Tracks which nodes belong to which library
   - Unregisters all nodes when a library is unloaded

3. **CategoryService** (`core/src/services/CategoryService.js`)
   - Dynamic category/section registration for node palette
   - Auto-creates library categories on install, removes empty ones on uninstall

4. **Database Schema**
   - `node_libraries`: library metadata, manifest, enabled state, load errors, `updated_at`
   - `node_categories` / `node_sections`: dynamic palette categories
   - `flow_library_dependencies`: tracks which flows use which library nodes

5. **API Endpoints** (`core/src/routes/libraries.js`)
   - Full CRUD + enable/disable/update operations
   - Extension HTTP routes mounted at `/api/extensions/{libraryId}/`
   - Extension assets served at `/api/extensions/{libraryId}/assets/{file}`

6. **Frontend PluginRegistry** (`front/src/utils/PluginRegistry.js`)
   - Loaded at app startup from `GET /api/flows/libraries`
   - Registers sidebar items, routes, and chart plugins from `uiExtensions[]`
   - Notifies subscribers when extensions change
   - Asset URLs use `?cb=<updated_at_timestamp>` for cache busting

7. **ExtensionLoader** (`front/src/utils/ExtensionLoader.js`)
   - Fetches extension JS assets from the API (with auth)
   - Creates blob URLs for dynamic `import()`
   - In-memory cache per URL; cache cleared when URL changes (via `?cb=` param)

---

## Module Structure

### Node Library

```
my-library/
├── library.manifest.json
├── index.js                 # exports registerNodes()
└── nodes/
    ├── MyCustomNode.js
    └── AnotherNode.js
```

### Extension

```
my-extension/
├── library.manifest.json
├── index.js                 # optional: exports activate(app) and/or registerNodes()
└── extension/
    ├── routes.js            # optional: Fastify plugin for API routes
    └── assets/
        ├── MyToolbar.js     # optional: frontend React component (plain ES module)
        └── MyConfigTab.js   # optional: frontend React component
```

---

## Manifest Format

```json
{
  "schemaVersion": 1,
  "libraryId": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "type": "extension",
  "description": "Adds AI forecasting to charts.",

  "requires": {
    "dataforemanVersion": ">=0.7.0",
    "services": [
      {
        "name": "forecast",
        "profile": "forecast",
        "healthUrl": "http://forecast:8100/health"
      }
    ]
  },

  "uiExtensions": [
    {
      "type": "chart-plugin",
      "id": "forecast",
      "configKey": "forecast",
      "toolbarComponentUrl": "extension/assets/ForecastToolbar.js",
      "configTabUrl": "extension/assets/ForecastConfigTab.js",
      "configTabLabel": "Forecast",
      "configTabIcon": "AutoGraph",
      "toolbarSlot": "data"
    },
    {
      "type": "sidebar-item",
      "title": "My Feature",
      "path": "/my-feature",
      "icon": "MyIcon",
      "feature": "flows",
      "componentUrl": "extension/assets/MyFeaturePage.js"
    }
  ]
}
```

**Key manifest fields:**

| Field | Required | Notes |
|-------|----------|-------|
| `schemaVersion` | ✅ | Must be `1` |
| `libraryId` | ✅ | Unique, lowercase alphanumeric + hyphens |
| `name` | ✅ | Human-readable |
| `version` | ✅ | Semver string (e.g. `1.0.0`) |
| `type` | | `"node-library"` (default) or `"extension"` |
| `requires.dataforemanVersion` | | Semver range, e.g. `">=0.7.0"` |
| `requires.services[]` | | Docker sidecar services the extension needs |
| `provides.connectivityDriver` | | Declares an installable connectivity driver (see [Connectivity Driver Extensions](#connectivity-driver-extensions)) |
| `uiExtensions[]` | | Frontend extension points (see below) |

### `uiExtensions` Types

#### `chart-plugin`

Adds a button to Chart Composer toolbar + a settings tab to Chart settings.

| Field | Notes |
|-------|-------|
| `id` | Unique identifier for this plugin |
| `configKey` | Key in `chartConfig` where this plugin's settings are stored |
| `toolbarComponentUrl` | Path to toolbar React component asset (relative to library root) |
| `configTabUrl` | Path to settings tab React component asset |
| `configTabLabel` | Label shown on the settings tab |
| `configTabIcon` | MUI icon name for the tab |
| `toolbarSlot` | Where the button appears: `data` (default), `view`, `zoom`, or `tools` |

#### `sidebar-item`

Adds an entry to the main left navigation.

| Field | Notes |
|-------|-------|
| `title` | Menu item label |
| `path` | Frontend route path |
| `icon` | MUI icon name |
| `feature` | Feature gate (e.g. `flows`) |
| `componentUrl` | Path to page React component asset |

#### `connectivity-driver-form`

Adds a connection-config form for an installable connectivity driver — renders as
a dynamic tab in the Connectivity page's Devices/Tags sections, alongside the
built-in driver tabs (OPC UA, S7, EIP, MQTT).

| Field | Notes |
|-------|-------|
| `driverType` | Must match `provides.connectivityDriver.driverType` in the same manifest |
| `label` | Tab label shown in the Connectivity page |
| `formComponentUrl` | Path to the connection-form React component asset (relative to library root) |

> **Build-tool note:** `formComponentUrl` must be included in the extensions
> build tool's `UI_ASSET_KEYS` list (`extensions/build-tool/build.js`) or the
> asset silently gets dropped from the packaged zip. This was fixed for the
> `tuya` extension — if you add another asset-URL field in the future, add it
> there too.

---

## Connectivity Driver Extensions

An extension can declare `provides.connectivityDriver` to add a new, **optional**
connection type to the Connectivity page without any changes to `core` or
`connectivity` source code. This is the "installable drivers" framework — see the
`tuya` extension for a complete working example.

```json
{
  "provides": {
    "connectivityDriver": {
      "driverType": "tuya",
      "rpcSubjectPrefix": "df.connectivity.tuya",
      "sidecarServiceName": "tuya-driver",
      "configSchema": { "type": "object", "...": "..." }
    }
  },
  "requires": {
    "services": [
      { "name": "tuya-driver", "profile": "tuya", "healthUrl": "http://tuya-driver:8200/health" }
    ]
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `driverType` | ✅ | Lowercase alphanumeric + hyphens; stored in `connections.type`. Cannot be one of the built-in types (`opcua-client`, `opcua-server`, `s7`, `eip`, `mqtt`, `system`, `internal`) |
| `rpcSubjectPrefix` | ✅ | NATS subject prefix for the generic control/command route, e.g. `df.connectivity.tuya` |
| `sidecarServiceName` | ✅ | Must match a `requires.services[].name` entry — the Docker Compose service implementing the driver |
| `configSchema` | | JSON Schema describing the connection's config fields (reserved for future generic form validation) |

### How it works

1. **Sidecar container** implements the Driver Plugin Protocol over HTTP:
   `POST /init`, `/start`, `/stop`, `/update-config`, `/rpc`, and `GET /health`.
   It publishes telemetry directly to NATS (`df.telemetry.raw.<connectionId>`) —
   it does **not** relay through the `connectivity` service.
2. On install/enable, `core` writes a row to the `connectivity_driver_types`
   table (`driver_type`, `rpc_subject_prefix`, `sidecar_base_url`, etc.).
3. `connectivity`'s `DriverManager` polls that table (every 30s, plus on
   startup) and routes any `conn.type` it finds there through a generic
   `RemoteSidecarDriver` proxy — no static `if/else` entry needed per driver.
4. Control/command calls go through one generic route,
   `POST /api/connectivity/drivers/:id/rpc` (`{ method, params }`), forwarded
   to the sidecar's `/rpc`. Built-in drivers keep their own dedicated routes
   (e.g. `/api/connectivity/eip/tags/:id`) and are unaffected.
5. Basic connection CRUD (`GET/POST /api/connectivity/connections`, `/config`,
   `/status`, `/read`, `/write/:id`, `/browse/:id`) already works for any
   `conn.type` — no new core routes are needed for those either.

See `extensions/tuya/` for a full reference implementation (FastAPI + Python),
and the main repo's `temp/installable-drivers-plan.md` for the original design
discussion (not committed — ask in the repo for context if it's gone).

---

## Extension Entry Points

### index.js — Backend Activation

For extensions, `index.js` exports `activate(app)` (and optionally `registerNodes()`):

```javascript
import forecastRoutes from './extension/routes.js';

export async function activate(app) {
  // Register job workers
  app.jobs.register('forecast_generation', async (job) => {
    // ... handle job
  });

  // Register HTTP routes (in addition to the auto-mounted extension/routes.js)
  await app.register(forecastRoutes, { prefix: '/api/historian' });
}
```

> **Note:** `extension/routes.js` is also auto-mounted at `/api/extensions/{libraryId}/` — use `activate()` for routes that need a different prefix (e.g. `/api/historian/forecast`).

### extension/routes.js — HTTP Routes

```javascript
export default async function routes(app, options) {
  app.get('/status', async (req, reply) => {
    return { status: 'ok' };
  });
}
```

### Frontend Asset Components

Extension frontend components are plain ES modules that use `window.__DF` globals instead of bundled React/MUI:

```javascript
const { React, MUI, MUIIcons, services } = window.__DF;
const { Button, Tooltip } = MUI;
const { useState } = React;
const { chartComposer } = services; // forecastPoints(), getForecastJob(), etc.

export default function MyToolbar({ tagConfigs, timeRange, chartConfig, onSeriesChange }) {
  // Props passed by ChartComposer:
  //   tagConfigs     — visible tag config objects
  //   timeRange      — { from, to } (Date objects or ISO strings)
  //   chartConfig    — full chart config object
  //   contextType    — 'composer' | 'dashboard'
  //   onSeriesChange — (EChartsSeries[] | null) => void — push series into chart

  return React.createElement(Button, {
    size: 'small',
    variant: 'outlined',
    color: 'inherit',
    sx: { minWidth: 100 }
  }, 'My Button');
}
```

**Button style convention** — match the toolbar:
- `size="small"`, `variant="outlined"` (idle) or `"contained"` (active)
- `startIcon={<SomeIcon fontSize="small" />}`
- `sx={{ minWidth: 100 }}` (or `90` for secondary actions)

**X-axis auto-extension:** When `onSeriesChange` pushes series with timestamps beyond the chart's current `timeRange.to` (e.g. a forecast horizon), the chart's x-axis automatically extends to show the full data range. Call `onSeriesChange(null)` to remove the extension series and restore the original range.

---

## Sidecar Docker Services

Extensions that require a sidecar service declare it in `requires.services[]`. DataForeman will:

1. Write `EXTENSION_<NAME>_ENABLED=true` to the `.env` file
2. Run `docker compose --profile <profile> up -d` to start the container
3. Poll the `healthUrl` and report status in Library Manager
4. On uninstall: stop the container and set the flag to `false`

**Prerequisites in `docker-compose.yml`** (done at release time):
- Service pre-declared with a Docker Compose profile (e.g. `profiles: ["forecast"]`)
- Service is invisible until the extension is installed — users never edit docker-compose.yml

The extension's service health is shown as a status chip in Library Manager and included in the library list API response.

---

## Creating a Module

### Step 1: Development

1. Create the directory structure (see above)
2. Write node implementations following the [Flow Node Schema](./flow-node-schema.md)
3. Create `extension/routes.js` for API endpoints
4. Write frontend asset components using `window.__DF` globals
5. Create `library.manifest.json`
6. Test locally before packaging

### Step 2: Packaging

```bash
cd my-library
zip -r my-library.zip .
```

**Rules:**
- Files must be at the ZIP root (not nested in a subdirectory)
- Include manifest, index.js, and all node/asset files
- Verify: `unzip -l my-library.zip`

---

## Installing & Managing Modules

### Install

**Web UI:** Admin → Libraries → Upload Library → select ZIP

**API:**
```bash
curl -X POST http://localhost:8080/api/flows/libraries/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@my-library.zip"
```

### Update

**Web UI:** Admin → Libraries → click the update icon on the library card → select new ZIP

**API:**
```bash
curl -X PUT http://localhost:8080/api/flows/libraries/my-library/update \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@my-library-v2.zip"
```

The library is hot-unloaded, files replaced, then hot-reloaded — no restart required. After updating an extension with frontend assets, **hard-refresh the browser** (`Ctrl+Shift+R`) so new assets are fetched.

### Enable/Disable

```bash
# Enable
curl -X POST http://localhost:8080/api/flows/libraries/my-library/enable \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Disable
curl -X POST http://localhost:8080/api/flows/libraries/my-library/disable \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Both operations are hot-reload — no restart required.

### Delete

```bash
curl -X DELETE http://localhost:8080/api/flows/libraries/my-library \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Prevented if flows are using the library. Use `?force=true` to override.

### Check Usage

```bash
curl http://localhost:8080/api/flows/libraries/my-library/usage \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Asset Cache Busting

Extension frontend assets are cached aggressively in the browser. The system handles this automatically:

- Asset URLs include a `?cb=<timestamp>` parameter derived from the library's `updated_at` DB field
- Any update (via the update button) changes `updated_at`, which changes all asset URLs
- New URLs bypass the browser cache and fetch fresh JS from the server
- If no `updated_at` is available, falls back to `?v=<version>`

**After updating an extension:** always hard-refresh the browser (`Ctrl+Shift+R`).

---

## Hot-Reload

| Operation | Hot-Reload |
|-----------|-----------|
| Install (node-library) | ✅ |
| Install (extension) | ❌ — requires a `core` restart to register routes/job workers and to appear as `loaded: true` in `GET /api/flows/libraries` (which gates whether its `uiExtensions` show up in the frontend) |
| Enable (node-library) | ✅ |
| Enable (extension) | ❌ — same restart requirement as install |
| Disable | ✅ (node-library); extension routes remain registered until restart, but `enabled: false` still stops it being surfaced/usable |
| Update (node-library) | ✅ |
| Update (extension) | ❌ — files are replaced and hot-*unloaded*, but not reloaded until restart |
| Delete | ✅ |

Running flows and data ingest are not disrupted by a restart. Sidecar Docker
services declared via `requires.services[]` (§ Sidecar Docker Services) are
started/stopped independently of the restart requirement above — that part is
always immediate.

---

## Permissions

| Action | Required Permission |
|--------|-------------------|
| Upload/Install | `flows.libraries:update` |
| List/View | `flows.libraries:read` |
| Enable/Disable | `flows.libraries:update` |
| Update | `flows.libraries:update` |
| Delete | `flows.libraries:delete` |

---

## Troubleshooting

### Library Upload Fails
- Missing/invalid manifest JSON
- Files nested inside a subdirectory in the ZIP
- Missing required manifest fields
- Check response error message

### Library Loads But Nodes Don't Work
- Check `load_errors` in library details
- Review logs: `docker compose logs core | grep LibraryManager`
- Verify `execute()` method exists on node class
- Check `flow_library_dependencies` if flows reference deleted libraries

### Schema Validation Errors
- `version must be a positive integer` → use `version: 1`, not `"1.0.0"`
- `type is required` → outputs/inputs need `type` field
- Valid port types: `main`, `trigger`, `number`, `string`, `boolean`, `object`, `array`
- See [Flow Node Schema](./flow-node-schema.md)

### Extension Frontend Component Not Appearing
- Check browser console for load errors
- Verify asset URL in PluginRegistry: `GET /api/flows/libraries` → check `uiExtensions[].toolbarComponentUrl`
- If button appeared before but vanished after update: hard-refresh the browser
- Confirm `window.__DF.MUI` etc. are available (host app must expose globals)

### Extension API Route Returns 404
- Ensure `activate(app)` registers the route (or `extension/routes.js` exports a default function)
- Check core logs for `[LibraryManager] Extension activated:` message
- Routes from `extension/routes.js` are auto-mounted at `/api/extensions/{libraryId}/`
- Routes from `activate()` need explicit prefix (e.g. `/api/historian`)

---

## Node Categories

**Core Categories:**

| Key | Display | Sections |
|-----|---------|---------|
| `TAG_OPERATIONS` | Tag Operations | `BASIC`, `ADVANCED` |
| `LOGIC_MATH` | Logic & Math | `MATH`, `COMPARISON`, `CONTROL`, `ADVANCED` |
| `COMMUNICATION` | Communication | `BASIC`, `DATABASE` |
| `DATA_TRANSFORM` | Data Transform | `BASIC` |
| `UTILITY` | Utility | `BASIC` |
| `OTHER` | Other | `BASIC` |

Libraries can use existing categories or create custom ones. Custom categories are created automatically on install and removed (if empty) on uninstall.

---

## Best Practices

- Only install modules from trusted sources; review code before installing
- Test in non-production first
- Check library usage before updates or deletions
- Bump the version in `library.manifest.json` on every release
- Use `window.__DF` for all React/MUI access in frontend assets — do not bundle your own copies
- Store state in `chartConfig[configKey]` for persistence across sessions

---

## References

- Logs: `docker compose logs core | grep LibraryManager`
- Flow Node Schema: `docs/flow-node-schema.md`
- Example extension: `forecast-extension/` at repo root
