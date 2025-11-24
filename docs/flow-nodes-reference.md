# Flow Nodes Reference

This document provides detailed specifications for all node types available in DataForeman Flow Studio.

## Table of Contents

- [Trigger Nodes](#trigger-nodes)
  - [Manual Trigger](#manual-trigger)
- [Input Nodes](#input-nodes)
  - [Tag Input](#tag-input)
- [Output Nodes](#output-nodes)
  - [Tag Output](#tag-output)
- [Processing Nodes](#processing-nodes)
  - [Math](#math)
  - [Comparison](#comparison)
  - [JavaScript](#javascript)

---

## Trigger Nodes

### Manual Trigger

**Type:** `trigger-manual`  
**Category:** Trigger  
**Description:** Manually triggers flow execution. Used for testing and on-demand execution.

#### Configuration
- No configuration required

#### Inputs
- None (trigger nodes don't have inputs)

#### Outputs
- **value:** `true` (boolean)
- **quality:** `192` (good quality)

#### Behavior
- Fires immediately when triggered via UI or API
- Always returns success with good quality
- Can only be triggered when flow is deployed or in test mode

#### Error Handling
- On error setting: N/A (always succeeds)

#### Log Messages
*(To be defined)*

---

## Input Nodes

### Tag Input

**Type:** `tag-input`  
**Category:** Input  
**Description:** Reads the current value of a tag from the tag cache.

#### Configuration
- **tag** (string, required): Tag path to read from (e.g., `PLC1.Temperature`)

#### Inputs
- None (input nodes don't have inputs)

#### Outputs
- **value:** Current tag value (any type)
- **quality:** Tag quality code (0-255)
  - `0` = Bad
  - `64` = Uncertain
  - `192` = Good

#### Behavior
- Reads from tag cache (real-time values)
- Returns most recent value available in cache
- If tag not found or no cached data available:
  - Returns `null` value
  - Returns quality `0` (bad)

#### Error Handling
- **On Error: Continue/Skip**
  - Missing tag: Returns `null` with quality `0`
  - No cached data: Returns `null` with quality `0`

#### Log Messages
*(To be defined)*

---

## Output Nodes

### Tag Output

**Type:** `tag-output`  
**Category:** Output  
**Description:** Writes a value to a tag.

#### Configuration
- **tag** (string, required): Tag path to write to (e.g., `PLC1.Setpoint`)

#### Inputs
- **Input 0:** Value to write (any type)

#### Outputs
- **value:** The input value (pass-through)
- **quality:** Input quality (pass-through)

#### Behavior
- Writes value to specified tag via NATS message
- In test mode with "Disable writes" enabled: Skips write (logs only)
- Quality threshold: Only writes if input quality >= 64 (uncertain or better)
- Returns input value/quality as pass-through

#### Error Handling
- **On Error: Stop**
  - Missing tag configuration: Throws error
  - Invalid tag path: Throws error
  - Write failure: Throws error
- **On Error: Continue/Skip**
  - Low quality input (<64): Skips write, passes through input

#### Log Messages
*(To be defined)*

---

## Processing Nodes

### Math

**Type:** `math`  
**Category:** Processing  
**Description:** Performs mathematical operations on input values.

#### Configuration
- **operation** (string, required): Mathematical operation
  - `add` - Addition (A + B)
  - `subtract` - Subtraction (A - B)
  - `multiply` - Multiplication (A × B)
  - `divide` - Division (A ÷ B)
  - `power` - Exponentiation (A^B)
  - `modulo` - Modulo (A % B)
  - `min` - Minimum value
  - `max` - Maximum value
  - `average` - Average value
  - `abs` - Absolute value
  - `sqrt` - Square root
  - `round` - Round to nearest integer
  - `floor` - Round down
  - `ceil` - Round up

#### Inputs
- **Input 0:** First operand (number, required)
- **Input 1:** Second operand (number, required for binary operations)

#### Outputs
- **value:** Result of mathematical operation (number)
- **quality:** Worst quality from inputs
  - Good (192) if all inputs are good
  - Uncertain (64) if any input is uncertain
  - Bad (0) if any input is bad or operation fails

#### Behavior
- Converts input values to numbers
- Performs specified operation
- Returns numeric result
- Quality propagation: Uses worst input quality
- Special cases:
  - Division by zero: Returns `null` with quality `0`
  - Invalid inputs (non-numeric): Returns `null` with quality `0`
  - Single-input operations (abs, sqrt, etc.): Uses only first input

#### Error Handling
- **On Error: Stop**
  - Division by zero: Throws error
  - Invalid operation: Throws error
- **On Error: Continue/Skip**
  - Division by zero: Returns `null` with quality `0`
  - Non-numeric inputs: Returns `null` with quality `0`
  - Missing operation config: Returns `null` with quality `0`

#### Log Messages
*(To be defined)*

---

### Comparison

**Type:** `comparison`  
**Category:** Processing  
**Description:** Compares two input values and returns boolean result.

#### Configuration
- **operation** (string, required): Comparison operation
  - `eq` - Equal (A == B)
  - `ne` - Not equal (A != B)
  - `gt` - Greater than (A > B)
  - `gte` - Greater than or equal (A >= B)
  - `lt` - Less than (A < B)
  - `lte` - Less than or equal (A <= B)

#### Inputs
- **Input 0:** First value (any type, required)
- **Input 1:** Second value (any type, required)

#### Outputs
- **value:** Comparison result (boolean)
- **quality:** Worst quality from inputs
  - Good (192) if all inputs are good
  - Uncertain (64) if any input is uncertain
  - Bad (0) if any input is bad

#### Behavior
- Performs type-aware comparison
- String comparison: Case-sensitive
- Number comparison: Numeric ordering
- Boolean comparison: `true > false`
- Null handling: `null` equals only `null`
- Quality propagation: Uses worst input quality

#### Error Handling
- **On Error: Stop**
  - Missing inputs: Throws error
  - Invalid operation: Throws error
- **On Error: Continue/Skip**
  - Missing inputs: Returns `false` with quality `0`
  - Type mismatch: Attempts conversion, returns `false` if fails

#### Log Messages
*(To be defined)*

---

### JavaScript

**Type:** `javascript`  
**Category:** Processing  
**Description:** Executes custom JavaScript code with access to input values.

#### Configuration
- **code** (string, required): JavaScript code to execute
  - Must return a value
  - Has access to `input0`, `input1`, etc. variables
  - Has access to `quality0`, `quality1`, etc. variables
  - Has access to helper functions: `min()`, `max()`, `avg()`

#### Inputs
- **Input 0..N:** Any number of inputs (accessed via `input0`, `input1`, etc.)

#### Outputs
- **value:** Return value from JavaScript code (any type)
- **quality:** Calculated based on input qualities
  - If code returns object with `{value, quality}`: Uses specified quality
  - Otherwise: Uses worst input quality

#### Behavior
- Executes JavaScript in sandboxed VM (vm2)
- Timeout: 5 seconds
- Memory limit: 128MB
- Available globals: `Math`, `Date`, `JSON`, helper functions
- Input access: `input0`, `input1`, `input2`, etc.
- Quality access: `quality0`, `quality1`, `quality2`, etc.
- Example code:
  ```javascript
  // Simple calculation
  return input0 * 1.8 + 32;
  
  // With quality check
  if (quality0 < 192) return { value: null, quality: 0 };
  return Math.round(input0 * 100) / 100;
  
  // Multiple inputs
  return Math.max(input0, input1, input2);
  ```

#### Error Handling
- **On Error: Stop**
  - Syntax error: Throws error
  - Runtime error: Throws error
  - Timeout: Throws error
- **On Error: Continue/Skip**
  - Runtime error: Returns `null` with quality `0`
  - Timeout: Returns `null` with quality `0`

#### Log Messages
*(To be defined)*

---

## Common Patterns

### Quality Propagation
Most processing nodes follow this quality propagation pattern:
- If all inputs have good quality (192): Output has good quality (192)
- If any input has uncertain quality (64): Output has uncertain quality (64)
- If any input has bad quality (0): Output has bad quality (0)
- On error: Output has bad quality (0)

### Error Handling Modes
All nodes support two error handling modes (configured per node):
- **Stop**: Node failure stops flow execution (default)
- **Continue/Skip**: Node returns bad quality result and flow continues

### Execution Context
All nodes have access to:
- Input values from connected nodes
- Configuration parameters
- Execution context (flow ID, execution ID, timestamps)
- Logging methods (debug, info, warn, error)

---

## Node Implementation Checklist

When implementing a new node:
- [ ] Extend `BaseNode` class
- [ ] Implement `execute(context)` method
- [ ] Validate required configuration in constructor or execute
- [ ] Handle missing/invalid inputs gracefully
- [ ] Implement quality propagation logic
- [ ] Respect error handling mode (`onError` setting)
- [ ] Add comprehensive logging (2 DEBUG + operational INFO/WARN/ERROR)
- [ ] Register node in `NodeRegistry`
- [ ] Add to UI node palette with icon and description
- [ ] Write tests for success and error cases
- [ ] Document in this reference guide

---

## Notes

- All node types are case-sensitive
- Node IDs are auto-generated UUIDs
- Configuration is stored in `node.data` object
- Inputs are accessed via `context.getInputValue(index)`
- Outputs must include both `value` and `quality` properties
