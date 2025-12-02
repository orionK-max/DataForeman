# Flow Node Schema Specification

**Version:** 1.0  
**Last Updated:** November 28, 2025  
**Status:** Active Standard

---

## Overview

This document defines the standard schema for Flow Studio nodes. All nodes must conform to this specification to ensure consistency, maintainability, and extensibility.

### Design Principles

1. **Single Source of Truth**: Node metadata lives in backend `description` object
2. **Declarative**: Configuration over implementation where possible
3. **Extensible**: Support new features without breaking existing nodes
4. **Versioned**: Clear upgrade path for schema changes
5. **Type Safe**: Well-defined types for all fields

---

## Schema Versions

### Version 1 (Current)
- Initial standardized schema
- Array-based inputs/outputs
- Extension mechanism for future features
- Backend-driven metadata

### Future Versions
- Version 2: TBD based on learnings
- Migration utilities will be provided for breaking changes

---

## Standard Schema Definition

### Complete Structure

```javascript
{
  // ============================================
  // METADATA (Required)
  // ============================================
  
  schemaVersion: 1,
  
  displayName: 'Node Display Name',
  name: 'node-type-identifier',
  version: 1,
  description: 'What this node does',
  category: 'TAG_OPERATIONS' | 'LOGIC_MATH' | 'COMMUNICATION' | 'CUSTOM',
  
  // Visual properties (used in UI)
  icon: '📊',  // Emoji or icon identifier
  color: '#2196F3',  // Hex color code
  
  // ============================================
  // INPUTS (Required, can be empty array)
  // ============================================
  
  inputs: [
    {
      type: 'main' | 'number' | 'string' | 'boolean' | 'trigger' | 'any',
      displayName: 'Input Label',
      required: true | false,
      description: 'What this input accepts'
    }
  ],
  
  // ============================================
  // INPUT CONFIGURATION (Optional)
  // For nodes with dynamic input count
  // ============================================
  
  inputConfiguration: {
    minInputs: 2,
    maxInputs: 10,
    defaultInputs: 2,
    canAddInputs: true,
    canRemoveInputs: true
  },
  
  // ============================================
  // OUTPUTS (Required, can be empty array)
  // ============================================
  
  outputs: [
    {
      type: 'main' | 'number' | 'string' | 'boolean' | 'trigger' | 'any',
      displayName: 'Output Label',
      description: 'What this output provides'
    }
  ],
  
  // ============================================
  // PROPERTIES (Required, can be empty array)
  // Configuration parameters for the node
  // ============================================
  
  properties: [
    {
      // Identification
      name: 'parameterName',
      displayName: 'Human Readable Name',
      
      // Type and behavior
      type: 'string' | 'number' | 'boolean' | 'options' | 'tag' | 'code' | 'collection',
      default: null,  // Default value
      required: false,
      description: 'Help text for users',
      placeholder: 'e.g., Enter value here',
      
      // Type-specific configuration
      // (see Property Types section below)
      
      // Conditional visibility
      displayOptions: {
        show: {
          operation: ['formula']  // Show when operation === 'formula'
        },
        hide: {
          operation: ['add', 'subtract']  // Hide when operation is add or subtract
        }
      }
    }
  ],
  
  // ============================================
  // EXTENSIONS (Optional)
  // For future features and non-breaking additions
  // ============================================
  
  extensions: {
    // Node behaviors
    behaviors: {
      streaming: false,
      stateful: false,
      sideEffects: true,
      experimental: false
    },
    
    // Custom metadata
    metadata: {
      // Node-specific data that doesn't fit standard schema
    },
    
    // Advanced configuration
    advanced: {
      // Future features go here
    }
  }
}
```

---

## Field Definitions

### Core Metadata

#### `schemaVersion` (number, required)
- **Purpose**: Indicates which schema version this node uses
- **Current**: `1`
- **Default**: If omitted, assumes version 1 for backward compatibility
- **Usage**: Allows parser to handle multiple schema versions

#### `displayName` (string, required)
- **Purpose**: Human-readable name shown in UI
- **Format**: Title Case
- **Example**: `"Tag Input"`, `"Math Operation"`

