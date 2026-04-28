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
- [File Nodes](#file-nodes)
  - [Load File](#load-file)
  - [Save File](#save-file)

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
**Description:** Writes a value to an internal tag with configurable save strategy.

#### Configuration
- **tag** (tag selector, required): Internal tag to write to (selected from tag browser)
  - **Note:** Only INTERNAL tags can be written by flows. Create internal tags via Connectivity → Tags → Internal tab.
  
- **saveToDatabase** (boolean, default: true): Enable/disable database saving
  - `true`: Publishes values to NATS for persistence
  - `false`: Flow-local only (no database writes)
  
- **saveStrategy** (options, default: 'on-change'): Controls write frequency
  - `always`: Writes every flow execution (high DB load)
  - `on-change`: Writes only when value changes significantly (recommended)
  - `never`: Skips all NATS publishing (flow-local only)
  
- **deadband** (number, default: 0): Minimum change required to trigger save (when saveStrategy = 'on-change')
  - `0`: Any change triggers save
  - `>0`: Only changes exceeding threshold trigger save
  
- **deadbandType** (options, default: 'absolute'): How deadband is calculated (when saveStrategy = 'on-change')
  - `absolute`: Fixed value difference (e.g., 0.5 = must change by 0.5)
  - `percent`: Percentage of previous value (e.g., 5 = must change by 5%)
  
- **heartbeatMs** (number, default: 60000): Force save after interval even if unchanged (when saveStrategy = 'on-change')
  - `0`: Disabled (only saves on change)
  - `>0`: Milliseconds between forced saves (e.g., 60000 = save every minute)

#### Inputs
- **Input 0:** Value to write (any type)

#### Outputs
- **value:** The input value (pass-through)
- **quality:** Input quality (pass-through)
- **tagPath:** The tag path written to
- **writeSkipped:** Boolean indicating if write was skipped
- **skipReason:** Reason for skip (if applicable)

#### Behavior
- Writes value to internal tags via NATS telemetry messages
- Write filtering based on save strategy:
  - **always**: Publishes every execution (scan_rate_ms determines write rate)
  - **on-change**: Publishes only when value changes beyond deadband threshold OR heartbeat interval expires
  - **never**: Skips all NATS publishing
- In test mode with "Disable writes" enabled: Skips write (logs only)
- Returns input value/quality as pass-through
- **Note:** Multiple flows can write to the same internal tag (OR logic - any flow can trigger save)

#### Example Configurations

**High-frequency monitoring (save all values):**
```
saveToDatabase: true
saveStrategy: always
→ Result: Saves every scan (e.g., 1000ms scan = 60 writes/minute)
```

**Stable value with noise filtering (recommended):**
```
saveToDatabase: true
saveStrategy: on-change
deadband: 0.5
deadbandType: absolute
heartbeatMs: 60000
→ Result: Saves when value changes by ±0.5, or every 60 seconds
```

**Development/testing (no persistence):**
```
saveToDatabase: false
→ Result: Flow-local only, no database writes
```

#### Error Handling
- **On Error: Stop**
  - Missing tag configuration: Throws error
  - Invalid tag ID: Throws error
  - Tag not found: Throws error
  - Tag is not INTERNAL type: Throws error "Only INTERNAL tags can be written to by flows"
  
#### Log Messages
- Info: `Wrote to tag "internal.tag_name": value (quality: quality_code)`
- Info: `Tag write skipped (reason): "internal.tag_name" = value`
  - Reasons: 'test_mode_writes_disabled', 'database_saving_disabled', 'no_significant_change'

#### Performance Notes
- Write-on-change filtering reduces database load by 90-99% for stable values
- Example: Temperature sensor at 22°C with ±0.2°C noise, scan rate 500ms:
  - Without filtering: 7,200 writes/hour
  - With on-change (deadband 0.5): ~70 writes/hour (99% reduction)

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

## File Nodes

### Load File

**Type:** `load-file`  
**Category:** File Operations  
**Description:** Uploads a file into the flow and outputs its contents in various formats.

#### Configuration
- **file** (fileUpload, required): File to upload and store with the flow
  - Maximum size: 10MB
  - Stored as base64 in flow definition
  - Shows upload timestamp and file metadata
  
- **output** (select, default: 'utf8'): Output format
  - `utf8`: Text (UTF-8) - returns file as string
  - `base64`: Base64 string - returns base64-encoded data
  - `json`: JSON (parse) - parses file content as JSON object

#### Inputs
- None (source node)

#### Outputs
- **value:** File contents in selected format (string or object)
- **quality:** `192` (good quality)
- **bytes:** File size in bytes
- **filename:** Original filename
- **mimeType:** File MIME type
- **timestamp:** Execution timestamp

#### Behavior
- File is uploaded during node configuration via file picker
- File data is stored in flow definition (base64-encoded)
- On execution, file is decoded and converted to selected format
- For `utf8` format: Converts buffer to UTF-8 string
- For `base64` format: Returns base64-encoded string
- For `json` format: Parses UTF-8 content as JSON
- File persists with flow (survives restarts)
- Visual display shows:
  - Filename
  - File size
  - Upload timestamp (relative time: "5m ago", "2h ago")

#### Error Handling
- **On Error: Stop**
  - No file selected: Throws "No file selected"
  - Missing file data: Throws "Uploaded file data is missing"
  - Invalid JSON (json format): Throws "Invalid JSON: {error message}"
  
#### Log Messages
- **Info level:** `Loaded file: {filename} ({bytes} bytes, {mimeType})`
- **Debug level:** `Loaded file: {filename} ({bytes} bytes, {mimeType})\nContent preview: {first 500 chars}...`
- **Error level:** `Load file failed: {error message}`

#### Example Use Cases
- Load configuration files (JSON, YAML)
- Read CSV data for processing
- Import reference data tables
- Load template files
- Process uploaded documents

---

### Save File

**Type:** `save-file`  
**Category:** File Operations  
**Description:** Prepares input data for file download in the browser.

#### Configuration
- **filename** (string, default: 'output.txt', required): Name for the downloaded file
  - Can include extension (e.g., `report.csv`, `data.json`)
  
- **format** (select, default: 'text'): Encoding format
  - `text`: Text (UTF-8) - converts input to plain text
  - `json`: JSON (pretty) - formats input as pretty-printed JSON
  - `base64`: Base64 (decode) - decodes base64 string to binary
  
- **mimeType** (string, optional): Custom MIME type for download
  - If empty, uses format-based default:
    - `text`: `text/plain`
    - `json`: `application/json`
    - `base64`: `application/octet-stream`
  - Examples: `text/csv`, `application/xml`, `image/png`

#### Inputs
- **Input 0:** Data to save (any type)
  - For `text` format: Converts any value to string
  - For `json` format: Serializes value to JSON
  - For `base64` format: Decodes base64 string to binary

#### Outputs
- None (sink node)

#### Behavior
- Prepares data for browser download (does not write to server filesystem)
- Output structure includes special `__download` object:
  ```javascript
  {
    __download: {
      filename: 'output.txt',
      mimeType: 'text/plain',
      dataBase64: 'SGVsbG8gV29ybGQ='
    }
  }
  ```
- Frontend detects `__download` and triggers browser download
- For `text` format:
  - Converts input to string (null/undefined → empty string)
  - Encodes as UTF-8
- For `json` format:
  - Serializes input with 2-space indentation
  - Pretty-prints for readability
- For `base64` format:
  - Decodes base64 input string to binary
  - Requires string input or throws error
- Visual display shows:
  - Filename
  - Format type
  - MIME type (if specified)

#### Error Handling
- **On Error: Stop**
  - Base64 format with non-string input: Throws "Base64 format requires a string input"
  - Invalid base64 data: Throws error during decode
  
#### Log Messages
- **Info level:** `Prepared download: {filename} ({bytes} bytes, {mimeType})`
- **Debug level:** `Prepared download: {filename} ({bytes} bytes, {mimeType})\nContent preview: {first 500 chars decoded}...`
- **Error level:** `Save file failed: {error message}`

#### Example Use Cases
- Export flow results as CSV
- Generate JSON reports
- Create downloadable logs
- Export processed data
- Generate text files from calculations

#### Notes
- Does NOT write to server filesystem (browser download only)
- File size limited by browser memory (recommended < 50MB)
- For large files, consider using external storage APIs
- `__download` objects are stripped from core logs to prevent bloat

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
