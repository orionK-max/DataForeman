# Permission System Developer Guide

**Version:** 1.0  
**Date:** October 20, 2025  
**Audience:** Developers adding new features to DataForeman  
**Purpose:** Guide for implementing permission-based access control in new features

---

## Table of Contents

1. [Overview](#overview)
2. [Permission System Architecture](#permission-system-architecture)
3. [Quick Start: Adding a New Feature](#quick-start-adding-a-new-feature)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Testing Your Implementation](#testing-your-implementation)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

DataForeman uses a **granular CRUD permission system** where:
- Each feature has separate permissions for **Create**, **Read**, **Update**, and **Delete** operations
- First user automatically gets admin rights
- Admins assign permissions through the User Management UI
- Backend validates all operations
- Frontend adapts UI based on permissions

### Permission Flow

```
User Login
    ↓
Load Permissions (from API)
    ↓
Store in Context (React) + localStorage
    ↓
UI Adapts (show/hide based on permissions)
    ↓
User Action Attempt
    ↓
Backend Validates Permission
    ↓
Success or 403 Forbidden
```

### Current Features

The system currently manages permissions for these features:

| Feature | Description |
|---------|-------------|
| `chart_composer` | Chart creation and management |
| `configuration` | System configuration settings |
| `connectivity.devices` | Device connections and management |
| `connectivity.poll_groups` | Polling group configuration |
| `connectivity.tags` | Tag definitions and metadata |
| `connectivity.units` | Unit conversions and management |
| `dashboards` | Dashboard creation and management |
| `diagnostic.capacity` | System capacity diagnostics |
| `diagnostic.logs` | Log viewing and analysis |
| `diagnostic.network` | Network diagnostics |
| `diagnostic.system` | System health monitoring |
| `diagnostics` | General diagnostic access |
| `jobs` | Background job management |
| `logs` | System log access |
| `permissions` | Permission management |
| `users` | User account management |

---

## Permission System Architecture

### Database Layer

**Table:** `user_permissions`
```sql
CREATE TABLE user_permissions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT FALSE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, feature)
);
```

### Backend Layer

**Service:** `core/src/services/permissions.js`
- Validates permissions
- Caches user permissions (5-min TTL)
- Provides middleware for routes

### Frontend Layer

**Context:** `front/src/contexts/PermissionsContext.jsx`
- Manages permission state
- Provides permission checking methods
- Persists to localStorage

---

## Quick Start: Adding a New Feature

Let's walk through adding a new feature called **"reports"** with full CRUD permissions.

### Step 1: Define the Feature Constant

**File:** `core/src/constants/features.js`

```javascript
export const FEATURES = {
  // Existing features...
  DASHBOARDS: 'dashboards',
  CONNECTIVITY_DEVICES: 'connectivity.devices',
  
  // Add your new feature
  REPORTS: 'reports',
};

export const FEATURE_METADATA = {
  // Existing metadata...
  
  [FEATURES.REPORTS]: {
    label: 'Reports',
    category: 'Analytics',
    description: 'Generate and manage system reports',
    operations: ['create', 'read', 'update', 'delete'],
  },
};
```

**Naming Convention:**
- Use dot notation for sub-features: `reports.scheduled`, `reports.exports`
- Use snake_case for feature names: `chart_composer`, `poll_groups`
- Use descriptive labels for UI display

### Step 2: Update Database Permissions

You have two options:

#### Option A: Migration (Recommended for Production)

Create a new migration file:

**File:** `core/migrations/003_add_reports_feature.sql`

```sql
-- Add reports permissions to all existing users
INSERT INTO user_permissions (user_id, feature, can_create, can_read, can_update, can_delete)
SELECT 
  id as user_id,
  'reports' as feature,
  false as can_create,
  false as can_read,
  false as can_update,
  false as can_delete
FROM users
ON CONFLICT (user_id, feature) DO NOTHING;

-- Grant full access to admin users (role = 'admin')
UPDATE user_permissions
SET 
  can_create = true,
  can_read = true,
  can_update = true,
  can_delete = true
WHERE feature = 'reports'
  AND user_id IN (SELECT id FROM users WHERE role = 'admin');
```

Run migration:
```bash
docker compose exec -T core npx node-pg-migrate \
  -m migrations \
  --check-order false \
  -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE \
  up
```

#### Option B: Manual SQL (Development Only)

```sql
-- Grant reports permissions to specific user
INSERT INTO user_permissions (user_id, feature, can_create, can_read, can_update, can_delete)
VALUES (
  'c0a80000-0000-0000-0000-000000000001', -- Replace with actual user ID
  'reports',
  true,
  true,
  true,
  true
);
```

### Step 3: Create Backend Route with Permissions

**File:** `core/src/routes/reports.js` (new file)

```javascript
/**
 * Reports API Routes
 * Implements CRUD operations with permission checks
 */

async function reportsRoutes(app, options) {
  const { permissions } = app;

  // CREATE - Generate new report
  app.post('/api/reports', {
    preHandler: [
      app.authenticate,
      permissions.requirePermission('reports', 'create')
    ]
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { name, type, config } = request.body;

    // Validation
    if (!name || !type) {
      return reply.code(400).send({ 
        error: 'Missing required fields: name, type' 
      });
    }

    // Business logic
    const report = await app.db.query(
      `INSERT INTO reports (name, type, config, user_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [name, type, JSON.stringify(config), userId]
    );

    return reply.code(201).send(report.rows[0]);
  });

  // READ - List reports
  app.get('/api/reports', {
    preHandler: [
      app.authenticate,
      permissions.requirePermission('reports', 'read')
    ]
  }, async (request, reply) => {
    const userId = request.user.sub;

    const result = await app.db.query(
      `SELECT * FROM reports 
       WHERE user_id = $1 OR is_shared = true
       ORDER BY created_at DESC`,
      [userId]
    );

    return reply.send({ items: result.rows });
  });

  // READ - Get single report
  app.get('/api/reports/:id', {
    preHandler: [
      app.authenticate,
      permissions.requirePermission('reports', 'read')
    ]
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.sub;

    const result = await app.db.query(
      `SELECT * FROM reports 
       WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    return reply.send(result.rows[0]);
  });

  // UPDATE - Modify existing report
  app.put('/api/reports/:id', {
    preHandler: [
      app.authenticate,
      permissions.requirePermission('reports', 'update')
    ]
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.sub;
    const { name, config } = request.body;

    // Check ownership
    const checkResult = await app.db.query(
      `SELECT user_id FROM reports WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return reply.code(403).send({ 
        error: 'Can only update your own reports' 
      });
    }

    // Update
    const result = await app.db.query(
      `UPDATE reports 
       SET name = COALESCE($1, name),
           config = COALESCE($2, config),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name, config ? JSON.stringify(config) : null, id]
    );

    return reply.send(result.rows[0]);
  });

  // DELETE - Remove report
  app.delete('/api/reports/:id', {
    preHandler: [
      app.authenticate,
      permissions.requirePermission('reports', 'delete')
    ]
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.sub;

    // Check ownership
    const checkResult = await app.db.query(
      `SELECT user_id FROM reports WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return reply.code(403).send({ 
        error: 'Can only delete your own reports' 
      });
    }

    await app.db.query(`DELETE FROM reports WHERE id = $1`, [id]);

    return reply.code(204).send();
  });
}

