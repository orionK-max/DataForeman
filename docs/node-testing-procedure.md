# Node Testing Procedure

**Version:** 1.0  
**Last Updated:** December 14, 2025  
**Status:** Active Standard

This document defines the testing procedure for all Flow Studio nodes and node libraries.

---

## Overview

Every node must pass through multiple testing tiers before being considered production-ready. This ensures quality, consistency, and prevents regressions.

### Testing Philosophy

- **Fast feedback first** - Unit tests catch most bugs
- **Automate the repetitive** - Schema validation, property combinations
- **Manual for aesthetics** - Visual quality needs human judgment
- **Test what matters** - Focus on execute() logic and I/O configuration

---

## Testing Tiers

### Tier 1: Backend Unit Tests (Required)

**When:** During node development (TDD recommended)  
**Run time:** < 1 second per node  
**Coverage target:** 80% minimum

#### What to Test

1. **Execute Method Logic**
   - All operation values (if node has operations property)
   - Valid inputs produce correct outputs
   - Edge cases: null, undefined, NaN, empty strings
   - Error handling: invalid inputs, missing required fields
   - Quality codes: 0 (good), 1 (bad)

2. **Input Validation**
   - Required vs optional inputs
   - Type validation (number, string, boolean)
   - skipNodeOnNull behavior

3. **Property Handling**
   - Default values work correctly
   - All property options produce valid results
   - displayOptions logic (show/hide conditions)

4. **Output Structure**
   - Returns correct shape: `{ value, quality, timestamp }`
   - Handles multiple outputs (if applicable)
   - Error outputs include error field

#### Test File Structure

```
core/test/nodes/
  ├── logic/
  │   ├── BooleanLogicNode.test.js
  │   └── GateNode.test.js
  ├── math/
  │   └── MathNode.test.js
  └── [category]/
      └── [NodeName].test.js
```

#### Test Template

Each node test file should include:

- Describe block per operation (if applicable)
- Test valid inputs
- Test null/undefined inputs
- Test boundary values
- Test error conditions
- Test property combinations

---

### Tier 2: Schema Validation (Required)

**When:** After node implementation  
**Run time:** Instant  
**Automation:** High (can be automated)

#### What to Test

1. **Node Metadata Structure**
   - All required fields present (displayName, name, version, category, etc.)
   - Valid field types and formats
   - Icon and color defined
   - inputs and outputs arrays exist

2. **ioRules Configuration** (if applicable)
   - Rules are well-formed
   - when conditions reference valid properties
   - Input/output configs have valid min/max/default
   - At least one rule without when clause (fallback)

3. **Property Definitions**
   - All properties have name, displayName, type
   - Options array for options type
   - Valid displayOptions conditions
   - Default values match property type

4. **Visual Configuration**
   - Canvas configuration valid
   - Layout blocks well-formed
   - Handle positions valid
   - Status indicators configured

#### Snapshot Testing

Capture node description to detect unintended changes:

- Metadata snapshot
- Property schema snapshot
- Visual configuration snapshot

---

### Tier 3: ioRules Validation (Required for dynamic I/O nodes)

**When:** After implementing ioRules  
**Run time:** < 1 second  
**Automation:** High (can be automated)

#### What to Test

1. **Operation-Dependent I/O**
   - For each operation value, verify:
     - Correct input count (min, max, default)
     - Can add/remove inputs as specified
     - Correct input types

2. **Rule Matching**
   - when conditions work correctly
   - Fallback rule activates when no match
   - Multiple values in when clause work

3. **Dynamic I/O Generation**
   - Node initializes with default input count
   - Adding inputs works up to max
   - Removing inputs works down to min
   - Cannot exceed boundaries

#### Example Scenarios

For BooleanLogicNode:
- NOT operation → 1 input (fixed)
- AND operation → 2 inputs default, can add up to 10
- XOR operation → 2 inputs (fixed)

