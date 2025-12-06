# Chart Configuration Schema Specification

**Version:** 1.0  
**Last Updated:** December 6, 2025  
**Status:** Active Standard

---

## Overview

This document defines the standard schema for chart configurations in DataForeman. All charts must conform to this specification to ensure consistency, maintainability, and extensibility. This approach mirrors the Flow Node Schema, providing a unified architecture across the platform.

### Design Principles

1. **Single Source of Truth**: Chart metadata and structure defined in backend schema
2. **Declarative**: Configuration over implementation where possible
3. **Extensible**: Support new features without breaking existing charts
4. **Versioned**: Clear upgrade path for schema changes
5. **Type Safe**: Well-defined types and validation for all fields
6. **Backend-Driven**: Schema served via API for dynamic UI generation

---

## Schema Versions

### Version 1 (Current)
- Initial standardized schema
- Comprehensive validation for all chart properties
- Support for tags, axes, reference lines, critical ranges, and derived series
- Grid, background, and display configuration
- Backend validation with detailed error messages

### Future Versions
- Version 2: TBD based on learnings
- Migration utilities provided for breaking changes
- See `chartValidator.js` for migration functions

---

## Schema Location

**Backend Implementation:**
- Schema Definition: `core/src/schemas/ChartConfigSchema.js`
- Validator Service: `core/src/services/chartValidator.js`
- Routes Integration: `core/src/routes/charts.js`

**API Endpoint:**
```
GET /api/charts/schema
```
Returns the complete schema definition including limits and types.

---

## Chart Configuration Structure

### Root-Level Properties

These are database columns in the `chart_configs` table:

```javascript
{
  // System fields (auto-managed)
  id: 'uuid',                    // Auto-generated
  user_id: 'uuid',               // Chart owner
  created_at: 'timestamp',       // Auto-set
  updated_at: 'timestamp',       // Auto-updated
  is_deleted: boolean,           // Soft delete flag
  
  // Required fields
  name: string,                  // Chart name (1-120 chars)
  
  // Time range configuration
  time_from: timestamp | null,   // Fixed mode start time
  time_to: timestamp | null,     // Fixed mode end time
  time_mode: 'fixed' | 'rolling' | 'shifted',
  time_duration: integer | null, // Duration in ms (rolling/shifted)
  time_offset: integer,          // Offset in ms (shifted mode)
  
  // Visibility and features
  is_shared: boolean,            // Share with other users
  is_system_chart: boolean,      // System diagnostic chart
  live_enabled: boolean,         // Enable live data updates
  show_time_badge: boolean,      // Show time range badge
  
  // Organization
  folder_id: uuid | null,        // Parent folder
  
  // Chart configuration (JSONB)
  options: ChartOptions          // See below
}
```

### Chart Options Schema

The `options` field is a JSONB object with the following structure:

