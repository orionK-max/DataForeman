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
  category: 'TAG_OPERATIONS' | 'LOGIC_MATH' | 'COMMUNICATION' | 'ROBOTICS' | ...,
  section: 'BASIC' | 'ADVANCED' | 'CUSTOM_SECTION' | ...,
  
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

  // ============================================
  // VISUAL DEFINITION (Optional)
  // Defines how node appears on canvas
  // ============================================
  
  visual: {
    // Canvas appearance
    canvas: {
      minWidth: 160,           // Minimum node width in pixels
      shape: 'rounded-rect',   // Node shape: 'rounded-rect', 'rectangle', 'circle'
      borderRadius: 8,         // Corner radius (if rounded)
      resizable: false,        // Can user resize? (e.g., Comment node)
      minHeight: 80,           // Minimum height (for resizable nodes)
      aspectRatio: null        // Lock aspect ratio (for circle nodes, set 1:1)
    },
    
    // Layout blocks (rendered top to bottom)
    layout: [
      {
        type: 'header',           // Block type (see Visual Block Types section)
        icon: '{{icon}}',         // Template or literal
        title: '{{displayName}}', // Template or literal
        color: '{{color}}',       // Template or literal
        badges: ['executionOrder'] // System badges: 'executionOrder', 'executionStatus', 'pinnedData'
      },
      {
        type: 'subtitle',
        text: '{{tagName}}',      // Template: {{field}} replaced with data[field]
        color: '#666666',         // Hex color or template
        visible: '{{tagName}}'    // Conditional: only show if tagName exists
      },
      {
        type: 'text',
        content: 'Processing...',
        fontSize: 12,
        color: '#999999',
        align: 'center',          // 'left', 'center', 'right'
        visible: '{{status}} === "processing"'
      },
      {
        type: 'values',
        items: [
          {
            label: 'Operation',
            value: '{{operation}}',
            color: null             // null = default text color
          }
        ]
      },
      {
        type: 'badges',
        items: [
          {
            text: '{{quality}}',
            color: '#ff9800',       // Orange
            visible: '{{quality}} < 192'
          }
        ],
        position: 'inline'          // 'inline' or 'stacked'
      },
      {
        type: 'divider',
        color: '#e0e0e0',
        margin: 8                   // Vertical margin in pixels
      },
      {
        type: 'code',
        language: 'javascript',
        content: '{{code}}',
        maxLines: 3,                // Show max 3 lines, rest scrollable
        showLineNumbers: false
      },
      {
        type: 'progress',
        value: '{{runtime.progress}}',    // Template accessing nested data
        max: '{{runtime.total}}',
        label: '{{runtime.progressText}}',
        color: '#2196F3',
        visible: '{{runtime.enabled}}'
      },
      {
        type: 'status-text',
        text: '{{runtime.statusMessage}}',
        color: '{{runtime.statusColor}}',
        icon: '{{runtime.statusIcon}}',
        visible: '{{runtime.enabled}}'
      }
    ],
    
    // Handle configuration
    handles: {
      inputs: [
        {
          index: 0,                // Input index from inputs array
          position: 'auto',        // 'auto' (evenly distributed) or percentage (e.g., '50%', '33.33%')
          color: 'auto',           // 'auto' (from input.type) or hex color
          label: null,             // Override displayName (null = use input.displayName)
          visible: true            // Show this handle?
        }
      ],
      outputs: [
        {
          index: 0,
          position: 'auto',
          color: 'auto',
          label: null,
          visible: true
        }
      ],
      // Handle sizing
      size: 12,                    // Handle diameter in pixels
      borderWidth: 2,              // Border width in pixels
      borderColor: '#ffffff'       // Border color
    },
    
    // Status indicators
    status: {
      execution: {
        enabled: true,             // Show execution status badge?
        position: 'top-left',      // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
        offset: { x: -10, y: -10 } // Offset from corner in pixels
      },
      pinned: {
        enabled: true,
        position: 'top-right',
        offset: { x: -8, y: -8 }
      },
      executionOrder: {
        enabled: true,
        position: 'header'         // 'header' (in title bar) or coordinates
      }
    },
    
    // Runtime data configuration (for async nodes)
    runtime: {
      enabled: false,              // Poll for runtime data?
      updateInterval: 1000,        // Poll interval in milliseconds
      endpoint: '/api/flows/nodes/{{nodeId}}/runtime', // API endpoint ({{nodeId}} replaced)
      fields: [                    // Fields to poll
        'progress',
        'total',
        'progressText',
        'statusMessage',
        'statusColor',
        'statusIcon'
      ]
    }
  }
}
```

---

## Visual Block Types

The `visual.layout` array defines the node's visual appearance using composable blocks. Each block is rendered in order from top to bottom.

### 1. Header Block

Displays the node's main identifier with icon and title.

**Schema:**
```javascript
{
  type: 'header',
  icon: '{{icon}}',              // Template or literal emoji/icon
  title: '{{displayName}}',      // Template or literal text
  color: '{{color}}',            // Hex color template or literal
  badges: ['executionOrder'],    // System badges to show in header
  fontSize: 14,                  // Optional: title font size (default: 14)
  iconSize: 16                   // Optional: icon size (default: 16)
}
```

**System Badges:**
- `'executionOrder'`: Blue numbered circle showing execution sequence
- Custom badges can be added via properties

**Example:**
```javascript
{
  type: 'header',
  icon: '📥',
  title: 'Tag Input',
  color: '#2196F3',
  badges: ['executionOrder']
}
```

**Rendered as:**
- Flex row with icon in colored box + title + badges
- Icon box: 28×28px with node color background
- Title: Body2 weight 600
- Badges: 24×24px circles on the right

---

### 2. Subtitle Block

Secondary text below header (operation name, tag name, etc.)

**Schema:**
```javascript
{
  type: 'subtitle',
  text: '{{tagName}}',         // Template or literal
  color: '#666666',            // Optional: text color (default: #666666 light, #999999 dark)
  fontSize: 12,                // Optional: font size (default: 12)
  fontWeight: 400,             // Optional: font weight (default: 400)
  visible: '{{tagName}}'       // Optional: conditional visibility
}
```

**Template Syntax:**
- `{{field}}`: Replaced with `data.field`
- If field is undefined/null/empty string, subtitle hidden

**Example:**
```javascript
// Math node showing operation
{
  type: 'subtitle',
  text: '{{operation}}',
  color: '#666666'
}

