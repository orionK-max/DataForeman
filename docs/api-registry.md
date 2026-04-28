# API Registry

**Version:** 1.0  
**Last Updated:** 2026-01-13 (Auto-generated)  
**Purpose:** Complete reference of all API endpoints with authentication and permission requirements

> ⚠️ **This file is auto-generated.** Run `node ops/validate-permissions.js --generate-docs` to update.

---

## 📋 Table of Contents

1. [Auth Routes](#auth-routes)
2. [Chart Composer Routes](#chart-composer-routes)
3. [Charts Routes](#charts-routes)
4. [Config Routes](#config-routes)
5. [Connectivity Routes](#connectivity-routes)
6. [Dashboards Routes](#dashboards-routes)
7. [Diag Routes](#diag-routes)
8. [Flow-live-data Routes](#flow-live-data-routes)
9. [Flow-resources Routes](#flow-resources-routes)
10. [Flows Routes](#flows-routes)
11. [Folders Routes](#folders-routes)
12. [Health Routes](#health-routes)
13. [Jobs Routes](#jobs-routes)
14. [Libraries Routes](#libraries-routes)
15. [Logs Routes](#logs-routes)
16. [Metrics Routes](#metrics-routes)
17. [Units Routes](#units-routes)

---

## Overview

This registry documents all HTTP endpoints in the DataForeman API.

### Authentication

Most endpoints require:
1. **Valid JWT token** in `Authorization: Bearer <token>` header
2. **Appropriate permission** for the feature and operation

Public endpoints (login, health checks, metrics) do not require authentication.

### Permission Format

Permissions follow the pattern: `feature:operation`

**Operations:**
- `read` - View/list resources
- `create` - Create new resources
- `update` - Modify existing resources
- `delete` - Remove resources

---

## Auth Routes

**Base Path:** `/api/auth`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/demo-info` | No | - | List resources |
| POST | `/demo-credentials` | No | - | Create resource |
| POST | `/login` | No | - | Create resource |
| POST | `/refresh` | No | - | Create resource |
| POST | `/logout` | No | - | Create resource |
| GET | `/me` | No | - | List resources |
| GET | `/sessions` | No | - | List resources |
| POST | `/sessions/:id/revoke` | No | - | API endpoint |
| POST | `/password` | Yes | *Check required* | Create resource |
| GET | `/admin/users` | Yes | *Check required* | List resources |
| GET | `/admin/users/:id/sessions` | No | - | Get single resource |
| POST | `/admin/users/:id/sessions/:sid/revoke` | No | - | API endpoint |
| POST | `/admin/users/:id/sessions/revoke-all` | No | - | API endpoint |
| POST | `/admin/users` | Yes | *Check required* | Create resource |
| POST | `/admin/users/:id` | Yes | *Check required* | API endpoint |
| POST | `/admin/users/:id/password` | Yes | *Check required* | API endpoint |
| GET | `/admin/users/:id/roles` | Yes | *Check required* | Get single resource |
| POST | `/admin/users/:id/roles` | Yes | *Check required* | API endpoint |
| GET | `/users/:userId/permissions` | Yes | `permissions:read` | Get single resource |
| PUT | `/users/:userId/permissions` | Yes | `permissions:update` | Update resource |
| DELETE | `/users/:userId/permissions/:feature` | Yes | `permissions:delete` | Delete resource |
| GET | `/dev-token` | No | - | List resources |

## Chart Composer Routes

**Base Path:** `/api/chart-composer`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/points` | Yes | *Via preHandler* | List resources |
| GET | `/buckets` | Yes | *Via preHandler* | List resources |
| GET | `/check` | Yes | *Via preHandler* | List resources |
| GET | `/tag-metadata` | Yes | *Via preHandler* | List resources |

## Charts Routes

**Base Path:** `/api/charts`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/schema` | Yes | *Via preHandler* | List resources |
| POST | `/` | Yes | *Via preHandler* | Create resource |
| GET | `/` | Yes | *Via preHandler* | List resources |
| GET | `/capacity-charts` | Yes | *Via preHandler* | List resources |
| GET | `/:id` | Yes | *Via preHandler* | Get single resource |
| PUT | `/:id` | Yes | *Via preHandler* | Update resource |
| PATCH | `/:id` | Yes | *Via preHandler* | API endpoint |
| DELETE | `/:id` | Yes | *Via preHandler* | Delete resource |
| POST | `/:id/duplicate` | Yes | *Via preHandler* | API endpoint |
| POST | `/:id/export` | Yes | *Via preHandler* | API endpoint |
| POST | `/import/validate` | Yes | *Via preHandler* | Create resource |
| POST | `/import/execute` | Yes | *Via preHandler* | Create resource |

## Config Routes

**Base Path:** `/api/config`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/` | No | - | List resources |
| POST | `/` | No | - | Create resource |

## Connectivity Routes

**Base Path:** `/api/connectivity`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/poll-groups` | Yes | *Via preHandler* | List resources |
| POST | `/poll-groups` | Yes | *Via preHandler* | Create resource |
| PUT | `/poll-groups/:groupId` | Yes | *Via preHandler* | Update resource |
| DELETE | `/poll-groups/:groupId` | Yes | *Via preHandler* | Delete resource |
| GET | `/summary` | Yes | *Via preHandler* | List resources |
| POST | `/config` | Yes | *Via preHandler* | Create resource |
| GET | `/status` | Yes | *Via preHandler* | List resources |
| GET | `/read` | Yes | *Via preHandler* | List resources |
| POST | `/write/:id` | Yes | *Via preHandler* | API endpoint |
| GET | `/browse/:id` | Yes | *Via preHandler* | Get single resource |
| GET | `/attributes/:id` | Yes | *Via preHandler* | Get single resource |
| GET | `/eip/tags/:id` | Yes | *Via preHandler* | Get single resource |
| POST | `/eip/tags/:id` | Yes | *Via preHandler* | API endpoint |
| POST | `/eip/snapshot/:id/heartbeat` | Yes | *Via preHandler* | API endpoint |
| POST | `/eip/resolve-types/:id` | Yes | *Via preHandler* | API endpoint |
| POST | `/test` | Yes | *Via preHandler* | Create resource |
| GET | `/connections` | Yes | *Via preHandler* | List resources |
| POST | `/connections` | Yes | *Via preHandler* | Create resource |
| POST | `/tags/save` | Yes | *Via preHandler* | Create resource |
| POST | `/tags/save-legacy` | Yes | *Via preHandler* | Create resource |
| PUT | `/tags/poll-group` | Yes | *Via preHandler* | API endpoint |
| GET | `/tags/:connectionId` | Yes | *Via preHandler* | Get single resource |
| GET | `/tags/by-poll-group/:groupId` | Yes | *Via preHandler* | Get single resource |
| PATCH | `/tags/poll-groups` | Yes | *Via preHandler* | API endpoint |
| PATCH | `/tags/units` | Yes | *Via preHandler* | API endpoint |
| PATCH | `/tags/on-change` | Yes | *Via preHandler* | API endpoint |
| POST | `/migration/tags/preview` | Yes | *Via preHandler* | Create resource |
| POST | `/migration/tags/execute` | Yes | *Via preHandler* | Create resource |
| GET | `/migration/status` | Yes | *Via preHandler* | List resources |
| GET | `/tags/saved` | Yes | *Via preHandler* | List resources |
| POST | `/tags/poll` | Yes | *Via preHandler* | Create resource |
| POST | `/tags/remove` | Yes | *Via preHandler* | Create resource |
| POST | `/tags/remove-batch` | Yes | *Via preHandler* | Create resource |
| GET | `/tags/history` | Yes | *Via preHandler* | List resources |
| POST | `/eip/discover` | Yes | *Via preHandler* | Create resource |
| POST | `/eip/identify` | Yes | *Via preHandler* | Create resource |
| POST | `/eip/rack-config` | Yes | *Via preHandler* | Create resource |
| POST | `/eip/tags/:id/bulk-save` | Yes | *Via preHandler* | API endpoint |
| GET | `/tags/:connectionId/export` | Yes | *Via preHandler* | Get single resource |
| POST | `/tags/:connectionId/import` | Yes | *Via preHandler* | API endpoint |
| GET | `/tags/:connectionId/export-csv` | Yes | *Via preHandler* | Get single resource |
| POST | `/tags/:connectionId/import-csv` | Yes | *Via preHandler* | API endpoint |
| GET | `/tags/internal` | Yes | *Via preHandler* | List resources |
| POST | `/tags/internal` | Yes | *Via preHandler* | Create resource |
| GET | `/tags/:tagId/writers` | Yes | *Via preHandler* | Get single resource |

## Dashboards Routes

**Base Path:** `/api/dashboards`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/` | Yes | *Check required* | List resources |
| GET | `/schema` | Yes | *Check required* | List resources |
| GET | `/:id` | Yes | *Check required* | Get single resource |
| POST | `/` | Yes | *Check required* | Create resource |
| PUT | `/:id` | Yes | *Check required* | Update resource |
| DELETE | `/:id` | Yes | *Check required* | Delete resource |
| POST | `/:id/duplicate` | Yes | *Check required* | API endpoint |
| POST | `/:id/export` | Yes | *Check required* | API endpoint |
| POST | `/import/validate` | Yes | *Check required* | Create resource |
| POST | `/import/execute` | Yes | *Check required* | Create resource |

## Diag Routes

**Base Path:** `/api/diag`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/summary` | Yes | *Via preHandler* | List resources |
| GET | `/system-metrics` | Yes | *Via preHandler* | List resources |
| POST | `/logs/emit-test` | Yes | *Via preHandler* | Create resource |
| GET | `/audit` | Yes | *Via preHandler* | List resources |
| GET | `/resources` | Yes | *Via preHandler* | List resources |
| GET | `/services/status` | Yes | `diagnostic.system:read` | List resources |
| POST | `/services/:serviceName/restart` | Yes | `diagnostic.system:update` | API endpoint |
| POST | `/recalculate-capacity` | Yes | `diagnostic.system:update` | Create resource |

## Flow-live-data Routes

**Base Path:** `/api`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/flows/:flowId/live-data` | Yes | *Check required* | Get single resource |

## Flow-resources Routes

**Base Path:** `/api`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/flows/resources/active` | Yes | `flows:read` | List resources |
| GET | `/api/flows/resources/summary` | Yes | `flows:read` | List resources |

## Flows Routes

**Base Path:** `/api`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/flows/categories` | Yes | *Check required* | List resources |
| GET | `/api/flows/schema` | Yes | *Check required* | List resources |
| GET | `/api/flows/node-types` | Yes | *Check required* | List resources |
| GET | `/api/flows/node-types/:type` | Yes | *Check required* | Get single resource |
| GET | `/api/flows` | Yes | *Check required* | List resources |
| POST | `/api/flows` | Yes | *Check required* | Create resource |
| GET | `/api/flows/:id` | Yes | *Check required* | Get single resource |
| POST | `/api/flows/:id/resource-chart` | Yes | `flows:update` | API endpoint |
| PUT | `/api/flows/:id` | Yes | *Check required* | Update resource |
| DELETE | `/api/flows/:id` | Yes | *Check required* | Delete resource |
| POST | `/api/flows/:id/deploy` | Yes | *Check required* | API endpoint |
| GET | `/api/flows/shared` | Yes | *Check required* | List resources |
| POST | `/api/flows/:id/duplicate` | Yes | *Check required* | API endpoint |
| GET | `/api/flows/:id/dependencies` | Yes | *Check required* | Get single resource |
| PUT | `/api/flows/:id/static-data` | Yes | *Check required* | Update resource |
| POST | `/api/flows/:id/execute` | Yes | `flows:read` | API endpoint |
| POST | `/api/flows/:id/trigger/:nodeId` | Yes | `flows:read` | API endpoint |
| POST | `/api/flows/:id/execute-from/:nodeId` | Yes | `flows:read` | API endpoint |
| GET | `/api/flows/:id/parameters` | Yes | *Check required* | Get single resource |
| PUT | `/api/flows/:id/parameters` | Yes | *Check required* | Update resource |
| GET | `/api/flows/:id/last-execution` | Yes | *Check required* | Get single resource |
| GET | `/api/flows/:id/parameter-history` | Yes | *Check required* | Get single resource |
| GET | `/api/flows/:id/history` | Yes | *Check required* | Get single resource |
| POST | `/api/flows/:id/nodes/:nodeId/test` | Yes | `flows:read` | API endpoint |
| POST | `/api/flows/:id/nodes/:nodeId/action` | Yes | *Check required* | API endpoint |
| GET | `/api/flows/:id/logs` | Yes | *Check required* | Get single resource |
| GET | `/api/flows/:id/executions/:execId/logs` | Yes | *Check required* | Get single resource |
| POST | `/api/flows/:id/logs/clear` | Yes | *Check required* | API endpoint |
| PUT | `/api/flows/:id/logs/config` | Yes | *Check required* | Update resource |
| GET | `/api/flows/:id/logs/stream` | Yes | *Check required* | Get single resource |
| POST | `/api/flows/:id/sessions/start` | Yes | *Check required* | API endpoint |
| POST | `/api/flows/:id/sessions/:sessionId/stop` | Yes | *Check required* | API endpoint |
| GET | `/api/flows/:id/sessions/active` | Yes | *Check required* | Get single resource |
| POST | `/api/flows/:id/calculate-execution-order` | Yes | *Check required* | API endpoint |
| POST | `/api/flows/:id/export` | Yes | *Check required* | API endpoint |
| POST | `/api/flows/import/validate` | Yes | *Check required* | Create resource |
| POST | `/api/flows/import/execute` | Yes | *Check required* | Create resource |

## Folders Routes

**Base Path:** `/api/folders`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/:folderType/folders` | Yes | *Via preHandler* | Get single resource |
| GET | `/:folderType/folders/tree` | Yes | *Via preHandler* | Get single resource |
| GET | `/:folderType/folders/:folderId` | Yes | *Via preHandler* | Get single resource |
| POST | `/:folderType/folders` | Yes | *Via preHandler* | API endpoint |
| PUT | `/:folderType/folders/:folderId` | Yes | *Via preHandler* | Update resource |
| DELETE | `/:folderType/folders/:folderId` | Yes | *Via preHandler* | Delete resource |
| GET | `/:folderType/folders/:folderId/items` | Yes | *Via preHandler* | Get single resource |
| PUT | `/:folderType/items/:itemId/move` | Yes | *Via preHandler* | Update resource |

## Health Routes

**Base Path:** `/api/health`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/` | No | - | List resources |
| GET | `/live` | No | - | List resources |
| GET | `/ready` | No | - | List resources |

## Jobs Routes

**Base Path:** `/api/jobs`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/jobs` | Yes | *Via preHandler* | List resources |
| GET | `/jobs/_ping` | Yes | *Via preHandler* | List resources |
| POST | `/jobs` | Yes | *Via preHandler* | Create resource |
| GET | `/jobs/:id` | Yes | *Via preHandler* | Get single resource |
| DELETE | `/jobs/:id` | Yes | *Via preHandler* | Delete resource |
| POST | `/jobs/:id/cancel` | Yes | *Via preHandler* | API endpoint |
| GET | `/jobs/metrics` | Yes | *Via preHandler* | List resources |

## Libraries Routes

**Base Path:** `/api`

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/flows/libraries` | Yes | *Check required* | List resources |
| GET | `/api/flows/libraries/:libraryId` | Yes | *Check required* | Get single resource |
| POST | `/api/flows/libraries/upload` | Yes | *Check required* | Create resource |
| POST | `/api/flows/libraries/:libraryId/enable` | Yes | *Check required* | API endpoint |
| POST | `/api/flows/libraries/:libraryId/disable` | Yes | *Check required* | API endpoint |
| DELETE | `/api/flows/libraries/:libraryId` | Yes | *Check required* | Delete resource |
| GET | `/api/flows/libraries/:libraryId/usage` | Yes | *Check required* | Get single resource |
| GET | `/api/extensions/:libraryId/assets/*` | Yes | *Check required* | Get single resource |

## Logs Routes

**Base Path:** `/api/logs`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/components` | Yes | *Via preHandler* | List resources |
| GET | `/read` | Yes | *Via preHandler* | List resources |

## Units Routes

**Base Path:** `/api/units`

> All routes in this file use a preHandler hook for permission checks.

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/` | Yes | *Via preHandler* | List resources |
| GET | `/categories` | Yes | *Via preHandler* | List resources |
| POST | `/` | Yes | `connectivity.units:create` | Create resource |
| PATCH | `/:id` | Yes | `connectivity.units:update` | API endpoint |
| DELETE | `/:id` | Yes | `connectivity.units:delete` | Delete resource |

---

## Validation

This registry is automatically generated from route files.

**To regenerate this file:**
```bash
node ops/validate-permissions.js --generate-docs
```

**To validate permission coverage:**
```bash
node ops/validate-permissions.js
node ops/validate-permissions.js --verbose
```

---

## Statistics

- **Total Endpoints:** 176
- **Protected:** 250
- **Public:** 17
- **Coverage:** 152%

*Generated on 2026-01-13*