#### `name` (string, required)
- **Purpose**: Unique identifier for node type
- **Format**: kebab-case
- **Example**: `"tag-input"`, `"math"`, `"script-js"`
- **Rules**: 
  - Alphanumeric and hyphens only
  - Must be unique across all nodes
  - Should be descriptive and concise

#### `version` (number, required)
- **Purpose**: Node implementation version (separate from schema version)
- **Format**: Integer starting at 1
- **Usage**: Track node evolution over time
- **Example**: `1`, `2`, `3`

#### `description` (string, required)
- **Purpose**: Brief explanation of what the node does
- **Format**: Single sentence or short paragraph
- **Example**: `"Read value from a tag"`, `"Perform mathematical operations on multiple inputs"`

#### `category` (string, required)
- **Purpose**: Organize nodes in UI
- **Allowed Values**:
  - `"TAG_OPERATIONS"` - Reading/writing tags
  - `"LOGIC_MATH"` - Calculations, comparisons, logic
  - `"COMMUNICATION"` - External integrations
  - `"TRIGGERS"` - Flow initiation
  - `"CUSTOM"` - User-defined category
- **Example**: `"TAG_OPERATIONS"`

#### `icon` (string, required)
- **Purpose**: Visual identifier in UI
- **Format**: Emoji or icon name
- **Example**: `"📊"`, `"🔢"`, `"▶️"`

#### `color` (string, required)
- **Purpose**: Node color in flow editor
- **Format**: Hex color code
- **Example**: `"#2196F3"`, `"#4CAF50"`

---

### Inputs

Array of input definitions. Empty array `[]` for nodes with no inputs (e.g., triggers, data sources).

#### Input Object Schema

```javascript
{
  type: string,        // Data type (see Input/Output Types)
  displayName: string, // Label shown in UI
  required: boolean,   // Is this input mandatory?
  skipNodeOnNull: boolean, // Skip node execution if this input is null (default: true for required, false for optional)
  description: string  // Help text (optional)
}
```

#### Input/Output Types

- **`main`**: Generic data type (accepts any value)
- **`number`**: Numeric values
- **`string`**: Text values
- **`boolean`**: True/false values
- **`trigger`**: Trigger signal (boolean flag)
- **`any`**: Explicitly accepts any type (same as main but more explicit)

#### Example: Node with Two Inputs

```javascript
inputs: [
  {
    type: 'number',
    displayName: 'First Value',
    required: true,
    skipNodeOnNull: true,  // Don't execute if this input is null
    description: 'First operand for comparison'
  },
  {
    type: 'number',
    displayName: 'Second Value',
    required: true,
    skipNodeOnNull: true,  // Don't execute if this input is null
    description: 'Second operand for comparison'
  }
]
```

#### Example: Node with No Inputs

```javascript
inputs: []
```

---

### Input Configuration (Dynamic Inputs)

Optional configuration for nodes that allow adding/removing inputs at runtime.

```javascript
inputConfiguration: {
  minInputs: 2,          // Minimum number of inputs
  maxInputs: 10,         // Maximum number of inputs
  defaultInputs: 2,      // Initial number of inputs
  canAddInputs: true,    // Can user add more inputs?
  canRemoveInputs: true  // Can user remove inputs?
}
```

**When to use:**
- Math operations that accept variable number of operands
- Aggregation nodes
- Concatenation nodes

**Example: Math Node**
```javascript
inputs: [
  { type: 'number', displayName: 'Input 1', required: true },
  { type: 'number', displayName: 'Input 2', required: true }
],
inputConfiguration: {
  minInputs: 2,
  maxInputs: 10,
  defaultInputs: 2,
  canAddInputs: true,
  canRemoveInputs: true
}
```

---

### Outputs

Array of output definitions. Most nodes have at least one output.

#### Output Object Schema

```javascript
{
  type: string,        // Data type (see Input/Output Types)
  displayName: string, // Label shown in UI
  description: string  // Help text (optional)
}
```

#### Example: Single Output

```javascript
outputs: [
  {
    type: 'number',
    displayName: 'Result',
    description: 'Calculation result'
  }
]
```

