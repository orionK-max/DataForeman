# Node Library Expansion Plan

## Overview

This document outlines the proposed expansion of DataForeman's Flow Studio node library, organizing nodes between built-in defaults and installable libraries for optimal user experience and maintainability.

---

## Current State

**Built-in Nodes (8 total):**
- TAG_OPERATIONS: Tag Input, Tag Output, Constant
- LOGIC_MATH: Math, Comparison, Gate
- UTILITY: Comment
- Scripts: JavaScript (legacy)

---

## Proposed Default Library (Built-in Nodes)

These are essential nodes that should be available by default in every DataForeman installation.

### TAG_OPERATIONS - BASIC
**Current (3 nodes):**
- ✅ Tag Input - Read tag values
- ✅ Tag Output - Write tag values with save strategies
- ✅ Constant - Output static values (number, string, boolean, JSON)

**No additions needed** - Core tag operations are complete.

---

### LOGIC_MATH - MATH
**Current (1 node):**
- ✅ Math - Basic arithmetic (add, subtract, multiply, divide, power, modulo)

**Proposed additions (2 nodes):**
- **Round/Truncate** - Round, floor, ceil, truncate, fixed decimals
- **Clamp** - Limit value to min/max range (useful for setpoint limiting)

---

### LOGIC_MATH - COMPARISON
**Current (1 node):**
- ✅ Comparison - Compare values (==, !=, <, >, <=, >=)

**Proposed additions (1 node):**
- **Range Check** - Check if value is within min/max range (returns boolean)
  - Inclusive/exclusive boundary options
  - Common for alarm conditions

---

### LOGIC_MATH - CONTROL
**Current (1 node):**
- ✅ Gate - Conditional pass-through based on boolean condition

**Proposed additions (3 nodes):**
- **Manual Trigger/Switch** - Button-triggered conditional execution
  - **Status:** Legacy code exists at `core/src/nodes/triggers/ManualTriggerNode.js` (not registered)
  - **Current behavior:** Outputs false by default, true when button pressed during deployment or test mode
  - **Note:** Only works in continuous flows (manual flows use parameterized execution instead)
  - **Proposed revision:** Convert to versatile manual control with multiple behavior modes:
    - **Momentary:** Button press outputs true for one scan cycle, then false
    - **Toggle:** Button press alternates between true/false states (persisted)
    - **Pulse:** Button press outputs true for configurable duration
    - **Multi-state:** Cycle through multiple values (e.g., 0, 1, 2, 3...)
    - **Reset:** Optional reset button to return to default state
  - **Implementation notes:**
    - Reuse existing RuntimeStateStore trigger flag infrastructure
    - Keep existing API endpoint `POST /api/flows/:id/trigger/:nodeId`
    - Add state persistence for toggle/multi-state modes
    - UI: In-node button with visual state indicator
    - Only enabled for deployed/test continuous flows (grayed out otherwise)
  - **Priority:** Medium - useful for testing and manual control scenarios in continuous flows
- **Switch/Case** - Route to different outputs based on input value
  - Multiple case values with default output
  - Essential for multi-state logic
- **Merge** - Combine multiple inputs into single output
  - Dynamic inputs (2-10)
  - Strategies: first non-null, highest quality, latest timestamp, highest/lowest value, average
  - Optional boolean reset input to clear internal state (for stateful strategies like "latest")
  - Use cases: sensor redundancy, quality-based selection, min/max selection

---

### LOGIC_MATH - LOGIC (NEW SECTION)
**Proposed (2 nodes):**
- **Boolean Logic** - Logical operations on boolean inputs
  - AND, OR, XOR, NOT, NAND, NOR
  - Multiple inputs (2-10)
  - Essential for industrial automation conditions
- **Bit Operations** - Bitwise operations for integer values
  - AND, OR, XOR, NOT, shift left/right
  - Useful for status word manipulation

---

### DATA_TRANSFORM - BASIC (NEW CATEGORY)
**Proposed (4 nodes):**
- **Type Convert** - Convert between data types
  - number ↔ string ↔ boolean
  - Handles edge cases (null, undefined, NaN)
- **String Operations** - Basic string manipulation
  - Substring, concat, replace, trim, case conversion
  - Length, split, join
- **Array Operations** - Basic array manipulation
  - Get element by index
  - Array length, first, last
  - Join array to string