```javascript
{
  version: 1,                    // Schema version (required)
  
  // Tags to display
  tags: [
    {
      connection_id: integer,    // Connection ID
      tag_id: integer,           // Tag ID
      tag_path: string,          // Tag path
      tag_name: string,          // Display name
      data_type: string,         // Data type
      alias: string,             // Optional custom name
      color: string,             // Hex color (#RRGGBB)
      thickness: number,         // Line width (0.5-10)
      strokeType: 'solid' | 'dashed' | 'dotted',
      yAxisId: string,           // Assigned Y-axis
      interpolation: 'linear' | 'monotone' | 'step' | 'stepBefore' | 'stepAfter',
      hidden: boolean            // Hide on chart
    }
    // ... max 50 tags
  ],
  
  // Y-axes configuration
  axes: [
    {
      id: string,                // Unique axis ID
      label: string,             // Axis label
      orientation: 'left' | 'right',
      domain: [min, max],        // ['auto', 'auto'] or [number, number]
      offset: number,            // Axis offset (pixels)
      namePosition: 'start' | 'middle' | 'end',
      nameOffset: number         // Name offset (pixels)
    }
    // ... max 10 axes, min 1
  ],
  
  // Horizontal reference lines
  referenceLines: [
    {
      id: string,                // Unique line ID
      value: number,             // Y-axis value
      label: string,             // Optional label
      color: string,             // Hex color
      lineWidth: number,         // Width (0.5-10)
      lineStyle: string,         // Dash pattern ('0' = solid, '4 4' = dashed)
      yAxisId: string            // Assigned Y-axis
    }
    // ... max 10 lines
  ],
  
  // Shaded critical ranges
  criticalRanges: [
    {
      id: string,                // Unique range ID
      yMin: number,              // Min Y value
      yMax: number,              // Max Y value
      color: string,             // Fill color
      opacity: number,           // Fill opacity (0-1)
      label: string,             // Optional label
      yAxisId: string            // Assigned Y-axis
    }
    // ... max 10 ranges
  ],
  
  // Derived/calculated series
  derived: [
    {
      id: string,                // Unique series ID
      name: string,              // Series name
      expression: string,        // Math expression
      color: string,             // Line color
      yAxisId: string            // Assigned Y-axis
    }
    // ... max 10 derived series
  ],
  
  // Grid configuration
  grid: {
    color: string,               // Grid line color
    opacity: number,             // Opacity (0-1)
    thickness: number,           // Line width (0.5-5)
    dash: string                 // Dash pattern
  },
  
  // Background configuration
  background: {
    color: string,               // Background color
    opacity: number              // Opacity (0-1)
  },
  
  // Display options
  display: {
    showLegend: boolean,
    showTooltip: boolean,
    legendPosition: 'top' | 'bottom' | 'left' | 'right' | 'none',
    crosshairEnabled: boolean,
    crosshairOpacity: number,
    crosshairPattern: string
  },
  
  // Global settings
  interpolation: string,         // Default interpolation
  xAxisTickCount: integer        // X-axis tick marks (2-20)
}
```

---

## Validation

### Backend Validation

All chart configurations are validated on the backend using the `chartValidator` service:

```javascript
import { validateChartConfig } from '../services/chartValidator.js';

const result = validateChartConfig(chartData, { partial: false });

if (!result.valid) {
  // result.errors contains validation errors
  // result.warnings contains non-critical issues
}

// result.value contains validated and normalized data
```

### Validation Rules

1. **Name**: Required, 1-120 characters, non-empty after trim
2. **Time Mode**: Must be 'fixed', 'rolling', or 'shifted'
3. **Time Duration**: Non-negative integer or null
4. **Options Version**: Must be 1
5. **Tags**: Max 50, all required fields present, valid colors
6. **Axes**: Max 10, min 1, unique IDs, valid orientations
7. **Reference Lines**: Max 10, valid numeric values
8. **Critical Ranges**: Max 10, valid min/max pairs
9. **Derived Series**: Max 10, valid expressions
10. **Colors**: Must match hex pattern `#[0-9a-fA-F]{6}`
11. **Options Size**: Max 65536 bytes (serialized)

### Partial Validation

For PATCH operations, use `partial: true`:

```javascript
const result = validateChartConfig(updates, { partial: true });
```

This allows updating individual fields without requiring all required fields.

---

## Limits and Constraints

Defined in `ChartConfigSchema.js`:

```javascript
export const CHART_LIMITS = {
  MAX_TAGS: 50,
  MAX_AXES: 10,
  MAX_REFERENCE_LINES: 10,
  MAX_CRITICAL_RANGES: 10,
  MAX_DERIVED_SERIES: 10,
  MAX_NAME_LENGTH: 120,
  MAX_OPTIONS_SIZE: 65536,
  MAX_ALIAS_LENGTH: 100,
  MAX_LABEL_LENGTH: 100
};
```

These limits ensure:
- **Performance**: Reasonable rendering times
- **Security**: Protection against resource exhaustion
- **Usability**: Charts remain readable and manageable

---

## API Usage