// Renders: "add", "subtract", "formula", etc.
```

---

### 3. Text Block

General-purpose text display

**Schema:**
```javascript
{
  type: 'text',
  content: 'Processing file...',  // Template or literal
  fontSize: 12,                    // Optional: font size (default: 12)
  fontWeight: 400,                 // Optional: font weight (default: 400)
  color: '#999999',                // Optional: text color (default: theme text)
  align: 'center',                 // Optional: 'left', 'center', 'right' (default: 'left')
  padding: 4,                      // Optional: vertical padding (default: 4)
  visible: '{{status}} === "processing"' // Optional: conditional visibility
}
```

**Use Cases:**
- Status messages
- Help text
- Static labels
- Conditional messages

**Example:**
```javascript
{
  type: 'text',
  content: 'Waiting for input...',
  color: '#999999',
  align: 'center',
  visible: '{{hasInput}} === false'
}
```

---

### 4. Values Block

Key-value pairs display

**Schema:**
```javascript
{
  type: 'values',
  items: [
    {
      label: 'Operation',         // Label text
      value: '{{operation}}',     // Template or literal
      color: null,                // Optional: value color (null = default)
      visible: '{{operation}}'    // Optional: conditional visibility
    }
  ],
  layout: 'horizontal',           // Optional: 'horizontal' or 'vertical' (default: 'horizontal')
  spacing: 8,                     // Optional: spacing between items (default: 8)
  labelWidth: 80                  // Optional: fixed label width (default: auto)
}
```

**Example:**
```javascript
{
  type: 'values',
  items: [
    {
      label: 'Type',
      value: '{{valueType}}',
      color: '#2196F3'
    },
    {
      label: 'Value',
      value: '{{currentValue}}',
      color: '#4CAF50'
    }
  ]
}
```

**Rendered as:**
- Horizontal: `Label: Value  Label: Value`
- Vertical: 
  ```
  Label: Value
  Label: Value
  ```

---

### 5. Badges Block

Small colored pills/chips for status indicators

**Schema:**
```javascript
{
  type: 'badges',
  items: [
    {
      text: '{{quality}}',               // Template or literal
      color: '#ff9800',                  // Badge background color
      textColor: '#ffffff',              // Optional: text color (default: white)
      icon: 'warning',                   // Optional: icon name or emoji
      visible: '{{quality}} < 192',      // Optional: conditional visibility
      tooltip: 'Quality code: {{quality}}' // Optional: hover tooltip
    }
  ],
  position: 'inline',                    // 'inline' (horizontal) or 'stacked' (vertical)
  spacing: 4,                            // Optional: spacing between badges (default: 4)
  align: 'left'                          // Optional: 'left', 'center', 'right' (default: 'left')
}
```

**Example:**
```javascript
{
  type: 'badges',
  items: [
    {
      text: 'Low Quality',
      color: '#ff9800',
      visible: '{{quality}} < 192'
    },
    {
      text: 'Cached',
      color: '#9E9E9E',
      visible: '{{cached}} === true'
    }
  ],
  position: 'inline'
}
```

**Rendered as:**
- Inline: [Badge1] [Badge2] [Badge3]
- Stacked:
  ```
  [Badge1]
  [Badge2]
  [Badge3]
  ```

---

### 6. Divider Block

Visual separator between sections

**Schema:**
```javascript
{
  type: 'divider',
  color: '#e0e0e0',              // Optional: line color (default: theme divider)
  thickness: 1,                  // Optional: line thickness (default: 1)
  margin: 8,                     // Optional: vertical margin (default: 8)
  style: 'solid',                // Optional: 'solid', 'dashed', 'dotted' (default: 'solid')
  visible: true                  // Optional: conditional visibility (default: true)
}
```

**Example:**
```javascript
{
  type: 'divider',
  color: '#e0e0e0',
  margin: 8
}
```

**Rendered as:**
- Horizontal line spanning node width
- Margin above and below

---

### 7. Code Block

Display code snippet with syntax highlighting

**Schema:**
```javascript
{
  type: 'code',
  language: 'javascript',         // Syntax highlighting language
  content: '{{code}}',            // Template or literal code
  maxLines: 3,                    // Optional: max visible lines (default: null = no limit)
  showLineNumbers: false,         // Optional: show line numbers (default: false)
  fontSize: 11,                   // Optional: font size (default: 11)
  fontFamily: 'monospace',        // Optional: font family (default: 'Fira Code, monospace')
  wrap: false,                    // Optional: word wrap (default: false)
  visible: '{{code}}'             // Optional: conditional visibility
}
```

**Supported Languages:**
- `javascript`
- `python`
- `sql`
- `json`
- `text`

**Example:**
```javascript
{
  type: 'code',
  language: 'javascript',
  content: '{{code}}',
  maxLines: 3,
  showLineNumbers: false
}
```

**Rendered as:**
- Monaco-style code display with syntax highlighting
- Scrollable if content exceeds maxLines
- Dark/light theme aware

---

### 8. Progress Block

Progress bar for async operations (file processing, downloads, etc.)

**Schema:**
```javascript
{
  type: 'progress',
  value: '{{runtime.progress}}',        // Template: current value
  max: '{{runtime.total}}',             // Template: maximum value
  label: '{{runtime.progressText}}',    // Optional: label text template
  color: '#2196F3',                     // Optional: progress bar color (default: #2196F3)
  backgroundColor: '#e0e0e0',           // Optional: track color (default: #e0e0e0)
  height: 4,                            // Optional: bar height in pixels (default: 4)
  showPercentage: true,                 // Optional: show percentage text (default: true)
  visible: '{{runtime.enabled}}'        // Optional: conditional visibility
}
```

**Use Cases:**
- File processing progress
- Download/upload progress
- Long-running calculations
- Multi-step operations

**Example:**
```javascript
{
  type: 'progress',
  value: '{{runtime.progress}}',
  max: '{{runtime.total}}',
  label: 'Processing: {{runtime.progressText}}',
  color: '#4CAF50',
  visible: '{{runtime.enabled}}'
}
```

**Rendered as:**
```
Processing: file.csv (50%)
[████████░░░░░░░░] 50%
```

---

### 9. Status Text Block

Dynamic status message with icon (for async nodes)

**Schema:**
```javascript
{
  type: 'status-text',
  text: '{{runtime.statusMessage}}',    // Template: status message
  color: '{{runtime.statusColor}}',     // Template or literal: text color
  icon: '{{runtime.statusIcon}}',       // Optional: icon name or emoji
  fontSize: 12,                         // Optional: font size (default: 12)
  fontWeight: 500,                      // Optional: font weight (default: 500)
  align: 'left',                        // Optional: 'left', 'center', 'right' (default: 'left')
  visible: '{{runtime.enabled}}'        // Optional: conditional visibility
}
```

**Use Cases:**
- "Processing file..."
- "Waiting for connection..."
- "Complete: 1000 records"
- "Error: Timeout"

**Example:**
```javascript
{
  type: 'status-text',
  text: '{{runtime.statusMessage}}',
  color: '{{runtime.statusColor}}',
  icon: '{{runtime.statusIcon}}',
  visible: '{{runtime.enabled}}'
}
```

**Rendered as:**
```
⏳ Processing file... (blue text)
✓ Complete (green text)
✗ Error: Timeout (red text)
```

---

## Template System

### Basic Syntax

Templates use `{{field}}` syntax to inject dynamic data:

```javascript
// In visual definition:
text: '{{tagName}}'

