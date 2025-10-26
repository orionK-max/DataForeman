import React from 'react';
import { Card, CardContent, Box, IconButton, Stack, Tooltip, Switch, FormControlLabel, TextField, MenuItem, Chip, CircularProgress, Typography } from '@mui/material';
import { ZoomIn, ZoomOut, RestartAlt, Settings, DashboardCustomize } from '@mui/icons-material';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { chartsGridClasses } from '@mui/x-charts/ChartsGrid';
import ChartConfigPanel from './ChartConfigPanel';

const ChartRenderer = ({ 
  data = [], 
  tagConfigs = [], 
  axes = [], 
  referenceLines = [], 
  grid = { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' },
  background = { color: '#000000', opacity: 1 },
  display = { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
  height = 360,
  loading = false, // Whether data is currently being loaded
  onZoomChange = null, // Callback when zoom changes: (xDomain, yDomains) => {}
  hasUnsavedChanges = false, // Whether there are unsaved changes
  saveButton = null, // Optional save button component to show in header
  updateTagConfig = null, // Function to update tag config: (tagId, field, value) => {}
  autoRefreshEnabled = false, // Whether live/auto-refresh is enabled
  onToggleAutoRefresh = null, // Callback to toggle auto-refresh: (enabled) => {}
  refreshIntervalValue = 5, // Refresh interval value (0.5, 1, 5, or 'custom')
  onRefreshIntervalChange = null, // Callback when interval changes: (value) => {}
  customRefreshInterval = 5, // Custom refresh interval in seconds
  onCustomRefreshIntervalChange = null, // Callback when custom interval changes: (value) => {}
  showPreferencesButton = true, // Whether to show the preferences button (requires HistorianProvider)
  compactMode = false, // Whether to use compact mode (minimal padding for dashboards)
  // Time mode badge settings
  timeModeBadge = null, // { mode: 'fixed'|'rolling'|'shifted', duration: number, offset: number, show: boolean }
  // Config update callbacks for ChartConfigPanel (optional - will use HistorianProvider if not provided)
  updateAxis = null,
  addAxis = null,
  removeAxis = null,
  addReferenceLine = null,
  updateReferenceLine = null,
  removeReferenceLine = null,
  updateGridConfig = null,
  updateBackgroundConfig = null,
  updateDisplayConfig = null,
  onPreferencesClose = null, // Callback when preferences panel closes
  onResetZoom = null, // Callback when reset zoom button is clicked (triggers re-query)
  onToggleCompactMode = null, // Callback to toggle compact mode preview: () => {}
}) => {
  // ALL HOOKS MUST BE AT THE TOP - NO CONDITIONAL HOOKS
  // Zoom state: track the visible domain
  const [xDomain, setXDomain] = React.useState(null); // [min, max] or null for auto
  const [yDomains, setYDomains] = React.useState({}); // Map of axisId -> [min, max] for per-axis zoom
  
  // Preferences overlay state
  const [showPreferences, setShowPreferences] = React.useState(false);
  const previousShowPreferences = React.useRef(showPreferences);
  
  // Pan state: track dragging
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState(null); // { x, y, xDomain, yDomains }
  const chartRef = React.useRef(null);
  
  // Helper function to format time mode badge text
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
  
  // Crosshair state
  const [crosshairEnabled, setCrosshairEnabled] = React.useState(false);
  const [crosshairPosition, setCrosshairPosition] = React.useState(null); // { x, y, time, values }
  
  // Notify parent of zoom changes
  React.useEffect(() => {
    if (onZoomChange) {
      onZoomChange(xDomain, yDomains);
    }
  }, [xDomain, yDomains, onZoomChange]);
  
  // Trigger callback when preferences close (detect transition from true to false)
  React.useEffect(() => {
    if (previousShowPreferences.current === true && showPreferences === false) {
      if (onPreferencesClose) {
        onPreferencesClose();
      }
    }
    previousShowPreferences.current = showPreferences;
  }, [showPreferences, onPreferencesClose]);
  
  // Transform data to MUI X Charts format
  const transformedData = React.useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
    
    // Build data rows by timestamp with dynamic keys per tag_id (OLD FRONTEND FORMAT)
    const timeMap = new Map();
    const allTagIds = new Set();
    
    data.forEach(point => {
      const value = Number(point?.v);  // Use v field like old frontend
      const time = new Date(point?.ts).getTime();
      const tagId = String(point?.tag_id ?? '');
      
      // Strict validation: only accept finite numbers
      if (!Number.isFinite(value) || !Number.isFinite(time) || !tagId) return;
      
      allTagIds.add(tagId);
      const row = timeMap.get(time) || { time };
      row[tagId] = value;  // Use tag_id directly as key (not tag_${tag_id})
      timeMap.set(time, row);
    });
    
    // Get set of hidden tag IDs for filtering
    const hiddenTagIds = new Set(
      tagConfigs.filter(t => t.hidden).map(t => String(t.tag_id))
    );
    
    // Get set of all configured tag IDs (to filter out stray data)
    const configuredTagIds = new Set(
      tagConfigs.map(t => String(t.tag_id))
    );
    
    // Clean up: ensure all rows have all tag keys (set missing to null for MUI X Charts)
    const result = Array.from(timeMap.values())
      .sort((a, b) => a.time - b.time)
      .map(row => {
        const cleaned = { time: row.time };
        // Only include tags that are in tagConfigs
        allTagIds.forEach(tagId => {
          // Skip tags that aren't configured (stray data from other queries)
          if (!configuredTagIds.has(tagId)) {
            return;
          }
          
          const val = row[tagId];
          // IMPORTANT: Don't include hidden tags in the dataset at all to prevent MUI warnings
          // about non-numerical elements. Hidden tags are handled by filtering the series instead.
          if (hiddenTagIds.has(tagId)) {
            return; // Skip adding this key entirely
          }
          
          // Set to null if missing or not finite
          cleaned[tagId] = Number.isFinite(val) ? val : null;
        });
        return cleaned;
      });
    
    return result;
  }, [data, tagConfigs]);

  // Build series config
  const series = React.useMemo(() => {
    // Include ALL tags (both hidden and visible) so they remain in the legend
    // Hidden tags won't have data in the dataset, so they won't render on the chart
    const result = tagConfigs
      .map(tag => {
        const dataKey = String(tag.tag_id);
        
        return {
          id: tag.tag_id,  // Add id for CSS targeting
          dataKey,  // Use tag_id directly (not tag_${tag_id})
          label: tag.alias || tag.name || `Tag ${tag.tag_id}`,
          color: tag.color || '#3b82f6',
          curve: tag.interpolation || 'linear',
          yAxisId: tag.axisId || 'default',  // Use yAxisId instead of yAxisKey
          showMark: false,
          connectNulls: true,  // Connect across null values for multi-rate data
          // Hidden series are still in the legend but won't render (no data)
          hidden: tag.hidden || false,
        };
      });

    return result;
  }, [tagConfigs]);

  // Calculate the actual data time range to avoid gaps at edges
  const dataTimeRange = React.useMemo(() => {
    if (!transformedData || transformedData.length === 0) return null;
    
    const times = transformedData.map(row => row.time).filter(t => Number.isFinite(t));
    if (times.length === 0) return null;
    
    return {
      min: Math.min(...times),
      max: Math.max(...times)
    };
  }, [transformedData]);

  // Build axes config with zoom domains
  const yAxesConfig = React.useMemo(() => {
    const axesArray = Array.isArray(axes) && axes.length > 0 ? axes : [
      { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
    ];
    
    return axesArray
      .filter(axis => axis && typeof axis === 'object' && axis.id) // Ensure valid axis objects
      .map((axis, index) => {
        // Find all tags using this axis (excluding hidden tags)
        const tagsOnAxis = tagConfigs.filter(tag => 
          (tag.axisId || 'default') === axis.id && !tag.hidden
        );
        
        // Build label from tag names
        let labelContent = axis.label || 'Value';
        if (tagsOnAxis.length > 0) {
          // Create a label with tag names
          labelContent = tagsOnAxis
            .map(tag => tag.alias || tag.name || `Tag ${tag.tag_id}`)
            .join(', ');
        }
        
        const config = {
          id: String(axis.id),
          label: compactMode ? '' : labelContent, // Hide label in compact mode
          position: axis.orientation === 'right' ? 'right' : 'left',
        };
        
        // Handle domain/min/max
        const domain = Array.isArray(axis.domain) ? axis.domain : ['auto', 'auto'];
        
        // Use zoom domain for this specific axis if set, otherwise use axis domain settings
        const axisZoomDomain = yDomains[axis.id];
        if (axisZoomDomain) {
          config.min = axisZoomDomain[0];
          config.max = axisZoomDomain[1];
        } else {
          if (domain[0] !== 'auto' && domain[0] != null) {
            const minVal = Number(domain[0]);
            if (!isNaN(minVal)) config.min = minVal;
          }
          if (domain[1] !== 'auto' && domain[1] != null) {
            const maxVal = Number(domain[1]);
            if (!isNaN(maxVal)) config.max = maxVal;
          }
        }
        
        return config;
      });
  }, [axes, yDomains, tagConfigs, compactMode]);

  // Convert dash pattern to strokeDasharray
  // Pattern is space-delimited numbers 1-100 (e.g., "1 2 1" or "50 30")
  // Each number represents length in pixels
  // 0 or empty = solid line
  const getDashArray = (dashPattern) => {
    if (!dashPattern || dashPattern === '0' || dashPattern === 'solid') return '0';
    
    // Parse space-delimited pattern
    const trimmed = String(dashPattern).trim();
    const parts = trimmed.split(/\s+/);
    const numbers = parts.map(p => parseInt(p, 10)).filter(n => Number.isFinite(n) && n >= 1 && n <= 100);
    
    if (numbers.length > 0) {
      return numbers.join(' ');
    }
    
    // Fallback for old style names
    if (dashPattern === 'dashed') return '8 4';
    if (dashPattern === 'dotted') return '2 2';
    if (dashPattern === 'dash-dot') return '8 4 2 4';
    
    return '0'; // Default to solid if invalid
  };

  // Chart styling with grid, background, and line styles
  const chartSx = React.useMemo(() => {
    const styles = {
      [`& .${chartsGridClasses.line}`]: {
        stroke: grid.color,
        strokeOpacity: grid.opacity,
        strokeWidth: grid.thickness,
        strokeDasharray: getDashArray(grid.dash),
      },
      backgroundColor: background.color,
    };
    
    // Add line styling for each series (thickness and stroke type)
    tagConfigs.forEach((tag) => {
      const seriesClass = `.MuiLineElement-series-${tag.tag_id}`;
      styles[seriesClass] = {
        strokeWidth: tag.hidden ? 0 : (tag.thickness || 2), // Hide line if hidden
        strokeDasharray: getDashArray(tag.strokeType || 'solid'),
        opacity: tag.hidden ? 0 : 1, // Also set opacity to 0 for hidden tags
      };
    });
    
    return styles;
  }, [grid, background, tagConfigs]);

  // Handle legend item click to toggle series visibility - MUST BE BEFORE CONDITIONAL RETURN
  const handleLegendClick = React.useCallback((event, context, legendItemIndex) => {
    if (!updateTagConfig) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // Get the series at this index
    if (legendItemIndex >= 0 && legendItemIndex < series.length) {
      const clickedSeries = series[legendItemIndex];
      const dataKey = clickedSeries.dataKey;
      const tagId = parseInt(dataKey, 10);
      
      // If tagId is NaN, don't proceed
      if (isNaN(tagId)) {
        return;
      }
      
      // Find the current tag config to get its hidden state
      const currentTag = tagConfigs.find(t => t.tag_id === tagId);
      const currentHidden = currentTag?.hidden || false;
      
      // Toggle the hidden property using the same method as the preferences checkbox
      updateTagConfig(tagId, 'hidden', !currentHidden);
    }
  }, [updateTagConfig, tagConfigs, series]);

  // Calculate current visible data range - MUST BE FUNCTION BEFORE CONDITIONAL RETURN
  const getDataRange = React.useCallback((data, key) => {
    const values = data.map(d => d[key]).filter(v => v != null);
    if (values.length === 0) return [0, 100];
    return [Math.min(...values), Math.max(...values)];
  }, []);

  const handleZoomIn = React.useCallback(() => {
    // Zoom in by 20% on both axes
    if (!xDomain) {
      const [xMin, xMax] = getDataRange(transformedData, 'time');
      const xRange = xMax - xMin;
      const newRange = xRange * 0.8;
      const center = (xMax + xMin) / 2;
      setXDomain([center - newRange / 2, center + newRange / 2]);
    } else {
      const [xMin, xMax] = xDomain;
      const xRange = xMax - xMin;
      const newRange = xRange * 0.8;
      const center = (xMax + xMin) / 2;
      setXDomain([center - newRange / 2, center + newRange / 2]);
    }

    // Zoom each Y axis separately based on its own data
    const newYDomains = {};
    const axesArray = Array.isArray(axes) && axes.length > 0 ? axes : [
      { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
    ];
    
    axesArray.forEach(axis => {
      // Get values for tags on this specific axis
      const tagsOnAxis = tagConfigs.filter(tag => 
        (tag.axisId || 'default') === axis.id && !tag.hidden
      );
      
      if (tagsOnAxis.length === 0) return;
      
      const yValues = transformedData.flatMap(row => 
        tagsOnAxis.map(tag => row[String(tag.tag_id)]).filter(v => v != null)
      );
      
      if (yValues.length > 0) {
        const currentDomain = yDomains[axis.id];
        if (!currentDomain) {
          const yMin = Math.min(...yValues);
          const yMax = Math.max(...yValues);
          const yRange = yMax - yMin;
          const newRange = yRange * 0.8;
          const center = (yMax + yMin) / 2;
          newYDomains[axis.id] = [center - newRange / 2, center + newRange / 2];
        } else {
          const [yMin, yMax] = currentDomain;
          const yRange = yMax - yMin;
          const newRange = yRange * 0.8;
          const center = (yMax + yMin) / 2;
          newYDomains[axis.id] = [center - newRange / 2, center + newRange / 2];
        }
      }
    });
    
    setYDomains(prev => ({ ...prev, ...newYDomains }));
  }, [xDomain, yDomains, transformedData, getDataRange, axes, tagConfigs]);

  const handleZoomOut = React.useCallback(() => {
    // Zoom out by 20% on both axes
    if (xDomain) {
      const [xMin, xMax] = xDomain;
      const xRange = xMax - xMin;
      const newRange = xRange * 1.25;
      const center = (xMax + xMin) / 2;
      setXDomain([center - newRange / 2, center + newRange / 2]);
    }

    // Zoom out each Y axis separately
    const newYDomains = {};
    Object.entries(yDomains).forEach(([axisId, domain]) => {
      const [yMin, yMax] = domain;
      const yRange = yMax - yMin;
      const newRange = yRange * 1.25;
      const center = (yMax + yMin) / 2;
      newYDomains[axisId] = [center - newRange / 2, center + newRange / 2];
    });
    
    setYDomains(newYDomains);
  }, [xDomain, yDomains]);

  const handleResetZoom = React.useCallback(() => {
    setXDomain(null);
    setYDomains({});
    // Trigger re-query if callback provided
    if (onResetZoom) {
      onResetZoom();
    }
  }, [onResetZoom]);

  // Pan handlers
  const handleMouseDown = React.useCallback((e) => {
    // Only pan if we have a zoom level set
    if (!xDomain && Object.keys(yDomains).length === 0) return;
    
    // Don't pan if clicking on UI elements
    if (e.target.closest('button') || e.target.closest('.MuiIconButton-root')) return;
    
    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      xDomain: xDomain || [dataTimeRange?.min, dataTimeRange?.max],
      yDomains: { ...yDomains } // Store copy of all axis domains
    });
  }, [xDomain, yDomains, dataTimeRange]);

  const handleMouseMove = React.useCallback((e) => {
    if (!isPanning || !panStart) return;
    
    const chartElement = chartRef.current;
    if (!chartElement) return;
    
    // Calculate pixel movement
    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;
    
    // Get chart dimensions
    const chartRect = chartElement.getBoundingClientRect();
    const chartWidth = chartRect.width - 30; // Account for margins (10 left + 20 right)
    const chartHeight = chartRect.height - 20; // Account for margins (10 top + 10 bottom)
    
    // Calculate pan amounts as ratio of chart size
    const xPanRatio = -deltaX / chartWidth;
    const yPanRatio = deltaY / chartHeight;
    
    // Apply pan to X domain
    if (panStart.xDomain) {
      const [xMin, xMax] = panStart.xDomain;
      const xRange = xMax - xMin;
      const xShift = xRange * xPanRatio;
      setXDomain([xMin + xShift, xMax + xShift]);
    }
    
    // Apply pan to each Y axis domain separately
    if (panStart.yDomains && Object.keys(panStart.yDomains).length > 0) {
      const newYDomains = {};
      Object.entries(panStart.yDomains).forEach(([axisId, domain]) => {
        const [yMin, yMax] = domain;
        const yRange = yMax - yMin;
        const yShift = yRange * yPanRatio;
        newYDomains[axisId] = [yMin + yShift, yMax + yShift];
      });
      setYDomains(newYDomains);
    }
  }, [isPanning, panStart]);

  const handleMouseUp = React.useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  // Crosshair click handler
  const handleChartClick = React.useCallback((e) => {
    if (!crosshairEnabled) return;
    if (isPanning) return; // Don't set crosshair if we were panning
    if (e.target.closest('button') || e.target.closest('.MuiIconButton-root')) return;
    
    const chartElement = chartRef.current;
    if (!chartElement) return;
    
    // Get click position relative to chart
    const chartRect = chartElement.getBoundingClientRect();
    const x = e.clientX - chartRect.left;
    const y = e.clientY - chartRect.top;
    
    // Calculate chart area (accounting for margins)
    const marginLeft = 10;
    const marginRight = 20;
    const marginTop = 10;
    const marginBottom = 10;
    const chartWidth = chartRect.width - marginLeft - marginRight;
    const chartHeight = chartRect.height - marginTop - marginBottom - 60; // 60 for legend (reduced from 120)
    
    // Check if click is within chart area
    if (x < marginLeft || x > chartRect.width - marginRight || 
        y < marginTop || y > marginTop + chartHeight) {
      return;
    }
    
    // Calculate relative position (0-1)
    const relativeX = (x - marginLeft) / chartWidth;
    const relativeY = (y - marginTop) / chartHeight;
    
    // Calculate time value
    const timeRange = xDomain || [dataTimeRange?.min, dataTimeRange?.max];
    if (!timeRange[0] || !timeRange[1]) return;
    
    const time = timeRange[0] + relativeX * (timeRange[1] - timeRange[0]);
    
    // Calculate Y values for each axis
    const yValues = {};
    yAxesConfig.forEach(axis => {
      const axisZoomDomain = yDomains[axis.id];
      const yRange = axisZoomDomain || [axis.min ?? 0, axis.max ?? 100];
      const yValue = yRange[1] - relativeY * (yRange[1] - yRange[0]);
      yValues[axis.id] = yValue;
    });
    
    setCrosshairPosition({ x, y, time, values: yValues });
  }, [crosshairEnabled, isPanning, xDomain, yDomains, dataTimeRange, yAxesConfig]);

  // Add global mouse event listeners for panning
  React.useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isPanning, handleMouseMove, handleMouseUp]);

  // NOW we can do conditional rendering AFTER all hooks are defined
  // Check loading first to avoid showing "No data" flash
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
  
  if (!transformedData.length) {
    return (
      <Card sx={{ height, display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
          {/* Controls Bar - Show preferences button even when no data */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
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
            </Stack>
            
            {/* Right side - Save button when changes pending */}
            <Stack direction="row" spacing={0.5} alignItems="center">
              {hasUnsavedChanges && !showPreferences && saveButton}
            </Stack>
          </Box>

          {/* Content area */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {showPreferences ? (
              /* Preferences Panel */
              <Box sx={{ height: '100%', width: '100%', overflow: 'auto' }}>
                <ChartConfigPanel 
                  compact={true}
                  saveButton={saveButton}
                  chartConfig={{
                    tagConfigs,
                    axes,
                    referenceLines,
                    grid,
                    background,
                    display
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
                />
              </Box>
            ) : (
              /* Empty state message */
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  No data to display. Select tags and query data to see the chart.
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ 
      height, 
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative', // For absolute positioning of compact toggle
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
        {/* Controls - Always visible (unless in compact mode) */}
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
        <Box 
          ref={chartRef}
          sx={{ 
            flex: 1, 
            minHeight: 0, 
            overflow: 'hidden',
            cursor: isPanning ? 'grabbing' : (xDomain || Object.keys(yDomains).length > 0 ? 'grab' : (crosshairEnabled ? 'crosshair' : 'default')),
            position: 'relative'
          }}
          onMouseDown={handleMouseDown}
          onClick={handleChartClick}
        >
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
                  display
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
              />
            </Box>
          ) : (
            /* Chart with crosshair */
            <>
              {/* Style for grey-ing out hidden legend items */}
              <style>
                {series.map((s, index) => s.hidden ? `
                  .MuiChartsLegend-item:nth-child(${index + 1}) {
                    opacity: 0.5;
                  }
                  .MuiChartsLegend-item:nth-child(${index + 1}) .MuiChartsLegend-series {
                    color: #9ca3af !important;
                  }
                  .MuiChartsLegend-item:nth-child(${index + 1}) .MuiChartsLegend-mark {
                    fill: #9ca3af !important;
                    stroke: #9ca3af !important;
                  }
                ` : '').join('\n')}
              </style>
              <LineChart
              key={`chart-${tagConfigs.map(t => `${t.tag_id}-${t.hidden}`).join('-')}`}
              dataset={transformedData}
              series={series}
              xAxis={[{ 
                dataKey: 'time', 
                scaleType: 'time',
                valueFormatter: (value) => {
                  const date = new Date(value);
                  const timeStr = date.toLocaleTimeString();
                  const ms = date.getMilliseconds().toString().padStart(3, '0');
                  return `${timeStr}.${ms}`;
                },
                // Use exact data range when not zoomed to avoid gaps at edges
                min: xDomain ? xDomain[0] : (dataTimeRange ? dataTimeRange.min : undefined),
                max: xDomain ? xDomain[1] : (dataTimeRange ? dataTimeRange.max : undefined),
              }]}
              yAxis={yAxesConfig}
              height={height - (compactMode ? 50 : 120)}
              margin={{ 
                top: 10, 
                right: 20, 
                bottom: compactMode && display.legendPosition === 'top' ? 20 : 0, 
                left: 10 
              }}
              grid={{ horizontal: true, vertical: true }}
              skipAnimation={true}
              {...(display.showLegend !== false && {
                legend: {
                  hidden: false,
                  direction: 'row',
                  padding: 0,
                },
                slotProps: {
                  legend: {
                    onItemClick: handleLegendClick,
                    position: { 
                      vertical: display.legendPosition || 'bottom', 
                      horizontal: 'middle' 
                    },
                    itemMarkWidth: 18,
                    itemMarkHeight: 18,
                    markGap: 5,
                    itemGap: 10,
                  },
                },
              })}
              {...(display.showLegend === false && {
                legend: {
                  hidden: true,
                },
              })}
              tooltip={display.showTooltip ? undefined : { trigger: 'none' }}
              sx={chartSx}
            >
              {/* Render reference lines - filter out lines with invalid values or axes with no data */}
              {referenceLines && referenceLines
                .filter(line => {
                  // Check if value is a valid number
                  if (!Number.isFinite(line.value)) {
                    return false;
                  }
                  
                  // Check if the referenced axis has visible tags with actual data
                  const axisId = line.yAxisId || 'default';
                  const visibleTagsOnAxis = tagConfigs.filter(tag => 
                    (tag.axisId || 'default') === axisId && !tag.hidden
                  );
                  
                  if (visibleTagsOnAxis.length === 0) {
                    return false;
                  }
                  
                  // CRITICAL: Check if transformedData has any non-null values for these tags
                  // This prevents rendering reference lines during the brief moment when
                  // tags are unhidden but transformedData still has null values
                  if (transformedData.length > 0) {
                    const tagIdsOnAxis = new Set(visibleTagsOnAxis.map(t => String(t.tag_id)));
                    const hasActualData = transformedData.some(row => {
                      return Array.from(tagIdsOnAxis).some(tagId => {
                        const val = row[tagId];
                        return Number.isFinite(val) && val !== null;
                      });
                    });
                    
                    if (!hasActualData) {
                      return false;
                    }
                  }
                  
                  return true;
                })
                .map(line => (
                <ChartsReferenceLine
                  key={line.id}
                  y={line.value}
                  label={line.label || ''}
                  lineStyle={{
                    stroke: line.color || '#ff0000',
                    strokeWidth: line.lineWidth || 1,
                    strokeDasharray: getDashArray(line.lineStyle || 'solid'),
                  }}
                  labelStyle={{
                    fontSize: '12px',
                    fill: line.color || '#ff0000',
                  }}
                  labelAlign={line.labelAlign || 'start'}
                  axisId={line.yAxisId}
                />
              ))}
            </LineChart>
            
            {/* Colored axis indicators for compact mode */}
            {compactMode && (
              <>
                {yAxesConfig.map((axisConfig, axisIndex) => {
                  // Find all tags using this axis (excluding hidden tags)
                  const tagsOnAxis = tagConfigs.filter(tag => 
                    String(tag.axisId || 'default') === String(axisConfig.id) && !tag.hidden
                  );
                  
                  if (tagsOnAxis.length === 0) return null;
                  
                  const isLeft = axisConfig.position === 'left';
                  
                  // Count how many axes of the same side are before this one
                  const samePositionBefore = yAxesConfig
                    .slice(0, axisIndex)
                    .filter(a => a.position === axisConfig.position && 
                      tagConfigs.some(tag => String(tag.axisId || 'default') === String(a.id) && !tag.hidden)
                    ).length;
                  
                  // Calculate horizontal offset based on axis spacing (60px per axis)
                  // Base offset accounts for chart margins: ~50px for left axes, ~30px for right axes
                  const baseOffset = isLeft ? 50 : 45;
                  const horizontalOffset = baseOffset + (samePositionBefore * 60);
                  
                  // Adjust vertical position based on legend position
                  // When legend is at top, axes are at bottom, so dots need more space from bottom
                  // When legend is at bottom, it takes space, so dots can be closer to bottom
                  const bottomPosition = (display.legendPosition === 'top') ? 0 : 10;
                  
                  // Create dots for each tag (max 4 per row)
                  return (
                    <Box
                      key={axisConfig.id}
                      sx={{
                        position: 'absolute',
                        bottom: bottomPosition,
                        [isLeft ? 'left' : 'right']: horizontalOffset,
                        pointerEvents: 'none',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        alignItems: isLeft ? 'flex-start' : 'flex-end',
                      }}
                    >
                      {/* Split tags into rows of 4 */}
                      {Array.from({ length: Math.ceil(tagsOnAxis.length / 4) }, (_, rowIndex) => (
                        <Box
                          key={rowIndex}
                          sx={{
                            display: 'flex',
                            gap: 0.5,
                            flexDirection: isLeft ? 'row' : 'row-reverse',
                          }}
                        >
                          {tagsOnAxis.slice(rowIndex * 4, (rowIndex + 1) * 4).map((tag) => (
                            <Tooltip 
                              key={tag.tag_id} 
                              title={tag.alias || tag.name || `Tag ${tag.tag_id}`}
                              placement="top"
                            >
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  bgcolor: tag.color || '#1976d2',
                                  pointerEvents: 'auto',
                                  cursor: 'help',
                                  boxShadow: 1,
                                  '&:hover': {
                                    transform: 'scale(1.3)',
                                    boxShadow: 2,
                                  },
                                  transition: 'transform 0.2s, box-shadow 0.2s',
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      ))}
                    </Box>
                  );
                })}
              </>
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
                  top: 20,
                  bottom: 130,
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
                  left: 60,
                  right: 80,
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
                  bottom: 120,
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
                {Object.entries(crosshairPosition.values).map(([axisId, value], index) => (
                  <Box key={axisId} sx={{
                    position: 'absolute',
                    left: index === 0 ? 0 : 'auto',
                    right: index === 0 ? 'auto' : 0,
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
                ))}
              </Box>
            )}
            
            {/* Time Mode Badge */}
            {!compactMode && timeModeBadge?.show && timeModeBadge.mode !== 'fixed' && (
              <Box sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                zIndex: 1
              }}>
                <Chip
                  label={formatTimeModeBadge(timeModeBadge.mode, timeModeBadge.duration, timeModeBadge.offset)}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{
                    bgcolor: 'background.paper',
                    fontWeight: 500,
                    fontSize: '0.75rem'
                  }}
                />
              </Box>
            )}
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ChartRenderer;
