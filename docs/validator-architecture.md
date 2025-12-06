# Validator Architecture

**Version:** 1.0  
**Last Updated:** December 6, 2025  
**Status:** Active Standard

---

## Overview

DataForeman uses a **modular validator architecture** where each major data type has its own dedicated validator. This approach ensures maintainability, testability, and clear separation of concerns.

---

## Design Principles

1. **One Validator Per Domain**: Each major data type (charts, dashboards, flows, etc.) has its own validator
2. **Separate Schema Files**: Schema definitions live in `core/src/schemas/`
3. **Separate Validator Files**: Validation logic lives in `core/src/services/` or domain-specific folders
4. **Consistent Naming**: `{domain}Validator.js` and `{Domain}Schema.js`
5. **Backend-Driven**: All validation happens on backend; frontend can optionally pre-validate

---

## File Organization

### Schemas (Data Structure Definitions)
```
core/src/schemas/
├── ChartConfigSchema.js       ← Chart configuration structure
├── DashboardSchema.js          ← Dashboard configuration structure
├── FlowNodeSchema.js           ← Flow node structure
└── IndicatorConfigSchema.js   ← Indicator/widget configuration (future)
```

### Validators (Validation Logic)
```
core/src/services/
├── chartValidator.js          ← Chart validation
├── dashboardValidator.js      ← Dashboard validation
└── indicatorValidator.js      ← Indicator validation (future)

core/src/nodes/base/
└── flowNodeValidator.js       ← Flow node validation (co-located with node infrastructure)
```

**Note:** Flow node validator is in `nodes/base/` because it's tightly coupled with the node system (NodeRegistry, BaseNode). Other validators are in `services/` as they're more general-purpose.

---

## Validator Structure

Each validator should follow this pattern:

### Required Exports

```javascript
/**
 * Validate complete configuration
 * @param {Object} config - Configuration to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.partial - Allow partial updates
 * @param {boolean} options.strict - Warnings become errors
 * @returns {Object} { valid, errors, warnings, value }
 */
export function validate{Domain}Config(config, { partial = false, strict = false } = {}) {
  // Validation logic
}

/**
 * Get counts/metrics for logging
 * @param {Object} config - Configuration object
 * @returns {Object} Metrics for logging/auditing
 */
export function get{Domain}Metrics(config) {
  // Extract metrics
}

/**
 * Migrate from old version to new version
 * @param {Object} config - Old configuration
 * @param {number} fromVersion - Current version
 * @param {number} toVersion - Target version
 * @returns {Object} Migrated configuration
 */
export function migrate{Domain}Config(config, fromVersion, toVersion) {
  // Migration logic
}
```

### Validation Return Format

All validators must return this structure:

```javascript
{
  valid: boolean,           // True if no errors
  errors: string[],        // Critical validation errors
  warnings: string[],      // Non-critical issues
  value: Object           // Validated and normalized data
}
```

---

## Current Validators

### Chart Validator

**File:** `core/src/services/chartValidator.js`  
**Schema:** `core/src/schemas/ChartConfigSchema.js`  
**API:** `GET /api/charts/schema`

**Validates:**
- Root-level properties (name, time_mode, etc.)
- Options object (tags, axes, reference lines, etc.)
- All sub-structures (grid, background, display)

**Functions:**
- `validateChartConfig(config, options)` - Main validation
- `validateChartOptions(options, options)` - Options-specific validation
- `getOptionCounts(options)` - Metrics for logging
- `migrateChartOptions(options, fromVersion)` - Migration utility

**Example Usage:**
```javascript
import { validateChartConfig } from '../services/chartValidator.js';

const result = validateChartConfig(req.body, { partial: false });
if (!result.valid) {
  return reply.code(400).send({ 
    error: 'validation_failed', 
    details: result.errors 
  });
}
// Use result.value (normalized data)
```

### Flow Node Validator

**File:** `core/src/nodes/base/flowNodeValidator.js`  
**API:** `GET /api/flows/node-types`

**Validates:**
- Node description objects
- Inputs/outputs arrays
- Properties definitions
- Visual configurations

**Functions:**
- `FlowNodeValidator.validate(nodeType, description)` - Validate description
- `FlowNodeValidator.validateAndApplyDefaults(nodeType, description)` - Validate + apply defaults
- `FlowNodeValidator.validateInputsOutputs(inputs, outputs)` - Validate I/O
- `FlowNodeValidator.validateProperties(properties)` - Validate properties