// With node data:
data = { tagName: 'Temperature_01' }

// Renders as:
"Temperature_01"
```

### Nested Paths

Access nested object properties with dot notation:

```javascript
// In visual definition:
value: '{{runtime.progress}}'

// With node data:
data = {
  runtime: {
    progress: 75,
    total: 100
  }
}

// Renders as:
75
```

### Conditional Visibility

Use JavaScript expressions for conditional rendering:

```javascript
// Show only when condition is true:
visible: '{{status}} === "processing"'

// Show when value exists:
visible: '{{tagName}}'

// Show when number is below threshold:
visible: '{{quality}} < 192'

// Complex conditions:
visible: '{{operation}} === "formula" && {{code}}'
```

**Supported Operators:**
- Equality: `===`, `!==`, `==`, `!=`
- Comparison: `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`
- Existence: Just `{{field}}` (truthy check)

### Fallback Values

If template field is undefined/null/empty:
- Text blocks: Hidden (not rendered)
- Subtitle: Hidden
- Values: Item hidden
- Badges: Item hidden
- Progress: Shows 0 value
- Code: Shows empty code block

**Best Practice:** Always use `visible` condition when field might be missing:

```javascript
// Good:
{
  type: 'subtitle',
  text: '{{tagName}}',
  visible: '{{tagName}}'  // Only show if tagName exists
}

