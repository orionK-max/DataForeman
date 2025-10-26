import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import chartComposerService from '../../services/chartComposerService';

const SaveChartButton = () => {
  const { can } = usePermissions();
  const {
    chartConfig,
    loadedChart,
    timeRange,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    setLoadedChart,
    autoRefresh,
    timeMode,
    timeDuration,
    timeOffset,
    showTimeBadge,
    smartCompression,
    maxDataPoints,
    refreshIntervalValue,
    customRefreshInterval,
  } = useChartComposer();

  const [open, setOpen] = useState(false);
  const [chartName, setChartName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleOpen = () => {
    // Pre-fill with loaded chart name if editing
    if (loadedChart?.name) {
      setChartName(loadedChart.name);
      setIsShared(loadedChart.is_shared || false);
    } else {
      setChartName('');
      setIsShared(false);
    }
    setError('');
    setSuccess(false);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setError('');
    setSuccess(false);
  };

  const handleSave = async () => {
    if (!chartName.trim()) {
      setError('Chart name is required');
      return;
    }

    if (chartConfig.tagConfigs.length === 0) {
      setError('No tags configured. Add tags to the chart before saving.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      // Build the chart data with proper schema
      const chartData = {
        name: chartName.trim(),
        time_from: timeRange.from ? timeRange.from.toISOString() : null,
        time_to: timeRange.to ? timeRange.to.toISOString() : null,
        is_shared: isShared,
        time_mode: timeMode,
        time_duration: timeMode === 'fixed' ? null : timeDuration,
        time_offset: timeMode === 'shifted' ? timeOffset : 0,
        live_enabled: autoRefresh, // Use current Live toggle state
        show_time_badge: showTimeBadge,
        options: {
          version: 1,
          // Query optimization settings
          smartCompression: smartCompression,
          maxDataPoints: maxDataPoints,
          // Auto-refresh settings
          refreshIntervalValue: refreshIntervalValue, // 'auto', 0.5, 1, 5, or 'custom'
          customRefreshInterval: customRefreshInterval, // Custom interval in seconds
          // Tags configuration
          tags: chartConfig.tagConfigs.map(tag => ({
            tag_id: tag.tag_id,
            name: tag.name,
            alias: tag.alias || null,
            color: tag.color || '#3b82f6',
            thickness: tag.thickness || 2,
            strokeType: tag.strokeType || 'solid',
            axisId: tag.axisId || 'default',
            interpolation: tag.interpolation || 'linear',
            hidden: tag.hidden || false,
          })),
          // Axes configuration
          axes: chartConfig.axes.map(axis => ({
            id: axis.id,
            label: axis.label || 'Value',
            orientation: axis.orientation || 'left',
            domain: axis.domain || ['auto', 'auto'],
            offset: axis.offset ?? 0,
            nameLocation: axis.nameLocation || 'inside',
            nameGap: axis.nameGap ?? 25,
          })),
          // Reference lines
          referenceLines: (chartConfig.referenceLines || []).map(line => ({
            id: line.id,
            value: line.value,
            label: line.label || '',
            color: line.color || '#ff0000',
            lineWidth: line.lineWidth || 1,
            lineStyle: line.lineStyle || 'solid',
            yAxisId: line.yAxisId || 'default',
          })),
          // Grid settings
          grid: {
            color: chartConfig.grid?.color || '#cccccc',
            opacity: chartConfig.grid?.opacity != null ? chartConfig.grid.opacity : 0.3,
            thickness: chartConfig.grid?.thickness || 1,
            dash: chartConfig.grid?.dash || 'solid',
          },
          // Background settings
          background: {
            color: chartConfig.background?.color || '#ffffff',
            opacity: chartConfig.background?.opacity != null ? chartConfig.background.opacity : 1,
          },
          // Display settings
          display: {
            showLegend: chartConfig.display?.showLegend === true,
            showTooltip: chartConfig.display?.showTooltip === true,
            legendPosition: chartConfig.display?.legendPosition || 'bottom',
          },
          // Global interpolation (optional)
          interpolation: chartConfig.interpolation || 'linear',
          // X-axis tick count
          xAxisTickCount: chartConfig.xAxisTickCount ?? 5,
        },
      };

      let result;
      if (loadedChart?.id && loadedChart.is_owner) {
        // Update existing chart
        result = await chartComposerService.updateChart(loadedChart.id, chartData);
      } else {
        // Save as new chart
        result = await chartComposerService.saveChart(chartData);
        
        // Update loaded chart state
        setLoadedChart({
          id: result.id,
          name: result.name,
          is_shared: result.is_shared,
          is_owner: true,
        });
      }

      setHasUnsavedChanges(false);
      setSuccess(true);
      
      // Close dialog after short delay to show success message
      setTimeout(() => {
        handleClose();
      }, 1500);

    } catch (err) {
      console.error('Failed to save chart:', err);
      setError(err.message || 'Failed to save chart. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = chartConfig.tagConfigs.length > 0;
  const hasCreatePermission = can('chart_composer', 'create');
  const hasUpdatePermission = can('chart_composer', 'update');
  
  // Determine if user can save: need create permission for new, update permission for existing
  const canPerformSave = loadedChart?.id ? hasUpdatePermission : hasCreatePermission;

  // Don't render button if no permission
  if (!canPerformSave) {
    return null;
  }

  return (
    <>
      <Button
        variant={hasUnsavedChanges ? "contained" : "outlined"}
        color={hasUnsavedChanges ? "primary" : "inherit"}
        startIcon={<Save fontSize="small" />}
        onClick={handleOpen}
        disabled={!canSave}
        size="small"
        sx={{ minWidth: 80 }}
      >
        {loadedChart?.id ? 'Save' : 'Save Chart'}
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {loadedChart?.id && loadedChart.is_owner ? 'Update Chart' : 'Save New Chart'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            
            {success ? (
              <Alert severity="success">
                Chart saved successfully!
              </Alert>
            ) : (
              <>
                <TextField
                  label="Chart Name"
                  value={chartName}
                  onChange={(e) => setChartName(e.target.value)}
                  fullWidth
                  autoFocus
                  placeholder="My Chart"
                  helperText={`${chartConfig.tagConfigs.length} tag(s) configured`}
                  disabled={saving}
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isShared}
                      onChange={(e) => setIsShared(e.target.checked)}
                      disabled={saving}
                    />
                  }
                  label="Share with other users"
                />

                {loadedChart?.id && !loadedChart.is_owner && (
                  <Alert severity="info">
                    You don't own this chart. A new copy will be created.
                  </Alert>
                )}
              </>
            )}
          </Box>
        </DialogContent>
        {!success && (
          <DialogActions>
            <Button onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving || !chartName.trim()}
              startIcon={saving ? <CircularProgress size={16} /> : <Save />}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
};

export default SaveChartButton;