**Example Usage:**
```javascript
import { FlowNodeValidator } from './flowNodeValidator.js';

const validation = FlowNodeValidator.validate(nodeType, description);
if (!validation.valid) {
  throw new Error(`Invalid schema: ${validation.errors.join(', ')}`);
}
```

---

## Implemented Validators

### Dashboard Validator

**File:** `core/src/services/dashboardValidator.js`  
**Schema:** `core/src/schemas/DashboardSchema.js`  
**API:** `GET /api/dashboards/schema`

**Validates:**
- Dashboard metadata (name, description, is_shared)
- Layout configuration (grid_cols, row_height)
- Widget items (position, size, constraints)
- UUID validation for chart_id references
- Duplicate widget ID detection

**Functions:**
```javascript
export function validatePayload(payload, options)  // Main validation
export function getSchemaVersion()                // Returns schema version
```

**Schema Structure:**
- **Version:** `DASHBOARD_SCHEMA_VERSION = 1`
- **Limits:** Grid columns (1-24), row height (10-500), max widgets (50)
- **Layout Items:** Each widget has i, chart_id, x, y, w, h, and optional constraints

**Example Usage:**
```javascript
import { validatePayload } from '../services/dashboardValidator.js';

// Create dashboard
const result = validatePayload(req.body, { isUpdate: false });
if (!result.valid) {
  return reply.code(400).send({ error: 'validation_failed', details: result.errors });
}

// Update dashboard
const result = validatePayload(req.body, { isUpdate: true });
```

### Future Validators

### Indicator/Widget Validator (To Be Implemented)

**File:** `core/src/services/indicatorValidator.js`  
**Schema:** `core/src/schemas/IndicatorConfigSchema.js`  
**API:** `GET /api/indicators/schema`

**Will Validate:**
- Indicator type (gauge, bar, pie, number, etc.)
- Data source configuration
- Visual styling and thresholds
- Update intervals

**Recommended Functions:**
```javascript
export function validateIndicatorConfig(config, options)
export function validateThresholds(thresholds, options)
export function getIndicatorMetrics(config)
export function migrateIndicatorConfig(config, fromVersion, toVersion)
```

---

## Naming Conventions

### Files
- Schema Files: `{Domain}Schema.js` (PascalCase + "Schema")
- Validator Files: `{domain}Validator.js` (camelCase + "Validator")

### Functions
- Main Validation: `validate{Domain}Config()`
- Sub-validation: `validate{Component}()`
- Metrics: `get{Domain}Metrics()` or `getOptionCounts()`
- Migration: `migrate{Domain}Config()`

### Constants
- Schema Version: `{DOMAIN}_SCHEMA_VERSION`
- Limits: `{DOMAIN}_LIMITS`
- Enums: `{PROPERTY}_VALUES` or `{PROPERTY}_TYPES`

**Examples:**
```javascript
// Chart Validator
export const CHART_SCHEMA_VERSION = 1;
export const CHART_LIMITS = { MAX_TAGS: 50, ... };
export function validateChartConfig(config, options) { ... }
export function getOptionCounts(options) { ... }

// Dashboard Validator (future)
export const DASHBOARD_SCHEMA_VERSION = 1;
export const DASHBOARD_LIMITS = { MAX_WIDGETS: 50, ... };
export function validateDashboardConfig(config, options) { ... }
export function getDashboardMetrics(config) { ... }
```

---

## Common Validation Patterns

### 1. String Validation
```javascript
// Name validation
if (!config.name || typeof config.name !== 'string') {
  errors.push('name is required and must be a string');
} else {
  const trimmed = config.name.trim();
  if (!trimmed) {
    errors.push('name cannot be empty');
  } else if (trimmed.length > MAX_NAME_LENGTH) {
    errors.push(`name too long (max ${MAX_NAME_LENGTH})`);
  } else {
    value.name = trimmed;
  }
}
```

### 2. Enum Validation
```javascript
const VALID_MODES = ['fixed', 'rolling', 'shifted'];
if (!VALID_MODES.includes(config.mode)) {
  errors.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
} else {
  value.mode = config.mode;
}
```

### 3. Color Validation
```javascript
const hexPattern = /^#[0-9a-fA-F]{6}$/;
if (!hexPattern.test(config.color)) {
  errors.push('color must be a valid hex color (e.g., #FF0000)');
} else {
  value.color = config.color;
}
```

### 4. Array Validation
```javascript
if (!Array.isArray(config.items)) {
  errors.push('items must be an array');
} else if (config.items.length > MAX_ITEMS) {
  errors.push(`too many items (max ${MAX_ITEMS})`);
} else {
  value.items = config.items.map((item, idx) => {
    // Validate each item
  });
}
```