- **JSON Operations** - Parse and stringify JSON
  - Parse JSON string to object
  - Stringify object to JSON
  - Get property by path (e.g., "data.values[0].temperature")

---

### UTILITY - BASIC
**Current (1 node):**
- ✅ Comment - Add documentation notes to flows

**Proposed additions (4 nodes):**
- **Delay** - Time delay before passing value through
  - Useful for debouncing, sequencing
  - Configurable delay in milliseconds
- **Debug/Log** - Output values to execution log
  - Log level (info, warn, error)
  - Custom message with value interpolation
  - Useful for troubleshooting flows
- **Jump Out** - Virtual output connector for clean flow layout
  - Has input only (no output handle shown)
  - Acts as "endpoint" that sends data to matching Jump In node
  - Configured with a unique jump name/label
  - Example: Receives value from upstream node
- **Jump In** - Virtual input connector for clean flow layout
  - Has output only (no input handle shown)
  - Acts as "source" that receives data from matching Jump Out node
  - Connects to Jump Out node with same jump name
  - No visible edge between Jump Out and Jump In nodes
  - Useful when edges are too long, cross many nodes, or look cluttered
  - Example: Jump Out "SetpointA" → Jump In "SetpointA" (virtual connection)

---

### SCRIPTS - ADVANCED
**Current (1 node):**
- ✅ JavaScript - Execute custom JavaScript code (legacy, needs refactor)

**Proposed additions (1 node):**
- **Python** - Execute Python code snippets
  - Sandboxed execution environment
  - Access to input data via context
  - Return output value and quality
  - Support for common libraries (numpy, pandas, etc.)
  - Use cases: data analysis, ML inference, complex algorithms

---

## Summary: Default Library Expansion

| Category | Current | Proposed | Total |
|----------|---------|----------|-------|
| TAG_OPERATIONS | 4 | +0 | **4** |
| LOGIC_MATH - MATH | 1 | +2 | **3** |
| LOGIC_MATH - COMPARISON | 1 | +1 | **2** |
| LOGIC_MATH - CONTROL | 1 | +2 | **3** |
| LOGIC_MATH - LOGIC | 0 | +2 | **2** |
| DATA_TRANSFORM | 0 | +4 | **4** |
| UTILITY | 1 | +4 | **5** |
| SCRIPTS | 1 | +1 | **2** |
| **TOTAL** | **9** | **+16** | **25** |

**Note on Jump Nodes:** Jump Out and Jump In nodes work as a pair to create virtual connections without visible edges. This is purely for visual organization - at execution time, the flow engine can either treat them as pass-through nodes or resolve the jump connections to create virtual edges in the execution graph.

---

## Proposed Installable Libraries

These are specialized node collections that users can install based on their specific needs.

### 1. Advanced Math Library
**Category:** LOGIC_MATH - ADVANCED

**Nodes:**
- **Trigonometry** - sin, cos, tan, asin, acos, atan, atan2
- **Statistics** - min, max, average, median, sum, std dev, variance
- **Scale/Map** - Linear scaling between input/output ranges
- **Moving Average** - Simple/weighted/exponential moving averages
- **Rate of Change** - Calculate change per time unit
- **Totalizer** - Accumulate/integrate values over time
  - Configurable units (flow, energy, counts, time)
  - Reset input for batch operations
  - Preset value for target-based stopping
  - Overflow handling
  - Rate-based or count-based accumulation
- **Exponential/Logarithm** - exp, log, log10, log2, pow

**Use cases:** Advanced calculations, signal processing, flow totalizing, production counting, energy metering

---

### 2. String Processing Library
**Category:** DATA_TRANSFORM - STRING

**Nodes:**
- **Regular Expression** - Pattern matching and extraction
- **Template Formatter** - String templates with variable substitution
- **Base64 Encode/Decode** - Base64 encoding operations
- **Hash Functions** - MD5, SHA1, SHA256 hashing
- **URL Operations** - Parse, build, encode/decode URLs
- **Text Case Converter** - Advanced case operations (camelCase, snake_case, kebab-case)

**Use cases:** Data parsing, formatting, security, API integration

---

### 3. Date/Time Library
**Category:** UTILITY - TIME

**Nodes:**
- **Current Timestamp** - Get current date/time in various formats
- **Date Formatter** - Format dates with custom patterns
- **Date Parser** - Parse date strings to timestamps
- **Date Arithmetic** - Add/subtract days, hours, minutes
- **Time Zone Convert** - Convert between time zones
- **Duration Calculator** - Calculate time differences
- **Cron Expression** - Evaluate cron expressions