#### Example: Multiple Outputs

```javascript
outputs: [
  {
    type: 'boolean',
    displayName: 'Result',
    description: 'Comparison result (true/false)'
  },
  {
    type: 'number',
    displayName: 'Quality',
    description: 'OPC UA quality code'
  }
]
```

---

### Properties

Array of configuration parameters for the node.

---

## Property Types

### 1. String

Basic text input.

```javascript
{
  name: 'tagName',
  displayName: 'Tag Name',
  type: 'string',
  default: '',
  required: false,
  description: 'Name for the tag',
  placeholder: 'e.g., Temperature_Sensor_1'
}
```

### 2. Number

Numeric input with optional constraints.

```javascript
{
  name: 'timeout',
  displayName: 'Timeout (ms)',
  type: 'number',
  default: 5000,
  required: false,
  description: 'Maximum execution time',
  min: 100,        // Optional minimum value
  max: 60000,      // Optional maximum value
  step: 100        // Optional step increment
}
```

### 3. Boolean

Checkbox or toggle.

```javascript
{
  name: 'enabled',
  displayName: 'Enable Feature',
  type: 'boolean',
  default: false,
  required: false,
  description: 'Enable this feature'
}
```

### 4. Options (Dropdown/Select)

Predefined list of choices.

```javascript
{
  name: 'operation',
  displayName: 'Operation',
  type: 'options',
  default: 'add',
  required: true,
  description: 'Mathematical operation to perform',
  options: [
    {
      name: 'Add',          // Display name
      value: 'add',         // Internal value
      description: 'Sum all inputs'  // Optional tooltip
    },
    {
      name: 'Subtract',
      value: 'subtract',
      description: 'Subtract all subsequent inputs from first'
    }
  ]
}
```

### 5. Tag Selector

Select a tag from the system.

```javascript
{
  name: 'tagId',
  displayName: 'Tag',
  type: 'tag',
  default: null,
  required: true,
  description: 'Select the tag to read from',
  filter: {
    driverType: ['EIP', 'OPCUA'],  // Optional: filter by driver
    dataType: ['REAL', 'INT']       // Optional: filter by data type
  }
}
```

### 6. Code Editor

Code input with syntax highlighting.

```javascript
{
  name: 'code',
  displayName: 'JavaScript Code',
  type: 'code',
  default: '// Write your code here\nreturn $input;',
  required: true,
  description: 'JavaScript code to execute',
  language: 'javascript',  // Syntax highlighting language
  minLines: 5,             // Optional: minimum editor height
  maxLines: 50             // Optional: maximum editor height
}
```

### 7. Collection (Nested Properties)

Group of related properties.

```javascript
{
  name: 'options',
  displayName: 'Options',
  type: 'collection',
  default: {},
  description: 'Advanced options',
  options: [
    {
      name: 'decimalPlaces',
      displayName: 'Decimal Places',
      type: 'number',
      default: -1,
      description: 'Number of decimal places (-1 = no rounding)'
    },
    {
      name: 'skipInvalid',
      displayName: 'Skip Invalid Inputs',
      type: 'boolean',
      default: false,
      description: 'Continue on invalid input instead of error'
    }
  ]
}
```

---

## Conditional Property Visibility

Use `displayOptions` to show/hide properties based on other property values.

### Show When Condition Met

```javascript
{
  name: 'formula',
  displayName: 'Formula',
  type: 'string',
  default: 'input0 + input1',
  description: 'Custom mathematical formula',
  displayOptions: {
    show: {
      operation: ['formula']  // Show only when operation is 'formula'
    }
  }
}
```

### Hide When Condition Met

```javascript
{
  name: 'simpleMode',
  displayName: 'Simple Mode',
  type: 'boolean',
  default: true,
  displayOptions: {
    hide: {
      advancedMode: [true]  // Hide when advancedMode is true
    }
  }
}
```

### Multiple Conditions (AND logic)

```javascript
{
  name: 'tolerance',
  displayName: 'Tolerance',
  type: 'number',
  default: 0.001,
  displayOptions: {
    show: {
      operation: ['eq', 'neq'],  // Show for equal/not-equal
      dataType: ['number']        // AND data type is number
    }
  }
}
```

