---
applyTo: "core/src/nodes/**,core/test/nodes/**,front/src/components/flowStudio/**,front/src/components/shared/FlowParameterPanel*"
description: "Use when: working on flow node outputs, TagOutputNode, output port definitions, quality codes, ioRules, FlowParameterPanel, or flow execution result handling."
---

# Output Nodes & Output Port Conventions

## Output port definition pattern

```js
outputs: [
  {
    type: 'number' | 'boolean' | 'string' | 'any' | 'main' | 'trigger',
    displayName: 'Result',   // shown on canvas edge
    required: true,          // optional, defaults true
    maxConnections: 1        // optional; omit for unlimited
  }
]
```

- Sink nodes (e.g. `TagOutputNode`) set `outputs: []`.
- Use `ioRules` when the number or type of outputs depends on a property value — never compute them imperatavely in `execute()`.

## Dynamic output count via ioRules

```js
ioRules: [
  {
    when: { operation: ['split'] },
    outputs: { count: 2, types: ['number', 'number'] }
  },
  {
    when: { operation: ['passthrough'] },
    outputs: { count: 1, type: 'any', canAdd: true, max: 8 }
  }
]
```

Full schema: [core/src/schemas/FlowNodeSchema.js](../src/schemas/FlowNodeSchema.js)

## Quality codes — always carry through

Every value flowing between nodes must be wrapped:
```js
// correct
return { value: 42.5, quality: 192 };

// wrong — loses quality metadata
return 42.5;
```

| Code | Meaning |
|------|---------|
| `0`  | Bad |
| `64` | Uncertain |
| `192`| Good |

Propagate the lowest (worst) quality when combining multiple inputs.

## TagOutputNode write strategies

| Strategy | Behaviour |
|----------|-----------|
| `always` | Write on every execution |
| `on-change` | Write only when value changes beyond deadband |
| `never` | Process internally, don't persist to tag store |

Deadband modes: `absolute` (`|new - old| ≥ deadband`) or `percent` (`|Δ/old| * 100 ≥ deadband%`).

NATS publish subject: `df.telemetry.raw.<connectionId>`  
Payload: `{ schema: 'telemetry', connection_id, tag_id, tag_path, value, quality, timestamp }`

## execute() return convention

```js
async execute(inputs, properties, context) {
  // inputs: Map<portName, { value, quality }>
  // Return array aligned to outputs[] definition
  return [
    { value: result, quality: inputQuality }
  ];
  // Or null to halt downstream propagation
}
```

Access inputs by port index or by name via `context.getInput(name)`.

## FlowParameterPanel (frontend)

`front/src/components/shared/FlowParameterPanel.jsx` renders flow-level output parameters:
- `boolean` → `<Chip>` (green = true, red = false)
- `number` / `string` → `<Typography>`
- `undefined` / `null` → shows `outputPlaceholder` ("Waiting…" by default)

Props: `outputSchema[]`, `outputValues{}`, `outputPlaceholder`, `lastExecutionTime`.

## Registering a new node

1. Create `core/src/nodes/<category>/MyNode.js` extending `BaseNode`
2. Add `execute(inputs, properties, context)` method
3. Import and register in `core/src/nodes/index.js`:
   ```js
   import { MyNode } from './category/MyNode.js';
   NodeRegistry.register('my-node', MyNode);
   ```
4. Run `npm test` in `Demo/core/` — a schema validation test runs automatically against all registered nodes.