### Get Chart Schema

```http
GET /api/charts/schema
Authorization: Bearer <token>
```

**Response:**
```json
{
  "schemaVersion": 1,
  "config": { /* root-level schema */ },
  "options": { /* options schema */ },
  "limits": { /* limit constants */ },
  "description": "Chart configuration schema definition"
}
```

### Create Chart

```http
POST /api/charts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Temperature Monitoring",
  "time_mode": "rolling",
  "time_duration": 3600000,
  "options": {
    "version": 1,
    "tags": [ /* ... */ ],
    "axes": [ /* ... */ ],
    "grid": { /* ... */ },
    "background": { /* ... */ },
    "display": { /* ... */ }
  }
}
```

**Validation occurs automatically** on the backend. Errors are returned with detailed messages.

---

## Migration Strategy

### Version 1 → Version 2 (Future)

When schema version 2 is introduced:

1. **Automatic Migration**: `migrateChartOptions()` function handles conversion
2. **Backwards Compatibility**: Version 1 charts continue to work
3. **Gradual Rollout**: Charts migrated on first edit after upgrade
4. **Validation**: New schema validated against version 2 rules

Example migration function:

```javascript
import { migrateChartOptions } from '../services/chartValidator.js';

// Automatically handles version upgrades
const migratedOptions = migrateChartOptions(oldOptions, 1, 2);
```

---

## Frontend Integration

### Fetching Schema

```javascript
import { apiClient } from './api';

const schema = await apiClient.get('/charts/schema');
console.log('Schema version:', schema.schemaVersion);
console.log('Tag limit:', schema.limits.MAX_TAGS);
```

### Validation Feedback

The frontend can use the schema to:
- **Pre-validate** configurations before saving
- **Generate dynamic forms** based on schema properties
- **Display limits** to users (e.g., "50 tags maximum")
- **Provide helpful errors** matching backend validation

### Context Usage

The existing `ChartComposerContext` remains unchanged. It manages UI state while the backend schema handles validation and persistence.

---

## Comparison with Flow Node Schema

### Similarities

1. **Backend-Driven**: Schema definitions live in backend
2. **Versioned**: `schemaVersion` field for upgrades
3. **Validation**: Comprehensive validation with error messages
4. **API-Served**: Schema available via API endpoint
5. **Type Safe**: Strong typing for all properties
6. **Extensible**: Extensions mechanism for future features

### Differences

1. **Storage**: Charts use JSONB field; flows use separate node definitions
2. **Complexity**: Charts have simpler structure than flow execution
3. **Runtime**: Charts are static configurations; flows execute dynamically
4. **Permissions**: Charts use dashboard permissions; flows use flow permissions

### Benefits of Unified Approach

- **Consistency**: Developers follow same patterns
- **Maintainability**: Similar validation and migration strategies
- **Documentation**: Parallel documentation structure
- **Testing**: Shared testing approaches
- **Learning Curve**: Understand one, understand both

---

## Best Practices

### Creating Charts

1. **Start Simple**: Begin with default axes and grid
2. **Add Tags Incrementally**: Don't try to add all 50 tags at once
3. **Use Aliases**: Provide meaningful names for clarity
4. **Choose Colors Wisely**: Ensure sufficient contrast
5. **Test Performance**: More tags = slower rendering

### Validation Errors

When you receive validation errors:

1. **Read Error Messages**: They specify exactly what's wrong
2. **Check Limits**: You may have exceeded maximum counts
3. **Verify Colors**: Ensure hex format (`#RRGGBB`)
4. **Validate IDs**: Axis IDs must be unique
5. **Review Types**: Numbers must be numbers, not strings

### Schema Evolution

As the schema evolves:

1. **Check Version**: Always include `version: 1` in options
2. **Monitor Deprecations**: Watch for schema changes in release notes
3. **Test Migrations**: Verify charts work after upgrades
4. **Report Issues**: File bugs for unexpected behavior

---

## Error Messages

