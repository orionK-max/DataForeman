import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  MenuItem,
  Button,
  Stack,
  Chip,
  Switch,
  FormControlLabel,
  TextField,
  Box,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Radio,
  RadioGroup,
  FormLabel,
} from '@mui/material';
import { Delete, Warning, Clear, Info, ErrorOutline } from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import chartComposerService from '../../services/chartComposerService';
import SaveChartButton from './SaveChartButton';

const TIME_PRESETS = [
  { label: '1m', value: 1, unit: 'minutes' },
  { label: '5m', value: 5, unit: 'minutes' },
  { label: '15m', value: 15, unit: 'minutes' },
  { label: '30m', value: 30, unit: 'minutes' },
  { label: '1h', value: 1, unit: 'hours' },
  { label: '6h', value: 6, unit: 'hours' },
  { label: '12h', value: 12, unit: 'hours' },
  { label: '24h', value: 24, unit: 'hours' },
];

const QueryControls = () => {
  const {
    timeRange,
    setTimeRange,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    refreshIntervalValue,
    setRefreshIntervalValue,
    customRefreshInterval,
    setCustomRefreshInterval,
    originalTimeWindow,
    setOriginalTimeWindow,
    loading,
    error,
    setLoading,
    setError,
    items,
    setItems,
    chartConfig,
    updateChartConfig,
    hasUnsavedChanges,
    loadedChart,
    setLoadedChart,
    setHasUnsavedChanges,
    timeMode,
    setTimeMode,
    timeDuration,
    setTimeDuration,
    timeOffset,
    setTimeOffset,
    showTimeBadge,
    setShowTimeBadge,
    smartCompression,
    setSmartCompression,
    maxDataPoints,
    setMaxDataPoints,
    limitWarning,
    setLimitWarning,
  } = useChartComposer();

  const [fromDate, setFromDate] = React.useState(
    new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
  );
  const [toDate, setToDate] = React.useState(new Date());
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false);
  const [selectedChartTagIds, setSelectedChartTagIds] = React.useState([]);

  // Sync local state with context when chart is loaded or timeRange changes
  React.useEffect(() => {
    if (timeRange.from && timeRange.to) {
      setFromDate(timeRange.from);
      setToDate(timeRange.to);
    }
  }, [timeRange]);

  // Sync custom duration/offset with context time mode values
  React.useEffect(() => {
    if (timeDuration) {
      setCustomDuration(Math.round(timeDuration / 60000)); // Convert ms to minutes
    }
    if (timeOffset !== undefined) {
      setCustomOffset(Math.round(timeOffset / 60000)); // Convert ms to minutes
    }
  }, [timeDuration, timeOffset]);

  const handleQuery = React.useCallback(async (isAutoRefresh = false) => {
    if (chartConfig.tagConfigs.length === 0) {
      alert('Please add tags to the chart first');
      return;
    }

    // Only show loading spinner for manual queries, not auto-refresh
    if (!isAutoRefresh) {
      setItems([]); // Clear old data before loading to show loading state immediately
      setLimitWarning(null); // Clear previous limit warning
      setLoading(true);
      setError('');
      // Store the original time window duration when starting a manual query
      const windowDuration = toDate.getTime() - fromDate.getTime();
      setOriginalTimeWindow(windowDuration);
    }

    try {
      let effectiveFromDate = fromDate;
      let effectiveToDate = toDate;
      
      // For auto-refresh, always query up to "now" so data reaches the right edge
      if (isAutoRefresh && originalTimeWindow) {
        const now = new Date();
        effectiveToDate = now; // Always query to current time
        effectiveFromDate = new Date(now.getTime() - originalTimeWindow); // Maintain window size
        
        // Update the UI date pickers to reflect the sliding window
        setFromDate(effectiveFromDate);
        setToDate(effectiveToDate);
      }
      
      // Collect all tag IDs (backend will handle multi-connection queries)
      const allTagIds = chartConfig.tagConfigs.map(tag => tag.tag_id);

      // Single API call for all tags
      // Backend will auto-detect System tags vs regular tags based on tag_id
      // and query from system_metrics or tag_values table accordingly
      const response = await chartComposerService.queryData({
        tag_ids: allTagIds,
        from: effectiveFromDate.toISOString(),
        to: effectiveToDate.toISOString(),
        limit: maxDataPoints,
        no_aggregation: !smartCompression,
      });

      // Handle response
      if (response?.error && !isAutoRefresh) {
        setError(String(response.error));
      }
      
      const items = Array.isArray(response?.items) ? response.items : [];
      
      // Check if limit was hit with Smart Compression OFF
      if (!isAutoRefresh && !smartCompression && response?.limitHit && response?.totalAvailable > items.length) {
        const warningData = {
          shown: items.length,
          available: response.totalAvailable,
          limit: maxDataPoints
        };
        setLimitWarning(warningData);
      } else {
        setLimitWarning(null);
      }
      
      setItems(items);
    } catch (err) {
      console.error('Query failed:', err);
      if (!isAutoRefresh) {
        setError(err.message || 'Failed to query data');
      }
    } finally {
      if (!isAutoRefresh) {
        setLoading(false);
      }
    }
  }, [chartConfig.tagConfigs, fromDate, toDate, originalTimeWindow, setLoading, setError, setItems, smartCompression, maxDataPoints, setFromDate, setToDate, setOriginalTimeWindow]);

  const handlePresetClick = (preset) => {
    const now = new Date();
    let duration;

    if (preset.unit === 'minutes') {
      duration = preset.value * 60 * 1000;
    } else if (preset.unit === 'hours') {
      duration = preset.value * 60 * 60 * 1000;
    }

    setTimeDuration(duration);
    setHasUnsavedChanges(true);

    // Mode-specific behavior
    if (timeMode === 'fixed') {
      // Fixed mode: Set range from (now - duration) to now
      const newFrom = new Date(now.getTime() - duration);
      setFromDate(newFrom);
      setToDate(now);
      setTimeRange({ from: newFrom, to: now }); // Sync with context
    } else if (timeMode === 'rolling') {
      // Rolling mode: Set To = now, From = now - duration, update duration input
      const newFrom = new Date(now.getTime() - duration);
      setToDate(now);
      setFromDate(newFrom);
      setTimeRange({ from: newFrom, to: now }); // Sync with context
      setCustomDuration(Math.round(duration / 60000)); // Convert to minutes
    }
    // Shifted mode doesn't use quick presets
  };

  // Custom duration in minutes for rolling/shifted modes
  // Initialize from context instead of hardcoding to avoid flicker when loading charts
  const [customDuration, setCustomDuration] = React.useState(() => Math.round(timeDuration / 60000));
  const [customOffset, setCustomOffset] = React.useState(() => Math.round(timeOffset / 60000));

  const handleCustomDurationChange = (minutes) => {
    const duration = minutes * 60 * 1000;
    setTimeDuration(duration);
    setCustomDuration(minutes);
    setHasUnsavedChanges(true);
    
    if (timeMode === 'rolling') {
      const now = new Date();
      const newTo = now;
      const newFrom = new Date(now.getTime() - duration);
      setToDate(newTo);
      setFromDate(newFrom);
      setTimeRange({ from: newFrom, to: newTo });
    } else if (timeMode === 'shifted') {
      const now = new Date();
      const offsetMs = customOffset * 60 * 1000;
      const offsetTo = new Date(now.getTime() - offsetMs);
      const offsetFrom = new Date(offsetTo.getTime() - duration);
      setFromDate(offsetFrom);
      setToDate(offsetTo);
      setTimeRange({ from: offsetFrom, to: offsetTo });
    }
  };

  const handleCustomOffsetChange = (minutes) => {
    const offsetMs = minutes * 60 * 1000;
    setTimeOffset(offsetMs);
    setCustomOffset(minutes);
    setHasUnsavedChanges(true);
    
    if (timeMode === 'shifted') {
      const now = new Date();
      const duration = customDuration * 60 * 1000;
      const offsetTo = new Date(now.getTime() - offsetMs);
      const offsetFrom = new Date(offsetTo.getTime() - duration);
      setFromDate(offsetFrom);
      setToDate(offsetTo);
      setTimeRange({ from: offsetFrom, to: offsetTo });
    }
  };

  const handleRefreshToggle = (e) => {
    const enabled = e.target.checked;
    setAutoRefresh(enabled);
    
    // When enabling auto-refresh, capture the current time window
    if (enabled) {
      const duration = toDate.getTime() - fromDate.getTime();
      setOriginalTimeWindow(duration);
    } else {
      setOriginalTimeWindow(null);
    }
  };

  const handleRefreshIntervalChange = (e) => {
    const value = e.target.value;
    if (value === 'custom') {
      setRefreshIntervalValue('custom');
    } else {
      const numValue = parseFloat(value);
      if (numValue > 0) {
        setRefreshIntervalValue(numValue);
      }
    }
  };

  const handleCustomRefreshIntervalChange = (e) => {
    const value = parseFloat(e.target.value);
    if (value > 0) {
      setCustomRefreshInterval(value);
    }
  };

  const handleRemoveTags = () => {
    if (selectedChartTagIds.length === 0) return;
    
    const updatedTagConfigs = chartConfig.tagConfigs.filter(
      tag => !selectedChartTagIds.includes(tag.tag_id)
    );
    
    updateChartConfig({ tagConfigs: updatedTagConfigs });
    setSelectedChartTagIds([]);
  };

  const toggleTagSelection = (tagId) => {
    if (selectedChartTagIds.includes(tagId)) {
      setSelectedChartTagIds(selectedChartTagIds.filter(id => id !== tagId));
    } else {
      setSelectedChartTagIds([...selectedChartTagIds, tagId]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedChartTagIds.length === chartConfig.tagConfigs.length) {
      setSelectedChartTagIds([]);
    } else {
      setSelectedChartTagIds(chartConfig.tagConfigs.map(t => t.tag_id));
    }
  };

  const handleClearQueryList = () => {
    if (hasUnsavedChanges && loadedChart) {
      // Show confirmation dialog if there are unsaved changes
      setClearDialogOpen(true);
    } else {
      // Clear immediately if no unsaved changes
      performClear();
    }
  };

  const handleSaveAndClear = async () => {
    try {
      // Build chart configuration in the format expected by backend
      const config = {
        version: 1,
        tags: chartConfig.tagConfigs.map(tag => ({
          tag_id: tag.tag_id,
          alias: tag.alias || '',
          originalName: tag.name || tag.originalName || `Tag ${tag.tag_id}`,
          color: tag.color || '#3b82f6',
          lineWidth: tag.lineWidth || 2,
          lineStyle: tag.lineStyle || 'solid',
          interpolation: tag.interpolation || 'linear',
          hidden: tag.hidden || false,
          connection_id: tag.connection_id,
          yAxisId: tag.axisId || 'default',
        })),
        axes: chartConfig.axes || [
          { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
        ],
        referenceLines: chartConfig.referenceLines || [],
        grid: chartConfig.grid || { color: '#ccc', opacity: 0.5, thickness: 1, dash: '4 4' },
        background: chartConfig.background || { color: '#000000', opacity: 1 },
        interpolation: 'linear',
      };

      // Save the chart
      await chartComposerService.updateChart(loadedChart.id, {
        name: loadedChart.name,
        is_shared: loadedChart.is_shared,
        options: config,
      });

      // Then clear
      performClear();
    } catch (error) {
      console.error('Failed to save chart:', error);
      alert('Failed to save chart. Please try again.');
    }
  };

  const performClear = () => {
    updateChartConfig({ tagConfigs: [] });
    setSelectedChartTagIds([]);
    setItems([]);
    setLoadedChart(null);
    setHasUnsavedChanges(false);
    setClearDialogOpen(false);
  };

  // Get unique connections
  const uniqueConnections = React.useMemo(() => {
    return Array.from(new Set(
      chartConfig.tagConfigs
        .map(t => t.connection_id)
        .filter(Boolean)
    ));
  }, [chartConfig.tagConfigs]);

  const isAllSelected = chartConfig.tagConfigs.length > 0 && 
    selectedChartTagIds.length === chartConfig.tagConfigs.length;
  const isPartiallySelected = selectedChartTagIds.length > 0 && !isAllSelected;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Card sx={{ height: 570, display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Query List
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {uniqueConnections.length > 1 && (
                <Tooltip title={`Multi-connection chart: ${uniqueConnections.join(', ')}`}>
                  <Chip 
                    label={`${uniqueConnections.length} connections`} 
                    size="small" 
                    color="info"
                    variant="outlined"
                  />
                </Tooltip>
              )}
              <Typography variant="caption" color="text.secondary">
                {chartConfig.tagConfigs.length} tag(s)
              </Typography>
              <Tooltip title="Clear all tags from Query List">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleClearQueryList}
                    disabled={chartConfig.tagConfigs.length === 0}
                    color="error"
                  >
                    <Clear fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Limit Warning Dialog */}
          <Dialog
            open={!!limitWarning}
            onClose={() => setLimitWarning(null)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Warning color="warning" />
                Data Limit Reached
              </Box>
            </DialogTitle>
            <DialogContent>
              <DialogContentText>
                Currently showing <strong>{limitWarning?.shown.toLocaleString()}</strong> of{' '}
                <strong>{limitWarning?.available.toLocaleString()}</strong> available data points.
              </DialogContentText>
              <DialogContentText sx={{ mt: 2 }}>
                Your current limit is set to <strong>{limitWarning?.limit.toLocaleString()}</strong> points.
                To view all available data efficiently, enable <strong>Smart Compression</strong> for optimized sampling,
                or dismiss this message to keep the current data.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button 
                onClick={() => setLimitWarning(null)}
                color="inherit"
              >
                Dismiss
              </Button>
              <Button 
                onClick={() => {
                  setSmartCompression(true);
                  setLimitWarning(null);
                  // Don't auto re-query - let user click Query button manually
                  // This ensures the same time range is used
                }}
                variant="contained"
                color="primary"
                startIcon={<Info />}
              >
                Enable Smart Compression
              </Button>
            </DialogActions>
          </Dialog>

          {/* Tags in Chart Table */}
          <Box sx={{ 
            flex: 1, 
            minHeight: 0, 
            overflow: 'auto', 
            border: 1, 
            borderColor: 'divider', 
            borderRadius: 1,
            mb: 2
          }}>
            {chartConfig.tagConfigs.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
                Empty. Select tags and click "Add to Chart".
              </Box>
            ) : (
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={isPartiallySelected}
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Poll</TableCell>
                    <TableCell>Conn</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {chartConfig.tagConfigs.map((tag) => (
                    <TableRow key={tag.tag_id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedChartTagIds.includes(tag.tag_id)}
                          onChange={() => toggleTagSelection(tag.tag_id)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tag.name || `Tag ${tag.tag_id}`}
                        {tag.isDeleted && (
                          <Tooltip title={`Tag is deleted (${tag.deletionReason || 'unknown reason'})`}>
                            <ErrorOutline sx={{ fontSize: 14, ml: 0.5, color: 'error.main', verticalAlign: 'middle' }} />
                          </Tooltip>
                        )}
                        {!tag.connection_id && !tag.isDeleted && (
                          <Tooltip title="Missing connection info">
                            <Warning sx={{ fontSize: 14, ml: 0.5, color: 'warning.main', verticalAlign: 'middle' }} />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {tag.data_type && (
                          <Chip label={tag.data_type} size="small" sx={{ fontSize: 9, height: 18 }} />
                        )}
                      </TableCell>
                      <TableCell>{tag.poll_rate_ms ? `${tag.poll_rate_ms}ms` : '—'}</TableCell>
                      <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tag.connection_name || tag.connection_id || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>

          {/* Remove Button */}
          {selectedChartTagIds.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<Delete />}
                onClick={handleRemoveTags}
                disabled={loading}
              >
                Remove {selectedChartTagIds.length} tag(s)
              </Button>
            </Box>
          )}

          <Stack spacing={2}>
            {/* Two Column Layout: Time Range Mode + Controls */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              {/* Left Column: Time Range Mode */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl component="fieldset" size="small">
                  <FormLabel component="legend" sx={{ fontSize: '0.875rem', mb: 1 }}>Time Range Mode</FormLabel>
                  <RadioGroup
                    value={timeMode}
                    onChange={(e) => {
                      setTimeMode(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                  >
                    <FormControlLabel 
                      value="fixed" 
                      control={<Radio size="small" />} 
                      label={
                        <Tooltip title="Use exact saved time range" placement="right">
                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Fixed <Info fontSize="small" sx={{ fontSize: '1rem', opacity: 0.5 }} />
                          </Typography>
                        </Tooltip>
                      }
                    />
                    <FormControlLabel 
                      value="rolling" 
                      control={<Radio size="small" />} 
                      label={
                        <Tooltip title="Always show last X time from now" placement="right">
                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Rolling <Info fontSize="small" sx={{ fontSize: '1rem', opacity: 0.5 }} />
                          </Typography>
                        </Tooltip>
                      }
                    />
                    <FormControlLabel 
                      value="shifted" 
                      control={<Radio size="small" />} 
                      label={
                        <Tooltip title="Show time range delayed by offset" placement="right">
                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Shifted <Info fontSize="small" sx={{ fontSize: '1rem', opacity: 0.5 }} />
                          </Typography>
                        </Tooltip>
                      }
                    />
                  </RadioGroup>
                </FormControl>

                {/* Show Time Badge Toggle */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showTimeBadge}
                      onChange={(e) => {
                        setShowTimeBadge(e.target.checked);
                        setHasUnsavedChanges(true);
                      }}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Show time mode badge on chart
                    </Typography>
                  }
                />
              </Box>

              {/* Right Column: Mode-Specific Controls */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Fixed Mode: Quick Presets + From and To date pickers */}
                {timeMode === 'fixed' && (
                  <>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {TIME_PRESETS.map((preset) => (
                        <Chip
                          key={preset.label}
                          label={preset.label}
                          onClick={() => handlePresetClick(preset)}
                          size="small"
                          color="default"
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                    <DateTimePicker
                      label="From"
                      value={fromDate}
                      onChange={(newValue) => {
                        setFromDate(newValue);
                        setTimeRange({ from: newValue, to: toDate }); // Sync with context
                        setHasUnsavedChanges(true);
                      }}
                      slotProps={{ textField: { size: 'small', fullWidth: true } }}
                    />
                    <DateTimePicker
                      label="To"
                      value={toDate}
                      onChange={(newValue) => {
                        setToDate(newValue);
                        setTimeRange({ from: fromDate, to: newValue }); // Sync with context
                        setHasUnsavedChanges(true);
                      }}
                      slotProps={{ textField: { size: 'small', fullWidth: true } }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Presets adjust "To" from "From" + duration
                    </Typography>
                    
                    {/* Query Optimization - Inline */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={smartCompression}
                            onChange={(e) => {
                              setSmartCompression(e.target.checked);
                              setHasUnsavedChanges(true);
                            }}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2">Smart Compression</Typography>}
                        title="Intelligently samples data using Min/Max Envelope algorithm. Preserves extreme values (spikes and dips) critical for troubleshooting. Distributes quota across tags proportionally based on poll rates."
                        sx={{ mr: 1 }}
                      />
                      
                      <TextField
                        label="Max Points"
                        type="number"
                        size="small"
                        value={maxDataPoints}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0 && val <= 50000) {
                            setMaxDataPoints(val);
                            setHasUnsavedChanges(true);
                          }
                        }}
                        inputProps={{ min: 100, max: 50000, step: 100 }}
                        title="Total data points across all tags (100-50,000). With Smart Compression ON, points are distributed proportionally based on poll rates - faster tags get more points. With Smart Compression OFF, points are distributed evenly."
                        sx={{ width: 140 }}
                      />
                    </Box>
                  </>
                )}

                {/* Rolling Mode: Quick Presets + Duration input field */}
                {timeMode === 'rolling' && (
                  <>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {TIME_PRESETS.map((preset) => (
                        <Chip
                          key={preset.label}
                          label={preset.label}
                          onClick={() => handlePresetClick(preset)}
                          size="small"
                          color="default"
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                    <TextField
                      label="Duration (minutes)"
                      type="number"
                      size="small"
                      fullWidth
                      value={customDuration}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (val >= 0) handleCustomDurationChange(val);
                      }}
                      inputProps={{ min: 0, step: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: -1 }}>
                      {new Date(Date.now() - customDuration * 60000).toLocaleString()} → Now
                    </Typography>
                    
                    {/* Query Optimization - Inline */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={smartCompression}
                            onChange={(e) => {
                              setSmartCompression(e.target.checked);
                              setHasUnsavedChanges(true);
                            }}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2">Smart Compression</Typography>}
                        title="Intelligently samples data by distributing max points across tags proportionally based on poll rates. Faster tags get more points. Preserves first/last points and peaks."
                        sx={{ mr: 1 }}
                      />
                      
                      <TextField
                        label="Max Points"
                        type="number"
                        size="small"
                        value={maxDataPoints}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0 && val <= 50000) {
                            setMaxDataPoints(val);
                            setHasUnsavedChanges(true);
                          }
                        }}
                        inputProps={{ min: 100, max: 50000, step: 100 }}
                        title="Total data points across all tags (100-50,000). With Smart Compression ON, points are distributed proportionally based on poll rates - faster tags get more points. With Smart Compression OFF, points are distributed evenly."
                        sx={{ width: 140 }}
                      />
                    </Box>
                  </>
                )}

                {/* Shifted Mode: Offset and Duration input fields (no Quick Presets) */}
                {timeMode === 'shifted' && (
                  <>
                    <TextField
                      label="Offset from Now (minutes)"
                      type="number"
                      size="small"
                      fullWidth
                      value={customOffset}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (val >= 0) handleCustomOffsetChange(val);
                      }}
                      inputProps={{ min: 0, step: 1 }}
                      helperText="How far back from now"
                    />
                    <TextField
                      label="Duration (minutes)"
                      type="number"
                      size="small"
                      fullWidth
                      value={customDuration}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (val >= 0) handleCustomDurationChange(val);
                      }}
                      inputProps={{ min: 0, step: 1 }}
                      helperText="Time window length"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: -1 }}>
                      {fromDate.toLocaleString()} → {toDate.toLocaleString()}
                    </Typography>
                    
                    {/* Query Optimization - Inline */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={smartCompression}
                            onChange={(e) => {
                              setSmartCompression(e.target.checked);
                              setHasUnsavedChanges(true);
                            }}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2">Smart Compression</Typography>}
                        title="Intelligently samples data by distributing max points across tags proportionally based on poll rates. Faster tags get more points. Preserves first/last points and peaks."
                        sx={{ mr: 1 }}
                      />
                      
                      <TextField
                        label="Max Points"
                        type="number"
                        size="small"
                        value={maxDataPoints}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0 && val <= 50000) {
                            setMaxDataPoints(val);
                            setHasUnsavedChanges(true);
                          }
                        }}
                        inputProps={{ min: 100, max: 50000, step: 100 }}
                        title="Total data points across all tags (100-50,000). With Smart Compression ON, points are distributed proportionally based on poll rates - faster tags get more points. With Smart Compression OFF, points are distributed evenly."
                        sx={{ width: 140 }}
                      />
                    </Box>
                  </>
                )}
              </Box>
            </Box>

            {/* Loading Indicator */}
            {loading && (
              <Alert 
                severity="info" 
                icon={<CircularProgress size={20} />}
                sx={{ mb: 1 }}
              >
                Retrieving data from {chartConfig.tagConfigs.length} tag(s)...
              </Alert>
            )}

            {/* Save Button - Show when chart is empty (no data queried yet) but has unsaved tag changes */}
            {!items || items.length === 0 && hasUnsavedChanges && (
              <SaveChartButton fullWidth />
            )}

            {/* Query Button */}
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleQuery(false)}
              disabled={loading || chartConfig.tagConfigs.length === 0}
              fullWidth
              startIcon={loading && <CircularProgress size={20} />}
            >
              {loading ? 'Querying...' : 'Query Data'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Clear Confirmation Dialog */}
      <Dialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
      >
        <DialogTitle>Clear Query List?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to "{loadedChart?.name}". 
            Do you want to save before clearing the query list?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={performClear} color="error">
            Clear Without Saving
          </Button>
          <Button onClick={handleSaveAndClear} variant="contained" color="primary">
            Save and Clear
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};

export default QueryControls;