---

## Extensions Object

The `extensions` object provides a flexible mechanism for adding features without breaking the schema.

### Structure

```javascript
extensions: {
  // Node behaviors (boolean flags)
  behaviors: {
    streaming: false,      // Processes continuous data streams
    stateful: false,       // Maintains state between executions
    sideEffects: true,     // Has external side effects (DB writes, API calls)
    experimental: false,   // Experimental/beta feature
    retryable: false       // Supports automatic retry on failure
  },
  
  // Custom metadata (any valid JSON)
  metadata: {
    author: 'DataForeman Team',
    documentation: 'https://docs.example.com/nodes/my-node',
    tags: ['math', 'calculation'],
    customField: 'custom value'
  },
  
  // Advanced configuration
  advanced: {
    caching: {
      enabled: false,
      ttl: 60000  // Cache TTL in milliseconds
    },
    retries: {
      attempts: 3,
      backoff: 'exponential'
    }
  }
}
```

### When to Use Extensions

**Use extensions for:**
- ✅ Experimental features being tested
- ✅ Node-specific metadata
- ✅ Features that may become standard later
- ✅ Optional advanced configuration
- ✅ Custom behaviors not in core schema

**Don't use extensions for:**
- ❌ Core functionality (use standard fields)
- ❌ Required properties (add to `properties` array)
- ❌ Data that UI must parse (add to standard schema)

### Example: Experimental Streaming Node

```javascript
description: {
  displayName: 'Stream Processor',
  name: 'stream-processor',
  // ... standard fields ...
  
  extensions: {
    behaviors: {
      streaming: true,
      experimental: true
    },
    advanced: {
      streaming: {
        bufferSize: 1000,
        flushInterval: 100,
        backpressure: 'drop'
      }
    }
  }
}
```

---

## Complete Examples

### Example 1: Simple Input Node (No Inputs)

```javascript
description: {
  schemaVersion: 1,
  displayName: 'Tag Input',
  name: 'tag-input',
  version: 1,
  description: 'Read value from a tag',
  category: 'TAG_OPERATIONS',
  icon: '📥',
  color: '#2196F3',
  
  inputs: [],
  
  outputs: [
    {
      type: 'main',
      displayName: 'Output',
      description: 'Tag value with quality'
    }
  ],
  
  properties: [
    {
      name: 'tagId',
      displayName: 'Tag',
      type: 'tag',
      required: true,
      description: 'Select the tag to read from'
    },
    {
      name: 'maxDataAge',
      displayName: 'Maximum Data Age (seconds)',
      type: 'number',
      default: -1,
      description: '-1 = any age, 0 = live (1s), >0 = custom max age',
      placeholder: 'e.g., 5 for 5 seconds'
    }
  ]
}
```

### Example 2: Processing Node (Inputs + Outputs)

```javascript
description: {
  schemaVersion: 1,
  displayName: 'Math',
  name: 'math',
  version: 1,
  description: 'Perform mathematical operations on multiple inputs',
  category: 'LOGIC_MATH',
  icon: '🔢',
  color: '#9C27B0',
  
  inputs: [
    {
      type: 'number',
      displayName: 'Input 1',
      required: true
    },
    {
      type: 'number',
      displayName: 'Input 2',
      required: true
    }
  ],
  
  inputConfiguration: {
    minInputs: 2,
    maxInputs: 10,
    defaultInputs: 2,
    canAddInputs: true,
    canRemoveInputs: true
  },
  
  outputs: [
    {
      type: 'number',
      displayName: 'Result',
      description: 'Calculation result'
    }
  ],
  
  properties: [
    {
      name: 'operation',
      displayName: 'Operation',
      type: 'options',
      default: 'add',
      required: true,
      options: [
        { name: 'Add', value: 'add' },
        { name: 'Subtract', value: 'subtract' },
        { name: 'Multiply', value: 'multiply' },
        { name: 'Divide', value: 'divide' },
        { name: 'Custom Formula', value: 'formula' }
      ]
    },
    {
      name: 'formula',
      displayName: 'Formula',
      type: 'string',
      default: 'input0 + input1',
      placeholder: 'input0 + input1 * input2',
      description: 'Use input0, input1, input2, etc.',
      displayOptions: {
        show: {
          operation: ['formula']
        }
      }
    }
  ]
}
```