For SwitchNode:
- Outputs vary from 2 to 11
- Can add/remove outputs dynamically

---

### Tier 4: Integration Testing (Required for complex nodes)

**When:** Before merging to main  
**Run time:** 5-10 seconds  
**Automation:** High

#### What to Test

1. **Flow Execution**
   - Node executes in simple flow
   - Connections work (input from upstream, output to downstream)
   - Flow orchestration respects execution order

2. **API Endpoints**
   - Node appears in registry
   - Metadata endpoint returns correct schema
   - Node can be created via API

3. **Property Updates**
   - Changing operation updates I/O (if using ioRules)
   - Property validation works
   - displayOptions show/hide correctly

---

### Tier 5: UI Visual Testing (Required)

**When:** Before release  
**Run time:** 5-10 minutes  
**Automation:** Medium

#### Automated Layout Validation

Run programmatic checks:

1. **Handle Layout**
   - Handles don't overlap
   - Handles within node bounds
   - Even spacing when position: auto

2. **Node Dimensions**
   - Width >= minWidth
   - Height >= minHeight (if resizable)
   - Content fits within node

3. **Text Rendering**
   - No text overflow
   - All labels visible
   - Font sizes readable (>= 10px)

#### Manual Visual Review

Use Node Gallery (auto-generated page showing all nodes):

1. **I/O Variations**
   - View node with min inputs
   - View node with default inputs
   - View node with max inputs
   - Check handle spacing and alignment

2. **Property States**
   - Each operation value (if applicable)
   - Long vs short text values
   - Extreme values (very large numbers, long strings)

3. **Visual Polish**
   - Colors appropriate
   - Icons clear
   - Layout balanced
   - Consistent with other nodes

#### Acceptance Criteria

- Handles clearly visible and clickable
- No overlapping elements
- Text readable at all zoom levels (80%-150%)
- Looks good with min, default, and max I/O

---

## Testing Checklist for New Nodes

Use this checklist for each node before considering it complete:

### Backend
- [ ] Unit tests written (80%+ coverage)
- [ ] All operations tested (if applicable)
- [ ] Null/undefined handling tested
- [ ] Error cases tested
- [ ] Tests pass

### Schema
- [ ] All required metadata fields present
- [ ] ioRules defined (if dynamic I/O)
- [ ] Properties have valid types and defaults
- [ ] Visual configuration complete
- [ ] Snapshot tests added

### ioRules (if applicable)
- [ ] All operations have correct I/O config
- [ ] Rule matching logic tested
- [ ] Min/max boundaries enforced
- [ ] Fallback rule present

### Integration
- [ ] Node executes in simple flow
- [ ] Appears in node palette
- [ ] API endpoints work
- [ ] Property changes trigger I/O updates

### Visual
- [ ] Automated layout checks pass
- [ ] Reviewed in Node Gallery
- [ ] Tested with min/default/max inputs
- [ ] No visual issues at 80%, 100%, 150% zoom
- [ ] Handles properly spaced

---

## Testing Checklist for Node Libraries

When adding a library of multiple nodes:

### Pre-Development
- [ ] Library structure planned
- [ ] Common patterns identified
- [ ] Test templates prepared

### Development
- [ ] Each node follows testing procedure
- [ ] Shared utility functions tested
- [ ] Category-specific validators tested

### Library-Level Testing
- [ ] All nodes appear in correct category
- [ ] Icons consistent within library
- [ ] Color scheme consistent
- [ ] Similar nodes have similar I/O patterns

### Documentation
- [ ] Library README created
- [ ] Each node documented
- [ ] Example flows provided
- [ ] Test coverage report generated

### Release Readiness
- [ ] All individual node checklists complete
- [ ] Integration smoke test for library
- [ ] Visual gallery review
- [ ] Performance testing (if >20 nodes)

---

## Test Automation Tools

### Available Now

