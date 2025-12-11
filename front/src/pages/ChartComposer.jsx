import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Box, Alert, Card, IconButton, Collapse, Badge, Button, Paper, Toolbar, Divider, Chip, Tooltip, Switch, FormControlLabel, TextField, MenuItem } from '@mui/material';
import { ExpandMore, ExpandLess, ArrowBack, Settings, ZoomIn, ZoomOut, RestartAlt, Visibility, Visibility as LiveIcon, DashboardCustomize } from '@mui/icons-material';
import { ChartComposerProvider, useChartComposer } from '../contexts/ChartComposerContext';
import ChartRenderer from '../components/chartComposer/ChartRenderer';
import PointsTable from '../components/chartComposer/PointsTable';
import SaveChartButton from '../components/chartComposer/SaveChartButton';
import ExportChartButton from '../components/chartComposer/ExportChartButton';
import chartComposerService from '../services/chartComposerService';
import useSetPageTitle from '../hooks/useSetPageTitle';

const ChartComposerContent = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    items, 
    loading, 
    error, 
    chartConfig, 
    loadedChart, 
    hasUnsavedChanges, 
    updateTagConfig,
    updateChartConfig,
    updateAxis,
    addAxis,
    removeAxis,
    addReferenceLine,
    updateReferenceLine,
    removeReferenceLine,
    updateGridConfig,
    updateBackgroundConfig,
    updateDisplayConfig,
    autoRefresh, 
    setAutoRefresh,
    refreshIntervalValue,
    setRefreshIntervalValue,
    customRefreshInterval,
    setCustomRefreshInterval,
    timeMode,
    timeDuration,
    timeOffset,
    timeRange,
    showTimeBadge,
    smartCompression,
    maxDataPoints,
    setTimeRange,
    queryData,
    setLoading,
    setError,
    setItems,
    setLimitWarning,
    loadChart,
    tagMetadata, // Metadata for all tags (write-on-change info)
    lastValuesBefore, // Last values before the query range
    setTagMetadata, // Setter for tagMetadata
    setLastValuesBefore, // Setter for lastValuesBefore
  } = useChartComposer();

  React.useEffect(() => {
    if (id && id !== 'new') {
      loadChart(id);
    }
  }, [id, loadChart]);

  // Set page title dynamically based on loaded chart
  const pageSubtitle = loadedChart?.name 
    ? `${loadedChart.name}${hasUnsavedChanges ? ' (unsaved changes)' : ''}` 
    : 'View and analyze historical time-series data';
  useSetPageTitle('Chart Composer', pageSubtitle);

  const [chartHeight, setChartHeight] = React.useState(720);
  const [isResizing, setIsResizing] = React.useState(false);
  const [visibleTimeRange, setVisibleTimeRange] = React.useState(null); // [min, max] timestamps from chart zoom
  const [pointsExpanded, setPointsExpanded] = React.useState(false); // Points table expansion state
  const [compactMode, setCompactMode] = React.useState(false); // Preview compact dashboard view
  const [showPreferences, setShowPreferences] = React.useState(false); // Chart preferences panel
  const [crosshairEnabled, setCrosshairEnabled] = React.useState(false); // Crosshair toggle
  const chartRef = React.useRef(null); // Reference to chart for zoom controls

  // Chart resize handlers
  const handleResizeStart = React.useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = React.useCallback((e) => {
    if (!isResizing) return;
    
    const chartContainer = document.getElementById('chart-composer-container');
    if (!chartContainer) return;
    
    const rect = chartContainer.getBoundingClientRect();
    const newHeight = e.clientY - rect.top;
    
    // Set constraints: min 200px, max 800px
    const constrainedHeight = Math.max(200, Math.min(800, newHeight));
    setChartHeight(constrainedHeight);
  }, [isResizing]);

  const handleResizeEnd = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add event listeners for resize
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Shared query function - used by Query button and Reset Zoom button
  const executeQuery = React.useCallback(async () => {
    if (!chartConfig.tagConfigs || chartConfig.tagConfigs.length === 0) return;

    let fromDate, toDate;
    
    if (timeMode === 'rolling') {
      const now = new Date();
      const duration = timeDuration || 3600000;
      fromDate = new Date(now.getTime() - duration);
      toDate = now;
    } else if (timeMode === 'shifted') {
      const now = new Date();
      const duration = timeDuration || 3600000;
      const offset = timeOffset || 0;
      const shiftedNow = new Date(now.getTime() - offset);
      fromDate = new Date(shiftedNow.getTime() - duration);
      toDate = shiftedNow;
    } else {
      // Fixed mode: use timeRange from context
      fromDate = timeRange.from;
      toDate = timeRange.to;
    }

    // Update time range in context (for rolling/shifted modes, or just confirm for fixed)
    setTimeRange({ from: fromDate, to: toDate });

    // Group tags by connection_id
    const tagsByConnection = new Map();
    chartConfig.tagConfigs.forEach(tagConfig => {
      const connId = tagConfig.connection_id || 'unknown';
      if (!tagsByConnection.has(connId)) {
        tagsByConnection.set(connId, []);
      }
      tagsByConnection.get(connId).push(tagConfig.tag_id);
    });

    setItems([]); // Clear old data before loading to show loading state immediately
    setLoading(true);
    setError('');
    setLimitWarning(null); // Clear any previous limit warning

    try {
      // Query all connections in parallel
      const perConnResults = await Promise.all(
        Array.from(tagsByConnection.entries()).map(async ([connId, tagIds]) => {
          const response = await chartComposerService.queryData({
            conn_id: connId,
            tag_ids: tagIds,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            limit: maxDataPoints,
            no_aggregation: !smartCompression,
          });
          return { connId, response };
        })
      );

      // Extract metadata from all responses into Context state
      for (const { response } of perConnResults) {
        if (response?.tag_metadata) {
          setTagMetadata(prevMeta => ({...prevMeta, ...response.tag_metadata}));
        }
        if (response?.last_values_before) {
          setLastValuesBefore(prevVals => ({...prevVals, ...response.last_values_before}));
        }
      }

      // Merge all results and check for limit hits
      let merged = [];
      let totalAvailable = 0;
      let anyLimitHit = false;
      let allErrors = [];
      
      for (const { connId: _connId, response } of perConnResults) {
        if (response?.error) {
          // Collect errors but don't stop processing
          allErrors.push(String(response.error));
        }
        const items = Array.isArray(response?.items) ? response.items : [];
        merged = merged.concat(items);
        
        // Check if limit was hit
        if (response?.limitHit) {
          anyLimitHit = true;
        }
        if (response?.totalAvailable) {
          totalAvailable += response.totalAvailable;
        }
      }
      
      // Only set error if we have errors AND no data
      if (allErrors.length > 0 && merged.length === 0) {
        setError(allErrors.join('; '));
      } else if (allErrors.length > 0) {
        // Some errors but we have data - log warning but continue
        console.warn('Some chart queries failed but data is available:', allErrors);
      }

      setItems(merged);
      
      // Show limit warning if Smart Compression is OFF and limit was hit
      if (!smartCompression && anyLimitHit && totalAvailable > merged.length) {
        setLimitWarning({
          shown: merged.length,
          available: totalAvailable,
          limit: maxDataPoints
        });
      }
    } catch (err) {
      console.error('Query failed:', err);
      setError(err.message || 'Failed to query data');
    } finally {
      setLoading(false);
    }
  }, [chartConfig.tagConfigs, timeMode, timeDuration, timeOffset, timeRange, smartCompression, maxDataPoints, setTimeRange, setLoading, setError, setItems, setLimitWarning]);

  // Handle preferences close - no longer auto re-queries
  const handlePreferencesClose = React.useCallback(() => {
    // Just close preferences, don't auto re-query
    // User can manually re-query using Query button or Reset Zoom
  }, []);

  // Zoom handlers
  const handleZoomIn = React.useCallback(() => {
    if (chartRef.current) {
      const chart = chartRef.current.getEchartsInstance();
      chart?.dispatchAction({ type: 'dataZoom', start: 10, end: 90 });
    }
  }, []);

  const handleZoomOut = React.useCallback(() => {
    if (chartRef.current) {
      const chart = chartRef.current.getEchartsInstance();
      chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    }
  }, []);

  const handleResetZoom = React.useCallback(() => {
    if (chartRef.current) {
      const chart = chartRef.current.getEchartsInstance();
      chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    }
    // Also re-query data
    queryData();
  }, [queryData]);

  return (
    <Box>
      {/* Toolbar */}
      <Paper elevation={2} sx={{ mb: 2 }}>
        <Toolbar sx={{ gap: 2, py: 1 }}>
          {/* Navigation */}
          <IconButton onClick={() => navigate('/charts')} edge="start" size="small">
            <ArrowBack />
          </IconButton>
          
          <Typography variant="h6" sx={{ ml: 2, flexGrow: 1 }}>
            {loadedChart?.name || 'New Chart'}
          </Typography>
          
          {hasUnsavedChanges && (
            <Chip label="Unsaved" color="warning" size="small" sx={{ mr: 2 }} />
          )}
          
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          
          {/* Primary Group */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              PRIMARY
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <SaveChartButton />
            </Box>
          </Box>
          
          <Divider orientation="vertical" flexItem />
          
          {/* View Group */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              VIEW
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Toggle crosshair">
                <Button
                  size="small"
                  variant={crosshairEnabled ? 'contained' : 'outlined'}
                  color={crosshairEnabled ? 'primary' : 'inherit'}
                  startIcon={<Visibility />}
                  onClick={() => setCrosshairEnabled(!crosshairEnabled)}
                  sx={{ minWidth: 100 }}
                >
                  Crosshair
                </Button>
              </Tooltip>
              <Tooltip title="Preview compact dashboard mode">
                <Button
                  size="small"
                  variant={compactMode ? 'contained' : 'outlined'}
                  color={compactMode ? 'primary' : 'inherit'}
                  startIcon={<DashboardCustomize />}
                  onClick={() => setCompactMode(!compactMode)}
                  sx={{ minWidth: 100 }}
                >
                  Compact
                </Button>
              </Tooltip>
            </Box>
          </Box>
          
          <Divider orientation="vertical" flexItem />
          
          {/* Data Group */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              DATA
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title="Live auto-refresh">
                <Button
                  size="small"
                  variant={autoRefresh ? 'contained' : 'outlined'}
                  color={autoRefresh ? 'primary' : 'inherit'}
                  startIcon={<LiveIcon />}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  sx={{ minWidth: 100 }}
                >
                  Live
                </Button>
              </Tooltip>
              <Box sx={{ display: 'flex', gap: 0.5, visibility: autoRefresh ? 'visible' : 'hidden', minWidth: 84 }}>
                <TextField
                  select
                  value={refreshIntervalValue}
                  onChange={(e) => setRefreshIntervalValue(e.target.value)}
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
                {refreshIntervalValue === 'custom' && (
                  <TextField
                    label="Seconds"
                    type="number"
                    value={customRefreshInterval}
                    onChange={(e) => setCustomRefreshInterval(parseFloat(e.target.value))}
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
              </Box>
            </Box>
          </Box>
          
          <Divider orientation="vertical" flexItem />
          
          {/* Zoom Group */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              ZOOM
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Zoom In">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ZoomIn />}
                  onClick={handleZoomIn}
                  sx={{ minWidth: 90 }}
                >
                  In
                </Button>
              </Tooltip>
              <Tooltip title="Zoom Out">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ZoomOut />}
                  onClick={handleZoomOut}
                  sx={{ minWidth: 90 }}
                >
                  Out
                </Button>
              </Tooltip>
              <Tooltip title="Reset Zoom & Re-query">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RestartAlt />}
                  onClick={handleResetZoom}
                  sx={{ minWidth: 90 }}
                >
                  Reset
                </Button>
              </Tooltip>
            </Box>
          </Box>
          
          <Divider orientation="vertical" flexItem />
          
          {/* Tools Group */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              TOOLS
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Chart preferences and configuration">
                <Button
                  size="small"
                  variant={showPreferences ? 'contained' : 'outlined'}
                  color={showPreferences ? 'primary' : 'inherit'}
                  startIcon={<Settings />}
                  onClick={() => setShowPreferences(!showPreferences)}
                  sx={{ minWidth: 100 }}
                >
                  Settings
                </Button>
              </Tooltip>
              <ExportChartButton />
            </Box>
          </Box>
        </Toolbar>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Full-width Chart */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Chart with integrated Points */}
        <Card>
              <Box 
                id="chart-composer-container"
                sx={{ 
                  position: 'relative',
                  cursor: isResizing ? 'ns-resize' : 'default',
                }}
              >
                <ChartRenderer
                  ref={chartRef}
                  data={items}
                  tagConfigs={chartConfig.tagConfigs}
                  axes={chartConfig.axes}
                  referenceLines={chartConfig.referenceLines}
                  grid={chartConfig.grid}
                  background={chartConfig.background}
                  display={chartConfig.display}
                  height={chartHeight}
                  loading={loading}
                  compactMode={compactMode}
                  requestedTimeRange={timeRange}
                  options={{ xAxisTickCount: chartConfig.xAxisTickCount }}
                  onZoomChange={(xDomain, yDomain) => setVisibleTimeRange(xDomain)}
                  tagMetadata={tagMetadata}
                  lastValuesBefore={lastValuesBefore}
                  updateAxis={updateAxis}
                  addAxis={addAxis}
                  removeAxis={removeAxis}
                  addReferenceLine={addReferenceLine}
                  updateReferenceLine={updateReferenceLine}
                  removeReferenceLine={removeReferenceLine}
                  updateGridConfig={updateGridConfig}
                  updateBackgroundConfig={updateBackgroundConfig}
                  updateDisplayConfig={updateDisplayConfig}
                  updateChartConfig={updateChartConfig}
                  onPreferencesClose={handlePreferencesClose}
                  timeModeBadge={{
                    mode: timeMode || 'fixed',
                    duration: timeDuration,
                    offset: timeOffset || 0,
                    show: showTimeBadge
                  }}
                  showPreferencesButton={false}
                  externalShowPreferences={showPreferences}
                  externalSetShowPreferences={setShowPreferences}
                  externalCrosshairEnabled={crosshairEnabled}
                  externalSetCrosshairEnabled={setCrosshairEnabled}
                  hideInternalControls={true}
                />
                
                {/* Resize handle */}
                <Box
                  onMouseDown={handleResizeStart}
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 12,
                    cursor: 'ns-resize',
                    background: isResizing 
                      ? 'primary.main' 
                      : 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.1))',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                    zIndex: 10,
                    '&:hover': {
                      background: 'linear-gradient(to bottom, transparent, rgba(25, 118, 210, 0.2))',
                    }
                  }}
                >
                  <Box sx={{ 
                    width: 60, 
                    height: 4, 
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 2,
                  }} />
                </Box>
              </Box>

              {/* Points Toggle Bar */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => setPointsExpanded(!pointsExpanded)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Points
                  </Typography>
                  {items.length > 0 && (
                    <Badge 
                      badgeContent={items.length} 
                      color="primary"
                      max={999999}
                      sx={{
                        '& .MuiBadge-badge': {
                          position: 'static',
                          transform: 'none',
                        }
                      }}
                    />
                  )}
                  {!pointsExpanded && items.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {chartConfig.tagConfigs.filter(t => !t.hidden).length} tag{chartConfig.tagConfigs.filter(t => !t.hidden).length === 1 ? '' : 's'}
                    </Typography>
                  )}
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton size="small" sx={{ pointerEvents: 'none' }}>
                    {pointsExpanded ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </Box>
              </Box>

              {/* Points Table - Collapsible */}
              <Collapse in={pointsExpanded}>
                {pointsExpanded && (
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                    <PointsTable visibleTimeRange={visibleTimeRange} hideHeader />
                  </Box>
                )}
              </Collapse>
            </Card>
          </Box>
    </Box>
  );
};

const ChartComposer = () => {
  return (
    <ChartComposerProvider>
      <ChartComposerContent />
    </ChartComposerProvider>
  );
};

export default ChartComposer;