### Example 3: Trigger Node (No Inputs, Trigger Output)

```javascript
description: {
  schemaVersion: 1,
  displayName: 'Manual Trigger',
  name: 'trigger-manual',
  version: 1,
  description: 'Start the flow manually from UI',
  category: 'TRIGGERS',
  icon: '▶️',
  color: '#4CAF50',
  
  inputs: [],
  
  outputs: [
    {
      type: 'trigger',
      displayName: 'Trigger',
      description: 'Trigger signal when button pressed'
    }
  ],
  
  properties: []
}
```

### Example 4: Gate Node (Conditional Control Flow)

```javascript
description: {
  schemaVersion: 1,
  displayName: 'Gate',
  name: 'gate',
  version: 1,
  description: 'Control data flow based on condition',
  category: 'LOGIC_MATH',
  icon: '🚪',
  color: '#00BCD4',
  
  inputs: [
    {
      type: 'boolean',
      displayName: 'Condition',
      required: true,
      skipNodeOnNull: false,  // Execute even if condition is null (treat as false)
      description: 'When true, input passes through'
    },
    {
      type: 'main',
      displayName: 'Input',
      required: true,
      skipNodeOnNull: false,  // Execute even if input is null (to control output)
      description: 'Data to control'
    }
  ],
  
  outputs: [
    {
      type: 'main',
      displayName: 'Output',
      description: 'Controlled output based on condition'
    }
  ],
  
  properties: [
    {
      name: 'falseOutputMode',
      displayName: 'Output When False',
      type: 'options',
      default: 'null',
      required: true,
      options: [
        {
          name: 'Output Null',
          value: 'null',
          description: 'Output null (downstream nodes skip if configured)'
        },
        {
          name: 'Output Previous Value',
          value: 'previous',
          description: 'Hold last valid value'
        }
      ],
      description: 'What to output when condition is false'
    }
  ]
}
```

---

## Validation Rules

### Required Fields

All nodes MUST have:
- `displayName`
- `name`
- `version`
- `description`
- `category`
- `icon`
- `color`
- `inputs` (array, can be empty)
- `outputs` (array, can be empty)
- `properties` (array, can be empty)

### Field Constraints

- `name`: Must match `/^[a-z0-9-]+$/` (lowercase, alphanumeric, hyphens)
- `version`: Must be positive integer
- `schemaVersion`: Must be 1 (current version)
- `inputs`: Each input must have `type` and `displayName`
- `inputs.skipNodeOnNull`: Defaults to `true` for required inputs, `false` for optional
- `outputs`: Each output must have `type` and `displayName`
- `properties`: Each property must have `name`, `displayName`, and `type`
- `color`: Must be valid hex color (e.g., `#RRGGBB`)

### Property Validation

Each property type has specific validation:
- `number`: If `min`/`max` specified, default must be within range
- `options`: Must have at least one option, default must be valid option value
- `tag`: Default should be null or valid tag ID
- `boolean`: Default must be true/false

---

## Migration Guide

### Adding New Features (Non-Breaking)

Use the `extensions` object:

```javascript
// Before
description: {
  displayName: 'My Node',
  // ... standard fields ...
}

// After (non-breaking addition)
description: {
  displayName: 'My Node',
  // ... standard fields ...
  extensions: {
    behaviors: {
      newFeature: true
    }
  }
}
```

### Breaking Changes (Schema Version Bump)

When making breaking changes:

1. Increment `schemaVersion`
2. Provide migration function
3. Update parser to handle both versions

```javascript
// Old node (schema v1)
description: {
  schemaVersion: 1,
  inputs: [{ type: 'number', displayName: 'Input' }]
}

// New node (schema v2) - breaking change
description: {
  schemaVersion: 2,
  inputs: [{ 
    type: 'number', 
    displayName: 'Input',
    newRequiredField: 'value'  // Breaking change
  }]
}

// Migration function
function migrateV1ToV2(description) {
  return {
    ...description,
    schemaVersion: 2,
    inputs: description.inputs.map(input => ({
      ...input,
      newRequiredField: 'default-value'
    }))
  };
}
```

