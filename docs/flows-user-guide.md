# Flows User Guide

## Overview

Flows are visual workflows that process data from tags, perform calculations, and write results back to tags. Build complex data processing pipelines by connecting nodes in a drag-and-drop editor.

## Key Concepts

### Flow States

- **Draft**: Flow is being edited, not active
- **Test Mode**: Temporary deployment for testing with optional write protection
- **Deployed**: Flow is live and running continuously

### Execution Mode

All flows use **Continuous Mode**: Flows run in a continuous loop at a configured scan rate (default: 1 second).

**Features:**
- Configurable scan rate (100ms to 60 seconds)
- Real-time monitoring with scan count
- Automatic session management
- Input values update between scans
- Manual triggers work within the continuous loop

### Node Types

**Triggers**
- `Manual Trigger`: Click to fire trigger flag on next scan (only works when deployed)

**Tag Operations**
- `Tag Input`: Read current value from a tag
- `Tag Output`: Write value to an internal tag

**Data Processing**
- `Math`: Operations (add, subtract, multiply, divide, average, min, max, custom formula)
- `Comparison`: Compare values (>, <, ≥, ≤, =, ≠)
- `JavaScript`: Custom code with `$input`, `$tags`, `$flow` access

## Building a Flow

1. **Add Nodes**: Click + button or press `/`
2. **Connect Nodes**: Drag from right (output) to left (input)
3. **Configure Nodes**: Click node to open config panel
4. **Configure Scan Rate**: Settings → Scan Rate (100-60000ms)
5. **Test**: Click "Test Run" to test with optional write protection
6. **Deploy**: Click "Deploy" to start continuous execution

## Node Configuration

### Manual Trigger
- No configuration needed
- **Works when deployed or in test mode**
- Sets flag for next scan cycle only
- Icon greyed out when undeployed

### Tag Input
- Select tag from browser
- **Maximum Data Age**: Controls data freshness
  - `-1` (default): Accept any age (use cached values)
  - `0`: Require live data (within 1 second)
  - `>0`: Custom maximum age in seconds
  - Returns null/bad quality when data exceeds age limit
  - Useful when OPC UA server or PLC connection is unstable

### Tag Output
- Only writes to internal tags
- Select target tag from browser

### Math Node
- Choose operation or custom formula
- Formula example: `(input1 + input2) * 0.5`

### Comparison Node
- Compare two values (>, <, ≥, ≤, =, ≠)
- Returns boolean result

### JavaScript Node
- Access: `$input`, `$tags`, `$flow`
- Timeout: 5 seconds

## Testing Workflows

### Test Mode

Test mode temporarily deploys your flow for testing.

**Starting Test Mode**:
1. Click "Test Run" (available when undeployed)
2. Configure options:
   - **Disable writes**: Tag-output nodes skip writing (safe testing)
   - **Auto-exit**: Exit after timeout (1-60 minutes)
3. Click "Start Test"

**During Test Mode**:
- Flow runs continuously at scan rate
- Manual triggers are clickable
- Writes respect disable setting
- Can stop anytime with "Stop Test" button

**Best Practice**: Enable "disable writes" to test safely without modifying production tags.

## Deployment

**Deploy**:
- Click "Deploy" button
- Flow starts running continuously
- Manual triggers become clickable
- Session tracked in database

**Undeploy**:
- Click "Undeploy" button
- Stops continuous execution
- Clears runtime state
- Manual triggers become greyed out

## Flow Logs

View real-time execution logs:
- Press `Ctrl+L` or click "Show Logs"
- Position panel: bottom or right side
- Auto-scroll to newest logs
- Filter by log level (DEBUG, INFO, WARN, ERROR)
- Pauses when scrolling up

**Log Retention**: Configured per flow (1-365 days, default: 30)

## Flow Sharing

- **Private**: Only you can view/edit
- **Shared**: Others can view/execute (not edit)
- Internal tags from shared flows are also shared

## Best Practices

1. **Test Before Deploy**: Use test mode with write protection
2. **Configure Scan Rate**: Match to your monitoring needs (faster = more CPU)
3. **Document Nodes**: Use descriptive labels
4. **Check Logs**: Monitor execution with log panel

## Data Quality

> **Note**: To be updated - Data quality system will be globalized across the application.

OPC UA quality codes propagate through flows:
- **Good (192)**: Valid data
- **Uncertain**: Stale/estimated
- **Bad**: Invalid/unavailable

Bad inputs produce bad outputs.

## Keyboard Shortcuts

- `/` - Open node browser
- `Ctrl+L` - Toggle log panel
- `Double-click node` - Open details panel
