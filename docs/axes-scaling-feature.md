# Per-Tag Vertical Axis with Custom Min/Max Scaling

## Overview
This feature allows you to configure multiple Y axes with independent scaling for different tag groups in the Historian chart view. Each tag can be assigned to a specific axis, and each axis can have custom min/max domains and positioning (left/right).

## Implementation Details

### State Management
- **Axes Configuration**: Stored in `axes` state array with structure:
  ```javascript
  {
    id: string,          // unique identifier (e.g., 'default', 'axis_123')
    label: string,       // display label for the axis
    orientation: string, // 'left' or 'right'
    domain: [min, max]  // ['auto', 'auto'] or numeric values
  }
  ```
- **Per-Tag Assignment**: Each tag has a `yAxisId` property linking it to an axis

### UI Components

#### 1. Axes & Scaling Tab (ChartConfigPanel)
Located in the Preferences panel, accessible via the Settings button in the chart.

**Features:**
- **Y Axes List**: Shows all configured axes with controls for:
  - Label editing
  - Position (left/right)
  - Min/Max domain (auto or custom numeric values)
  - Offset (manual positioning in pixels)
  - Name Position (inside/outside chart area)
  - Name Offset (distance from axis line)
  - Remove button (except for 'default' axis)
- **Add Y Axis Button**: Creates new axes with auto-generated IDs
- **Tag Assignment**: Dropdown in Tags tab to assign each tag to an axis

#### 2. Chart Rendering (ChartRenderer)
- Uses Apache ECharts for canvas-based rendering
- Renders multiple Y-axes based on `axes` configuration
- Each series references its assigned axis via `yAxisIndex`
- Domain calculation respects axis configuration (auto vs. fixed values)
- Automatic offset calculation for multiple axes on same side (70px spacing)

### Persistence
- Axes configuration saved in chart metadata via `extractConfig()`/`applyConfig()`
- Structure in saved chart JSON:
  ```json
  {
    "version": 1,
    "tags": [
      {
        "tag_id": 123,
        "yAxisId": "default",
        ...
      }
    ],
    "axes": [
      {
        "id": "default",
        "label": "Value",
        "orientation": "left",
        "domain": ["auto", "auto"]
      }
    ]
  }
  ```

### Default Behavior
- Every chart starts with a 'default' axis (left-aligned, auto-scaled)
- All tags are assigned to 'default' axis unless explicitly changed
- 'default' axis cannot be deleted

## Usage Guide

### Creating Multiple Axes

1. Open a saved chart or load tags
2. Click "Manage…" button to open Chart Options
3. Navigate to "Axes & Scaling" tab
4. Click "+ Add Y Axis" button
5. Configure the new axis:
   - Set a descriptive label (e.g., "Temperature", "Pressure")
   - Choose position (left or right)
   - Set min/max values (use "auto" for automatic scaling or enter numeric values)

### Assigning Tags to Axes

1. In the "Tag Axis Assignment" section, find your tag
2. Use the dropdown to select which axis the tag should use
3. The tag will now be scaled according to that axis's domain

### Use Cases

**Example 1: Temperature & Humidity**
- Axis 1 (left): Temperature (0-100°C)
- Axis 2 (right): Humidity (0-100%)

**Example 2: Different Scales**
- Axis 1 (left): Pressure (0-1000 PSI, fixed range)
- Axis 2 (right): Flow Rate (auto-scale based on data)

**Example 3: Multiple Zones**
- Axis 1 (left): Zone 1 sensors (auto)
- Axis 2 (right): Zone 2 sensors (auto)

## Technical Notes

### Files Modified
- `/front/src/pages/ChartComposer.jsx` - Chart composer page with axes state
- `/front/src/components/chartComposer/ChartConfigPanel.jsx` - Preferences panel with "Axes & Scaling" tab
- `/front/src/components/chartComposer/ChartRenderer.jsx` - ECharts renderer with multi-axis support
- `/front/src/contexts/ChartComposerContext.jsx` - Context managing axes configuration
- `/front/src/components/chartComposer/SaveChartButton.jsx` - Persists axes configuration

### ECharts Integration
Uses Apache ECharts' canvas-based multi-axis support for optimal performance:
```javascript
yAxis: [
  {
    id: 'axis1',
    position: 'left',
    offset: 0,
    nameLocation: 'inside',
    nameGap: 25,
    ...
  },
  {
    id: 'axis2', 
    position: 'right',
    offset: 70,
    ...
  }
]
```

### New Axis Properties (Added October 2025)
- **offset**: Manual positioning offset in pixels (auto-calculated by default)
- **nameLocation**: 'inside' (opposite side from numbers) or 'outside' (same side as numbers)
- **nameGap**: Distance of axis name from axis line in pixels

### Performance
- Canvas-based rendering provides 80-90% better CPU performance with large datasets (7k+ points)
- Single canvas element vs 30k-50k DOM nodes with previous SVG implementation
- See [ECharts Migration](echarts-migration-completed.md) for details

### Zoom Behavior
- Independent zoom/pan per axis supported
- X-axis zoom controls time range
- Y-axis zoom respects per-axis domains

## Future Enhancements
- [x] Per-axis positioning controls (offset) - ✅ Implemented
- [x] Axis name placement options - ✅ Implemented  
- [ ] Axis color coding to match assigned tags
- [ ] Quick presets (e.g., "Temperature Scale", "Percentage Scale")
- [ ] Visual indication of which tags use which axis in the chart