Common validation errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `name required` | Missing or empty name | Provide non-empty chart name |
| `options.version must be 1` | Wrong version number | Set `version: 1` |
| `too many tags (max 50)` | Exceeded tag limit | Remove some tags |
| `tag[0].color must be valid hex` | Invalid color format | Use format `#FF0000` |
| `axis[0].orientation must be 'left' or 'right'` | Invalid orientation | Use 'left' or 'right' |
| `options too large` | Configuration exceeds 65KB | Simplify configuration |

---

## Examples

### Minimal Chart

```javascript
{
  "name": "Simple Chart",
  "time_mode": "rolling",
  "time_duration": 3600000,
  "options": {
    "version": 1,
    "tags": [
      {
        "connection_id": 1,
        "tag_id": 42,
        "tag_path": "PLC1.Temperature",
        "tag_name": "Temperature",
        "data_type": "REAL",
        "color": "#FF5722",
        "yAxisId": "default"
      }
    ],
    "axes": [
      {
        "id": "default",
        "label": "Temperature (°C)",
        "orientation": "left",
        "domain": ["auto", "auto"]
      }
    ]
  }
}
```

### Advanced Chart

```javascript
{
  "name": "Multi-Axis Temperature & Pressure",
  "time_mode": "fixed",
  "time_from": "2025-12-06T00:00:00Z",
  "time_to": "2025-12-06T23:59:59Z",
  "options": {
    "version": 1,
    "tags": [
      {
        "connection_id": 1,
        "tag_id": 42,
        "tag_path": "PLC1.Temperature",
        "tag_name": "Temperature",
        "data_type": "REAL",
        "color": "#FF5722",
        "thickness": 2,
        "strokeType": "solid",
        "yAxisId": "temp",
        "interpolation": "linear"
      },
      {
        "connection_id": 1,
        "tag_id": 43,
        "tag_path": "PLC1.Pressure",
        "tag_name": "Pressure",
        "data_type": "REAL",
        "color": "#2196F3",
        "thickness": 2,
        "strokeType": "solid",
        "yAxisId": "pressure",
        "interpolation": "linear"
      }
    ],
    "axes": [
      {
        "id": "temp",
        "label": "Temperature (°C)",
        "orientation": "left",
        "domain": [0, 100]
      },
      {
        "id": "pressure",
        "label": "Pressure (bar)",
        "orientation": "right",
        "domain": [0, 10]
      }
    ],
    "referenceLines": [
      {
        "id": "temp-max",
        "value": 80,
        "label": "Max Temperature",
        "color": "#F44336",
        "lineWidth": 2,
        "lineStyle": "4 4",
        "yAxisId": "temp"
      }
    ],
    "criticalRanges": [
      {
        "id": "danger-zone",
        "yMin": 80,
        "yMax": 100,
        "color": "#F44336",
        "opacity": 0.2,
        "label": "Danger Zone",
        "yAxisId": "temp"
      }
    ],
    "grid": {
      "color": "#374151",
      "opacity": 0.3,
      "thickness": 1,
      "dash": "solid"
    },
    "background": {
      "color": "#000000",
      "opacity": 1
    },
    "display": {
      "showLegend": true,
      "showTooltip": true,
      "legendPosition": "bottom"
    }
  }
}
```

---

## Related Documentation

- **Flow Node Schema**: `docs/flow-node-schema.md` - Similar approach for flows
- **API Registry**: `docs/api-registry.md` - Complete API documentation
- **Chart User Guide**: `website/content/documentation/charts.md` - User-facing documentation
- **Permission System**: `docs/permission-system-developer-guide.md` - Access control

---

## Changelog

### Version 1.0 (December 6, 2025)
- Initial standardized schema
- Backend validation implementation
- Schema API endpoint
- Migration utilities
- Documentation complete

---

## Support

For questions or issues:
1. Check validation error messages
2. Review this documentation
3. Consult API registry
4. Check GitHub issues
5. Contact development team