---

## Execution Skipping Logic

### How skipNodeOnNull Works

**Before executing any node, the execution engine checks:**

1. Get all input values for the node
2. For each input with `skipNodeOnNull: true`:
   - If input value is `null` OR quality is `0` (bad)
   - Skip node execution entirely
   - Don't call `execute()` method
   - Don't write any outputs
   - Don't generate logs
3. If all required inputs are valid, execute normally

**Default Behavior:**
- Required inputs: `skipNodeOnNull: true` (can't execute without data)
- Optional inputs: `skipNodeOnNull: false` (can execute, just ignore missing input)

**Use Cases:**

**Conditional Processing:**
```
Tag A ─┐
       ├─> Comparison ──> Gate ──> Math ──> Tag Output
Tag B ─┘                      ▲
                              │
                         Tag A, Tag B
```
- When condition false: Gate outputs null
- Math has `skipNodeOnNull: true` on inputs → skips execution
- Tag Output has `skipNodeOnNull: true` → skips write
- Result: No useless data written to database

**Error Handling:**
```
Tag Input ──> Math ──> Tag Output
```
- Tag Input fails (returns null with quality=0)
- Math skips (can't calculate with null)
- Tag Output skips (no data to write)
- Result: Error propagates gracefully without writing bad data

**State Holding (Gate with "previous value" mode):**
```
Condition ──> Gate (mode: previous) ──> Tag Output
              ▲
              │
           Tag Input
```
- When condition true: Gate passes fresh value, Tag Output writes
- When condition false: Gate outputs previous value, Tag Output writes same value again
- Result: Tag maintains last known good value during condition failures

## Best Practices

### Naming Conventions

- **Node names**: Use kebab-case (`tag-input`, `script-js`)
- **Property names**: Use camelCase (`maxDataAge`, `operation`)
- **Display names**: Use Title Case (`Tag Input`, `Maximum Data Age`)

### Descriptions

- Keep concise (one sentence preferred)
- Explain what the field does, not how to use it
- Use examples when helpful

### Defaults

- Provide sensible defaults for optional properties
- Use `null` for required properties that must be configured
- Document what default values mean

### Icons

- Use relevant emojis that clearly represent the function
- Common patterns:
  - Data: 📊 📈 📉
  - Input/Output: 📥 📤
  - Math: 🔢 ➕ ➖ ✖️ ➗
  - Logic: ⚖️ 🔀 🔁
  - Code: 📜 💻
  - Triggers: ▶️ 🔘

### Colors

- Use distinct colors for different categories
- Maintain consistency within category
- Ensure good contrast with white/dark backgrounds

### Property Organization

- Order properties logically
- Group related properties
- Put most important properties first
- Use `displayOptions` to reduce clutter

---

## FAQ

### Q: When should I bump schema version?

**A:** Only for breaking changes that old parsers cannot handle. Examples:
- Changing required field structure
- Removing required fields
- Changing field types
- Changing validation rules that reject old nodes

Non-breaking additions use `extensions` instead.

### Q: Can I add custom property types?

**A:** Not in schema v1. Use existing types or wait for schema v2. For now, use:
- `string` with validation in execute()
- `options` for predefined choices
- `code` for complex input
- Extensions for metadata

### Q: How do I handle node-specific UI?

**A:** Use `extensions`:
```javascript
extensions: {
  metadata: {
    customUI: 'MyNodeConfigPanel'
  }
}
```

Frontend can check this and load custom component.

### Q: What if my node needs 20+ properties?

**A:** Consider:
1. Use `collection` type to group related properties
2. Use `displayOptions` to show/hide conditionally
3. Split into multiple simpler nodes
4. Consider if configuration should be in flow settings instead

---

## Reference Implementation

See `core/src/nodes/base/NodeTemplate.js` for a complete, documented example node following this specification.

---

**END OF SPECIFICATION**