module.exports = reportsRoutes;
```

**Key Points:**
1. ✅ Use `permissions.requirePermission(feature, operation)` middleware
2. ✅ Always include `app.authenticate` before permission check
3. ✅ Validate ownership for update/delete operations
4. ✅ Return proper HTTP status codes (201, 404, 403)
5. ✅ Include descriptive error messages

### Step 4: Register Route in Server

**File:** `core/src/server.js`

```javascript
// Import route
const reportsRoutes = require('./routes/reports');

// ... inside start() function after permissions plugin ...

// Register route
app.register(reportsRoutes);
```

### Step 5: Create Frontend Service

**File:** `front/src/services/reportService.js` (new file)

```javascript
import apiClient from './api';

const reportService = {
  /**
   * List all reports accessible to current user
   */
  async listReports() {
    const response = await apiClient.get('/api/reports');
    return response.data;
  },

  /**
   * Get single report by ID
   */
  async getReport(id) {
    const response = await apiClient.get(`/api/reports/${id}`);
    return response.data;
  },

  /**
   * Create new report
   */
  async createReport(reportData) {
    const response = await apiClient.post('/api/reports', reportData);
    return response.data;
  },

  /**
   * Update existing report
   */
  async updateReport(id, reportData) {
    const response = await apiClient.put(`/api/reports/${id}`, reportData);
    return response.data;
  },

  /**
   * Delete report
   */
  async deleteReport(id) {
    await apiClient.delete(`/api/reports/${id}`);
  },
};

