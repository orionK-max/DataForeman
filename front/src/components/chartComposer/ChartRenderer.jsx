import React from 'react';
import { Card, CardContent, Box, CircularProgress, Typography, IconButton, Stack, Tooltip, Switch, FormControlLabel, TextField, MenuItem, useTheme } from '@mui/material';
import { ZoomIn, ZoomOut, RestartAlt, Settings, DashboardCustomize } from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';
import ChartConfigPanel from './ChartConfigPanel';
import { useChartComposer } from '../../contexts/ChartComposerContext';

const ChartRenderer = ({ 
  data = [], 
  tagConfigs = [], 
  axes = [],
  referenceLines = [],
  grid = { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' },
  background = { color: '#000000', opacity: 1 },
  display = { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
  height = 360,
  loading = false,
  compactMode = false,
  requestedTimeRange = null, // { from, to } - the requested time range to show on x-axis
  options = {}, // Chart options including xAxisTickCount
  // Props for write-on-change support (can be passed or use context)
  tagMetadata: tagMetadataProp = null,
  lastValuesBefore: lastValuesBeforeProp = null,
  // Callbacks and controls (matching ChartRenderer.jsx)
  onZoomChange = null,
  hasUnsavedChanges = false,
  saveButton = null,
  updateTagConfig = null,
  autoRefreshEnabled = false,
  onToggleAutoRefresh = null,
  refreshIntervalValue = 5,
  onRefreshIntervalChange = null,
  customRefreshInterval = 5,
  onCustomRefreshIntervalChange = null,
  showPreferencesButton = true,
  timeModeBadge = null,
  updateAxis = null,
  addAxis = null,
  removeAxis = null,
  addReferenceLine = null,
  updateReferenceLine = null,
  removeReferenceLine = null,
  updateGridConfig = null,
  updateBackgroundConfig = null,
  updateDisplayConfig = null,
  updateChartConfig = null,
  onPreferencesClose = null,
  onResetZoom = null,
  onToggleCompactMode = null,
}) => {
  // Get MUI theme for background color
  const theme = useTheme();
  
  // Get context for shouldOpenPreferences flag and metadata (if not passed as props)
  // This may be null if component is used outside ChartComposerProvider (e.g., in Dashboard)
  const context = useChartComposer();
  const { 
    shouldOpenPreferences, 
    setShouldOpenPreferences, 
    tagMetadata: tagMetadataContext, 
    lastValuesBefore: lastValuesBeforeContext 
  } = context || {};
  
  // Use props if provided, otherwise fall back to context
  const tagMetadata = tagMetadataProp || tagMetadataContext;
  const lastValuesBefore = lastValuesBeforeProp || lastValuesBeforeContext;
  
  // Preferences overlay state
  const [showPreferences, setShowPreferences] = React.useState(false);
  const previousShowPreferences = React.useRef(showPreferences);
  
  // Crosshair state
  const [crosshairEnabled, setCrosshairEnabled] = React.useState(false);
  const [crosshairPosition, setCrosshairPosition] = React.useState(null); // { x, y, time, values }
  
  // ECharts instance reference
  const chartRef = React.useRef(null);
  
  // Persistent storage for last heartbeat values for write-on-change tags
  // Structure: { tagId: { value, originalTime, heartbeatInterval } }
  const persistedHeartbeats = React.useRef({});
  
  // Watch for shouldOpenPreferences flag and open preferences panel
  React.useEffect(() => {
    if (shouldOpenPreferences && setShouldOpenPreferences) {
      setShowPreferences(true);
      setShouldOpenPreferences(false); // Reset the flag
    }
  }, [shouldOpenPreferences, setShouldOpenPreferences]);
  
  // Trigger callback when preferences close
  React.useEffect(() => {
    if (previousShowPreferences.current === true && showPreferences === false) {
      if (onPreferencesClose) {
        onPreferencesClose();
      }
    }
    previousShowPreferences.current = showPreferences;
  }, [showPreferences, onPreferencesClose]);
  
  // Helper: Format time mode badge text
  const formatTimeModeBadge = (mode, duration, offset) => {
    const formatDuration = (ms) => {
      const seconds = ms / 1000;
      const minutes = seconds / 60;
      const hours = minutes / 60;
      const days = hours / 24;
      
      if (days >= 1) return `${Math.round(days)} day${Math.round(days) !== 1 ? 's' : ''}`;
      if (hours >= 1) return `${Math.round(hours)} hour${Math.round(hours) !== 1 ? 's' : ''}`;
      if (minutes >= 1) return `${Math.round(minutes)} min${Math.round(minutes) !== 1 ? 's' : ''}`;
      return `${Math.round(seconds)} sec${Math.round(seconds) !== 1 ? 's' : ''}`;
    };
    
    if (mode === 'rolling') {
      return `Rolling - Last ${formatDuration(duration)}`;
    } else if (mode === 'shifted') {
      const delayText = offset > 0 ? ` - Delayed ${formatDuration(offset)}` : '';
      return `Shifted - ${formatDuration(duration)}${delayText}`;
    }
    return 'Fixed Time Range';
  };
  
  // Zoom handlers
  const handleZoomIn = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      instance.dispatchAction({
        type: 'dataZoom',
        start: 25,
        end: 75
      });
    }
  };
  
  const handleZoomOut = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      instance.dispatchAction({
        type: 'dataZoom',
        start: 0,
        end: 100
      });
    }
  };
  
  // Crosshair click handler
  const handleChartClick = React.useCallback((event) => {
    if (!crosshairEnabled) return;
    
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    
    // Get the chart's DOM element and its position
    const chartDom = instance.getDom();
    const chartRect = chartDom.getBoundingClientRect();
    
    // Calculate position relative to chart
    const x = event.clientX - chartRect.left;
    const y = event.clientY - chartRect.top;
    
    // Convert pixel coordinates to data coordinates
    const pointInGrid = instance.convertFromPixel({ seriesIndex: 0 }, [x, y]);
    if (!pointInGrid) return;
    
    const [timestamp, _value] = pointInGrid;
    
    // Get values for all visible series at this timestamp
    const option = instance.getOption();
    const series = option.series || [];
    const values = {};
    
    series.forEach((s, index) => {
      if (s.data && Array.isArray(s.data)) {
        // Find closest data point
        let closest = null;
        let minDiff = Infinity;
        
        s.data.forEach(point => {
          if (Array.isArray(point) && point.length >= 2) {
            const diff = Math.abs(point[0] - timestamp);
            if (diff < minDiff) {
              minDiff = diff;
              closest = point;
            }
          }
        });
        
        if (closest && closest[1] != null) {
          const yAxisIndex = s.yAxisIndex || 0;
          const axisId = `axis-${yAxisIndex}`;
          values[axisId] = closest[1];
        }
      }
    });
    
    setCrosshairPosition({ x, y, time: timestamp, values });
  }, [crosshairEnabled]);
  
  const handleResetZoom = () => {
    if (onResetZoom) {
      onResetZoom();
    }
  };
  // Helper: Convert dash pattern to ECharts line type
  const getDashType = (dashPattern) => {
    if (!dashPattern || dashPattern === '0' || dashPattern === 'solid') return 'solid';
    if (dashPattern === 'dashed' || dashPattern === '8 4') return 'dashed';
    if (dashPattern === 'dotted' || dashPattern === '2 2') return 'dotted';
    if (dashPattern === 'dash-dot') return [8, 4, 2, 4]; // Custom pattern
    
    // Try parsing space-delimited pattern (e.g., "5 3")
    const parts = String(dashPattern).trim().split(/\s+/);
    const numbers = parts.map(p => parseInt(p, 10)).filter(n => Number.isFinite(n) && n >= 1);
    if (numbers.length > 0) {
      return numbers; // ECharts accepts array of numbers
    }
    
    return 'solid';
  };

  // Helper: Map interpolation types to ECharts properties
  const getInterpolationConfig = (interpolation) => {
    const type = interpolation || 'linear';
    
    // ECharts supports:
    // - smooth: boolean (for smooth curves)
    // - step: 'start' | 'middle' | 'end' (for step lines)
    
    switch (type) {
      case 'monotone':
        return { smooth: true, step: false };
      
      case 'step':
      case 'stepBefore':
        return { smooth: false, step: 'start' };
      
      case 'stepAfter':
        return { smooth: false, step: 'end' };
      
      case 'linear':
      default:
        return { smooth: false, step: false };
    }
  };

  // Transform data to ECharts format
  const echartsData = React.useMemo(() => {
    if (!data || data.length === 0) {
      return { series: [], axisIndexMap: new Map() };
    }
    
    // Build axis index map from axes config
    const axesArray = Array.isArray(axes) && axes.length > 0 ? axes : [
      { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
    ];
    
    const axisIndexMap = new Map();
    axesArray.forEach((axis, index) => {
      axisIndexMap.set(axis.id, index);
    });
    
    // Group data by tag
    const tagDataMap = new Map();
    
    data.forEach(point => {
      const tagId = String(point.tag_id);
      const time = new Date(point.ts).getTime();
      const value = Number(point.v);
      
      if (!Number.isFinite(value) || !Number.isFinite(time)) return;
      
      if (!tagDataMap.has(tagId)) {
        tagDataMap.set(tagId, new Map());
      }
      
      tagDataMap.get(tagId).set(time, value);
    });
    
    // Helper: Fill gaps for write-on-change tags (updated 2025-10-23)
    // Persists last heartbeat and keeps it anchored at query start (left edge)
    const fillWriteOnChangeGaps = (tagId, tagData) => {
      const meta = tagMetadata?.[tagId];
      
      if (!meta?.on_change_enabled) {
        // Not a write-on-change tag - return data as-is, sorted by timestamp
        const timestamps = Array.from(tagData.keys()).sort((a, b) => a - b);
        return timestamps.map(time => [time, tagData.get(time)]);
      }
      
      const now = Date.now();
      const queryStartTime = requestedTimeRange ? new Date(requestedTimeRange.from).getTime() : (now - 3600000);
      const queryEndTime = requestedTimeRange ? new Date(requestedTimeRange.to).getTime() : now;
      // Support both heartbeat_interval (seconds) and on_change_heartbeat_ms (milliseconds)
      const heartbeatMs = meta.on_change_heartbeat_ms || (meta.heartbeat_interval * 1000) || 60000;
      const heartbeatInterval = heartbeatMs; // Already in milliseconds
      
      // Get all timestamps from this tag's data within query window, sorted
      const timestamps = Array.from(tagData.keys()).sort((a, b) => a - b);
      
      const result = [];
      let persistedHeartbeat = persistedHeartbeats.current[tagId];
      
      // Update persisted heartbeat with new data from query
      if (timestamps.length > 0) {
        // Get the last (most recent) heartbeat from current query data
        const lastTimestamp = timestamps[timestamps.length - 1];
        const lastValue = tagData.get(lastTimestamp);
        
        // Update persisted heartbeat
        persistedHeartbeat = {
          value: lastValue,
          originalTime: lastTimestamp,
          heartbeatInterval: heartbeatInterval
        };
        persistedHeartbeats.current[tagId] = persistedHeartbeat;
      } else if (!persistedHeartbeat && lastValuesBefore?.[tagId]) {
        // No data in query, but we have lastValuesBefore - initialize persisted heartbeat
        const lastValBefore = lastValuesBefore[tagId];
        const lastTime = new Date(lastValBefore.ts).getTime();
        const lastValue = Number(lastValBefore.v);
        
        persistedHeartbeat = {
          value: lastValue,
          originalTime: lastTime,
          heartbeatInterval: heartbeatInterval
        };
        persistedHeartbeats.current[tagId] = persistedHeartbeat;
      }
      
      // Check if persisted heartbeat has expired
      if (persistedHeartbeat) {
        const age = now - persistedHeartbeat.originalTime;
        if (age > persistedHeartbeat.heartbeatInterval) {
          delete persistedHeartbeats.current[tagId];
          persistedHeartbeat = null;
        }
      }
      
      // Strategy: Always show horizontal line for persisted heartbeat (sliding window)
      // This ensures the line appears at the left edge and slides with the window in Live mode
      
      if (persistedHeartbeat) {
        // We have a valid persisted heartbeat - create horizontal line across entire visible range
        // Add horizontal line from query start (left edge) to query end (right edge)
        result.push([queryStartTime, persistedHeartbeat.value]);
        
        // Add all actual data points from current query (if any)
        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];
          const value = tagData.get(time);
          result.push([time, value]);
        }
        
        // Extend to query end (right edge)
        result.push([queryEndTime, persistedHeartbeat.value]);
      } else if (timestamps.length > 0) {
        // No persisted heartbeat, but we have data - render it normally
        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];
          const value = tagData.get(time);
          result.push([time, value]);
        }
        
        // Extend last point to query end (right edge)
        const lastValue = result[result.length - 1][1];
        result.push([queryEndTime, lastValue]);
      }
      
      return result;
    };
    
    // Build series for each tag (excluding hidden)
    const series = tagConfigs
      .filter(tag => !tag.hidden)
      .map(tagConfig => {
        const tagId = String(tagConfig.tag_id);
        const tagData = tagDataMap.get(tagId) || new Map();
        
        // Apply write-on-change gap filling
        const values = fillWriteOnChangeGaps(tagId, tagData);
        
        // Get axis index for this tag
        const axisId = tagConfig.axisId || 'default';
        const yAxisIndex = axisIndexMap.get(axisId) ?? 0;
        
        // Get interpolation configuration
        const interpolationConfig = getInterpolationConfig(tagConfig.interpolation);
        
        return {
          name: tagConfig.alias || tagConfig.tag_name || tagConfig.name || `Tag ${tagConfig.tag_id}`,
          type: 'line',
          data: values,
          smooth: interpolationConfig.smooth,
          step: interpolationConfig.step,
          showSymbol: false,
          lineStyle: {
            color: tagConfig.color || '#3b82f6',
            width: tagConfig.thickness || 2,
            type: getDashType(tagConfig.strokeType || 'solid'),
          },
          itemStyle: {
            color: tagConfig.color || '#3b82f6',
          },
          connectNulls: false, // Changed to false so gaps beyond heartbeat show as breaks
          yAxisIndex: yAxisIndex,
        };
      });
    
    return { series, axisIndexMap };
  }, [data, tagConfigs, axes, tagMetadata, lastValuesBefore]);

  // Build ECharts option
  const option = React.useMemo(() => {
    const hasData = echartsData.series.length > 0;
    
    // Build Y-axes from axes config
    const axesArray = Array.isArray(axes) && axes.length > 0 ? axes : [
      { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
    ];
    
    const yAxisConfig = axesArray.map((axis, index) => {
      // Find tags using this axis (for label)
      const tagsOnAxis = tagConfigs.filter(tag => 
        (tag.axisId || 'default') === axis.id && !tag.hidden
      );
      
      // Build label from tag names
      let labelText = axis.label || 'Value';
      if (!compactMode && tagsOnAxis.length > 0) {
        labelText = tagsOnAxis
          .map(tag => tag.alias || tag.name || `Tag ${tag.tag_id}`)
          .join(', ');
      }
      
      // Calculate offset - use manual offset if provided, otherwise auto-calculate
      const position = axis.orientation === 'right' ? 'right' : 'left';
      let offset = 0;
      
      if (axis.offset != null && axis.offset !== undefined) {
        // Use manual offset from axis configuration
        offset = axis.offset;
      } else {
        // Auto-calculate offset based on how many axes are on the same side
        const axesOnSameSide = axesArray.filter((a, i) => 
          i < index && (a.orientation === 'right' ? 'right' : 'left') === position
        );
        offset = axesOnSameSide.length * 70; // 70px offset per axis
      }
      
      // Handle domain (min/max)
      const domain = Array.isArray(axis.domain) ? axis.domain : ['auto', 'auto'];
      
      // Determine name location based on axis configuration
      // 'inside' = name appears on opposite side from numbers (inside chart area)
      // 'outside' = name appears on same side as numbers (outside chart area)  
      const nameLocation = axis.nameLocation || 'inside';
      const nameGap = axis.nameGap ?? 25; // Distance from axis line
      
      // Calculate effective name gap
      // Positive gap = name moves away from axis in the natural direction
      // For left axis: positive = moves left (outside), negative = moves right (inside)
      // For right axis: positive = moves right (outside), negative = moves left (inside)
      let effectiveNameGap = nameGap;
      if (nameLocation === 'inside') {
        // Negative gap to push name to opposite side (inside chart)
        effectiveNameGap = -Math.abs(nameGap);
      } else {
        // Positive gap to keep name on same side (outside chart)
        effectiveNameGap = Math.abs(nameGap);
      }
      
      const axisConfig = {
        type: 'value',
        name: compactMode ? '' : labelText,
        nameLocation: 'middle', // Always vertically centered
        nameGap: effectiveNameGap,
        nameRotate: 90, // Vertical text
        nameTextStyle: {
          color: '#999',
          fontSize: 12,
        },
        position: position,
        offset: offset,
        axisPointer: {
          show: true,
        },
        axisLabel: {
          color: '#999',
          formatter: (value) => {
            // Format large numbers compactly
            const absValue = Math.abs(value);
            if (absValue >= 1000000000) {
              return (value / 1000000000).toFixed(1) + 'B';
            } else if (absValue >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M';
            } else if (absValue >= 1000) {
              return (value / 1000).toFixed(1) + 'K';
            }
            return value.toFixed(0);
          }
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: '#666',
          },
        },
        splitLine: {
          lineStyle: {
            color: grid.color || '#333',
            opacity: grid.opacity ?? 0.3,
            width: grid.thickness || 1,
            type: getDashType(grid.dash),
          },
        },
      };
      
      // Apply min/max from domain if not 'auto'
      if (domain[0] !== 'auto' && domain[0] != null) {
        const minVal = Number(domain[0]);
        if (Number.isFinite(minVal)) {
          axisConfig.min = minVal;
        }
      }
      if (domain[1] !== 'auto' && domain[1] != null) {
        const maxVal = Number(domain[1]);
        if (Number.isFinite(maxVal)) {
          axisConfig.max = maxVal;
        }
      }
      
      return axisConfig;
    });
    
    // Build reference lines and add as markLine to series
    const processedSeries = echartsData.series.map((series, seriesIndex) => {
      // Find which axis this series uses
      const seriesAxisIndex = series.yAxisIndex;
      
      // Find reference lines for this axis
      const axisId = axesArray[seriesAxisIndex]?.id || 'default';
      const linesForThisSeries = referenceLines.filter(line => {
        const lineAxisId = line.yAxisId || 'default';
        const isValid = lineAxisId === axisId && Number.isFinite(line.value);
        return isValid;
      });
      
      // Add markLine only to first series of each axis (to avoid duplicates)
      const isFirstSeriesForAxis = echartsData.series
        .slice(0, seriesIndex)
        .every(s => s.yAxisIndex !== seriesAxisIndex);
      
      if (isFirstSeriesForAxis && linesForThisSeries.length > 0) {
        return {
          ...series,
          markLine: {
            symbol: 'none',
            silent: false,
            animation: false,
            label: {
              show: true,
              position: 'end',
              formatter: '{b}',
              color: '#fff',
            },
            lineStyle: {
              type: 'solid',
            },
            data: linesForThisSeries.map(line => ({
              name: line.label || '',
              yAxis: line.value,
              lineStyle: {
                color: line.color || '#ff0000',
                width: line.lineWidth || 1,
                type: getDashType(line.lineStyle || 'solid'),
              },
              label: {
                show: !!line.label,
                formatter: line.label || '',
                color: line.color || '#ff0000',
                fontSize: 12,
              },
            })),
          },
        };
      }
      
      return series;
    });
    
    // If there are reference lines but no series, we need to add them differently
    // This handles the case where all series might be hidden but ref lines should still show
    if (referenceLines.length > 0 && processedSeries.length === 0) {
      // Add invisible dummy series for each axis that has reference lines
      const axesWithLines = new Set(referenceLines.map(l => l.yAxisId || 'default'));
      axesWithLines.forEach(axisId => {
        const axisIndex = echartsData.axisIndexMap.get(axisId) ?? 0;
        const linesForAxis = referenceLines.filter(l => (l.yAxisId || 'default') === axisId);
        
        if (linesForAxis.length > 0) {
          processedSeries.push({
            name: '_refline_dummy_' + axisId,
            type: 'line',
            data: [],
            yAxisIndex: axisIndex,
            showSymbol: false,
            lineStyle: { opacity: 0 },
            markLine: {
              symbol: 'none',
              silent: false,
              animation: false,
              label: {
                show: true,
                position: 'end',
                formatter: '{b}',
                color: '#fff',
              },
              data: linesForAxis.map(line => ({
                name: line.label || '',
                yAxis: line.value,
                lineStyle: {
                  color: line.color || '#ff0000',
                  width: line.lineWidth || 1,
                  type: getDashType(line.lineStyle || 'solid'),
                },
                label: {
                  show: !!line.label,
                  formatter: line.label || '',
                  color: line.color || '#ff0000',
                  fontSize: 12,
                },
              })),
            },
          });
        }
      });
    }
    
    // Calculate grid margins based on axes with offsets
    const leftAxes = yAxisConfig.filter(axis => axis.position === 'left');
    const rightAxes = yAxisConfig.filter(axis => axis.position === 'right');
    
    // Find max offset on each side and add space for labels (60px base)
    const maxLeftOffset = leftAxes.length > 0 
      ? Math.max(...leftAxes.map(a => a.offset || 0)) + 60 
      : 60;
    const maxRightOffset = rightAxes.length > 0 
      ? Math.max(...rightAxes.map(a => a.offset || 0)) + 60 
      : 60;
    
    // Use theme background color if background is transparent or black (default)
    const bgColor = background.color === 'transparent' || background.color === '#000000' || !background.color
      ? theme.palette.background.paper
      : background.color;
    
    return {
      backgroundColor: bgColor,
      animation: false,
      grid: {
        left: maxLeftOffset,
        right: maxRightOffset,
        top: compactMode ? 20 : 40,
        bottom: compactMode ? 40 : 100,
        containLabel: false, // Must be false to respect custom offsets
      },
      tooltip: {
        trigger: display.showTooltip !== false ? 'axis' : 'none',
        axisPointer: {
          type: 'line', // Always use line, custom crosshair is rendered separately
          lineStyle: {
            color: '#999',
            type: 'dashed'
          }
        },
        formatter: (params) => {
          if (!params || params.length === 0) return '';
          
          // Get time from first param
          const time = params[0].value[0];
          const date = new Date(time);
          const timeStr = date.toLocaleTimeString();
          const ms = date.getMilliseconds().toString().padStart(3, '0');
          
          // Display time header
          let html = `<div style="font-weight: 600; margin-bottom: 4px;">${timeStr}.${ms}</div>`;
          
          // Track unique series to avoid duplicates
          const uniqueSeries = new Map();
          
          // Only show series data (vertical axis values), filter out any non-series data
          params.forEach(param => {
            // Only show if it's a series with actual data value
            if (param.componentType === 'series' && param.value && param.value[1] !== null && param.value[1] !== undefined) {
              const seriesName = param.seriesName;
              const value = param.value[1];
              
              // Only add if we haven't seen this series yet, or update with latest value
              if (!uniqueSeries.has(seriesName)) {
                uniqueSeries.set(seriesName, {
                  color: param.color,
                  value: value
                });
              }
            }
          });
          
          // Render unique series
          uniqueSeries.forEach((data, seriesName) => {
            html += `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${data.color};"></span>
                <span>${seriesName}: <strong>${data.value.toFixed(2)}</strong></span>
              </div>
            `;
          });
          
          return html;
        }
      },
      legend: {
        show: display.showLegend !== false && !compactMode,
        bottom: 0,
        type: 'scroll',
        textStyle: {
          color: '#fff',
        },
        pageTextStyle: {
          color: '#fff',
        },
      },
      xAxis: (() => {
        // Calculate minInterval dynamically based on time range and tick count
        let minInterval = 1000; // Default 1 second
        if (requestedTimeRange) {
          const timeRangeMs = new Date(requestedTimeRange.to).getTime() - new Date(requestedTimeRange.from).getTime();
          const tickCount = options?.xAxisTickCount ?? 5;
          // Calculate the interval per tick, then set minInterval to 1/10th of that to allow flexibility
          const intervalPerTick = timeRangeMs / tickCount;
          minInterval = Math.max(1000, intervalPerTick / 10); // At least 1 second
        }
        
        return {
          type: 'time',
          min: requestedTimeRange ? new Date(requestedTimeRange.from).getTime() : 'dataMin',
          max: requestedTimeRange ? new Date(requestedTimeRange.to).getTime() : 'dataMax',
          boundaryGap: false,
          axisPointer: {
            show: true,
            snap: true,
          },
          axisLabel: {
            formatter: (value) => {
              const date = new Date(value);
              // Use compact format: HH:MM:SS without AM/PM for better readability
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              const seconds = date.getSeconds().toString().padStart(2, '0');
              return `${hours}:${minutes}:${seconds}`;
            },
            color: '#999',
            rotate: 0, // Keep labels horizontal for better readability
          },
          splitNumber: options?.xAxisTickCount ?? 5, // Number of X-axis ticks (configurable, default 5)
          minInterval: minInterval, // Dynamically calculated minimum interval between ticks
          axisLine: {
            lineStyle: {
              color: '#666',
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: grid.color || '#333',
              opacity: grid.opacity ?? 0.3,
              width: grid.thickness || 1,
              type: getDashType(grid.dash),
            },
          },
        };
      })(),
      yAxis: yAxisConfig,
      series: processedSeries,
      dataZoom: [
        {
          type: 'inside',
          start: requestedTimeRange ? 0 : undefined,
          end: requestedTimeRange ? 100 : undefined,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        {
          type: 'slider',
          show: !compactMode,
          start: requestedTimeRange ? 0 : undefined,
          end: requestedTimeRange ? 100 : undefined,
          height: 20,
          bottom: compactMode ? 5 : 45,
          handleIcon: 'path://M10.7,11.9H9.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4h1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z',
          handleSize: '80%',
          handleStyle: {
            color: '#fff',
            shadowBlur: 3,
            shadowColor: 'rgba(0, 0, 0, 0.6)',
            shadowOffsetX: 2,
            shadowOffsetY: 2
          },
          textStyle: {
            color: '#999',
          },
          borderColor: '#666',
        },
      ],
    };
  }, [echartsData, compactMode, axes, tagConfigs, grid, background, display, referenceLines, requestedTimeRange, getDashType, theme]);

  // Loading state
  if (loading) {
    return (
      <Card sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={40} />
            <Typography variant="body1" color="text.secondary">
              Retrieving data, please wait...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
              Large datasets may take a few moments to load
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Check if we have no data
  const hasNoData = !data || data.length === 0;

  return (
    <Card sx={{ 
      height, 
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative',
      ...(compactMode && {
        border: 'none',
        boxShadow: 'none',
        borderRadius: 0,
      })
    }}>
      {/* Compact Mode Toggle - Always visible as floating button */}
      {onToggleCompactMode && (
        <Tooltip title={compactMode ? "Exit Compact Mode" : "Compact Mode"}>
          <IconButton 
            size="small" 
            onClick={onToggleCompactMode}
            color={compactMode ? "primary" : "default"}
            sx={{
              position: 'absolute',
              top: 60,
              left: 15,
              zIndex: 1100,
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': {
                bgcolor: 'background.paper',
                boxShadow: 2,
              }
            }}
          >
            <DashboardCustomize fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      
      <CardContent sx={{ flex: 1, p: compactMode ? 0 : 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Controls Bar - Always visible (unless in compact mode) */}
        {!compactMode && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
          {/* Left side - Settings button + Live controls */}
          <Stack direction="row" spacing={1} alignItems="center">
            {showPreferencesButton && (
              <Tooltip title="Chart Preferences">
                <IconButton 
                  size="small" 
                  onClick={() => setShowPreferences(!showPreferences)}
                  sx={{ 
                    color: showPreferences ? 'primary.main' : 'inherit',
                    bgcolor: showPreferences ? 'action.selected' : 'transparent'
                  }}
                >
                  <Settings fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {/* Crosshair Toggle */}
            {!showPreferences && (
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={crosshairEnabled}
                    onChange={(e) => setCrosshairEnabled(e.target.checked)}
                  />
                }
                label="Crosshair"
                sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
            )}

            {/* Live Toggle and Interval - Only show when not in preferences mode */}
            {!showPreferences && onToggleAutoRefresh && (
              <>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={autoRefreshEnabled}
                      onChange={(e) => onToggleAutoRefresh(e.target.checked)}
                    />
                  }
                  label="Live"
                  sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                />
                {autoRefreshEnabled && onRefreshIntervalChange && (
                  <>
                    <TextField
                      select
                      value={refreshIntervalValue}
                      onChange={(e) => onRefreshIntervalChange(e.target.value)}
                      size="small"
                      sx={{ 
                        minWidth: 80,
                        '& .MuiInputBase-root': { fontSize: '0.8125rem' },
                        '& .MuiInputBase-input': { py: 0.5 }
                      }}
                    >
                      <MenuItem value={'auto'} sx={{ fontSize: '0.8125rem' }}>Auto</MenuItem>
                      <MenuItem value={0.5} sx={{ fontSize: '0.8125rem' }}>0.5s</MenuItem>
                      <MenuItem value={1} sx={{ fontSize: '0.8125rem' }}>1s</MenuItem>
                      <MenuItem value={5} sx={{ fontSize: '0.8125rem' }}>5s</MenuItem>
                      <MenuItem value={'custom'} sx={{ fontSize: '0.8125rem' }}>Custom</MenuItem>
                    </TextField>
                    {refreshIntervalValue === 'custom' && onCustomRefreshIntervalChange && (
                      <TextField
                        label="Seconds"
                        type="number"
                        value={customRefreshInterval}
                        onChange={(e) => onCustomRefreshIntervalChange(parseFloat(e.target.value))}
                        size="small"
                        inputProps={{ min: 0.1, step: 0.1 }}
                        sx={{ 
                          width: 80,
                          '& .MuiInputBase-root': { fontSize: '0.8125rem' },
                          '& .MuiInputBase-input': { py: 0.5 },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem' }
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </Stack>

          {/* Right side controls */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            {/* Save button - Show when changes pending and not in preferences mode */}
            {hasUnsavedChanges && !showPreferences && saveButton}
            
            {/* Zoom Controls - Only show when not in preferences mode */}
            {!showPreferences && (
              <>
                <Tooltip title="Zoom In">
                  <IconButton size="small" onClick={handleZoomIn}>
                    <ZoomIn fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Zoom Out">
                  <IconButton size="small" onClick={handleZoomOut}>
                    <ZoomOut fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reset Zoom & Re-query">
                  <IconButton size="small" onClick={handleResetZoom}>
                    <RestartAlt fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
        </Box>
        )}

        {/* Chart or Preferences Panel */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {showPreferences ? (
            /* Preferences Panel - fits in chart space */
            <Box sx={{ height: '100%', overflow: 'auto' }}>
              <ChartConfigPanel 
                compact={true}
                saveButton={saveButton}
                chartConfig={{
                  tagConfigs,
                  axes,
                  referenceLines,
                  grid,
                  background,
                  display,
                  xAxisTickCount: options?.xAxisTickCount ?? 5
                }}
                onUpdateTagConfig={updateTagConfig}
                onUpdateAxis={updateAxis}
                onAddAxis={addAxis}
                onRemoveAxis={removeAxis}
                onAddReferenceLine={addReferenceLine}
                onUpdateReferenceLine={updateReferenceLine}
                onRemoveReferenceLine={removeReferenceLine}
                onUpdateGridConfig={updateGridConfig}
                onUpdateBackgroundConfig={updateBackgroundConfig}
                onUpdateDisplayConfig={updateDisplayConfig}
                onUpdateChartConfig={updateChartConfig}
              />
            </Box>
          ) : (
            /* Chart */
            <>
              {/* Chart or No Data Message */}
              <Box 
                sx={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}
                onClick={handleChartClick}
              >
                {hasNoData ? (
                  /* No data message */
                  <Box sx={{ 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <Typography variant="body1" color="text.secondary">
                      No data to display. Query data to see the chart.
                    </Typography>
                  </Box>
                ) : (
                  /* Chart */
                  <ReactECharts
                    ref={chartRef}
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge={false}
                    lazyUpdate={true}
                  />
                )}
                
                {/* Crosshair overlay */}
                {crosshairEnabled && crosshairPosition && (
                  <Box sx={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    pointerEvents: 'none',
                    zIndex: 1000
                  }}>
                    {/* Vertical line */}
                    <Box sx={{
                      position: 'absolute',
                      left: `${crosshairPosition.x}px`,
                      top: 0,
                      bottom: 0,
                      width: `${display.crosshairThickness || 1}px`,
                      bgcolor: display.crosshairColor || '#00ff00',
                      opacity: display.crosshairOpacity ?? 0.7,
                      ...(display.crosshairPattern && display.crosshairPattern !== '0' && {
                        backgroundImage: `repeating-linear-gradient(0deg, ${display.crosshairColor || '#00ff00'} 0px, ${display.crosshairColor || '#00ff00'} ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${(parseInt(display.crosshairPattern.split(' ')[0] || 5) + parseInt(display.crosshairPattern.split(' ')[1] || 5))}px)`,
                        bgcolor: 'transparent'
                      })
                    }} />
                    
                    {/* Horizontal line */}
                    <Box sx={{
                      position: 'absolute',
                      top: `${crosshairPosition.y}px`,
                      left: 0,
                      right: 0,
                      height: `${display.crosshairThickness || 1}px`,
                      bgcolor: display.crosshairColor || '#00ff00',
                      opacity: display.crosshairOpacity ?? 0.7,
                      ...(display.crosshairPattern && display.crosshairPattern !== '0' && {
                        backgroundImage: `repeating-linear-gradient(90deg, ${display.crosshairColor || '#00ff00'} 0px, ${display.crosshairColor || '#00ff00'} ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${(parseInt(display.crosshairPattern.split(' ')[0] || 5) + parseInt(display.crosshairPattern.split(' ')[1] || 5))}px)`,
                        bgcolor: 'transparent'
                      })
                    }} />
                    
                    {/* Time label */}
                    <Box sx={{
                      position: 'absolute',
                      left: `${crosshairPosition.x}px`,
                      bottom: 80,
                      transform: 'translateX(-50%)',
                      bgcolor: 'rgba(0, 0, 0, 0.7)',
                      color: display.crosshairColor || '#00ff00',
                      px: 1,
                      py: 0.5,
                      borderRadius: 0.5,
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {new Date(crosshairPosition.time).toLocaleTimeString()}.{new Date(crosshairPosition.time).getMilliseconds().toString().padStart(3, '0')}
                    </Box>
                    
                    {/* Y-axis values labels */}
                    {Object.entries(crosshairPosition.values).map(([axisId, value], index) => {
                      const isLeft = index % 2 === 0; // Alternate left/right for multiple axes
                      return (
                        <Box key={axisId} sx={{
                          position: 'absolute',
                          left: isLeft ? 0 : 'auto',
                          right: isLeft ? 'auto' : 0,
                          top: `${crosshairPosition.y}px`,
                          transform: 'translateY(-50%)',
                          bgcolor: 'rgba(0, 0, 0, 0.7)',
                          color: display.crosshairColor || '#00ff00',
                          px: 1,
                          py: 0.5,
                          borderRadius: 0.5,
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}>
                          {value.toFixed(2)}
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ChartRenderer;