// Bad (shows empty subtitle):
{
  type: 'subtitle',
  text: '{{tagName}}'
}
```

---

## Handle Configuration

### Auto-Positioning

Most nodes use automatic handle distribution:

```javascript
handles: {
  inputs: [
    { index: 0, position: 'auto', color: 'auto' },
    { index: 1, position: 'auto', color: 'auto' }
  ],
  outputs: [
    { index: 0, position: 'auto', color: 'auto' }
  ]
}
```

**Algorithm:**
- Inputs distributed evenly on left side
- Outputs distributed evenly on right side
- Position = `(100 / (count + 1)) * (index + 1)`%

**Examples:**
- 1 handle: 50%
- 2 handles: 33.33%, 66.67%
- 3 handles: 25%, 50%, 75%
- 4 handles: 20%, 40%, 60%, 80%

### Manual Positioning

Override with specific percentages:

```javascript
handles: {
  inputs: [
    { index: 0, position: '25%', color: 'auto' },
    { index: 1, position: '75%', color: 'auto' }
  ]
}
```

### Color Mapping

Auto colors based on input/output type:

| Type | Color | Hex |
|------|-------|-----|
| main | Gray | #757575 |
| number | Green | #4CAF50 |
| string | Orange | #FF9800 |
| boolean | Blue | #2196F3 |
| json | Purple | #9C27B0 |
| trigger | Red | #F44336 |
| any | Gray | #757575 |

**Override with explicit color:**

```javascript
handles: {
  inputs: [
    { index: 0, position: 'auto', color: '#FF5722' }  // Custom red-orange
  ]
}
```

### Dynamic Handle Count

For nodes with variable inputs (Math node):

```javascript
// Backend generates handles based on data.inputCount
handles: {
  inputs: Array.from({ length: data.inputCount || 2 }, (_, i) => ({
    index: i,
    position: 'auto',
    color: 'auto'
  })),
  outputs: [
    { index: 0, position: 'auto', color: 'auto' }
  ]
}
```

Frontend receives pre-calculated handle array from backend.

---

## Status Indicators

### Execution Status Badge

Shows current execution state:

```javascript
status: {
  execution: {
    enabled: true,
    position: 'top-left',
    offset: { x: -10, y: -10 }
  }
}
```

**States:**
- ✓ Success: Green (#4CAF50) checkmark
- ✗ Error: Red (#F44336) error icon
- ⏳ Running: Blue (#2196F3) hourglass with pulse animation

**Rendered as:**
- 24×24px circle at specified position
- Absolute positioning with offset from node corner

### Pinned Data Indicator

Shows when node has pinned test data:

```javascript
status: {
  pinned: {
    enabled: true,
    position: 'top-right',
    offset: { x: -8, y: -8 }
  }
}
```

**Rendered as:**
- 20×20px orange (#FF9800) circle
- Pin icon (📌)
- Top-right corner by default

### Execution Order Badge

Shows sequence number in flow execution:

```javascript
status: {
  executionOrder: {
    enabled: true,
    position: 'header'  // Shows in header next to icon
  }
}
```

**Rendered as:**
- 24×24px blue (#1976D2) circle
- White number (1, 2, 3, ...)
- Positioned in header before icon

---

## Runtime Data (Async Nodes)

For nodes that perform long-running operations, enable runtime data polling:

```javascript
visual: {
  runtime: {
    enabled: true,
    updateInterval: 1000,  // Poll every 1 second
    endpoint: '/api/flows/nodes/{{nodeId}}/runtime',
    fields: [
      'progress',
      'total',
      'progressText',
      'statusMessage',
      'statusColor',
      'statusIcon'
    ]
  },
  layout: [
    {
      type: 'progress',
      value: '{{runtime.progress}}',
      max: '{{runtime.total}}',
      label: '{{runtime.progressText}}',
      visible: '{{runtime.enabled}}'
    },
    {
      type: 'status-text',
      text: '{{runtime.statusMessage}}',
      color: '{{runtime.statusColor}}',
      icon: '{{runtime.statusIcon}}',
      visible: '{{runtime.enabled}}'
    }
  ]
}
```

### Backend Implementation

Node's `execute()` method updates runtime data:

```javascript
async execute(data, inputs, context) {
  // Update runtime data (persisted for polling)
  await context.updateRuntimeData({
    enabled: true,
    progress: 0,
    total: 100,
    progressText: 'Starting...',
    statusMessage: 'Initializing',
    statusColor: '#2196F3',
    statusIcon: '⏳'
  });
  
  // Long-running operation
  for (let i = 0; i < 100; i++) {
    // Do work...
    
    // Update progress
    await context.updateRuntimeData({
      progress: i + 1,
      progressText: `Processing item ${i + 1}/100`,
      statusMessage: `Processing...`
    });
  }
  
  // Complete
  await context.updateRuntimeData({
    progress: 100,
    progressText: 'Complete',
    statusMessage: 'Finished processing 100 items',
    statusColor: '#4CAF50',
    statusIcon: '✓'
  });
  
  return { outputs: [result] };
}
```

### Frontend Polling

When `runtime.enabled` is true:
1. Frontend starts polling at specified interval
2. GET `runtime.endpoint` (e.g., `/api/flows/nodes/12345/runtime`)
3. Response merged into `data.runtime` object
4. Blocks re-render with updated values
5. Polling stops when execution completes or node unmounts

---

## Canvas Configuration

### Basic Shape

Most nodes use rounded rectangle:

```javascript
canvas: {
  minWidth: 160,
  shape: 'rounded-rect',
  borderRadius: 8,
  resizable: false
}
```

### Resizable Nodes

Comment nodes can be resized by user:

```javascript
canvas: {
  minWidth: 200,
  minHeight: 80,
  shape: 'rectangle',
  borderRadius: 0,
  resizable: true
}
```

**Features:**
- Drag handles on edges and corners
- Respects minWidth/minHeight
- Size persisted in node data
- Uses ReactFlow's NodeResizer component

### Special Shapes

Circle nodes (future):

```javascript
canvas: {
  minWidth: 100,
  shape: 'circle',
  aspectRatio: 1,  // Force square aspect ratio
  resizable: false
}
```

---

## Complete Visual Definition Examples

### Example 1: Tag Input (Simple)

```javascript
visual: {
  canvas: {
    minWidth: 160,
    shape: 'rounded-rect',
    borderRadius: 8,
    resizable: false
  },
  layout: [
    {
      type: 'header',
      icon: '📥',
      title: 'Tag Input',
      color: '#2196F3',
      badges: ['executionOrder']
    },
    {
      type: 'subtitle',
      text: '{{tagName}}',
      color: '#666666',
      visible: '{{tagName}}'
    }
  ],
  handles: {
    inputs: [],
    outputs: [
      { index: 0, position: 'auto', color: 'auto' }
    ],
    size: 12,
    borderWidth: 2,
    borderColor: '#ffffff'
  },
  status: {
    execution: { enabled: true, position: 'top-left', offset: { x: -10, y: -10 } },
    pinned: { enabled: true, position: 'top-right', offset: { x: -8, y: -8 } },
    executionOrder: { enabled: true, position: 'header' }
  },
  runtime: {
    enabled: false
  }
}
```

### Example 2: Math (Dynamic Inputs)

```javascript
visual: {
  canvas: {
    minWidth: 160,
    shape: 'rounded-rect',
    borderRadius: 8,
    resizable: false
  },
  layout: [
    {
      type: 'header',
      icon: '🔢',
      title: 'Math',
      color: '#9C27B0',
      badges: ['executionOrder']
    },
    {
      type: 'subtitle',
      text: '{{operation}}',
      color: '#666666',
      visible: '{{operation}}'
    },
    {
      type: 'text',
      content: '{{formula}}',
      fontSize: 11,
      color: '#999999',
      visible: '{{operation}} === "formula"'
    }
  ],
  handles: {
    // Backend generates inputs array based on data.inputCount
    inputs: [],  // Populated by backend
    outputs: [
      { index: 0, position: 'auto', color: 'auto' }
    ]
  },
  status: {
    execution: { enabled: true, position: 'top-left', offset: { x: -10, y: -10 } },
    pinned: { enabled: true, position: 'top-right', offset: { x: -8, y: -8 } },
    executionOrder: { enabled: true, position: 'header' }
  },
  runtime: {
    enabled: false
  }
}
```

### Example 3: Script-JS (Code Preview)

```javascript
visual: {
  canvas: {
    minWidth: 180,
    shape: 'rounded-rect',
    borderRadius: 8,
    resizable: false
  },
  layout: [
    {
      type: 'header',
      icon: '📜',
      title: 'JavaScript',
      color: '#F57C00',
      badges: ['executionOrder']
    },
    {
      type: 'subtitle',
      text: 'Custom script',
      color: '#666666'
    },
    {
      type: 'divider',
      color: '#e0e0e0',
      margin: 8
    },
    {
      type: 'code',
      language: 'javascript',
      content: '{{code}}',
      maxLines: 3,
      showLineNumbers: false,
      visible: '{{code}}'
    }
  ],
  handles: {
    inputs: [],  // Dynamic, populated by backend
    outputs: [
      { index: 0, position: 'auto', color: 'auto' }
    ]
  },
  status: {
    execution: { enabled: true, position: 'top-left', offset: { x: -10, y: -10 } },
    pinned: { enabled: true, position: 'top-right', offset: { x: -8, y: -8 } },
    executionOrder: { enabled: true, position: 'header' }
  },
  runtime: {
    enabled: false
  }
}
```

### Example 4: Comment (Resizable)

```javascript
visual: {
  canvas: {
    minWidth: 200,
    minHeight: 80,
    shape: 'rectangle',
    borderRadius: 0,
    resizable: true
  },
  layout: [
    {
      type: 'text',
      content: '{{text}}',
      fontSize: 14,
      color: '#333333',
      align: 'left'
    }
  ],
  handles: {
    inputs: [],
    outputs: []
  },
  status: {
    execution: { enabled: false },
    pinned: { enabled: false },
    executionOrder: { enabled: false }
  },
  runtime: {
    enabled: false
  }
}
```

### Example 5: File Processor (Async with Progress)

```javascript
visual: {
  canvas: {
    minWidth: 200,
    shape: 'rounded-rect',
    borderRadius: 8,
    resizable: false
  },
  layout: [
    {
      type: 'header',
      icon: '📄',
      title: 'File Processor',
      color: '#00BCD4',
      badges: ['executionOrder']
    },
    {
      type: 'subtitle',
      text: '{{filename}}',
      color: '#666666',
      visible: '{{filename}}'
    },
    {
      type: 'divider',
      color: '#e0e0e0',
      margin: 8,
      visible: '{{runtime.enabled}}'
    },
    {
      type: 'progress',
      value: '{{runtime.progress}}',
      max: '{{runtime.total}}',
      label: '{{runtime.progressText}}',
      color: '#4CAF50',
      visible: '{{runtime.enabled}}'
    },
    {
      type: 'status-text',
      text: '{{runtime.statusMessage}}',
      color: '{{runtime.statusColor}}',
      icon: '{{runtime.statusIcon}}',
      visible: '{{runtime.enabled}}'
    }
  ],
  handles: {
    inputs: [
      { index: 0, position: 'auto', color: 'auto' }
    ],
    outputs: [
      { index: 0, position: 'auto', color: 'auto' }
    ]
  },
  status: {
    execution: { enabled: true, position: 'top-left', offset: { x: -10, y: -10 } },
    pinned: { enabled: true, position: 'top-right', offset: { x: -8, y: -8 } },
    executionOrder: { enabled: true, position: 'header' }
  },
  runtime: {
    enabled: true,
    updateInterval: 1000,
    endpoint: '/api/flows/nodes/{{nodeId}}/runtime',
    fields: [
      'progress',
      'total',
      'progressText',
      'statusMessage',
      'statusColor',
      'statusIcon'
    ]
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
- **Purpose**: Organize nodes in the Flow Studio palette
- **Core Categories**:
  - `"TAG_OPERATIONS"` - Reading/writing tags
  - `"LOGIC_MATH"` - Calculations, comparisons, logic
  - `"COMMUNICATION"` - External integrations
  - `"DATA_TRANSFORM"` - Data manipulation
  - `"UTILITY"` - Helper nodes
  - `"OTHER"` - Miscellaneous
- **Custom Categories**: Library nodes can specify any category key
  - Categories are created dynamically when the library is installed
  - Custom categories appear only while the library is active
  - Examples: `"ROBOTICS"`, `"VISION"`, `"SAFETY"`, `"PACKAGING"`
- **Example**: `"TAG_OPERATIONS"` or `"ROBOTICS"`

#### `section` (string, required)
- **Purpose**: Sub-group within a category for better organization
- **Core Sections** (examples):
  - TAG_OPERATIONS: `"BASIC"`, `"ADVANCED"`
  - LOGIC_MATH: `"MATH"`, `"COMPARISON"`, `"CONTROL"`, `"ADVANCED"`
  - COMMUNICATION: `"BASIC"`, `"DATABASE"`
- **Custom Sections**: Library nodes can specify any section key
  - Sections are created dynamically when the library is installed
  - Custom sections appear only while the library is active
  - Examples: `"MOTION_CONTROL"`, `"VISION_ANALYSIS"`, `"TEST_SECTION"`
- **Example**: `"BASIC"` or `"MOTION_CONTROL"`
- **Note**: See CategoryDefinitions.js for core categories/sections. Libraries extend dynamically.

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

### Visual Definition Constraints

If `visual` object is present:

**Canvas:**
- `minWidth`: Must be positive integer >= 100
- `shape`: Must be one of `'rounded-rect'`, `'rectangle'`, `'circle'`
- `borderRadius`: Must be non-negative integer
- `resizable`: Must be boolean
- `minHeight`: Required if `resizable: true`, must be positive integer >= 40

**Layout:**
- Must be array of valid block objects
- Each block must have `type` field
- Block `type` must be one of: `'header'`, `'subtitle'`, `'text'`, `'values'`, `'badges'`, `'divider'`, `'code'`, `'progress'`, `'status-text'`
- Template strings must use valid syntax: `{{field}}` or `{{nested.path}}`
- Conditional `visible` must use valid JavaScript expression
- At least one `header` block recommended (not enforced)

**Block-Specific Validation:**

*Header Block:*
- Must have `icon`, `title`, `color` fields
- `badges` array items must be strings

*Subtitle/Text/Status-Text:*
- Must have `text` or `content` field
- `fontSize` must be positive integer (8-32 range recommended)
- `align` must be one of: `'left'`, `'center'`, `'right'`

*Values Block:*
- `items` must be array with at least one item
- Each item must have `label` and `value`
- `layout` must be `'horizontal'` or `'vertical'`

*Badges Block:*
- `items` must be array with at least one item
- Each item must have `text` and `color`
- `position` must be `'inline'` or `'stacked'`

*Code Block:*
- Must have `language` and `content` fields
- `language` must be one of: `'javascript'`, `'python'`, `'sql'`, `'json'`, `'text'`
- `maxLines` must be positive integer if specified

*Progress Block:*
- Must have `value` and `max` fields
- `height` must be positive integer if specified
- `color` must be valid hex color if specified

*Divider Block:*
- `thickness` must be positive integer if specified
- `margin` must be non-negative integer if specified
- `style` must be one of: `'solid'`, `'dashed'`, `'dotted'`

**Handles:**
- `inputs` and `outputs` must be arrays
- Each handle must have `index`, `position`, `color` fields
- `position` must be `'auto'` or percentage string (e.g., `'50%'`, `'33.33%'`)
- `color` must be `'auto'` or valid hex color
- `index` must reference valid input/output in metadata
- `size` must be positive integer (8-20 range recommended)
- `borderWidth` must be non-negative integer

**Status:**
- Each status indicator must have `enabled`, `position`, `offset` fields
- `enabled` must be boolean
- `position` must be one of: `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`, `'header'`
- `offset` must be object with `x` and `y` integer fields

**Runtime:**
- `enabled` must be boolean
- `updateInterval` must be positive integer (>= 100ms recommended)
- `endpoint` must be valid URL template with `{{nodeId}}`
- `fields` must be array of strings

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