### 5. Number Range Validation
```javascript
const val = Number(config.value);
if (isNaN(val) || val < MIN || val > MAX) {
  errors.push(`value must be between ${MIN} and ${MAX}`);
} else {
  value.value = val;
}
```

---

## Integration with Routes

Validators should be imported and used in route handlers:

```javascript
import { validateChartConfig } from '../services/chartValidator.js';

export async function chartsRoutes(app) {
  // Create chart
  app.post('/', async (req, reply) => {
    const userId = req.user.sub;
    
    // Validate
    const result = validateChartConfig(req.body, { partial: false });
    if (!result.valid) {
      return reply.code(400).send({ 
        error: 'validation_failed', 
        details: result.errors 
      });
    }
    
    // Use validated data
    const validated = result.value;
    
    // Save to database
    const { rows } = await app.db.query(
      'INSERT INTO charts (...) VALUES (...)',
      [validated.name, validated.options, ...]
    );
    
    return rows[0];
  });
}
```

---

## Testing Strategy

Each validator should have comprehensive tests:

### Unit Tests
```javascript
// test/validators/chartValidator.test.js
import { validateChartConfig } from '../../src/services/chartValidator.js';

describe('Chart Validator', () => {
  describe('validateChartConfig', () => {
    it('should accept valid configuration', () => {
      const config = { /* valid config */ };
      const result = validateChartConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject missing name', () => {
      const config = { /* no name */ };
      const result = validateChartConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });
    
    // More tests...
  });
});
```

### Integration Tests
```javascript
// test/routes/charts.test.js
describe('POST /api/charts', () => {
  it('should create chart with valid config', async () => {
    const response = await request(app)
      .post('/api/charts')
      .send(validChartConfig)
      .expect(201);
      
    expect(response.body.id).toBeDefined();
  });
  
  it('should return 400 for invalid config', async () => {
    const response = await request(app)
      .post('/api/charts')
      .send(invalidChartConfig)
      .expect(400);
      
    expect(response.body.error).toBe('validation_failed');
    expect(response.body.details).toBeDefined();
  });
});
```

---

## Benefits of This Architecture

### 1. Maintainability
- Easy to find and update specific validators
- Clear ownership of validation logic
- Isolated changes reduce risk

### 2. Testability
- Each validator can be tested independently
- Focused unit tests for specific domains
- Easier to achieve high test coverage

### 3. Performance
- Tree-shaking removes unused validators
- Smaller bundle sizes for frontend
- Faster imports and loading

### 4. Scalability
- Easy to add new validators
- No file size limitations
- Team can work in parallel

### 5. Consistency
- Common patterns across all validators
- Predictable API surface
- Easier onboarding for new developers

---

## Migration Path

When converting dashboards to use this architecture:

1. Create `core/src/schemas/DashboardConfigSchema.js`
2. Create `core/src/services/dashboardValidator.js`
3. Add `/api/dashboards/schema` endpoint
4. Update dashboard routes to use validator
5. Create comprehensive tests
6. Document in `docs/dashboard-configuration-schema.md`

Follow the same pattern used for charts - it's proven and working!

---

## Common Pitfalls to Avoid

### ❌ DON'T: Combine All Validators
```javascript
// Bad - one huge file
export function validateChart() { /* 200 lines */ }
export function validateDashboard() { /* 200 lines */ }
export function validateIndicator() { /* 200 lines */ }
export function validateFlow() { /* 200 lines */ }
// ... becomes unmaintainable
```

### ✅ DO: Separate Files
```javascript
// Good - focused files
// chartValidator.js
export function validateChartConfig() { /* focused logic */ }

// dashboardValidator.js  
export function validateDashboardConfig() { /* focused logic */ }
```

### ❌ DON'T: Mix Validation with Business Logic
```javascript
// Bad - validation mixed with DB queries
export function validateAndSaveChart(config, db) {
  if (!config.name) throw new Error('Invalid');
  return db.query('INSERT ...'); // Don't mix!
}
```

### ✅ DO: Separate Concerns
```javascript
// Good - validation returns normalized data
const result = validateChartConfig(config);
if (!result.valid) return error;

// Then use normalized data for business logic
await saveChart(result.value, db);
```

---

## Conclusion

Keep validators **separate, focused, and modular**. Your current architecture for charts is excellent - replicate it for dashboards and other domains. This approach scales well and maintains consistency across the entire platform.

**Key Takeaway:** Consistency comes from following the same **pattern** and **naming conventions**, not from combining everything into one file.