**Use cases:** Scheduling, time-based logic, reporting, log timestamps

---

### 4. Excel File Operations Library
**Category:** DATA_TRANSFORM - FILES

**Nodes (using SheetJS/xlsx library):**
- **Read Excel File** - Read data from .xlsx/.xls files
  - Select worksheet by name/index
  - Read range or entire sheet
  - Header row options
  - Output as JSON array
- **Write Excel File** - Create/modify Excel files
  - Write data to specific worksheet
  - Format cells (bold, colors, alignment)
  - Auto-size columns
  - Multiple worksheets support
- **Excel Cell Operations** - Read/write individual cells
  - Get/set cell value by reference (A1, B2)
  - Cell formulas
  - Cell formatting
- **Excel Query** - Query Excel data like database
  - Filter rows by criteria
  - Sort operations
  - Column selection

**Use cases:** Recipe management, batch records, data import/export, reporting

---

### 5. L5X Operations Library
**Category:** INDUSTRIAL - ROCKWELL

**Nodes (using custom L5X library):**
- **Parse L5X File** - Read and parse Rockwell L5X project files
  - Extract tags, routines, programs
  - Get controller information
  - Parse rung logic
- **L5X Tag Extractor** - Extract tag definitions
  - Filter by tag type, scope, data type
  - Export tag list with properties
- **L5X Data Type Analyzer** - Analyze user-defined data types
  - Extract UDT structure
  - Member definitions
  - Nested UDT support
- **L5X Compare** - Compare two L5X files
  - Identify tag additions/deletions
  - Detect rung changes
  - Generate change report
- **L5X Generator** - Create L5X import files
  - Generate tag import XML
  - Create add-on instruction imports
  - Build partial L5X files for importing
- **L5X Ladder Renderer** - Visualize ladder logic as SVG diagrams
  - Render rungs with contacts, coils, instructions
  - Export as SVG/PNG for documentation
  - Studio 5000-style appearance
  - Parse Neutral Text from L5X
- **L5X Function Block Renderer** - Visualize function block diagrams
  - Render FB routines with blocks and connections
  - Auto-layout with wire routing
  - Export as SVG/PNG
  - Studio 5000-style appearance

**Technical implementation:**
- Core library: Custom JavaScript L5X manipulation library (4,000+ lines, proven)
- Rendering: SVG-based visualization (supports both ladder and function blocks)
- Layout engine: Graph layout algorithms for automatic positioning
- Neutral Text parser: Extract and parse Rockwell's intermediate format
- Backend execution: Node.js with xmldom and xpath
- Protection: Obfuscated distribution to protect proprietary know-how

**Use cases:** PLC programming automation, documentation generation, configuration management, version control, visual code review, training materials, automated reporting

---

### 6. Database Operations Library
**Category:** DATA_TRANSFORM - DATABASE

**Nodes:**
- **SQL Query** - Execute SELECT queries
  - Connection string configuration
  - Parameter binding (SQL injection protection)
  - Result set output as JSON
  - Support for PostgreSQL, MySQL, SQL Server, SQLite
- **SQL Execute** - Execute INSERT/UPDATE/DELETE
  - Transaction support
  - Affected rows count
  - Return inserted ID
- **SQL Transaction** - Manage database transactions
  - Begin, commit, rollback operations
  - Multiple queries in single transaction
- **Stored Procedure** - Call database stored procedures
  - Input/output parameters
  - Result sets handling

**Use cases:** MES integration, custom data storage, reporting queries, data migration

---

### 7. File Operations Library
**Category:** DATA_TRANSFORM - FILES

**Nodes:**
- **Read Text File** - Read text file contents
  - Full file or line-by-line
  - Encoding options (UTF-8, ASCII, etc.)
- **Write Text File** - Write text to file
  - Overwrite or append modes
  - Create directory if not exists
- **CSV Operations** - Read/write CSV files
  - Parse with header detection
  - Custom delimiters
  - Quote handling
- **File Info** - Get file metadata
  - Size, dates, permissions
  - File exists check
- **Directory Operations** - List, create, delete directories
- **File Watch** - Monitor files for changes (trigger node)

**Use cases:** Log file processing, data import/export, batch file generation, file monitoring

---

### 8. Process Control Library
**Category:** CONTROL - PROCESS