1. **Backend Unit Tests**
   - Framework: Jest or Vitest
   - Location: `core/test/nodes/`
   - Run: `npm test`

2. **Snapshot Testing**
   - Framework: Jest
   - Captures: node.description object
   - Updates: `npm test -- -u`

### To Be Built

1. **Schema Validator**
   - Validates node description against schema
   - Checks ioRules well-formedness
   - Reports missing required fields

2. **Test Generator**
   - Reads node description
   - Generates test skeleton
   - Creates property combination tests
   - Generates ioRules tests

3. **Node Gallery**
   - Interactive web page
   - Shows all nodes in all states
   - Filters by category
   - Exports screenshots

4. **Layout Validator**
   - Checks handle spacing
   - Validates node dimensions
   - Detects overlapping elements
   - Reports layout issues

---

## Test Data Guidelines

### Input Test Data

**Numbers:**
- Zero: 0
- Small: 1, 2, 3
- Large: 1000, 999999
- Negative: -1, -100
- Decimals: 0.5, 3.14159
- Edge: Infinity, -Infinity, NaN

**Strings:**
- Empty: ""
- Short: "a", "test"
- Long: 1000+ characters
- Special: "\n", "\t", Unicode
- Null-like: "null", "undefined"

**Booleans:**
- true, false
- Truthy/falsy: 0, 1, "", "false"

**Objects:**
- null
- undefined
- Empty: {}
- Valid structures
- Invalid structures

### Property Test Data

Test each property with:
- Default value
- Each option value (for options type)
- Boundary values (for number type)
- Invalid values (to test validation)

---

## Performance Testing

For libraries with >20 nodes or computationally intensive nodes:

### Execution Performance
- Measure execute() time
- Target: <10ms for simple nodes, <100ms for complex
- Test with realistic input sizes
- Profile slow operations

### Memory Usage
- Monitor memory during execution
- Check for memory leaks in long-running flows
- Test with large data sets

### UI Performance
- Node rendering time
- Canvas performance with 50+ nodes
- I/O updates (adding/removing inputs)

---

## Continuous Integration

### On Every Commit
- Backend unit tests
- Schema validation
- Snapshot comparison

### On Pull Request
- Integration tests
- ioRules validation
- Automated layout checks

### Before Release
- Full test suite
- Manual visual review
- Performance benchmarks
- Documentation review

---

## Test Maintenance

### When to Update Tests

- Node logic changes
- New operations added
- ioRules modified
- Properties added/removed
- Visual configuration changes

### Snapshot Updates

- Review changes carefully
- Update only if intentional
- Document reason in commit message

### Test Refactoring

- Extract common test utilities
- Share test data across similar nodes
- Remove redundant tests
- Keep tests fast and focused

---

## Quality Metrics

### Minimum Requirements

- **Backend coverage:** 80%
- **Schema validation:** 100% (automated)
- **ioRules testing:** 100% (if applicable)
- **Visual review:** Completed

### Stretch Goals

- **Backend coverage:** 90%+
- **Integration tests:** All critical paths
- **Visual regression:** Baseline captured
- **Performance:** All benchmarks met

---

## Examples

See reference implementations:
- `core/test/nodes/logic/BooleanLogicNode.test.js` - Heterogeneous ioRules
- `core/test/nodes/math/MathNode.test.js` - Homogeneous ioRules
- `core/test/nodes/comparison/ComparisonNode.test.js` - Fixed I/O

---

## Troubleshooting

### Tests are slow
- Mock expensive operations
- Use beforeAll for setup
- Parallelize test execution
- Focus on unit over integration

### Tests are brittle
- Avoid testing implementation details
- Test behavior, not structure
- Use semantic queries, not CSS selectors
- Keep assertions focused

### Visual tests fail often
- Increase tolerance threshold
- Test layout rules, not pixels
- Update baselines when intentional
- Use component-level snapshots

---

**END OF DOCUMENT**
