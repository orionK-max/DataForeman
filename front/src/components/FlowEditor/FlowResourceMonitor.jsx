import React, { memo, useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Chip,
  Grid,
  Paper,
  Divider
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Timer as TimerIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import ChartLoader from '../chart/ChartLoader';
import { apiClient } from '../../services/api';

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format bytes to MB
 */
function formatMemory(mb) {
  if (!mb) return '0 MB';
  if (mb < 0.1) return `${(mb * 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Get severity color for warnings
 */
function getSeverityColor(severity) {
  switch (severity) {
    case 'critical': return 'error';
    case 'warning': return 'warning';
    default: return 'info';
  }
}

/**
 * Memoized metric card to prevent unnecessary re-renders
 */
const MetricCard = memo(({ icon, title, value, subtitle, color = 'primary.main' }) => (
  <Paper sx={{ p: 2 }}>
    <Box display="flex" alignItems="center" mb={1}>
      {React.cloneElement(icon, { sx: { mr: 1, color } })}
      <Typography variant="subtitle2">{title}</Typography>
    </Box>
    <Typography variant={title === 'CPU Time' ? 'h5' : 'h6'}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {subtitle}
    </Typography>
  </Paper>
));

MetricCard.displayName = 'MetricCard';

/**
 * Flow Resource Monitor Dialog
 * Shows resource usage statistics, warnings, and historical chart for a flow
 */
const FlowResourceMonitor = memo(({ open, onClose, flowId, flowName, resourceData, loading, onRefresh }) => {
  const hasWarnings = resourceData?.warnings?.length > 0;
  const [chartId, setChartId] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const setupInProgressRef = useRef(false);

  // Fetch (or create, once) the chart for flow resource metrics
  useEffect(() => {
    if (!open || !flowId || !flowName || setupInProgressRef.current) return;

    const setupChart = async () => {
      setupInProgressRef.current = true;
      setLoadingChart(true);
      try {
        // Backend handles idempotent get-or-create and persists flows.resource_chart_id
        const res = await apiClient.post(`/flows/${flowId}/resource-chart`, {});
        const id = res?.chart_id;
        if (id) {
          setChartId(id);
        }
      } catch (err) {
        console.error('Failed to setup resource chart:', err);
      } finally {
        setLoadingChart(false);
        setupInProgressRef.current = false;
      }
    };

    setupChart();
  }, [open, flowId, flowName]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Resource Monitor</Typography>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {flowName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {!resourceData && !loading && (
          <Alert severity="info">
            Flow is not currently running. Deploy or test the flow to see resource usage.
          </Alert>
        )}

        {resourceData && (
          <>
            {/* Warnings */}
            {hasWarnings && (
              <Box mb={3}>
                <Typography variant="subtitle2" gutterBottom>
                  Warnings
                </Typography>
                {resourceData.warnings.map((warning, idx) => (
                  <Alert
                    key={idx}
                    severity={getSeverityColor(warning.severity)}
                    sx={{ mb: 1 }}
                  >
                    <Typography variant="body2">
                      <strong>{warning.type.toUpperCase()}:</strong> {warning.message}
                    </Typography>
                  </Alert>
                ))}
              </Box>
            )}

            {/* Resource Metrics */}
            <Grid container spacing={2}>
              {/* Scan Efficiency */}
              <Grid item xs={6}>
                <MetricCard
                  icon={<SpeedIcon />}
                  title="Scan Efficiency"
                  value={`${(resourceData.scanEfficiencyPercent || 0).toFixed(1)}%`}
                  subtitle="% of scan rate used"
                  color="primary.main"
                />
              </Grid>

              {/* Cycles per Second */}
              <Grid item xs={6}>
                <MetricCard
                  icon={<SpeedIcon />}
                  title="Cycles/Second"
                  value={`${(resourceData.cyclesPerSecond || 0).toFixed(2)}`}
                  subtitle={`${resourceData.totalCycles || 0} total cycles`}
                  color="success.main"
                />
              </Grid>

              {/* Memory Usage */}
              <Grid item xs={6}>
                <MetricCard
                  icon={<MemoryIcon />}
                  title="Memory Peak"
                  value={formatMemory(resourceData.memoryPeakMb)}
                  subtitle="Highest usage"
                  color="secondary.main"
                />
              </Grid>

              <Grid item xs={6}>
                <MetricCard
                  icon={<MemoryIcon />}
                  title="Memory Avg"
                  value={formatMemory(resourceData.memoryAvgMb)}
                  subtitle="Average usage"
                  color="secondary.main"
                />
              </Grid>

              {/* Scan Performance */}
              <Grid item xs={6}>
                <MetricCard
                  icon={<TimerIcon />}
                  title="Scan Avg"
                  value={`${resourceData.scanDurationAvgMs || 0}ms`}
                  subtitle="Average cycle time"
                  color="info.main"
                />
              </Grid>

              <Grid item xs={6}>
                <MetricCard
                  icon={<TimerIcon />}
                  title="Scan Max"
                  value={`${resourceData.scanDurationMaxMs || 0}ms`}
                  subtitle="Longest cycle"
                  color="info.main"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Session Info */}
            <Box mb={3}>
              <Typography variant="caption" color="text.secondary" display="block">
                Uptime: <strong>{formatDuration((resourceData.uptimeSeconds || 0) * 1000)}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Scan Rate: <strong>{resourceData.scanRateMs || 1000}ms</strong>
              </Typography>
              {resourceData.lastScanAt && (
                <Typography variant="caption" color="text.secondary" display="block">
                  Last Scan: <strong>{new Date(resourceData.lastScanAt).toLocaleTimeString()}</strong>
                </Typography>
              )}
            </Box>
          </>
        )}

        {/* Historical Chart - always show if dialog is open */}
        {open && (
          <Box mt={resourceData ? 3 : 0}>
            <Typography variant="subtitle2" gutterBottom>
              Historical Resource Usage
            </Typography>
            {loadingChart ? (
              <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LinearProgress sx={{ width: '50%' }} />
              </Box>
            ) : chartId ? (
              <ChartLoader
                chartId={chartId}
                compactMode={true}
                height={300}
                showPreferencesButton={false}
                autoRefreshEnabled={true}
                refreshInterval={0.5}
                contextType="flow-monitor"
              />
            ) : (
              <Alert severity="info">
                Chart will appear once flow resource metrics are being saved.
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
});

FlowResourceMonitor.displayName = 'FlowResourceMonitor';

export default FlowResourceMonitor;