**Nodes:**
- **PID Controller** - Proportional-Integral-Derivative control
  - Configurable Kp, Ki, Kd gains
  - Anti-windup protection
  - Manual/auto mode switching
  - Output limits
- **Lead-Lag** - Lead-lag compensation filter
  - Phase compensation for control loops
  - Configurable lead/lag time constants
- **Deadband** - Eliminate noise around setpoint
  - Configurable deadband range
  - Prevents oscillation
- **Ramp/Rate Limiter** - Limit rate of change
  - Rising and falling rate limits
  - Prevents sudden changes to process
- **Setpoint Profile** - Multi-segment setpoint ramping
  - Time-based setpoint changes
  - Linear/curved ramps between points
- **Auto-Tuner** - Automatic PID tuning
  - Relay feedback method
  - Ziegler-Nichols tuning rules
- **Split Range** - Control two outputs from one signal
  - Heating/cooling valve control
  - Configurable split point and ranges

**Use cases:** Temperature control, pressure regulation, flow control, level control, automated tuning

---

## Implementation Priority

### Phase 1: Essential Default Nodes (High Priority)
1. Boolean Logic - Critical for industrial logic
2. Switch/Case - Common control pattern
3. Type Convert - Frequently needed
4. Range Check - Common in alarms
5. String Operations - Basic text handling

### Phase 2: Additional Default Nodes (Medium Priority)
6. Round/Truncate - Numeric formatting
7. Merge - Data combination
8. Array Operations - Data structure handling
9. Clamp - Value limiting
10. JSON Operations - Data parsing

### Phase 3: Remaining Default Nodes (Lower Priority)
11. Bit Operations - Specialized use
12. Delay - Timing control
13. Debug/Log - Troubleshooting aid
14. Jump Out / Jump In - Flow layout organization
15. Python - Custom Python scripts (requires sandboxing implementation)

### Phase 4: Installable Libraries
- Start with most-requested libraries based on user feedback
- **L5X Library (Priority 1)** - Unique competitive advantage, ready to adapt
  - Week 1-2: Adapt core library for Node.js backend
  - Week 3-4: Implement SVG rendering for ladder and function blocks
  - Week 5: Create Flow Studio node wrappers (7-8 nodes)
  - Week 6: Testing, documentation, obfuscation
- Excel Library - High demand for recipe/batch management
- Advanced Math - Control engineers need this
- Date/Time - Common requirement for reporting
- Database - MES integration scenarios
- Process Control - PID and control algorithms
- String Processing - API integration
- File Operations - Data exchange scenarios

---

## Technical Considerations

### Default Node Guidelines
- Must be useful to 70%+ of users
- Should not require external dependencies (or minimal ones)
- Must follow FlowNodeSchema v1 specification
- Comprehensive input validation
- Clear error messages
- Good documentation with examples

### Library Node Guidelines
- Can have external npm dependencies
- Must declare dependencies in manifest
- Should be cohesive (related functionality)
- Include comprehensive documentation
- Provide example flows
- Test with obfuscation before distribution

### Categories and Sections
All nodes use the dynamic category system:
- TAG_OPERATIONS (core)
- LOGIC_MATH (core)
- DATA_TRANSFORM (new core category)
- UTILITY (core)
- INDUSTRIAL (library-specific)

Libraries can introduce custom categories/sections that auto-cleanup on uninstall.

---

## Notes

### Excluded from This Plan
- **Communication Libraries** (HTTP, MQTT, Email, Webhook) - Will be implemented separately
- **Industrial Protocol Libraries** (Modbus, OPC UA advanced) - Separate implementation plan

### Custom Libraries Integration
- **L5X Library** - Existing custom library (4,000+ lines) will be:
  - Adapted for Node.js backend (replace browser APIs with xmldom/xpath)
  - Extended with SVG rendering capabilities for ladder and function block visualization
  - Integrated with Flow Studio node wrappers
  - Obfuscated for distribution to protect intellectual property
  - Estimated adaptation effort: 1 week core library + 1 week visualization
- **Excel Library** - Will use SheetJS (xlsx) - Apache 2.0 license, production-ready

---

## Next Steps

1. **Review and approve** this expansion plan
2. **Prioritize** specific nodes for implementation
3. **Implement Phase 1 nodes** (5 high-priority default nodes)
4. **Test and document** new nodes
5. **Update node palette UI** to reflect new categories
6. **Create example flows** demonstrating new capabilities
7. **Begin library development** for installable packages