export default reportService;
```

### Step 6: Create Frontend Component with Permission Checks

**File:** `front/src/pages/Reports.jsx` (new file)

```javascript
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Typography,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { usePermissions } from '../contexts/PermissionsContext';
import PermissionGuard from '../components/PermissionGuard';
import reportService from '../services/reportService';

const Reports = () => {
  const { can } = usePermissions();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await reportService.listReports();
      setReports(data.items || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this report?')) return;
    
    try {
      await reportService.deleteReport(id);
      loadReports();
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PermissionGuard 
      feature="reports" 
      operation="read" 
      showFallback={true}
    >
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4">Reports</Typography>
          
          {/* CREATE BUTTON - Only show if user has create permission */}
          {can('reports', 'create') && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {/* Open create dialog */}}
            >
              New Report
            </Button>
          )}
        </Box>

        <Grid container spacing={3}>
          {reports.map(report => (
            <Grid item xs={12} sm={6} md={4} key={report.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{report.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {report.type}
                  </Typography>
                </CardContent>
                
                <CardActions>
                  <Button size="small" onClick={() => {/* View report */}}>
                    View
                  </Button>
                  
                  {/* EDIT BUTTON - Only show if user has update permission */}
                  {can('reports', 'update') && report.is_owner && (
                    <IconButton 
                      size="small"
                      onClick={() => {/* Open edit dialog */}}
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                  )}
                  
                  {/* DELETE BUTTON - Only show if user has delete permission */}
                  {can('reports', 'delete') && report.is_owner && (
                    <IconButton 
                      size="small"
                      onClick={() => handleDelete(report.id)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </PermissionGuard>
  );
};

export default Reports;
```

**Key Permission Patterns:**
1. ✅ Wrap entire page with `PermissionGuard` for read access
2. ✅ Conditionally render create button with `can('reports', 'create')`
3. ✅ Check ownership + update permission for edit buttons
4. ✅ Check ownership + delete permission for delete buttons

### Step 7: Add Navigation Item

**File:** `front/src/layouts/Sidebar.jsx`

```javascript
import ReportIcon from '@mui/icons-material/Assessment';

const allMenuItems = [
  // Existing items...
  { 
    text: 'Dashboards', 
    icon: <DashboardIcon />, 
    path: '/dashboards', 
    feature: 'dashboards' 
  },
  
  // Add your new menu item
  { 
    text: 'Reports', 
    icon: <ReportIcon />, 
    path: '/reports', 
    feature: 'reports' 
  },
];
```

Navigation will automatically filter based on read permission!

### Step 8: Add Route to Router

**File:** `front/src/App.jsx`

```javascript
import Reports from './pages/Reports';

// Inside <Routes>
<Route path="/reports" element={<Reports />} />
```

---

## Backend Implementation

### Permission Middleware

The `permissions.requirePermission()` middleware automatically:
1. ✅ Checks if user is authenticated
2. ✅ Validates permission from database (with caching)
3. ✅ Returns 403 if permission denied
4. ✅ Includes feature/operation context in error

### Using Permission Service Directly

Sometimes you need to check permissions in service logic:

```javascript
async function someServiceFunction(app, userId, itemId) {
  // Check permission programmatically
  const hasPermission = await app.permissions.can(
    userId, 
    'reports', 
    'update'
  );

  if (!hasPermission) {
    throw new Error('Permission denied: reports - update');
  }

  // Continue with business logic...
}
```

### Advanced: Dynamic Feature Detection

For sub-features like `connectivity.devices`, `connectivity.tags`:

```javascript
// In connectivity.js route
app.post('/api/connectivity/:type', {
  preHandler: [app.authenticate]
}, async (request, reply) => {
  const { type } = request.params; // 'devices' or 'tags'
  const feature = `connectivity.${type}`;
  const userId = request.user.sub;

  // Dynamic permission check
  const canCreate = await app.permissions.can(userId, feature, 'create');
  
  if (!canCreate) {
    return reply.code(403).send({
      error: 'Permission denied',
      feature,
      operation: 'create',
    });
  }

  // Process request...
});
```

### Checking Multiple Permissions

```javascript
// Check if user has ANY of the permissions
const canAccess = await app.permissions.canAny(
  userId,
  'reports',
  ['read', 'update']
);

// Check if user has ALL permissions
const hasFullAccess = await app.permissions.canAll(
  userId,
  'reports',
  ['create', 'read', 'update', 'delete']
);
```

### Cache Management

The permission service caches user permissions for 5 minutes. To invalidate:

```javascript
// After updating permissions
await app.permissions.invalidateCache(userId);
```

The cache is automatically invalidated when:
- Permissions are updated via Admin API
- User permissions are deleted

---

## Frontend Implementation

### Using the Permissions Context

```javascript
import { usePermissions } from '../contexts/PermissionsContext';

function MyComponent() {
  const { can, canAll, canAny, getFeatures } = usePermissions();

  // Check single permission
  const canCreate = can('reports', 'create');

  // Check multiple permissions (OR logic)
  const canModify = canAny('reports', ['update', 'delete']);

  // Check multiple permissions (AND logic)
  const hasFullAccess = canAll('reports', ['create', 'read', 'update', 'delete']);

  // Get all features user can access
  const features = getFeatures();

  return (
    <div>
      {canCreate && <Button>Create</Button>}
    </div>
  );
}
```

### Permission Guard Patterns

#### Pattern 1: Hide Entire Component

```javascript
<PermissionGuard feature="reports" operation="read">
  <ReportsPage />
</PermissionGuard>
```

#### Pattern 2: Show Lock Screen

```javascript
<PermissionGuard 
  feature="reports" 
  operation="read" 
  showFallback={true}
>
  <ReportsPage />
</PermissionGuard>
```

#### Pattern 3: Custom Fallback

```javascript
<PermissionGuard 
  feature="reports" 
  operation="create"
  fallback={<Typography>Contact admin for access</Typography>}
>
  <CreateReportForm />
</PermissionGuard>
```

#### Pattern 4: Multiple Operations

```javascript
// User needs EITHER create OR update permission
<PermissionGuard 
  feature="reports" 
  operation={['create', 'update']}
  requireAll={false}
>
  <ReportEditor />
</PermissionGuard>

// User needs BOTH create AND update permission
<PermissionGuard 
  feature="reports" 
  operation={['create', 'update']}
  requireAll={true}
>
  <AdvancedReportEditor />
</PermissionGuard>
```

### Conditional Rendering Patterns

#### Pattern 1: Simple Condition

```javascript
{can('reports', 'create') && (
  <Button>Create Report</Button>
)}
```

#### Pattern 2: Conditional Props

```javascript
<ReportsList
  onEdit={can('reports', 'update') ? handleEdit : null}
  onDelete={can('reports', 'delete') ? handleDelete : null}
/>
```

#### Pattern 3: Disabled State

```javascript
<Button
  disabled={!can('reports', 'create')}
  onClick={handleCreate}
>
  Create Report
</Button>
```

**Note:** Prefer hiding over disabling for better UX!

---

## Testing Your Implementation

### 1. Database Check

```sql
-- Verify feature exists in permissions table
SELECT DISTINCT feature FROM user_permissions WHERE feature = 'reports';

-- Check specific user permissions
SELECT * FROM user_permissions 
WHERE user_id = 'YOUR_USER_ID' AND feature = 'reports';
```

### 2. Backend Testing

```bash
# Test CREATE endpoint (should return 403 without permission)
curl -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Report","type":"sales"}'

# Test READ endpoint
curl http://localhost:3000/api/reports \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Frontend Testing

1. **Login as admin** → Should see all features and buttons
2. **Create test user** without permissions → Should see empty sidebar
3. **Grant read permission** → Should see Reports in navigation, but no Create button
4. **Grant create permission** → Should see Create button appear
5. **Grant update/delete** → Should see Edit/Delete buttons on owned reports

### 4. Permission Cache Test

```javascript
// In browser console
// Check loaded permissions
JSON.parse(localStorage.getItem('df_permissions'));

// Clear cache
localStorage.removeItem('df_permissions');

// Reload page - permissions should reload from API
```

---

## Common Patterns

### Pattern: Feature with Sub-features

```javascript
// Backend - features.js
export const FEATURES = {
  ANALYTICS: 'analytics',
  ANALYTICS_REPORTS: 'analytics.reports',
  ANALYTICS_CHARTS: 'analytics.charts',
  ANALYTICS_EXPORTS: 'analytics.exports',
};

// Frontend - check parent or child
{(can('analytics', 'read') || can('analytics.reports', 'read')) && (
  <AnalyticsMenu />
)}
```

### Pattern: Admin-Only Operations

Some operations are restricted to users with specific administrative permissions (system config, user management):

```javascript
// Backend route - check admin permission
app.post('/api/admin/system/config', {
  preHandler: [
    app.authenticate,
    async (req, reply) => {
      const userId = req.user?.sub;
      if (!userId || !(await app.permissions.can(userId, 'configuration', 'update'))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
    }
  ]
}, async (request, reply) => {
  // Configuration logic
});
```

### Pattern: Shared Resources

```javascript
// Backend - check ownership for update/delete
const result = await app.db.query(
  `SELECT user_id FROM reports WHERE id = $1`,
  [id]
);

const isOwner = result.rows[0].user_id === userId;
const isShared = result.rows[0].is_shared;

if (!isOwner && !isShared) {
  return reply.code(403).send({ error: 'Access denied' });
}
```

### Pattern: Bulk Operations

```javascript
// Check permission once for bulk operation
const canDelete = await app.permissions.can(userId, 'reports', 'delete');

if (!canDelete) {
  return reply.code(403).send({ 
    error: 'Permission denied for bulk delete' 
  });
}

// Check ownership for each item
const ownedIds = await app.db.query(
  `SELECT id FROM reports 
   WHERE id = ANY($1) AND user_id = $2`,
  [idsToDelete, userId]
);

// Only delete owned items
await app.db.query(
  `DELETE FROM reports WHERE id = ANY($1)`,
  [ownedIds.rows.map(r => r.id)]
);
```

---

## Troubleshooting

### Issue: Permission Check Always Returns False

**Causes:**
1. Feature name doesn't match database
2. User doesn't have permission in database
3. Permission cache is stale

**Solutions:**
```sql
-- Check database
SELECT * FROM user_permissions 
WHERE user_id = 'USER_ID' AND feature = 'FEATURE_NAME';

-- Grant permission
INSERT INTO user_permissions (user_id, feature, can_read)
VALUES ('USER_ID', 'FEATURE_NAME', true)
ON CONFLICT (user_id, feature) DO UPDATE SET can_read = true;
```

```javascript
// Clear cache (backend)
await app.permissions.invalidateCache(userId);

// Clear cache (frontend)
localStorage.removeItem('df_permissions');
window.location.reload();
```

### Issue: 403 Error on Valid Permission

**Causes:**
1. Missing `app.authenticate` middleware
2. Permission middleware in wrong order
3. Feature name typo
4. Case sensitivity mismatch

**Solutions:**
```javascript
// Correct order
app.post('/api/reports', {
  preHandler: [
    app.authenticate,                              // FIRST
    app.permissions.requirePermission('reports', 'create')  // SECOND
  ]
}, handler);

// Check feature name matches exactly
console.log(FEATURES.REPORTS); // 'reports'
```

### Issue: UI Shows Button But API Returns 403

**Cause:** Frontend permission check passed but backend failed

**Solutions:**
1. Ensure feature names match exactly between frontend and backend
2. Check for typos in operation names (`'read'` vs `'Read'`)
3. Verify permissions were loaded on frontend:
   ```javascript
   console.log(localStorage.getItem('df_permissions'));
   ```

### Issue: Navigation Item Not Showing

**Causes:**
1. User lacks read permission
2. Feature name doesn't match sidebar config
3. Permissions not loaded yet

**Solutions:**
```javascript
// Check PermissionsLoader is in App.jsx
<PermissionsLoader />

// Check sidebar item has feature property
{ 
  text: 'Reports', 
  icon: <ReportIcon />, 
  path: '/reports', 
  feature: 'reports'  // Must match FEATURES constant
}

// Check user has read permission
can('reports', 'read') // Should return true
```

---

## Best Practices

### ✅ DO

1. **Always validate permissions on backend** - Frontend checks are UX only
2. **Use descriptive feature names** - `analytics.reports` not `rpt`
3. **Check ownership for update/delete** - Don't let users modify others' data
4. **Hide UI elements** - Don't show disabled buttons
5. **Return 403 with context** - Include feature and operation in error
6. **Cache appropriately** - Use 5-min cache for permissions
7. **Use PermissionGuard for pages** - Wrap entire page components
8. **Use conditional rendering for buttons** - `{can() && <Button />}`
9. **Test with multiple permission sets** - Create test users
10. **Document new features** - Update FEATURE_METADATA

### ❌ DON'T

1. **Don't skip backend validation** - Never trust frontend alone
2. **Don't hardcode user IDs** - Always use request.user.sub
3. **Don't show disabled buttons** - Hide them instead
4. **Don't forget ownership checks** - Users shouldn't delete others' data
5. **Don't cache forever** - Use reasonable TTL (5 minutes)
6. **Don't forget to invalidate cache** - After permission updates
7. **Don't use generic errors** - Include feature context in 403
8. **Don't bypass permission system** - All routes must check permissions
9. **Don't expose admin features** - Require appropriate permissions for system operations
10. **Don't forget navigation** - Add menu items for new features

### Security Checklist

- [ ] Feature defined in `FEATURES` constant
- [ ] Database permissions table includes feature
- [ ] Backend route uses `requirePermission` middleware
- [ ] Backend checks ownership for update/delete
- [ ] Frontend uses `PermissionGuard` or `can()` checks
- [ ] Navigation item filtered by read permission
- [ ] Create button hidden without create permission
- [ ] Edit button hidden without update permission + ownership
- [ ] Delete button hidden without delete permission + ownership
- [ ] API returns proper 403 errors with context
- [ ] Permissions cached appropriately (5-min TTL)
- [ ] Cache invalidated on permission updates
- [ ] Tested with multiple permission sets
- [ ] Documentation updated

---

## Summary

Adding a new feature with permissions requires:

1. **Define** feature constant
2. **Update** database permissions
3. **Create** backend route with permission middleware
4. **Register** route in server
5. **Create** frontend service
6. **Build** frontend component with permission checks
7. **Add** navigation item
8. **Test** with different permission sets

**Remember:**
- Backend validates (security)
- Frontend adapts (UX)
- Permissions are granular (CRUD)
- Cache intelligently (5-min TTL)
- Hide, don't disable
- Always check ownership

---

## Additional Resources

### Code References
- **Permission Service:** `core/src/services/permissions.js`
- **Permission Context:** `front/src/contexts/PermissionsContext.jsx`
- **Permission Guard:** `front/src/components/PermissionGuard.jsx`
- **Feature Constants:** `core/src/constants/features.js`

### Example Implementations
- **Backend Routes:** `core/src/routes/units.js`, `connectivity.js`
- **Frontend Pages:** `front/src/pages/DashboardList.jsx`, `Connectivity.jsx`

### Testing
- **Testing Checklist:** `docs/permission-system-testing-checklist.md` - Comprehensive test scenarios

---

**Questions or Issues?**
Check the troubleshooting section or review existing implementations in the codebase.

**Happy coding! 🚀**
