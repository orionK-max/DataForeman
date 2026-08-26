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
  Divider,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Timer as TimerIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  InfoOutlined as InfoOutlinedIcon
} from '@mui/icons-material';
import ChartLoader from '../chart/ChartLoader';
import { LineChart } from '@mui/x-charts/LineChart';
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
 * Format an estimated bytes/day figure into a compact MB or GB per day string
 */
function formatBytesPerDay(bytes) {
  const mbPerDay = (bytes || 0) / 1024 / 1024;
  if (mbPerDay < 1) return `${(mbPerDay * 1024).toFixed(0)} KB/day`;
  if (mbPerDay < 1024) return `${mbPerDay.toFixed(1)} MB/day`;
  return `${(mbPerDay / 1024).toFixed(2)} GB/day`;
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
const MetricCard = memo(({ icon, title, value, subtitle, color = 'primary.main', hint }) => (
  <Paper sx={{ p: 1.25 }}>
    <Box display="flex" alignItems="center" mb={0.5}>
      {React.cloneElement(icon, { sx: { mr: 0.75, fontSize: '1.1rem', color } })}
      <Typography variant="caption" sx={{ fontWeight: 600 }}>{title}</Typography>
      {hint && (
        <Tooltip title={hint} placement="top" arrow>
          <IconButton size="small" sx={{ p: 0, ml: 0.5 }}>
            <InfoOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
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

  // Client-side-only rolling buffer of recent samples, used as a live preview chart when
  // "Save usage/diagnostic history" is off (nothing is persisted, so ChartLoader has nothing to
  // show). Resets whenever the modal is reopened or a different flow is viewed - this is
  // intentionally ephemeral, not a substitute for real history.
  const MAX_LIVE_SAMPLES = 60; // ~5 minutes at the hook's default 5s poll interval
  const liveBufferRef = useRef([]);
  const [liveBuffer, setLiveBuffer] = useState([]);

  useEffect(() => {
    liveBufferRef.current = [];
    setLiveBuffer([]);
  }, [flowId, open]);

  useEffect(() => {
    if (!open || !resourceData || resourceData.saveUsageData !== false) return;
    const sample = {
      t: Date.now(),
      scanEfficiencyPercent: resourceData.scanEfficiencyPercent || 0,
      cyclesPerSecond: resourceData.cyclesPerSecond || 0,
      memoryAvgMb: resourceData.memoryAvgMb || 0,
      scanDurationAvgMs: resourceData.scanDurationAvgMs || 0,
    };
    const next = [...liveBufferRef.current, sample].slice(-MAX_LIVE_SAMPLES);
    liveBufferRef.current = next;
    setLiveBuffer(next);
  }, [open, resourceData]);

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
            {/* Diagnostics saving off - historical chart below has nothing to show */}
            {resourceData.saveUsageData === false && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Usage diagnostics aren't being saved for this flow right now. The values below are live,
                but no trend is being recorded - the chart shows a temporary live preview instead (lost
                on refresh). Open Flow Settings to turn "Save usage/diagnostic history" back on.
              </Alert>
            )}

            {/* Warnings */}
            {hasWarnings && (
              <Box mb={2}>
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
            <Grid container spacing={1.5}>
              {/* Scan Efficiency */}
              <Grid item xs={6} sm={4}>
                <MetricCard
                  icon={<SpeedIcon />}
                  title="Scan Efficiency"
                  value={`${(resourceData.scanEfficiencyPercent || 0).toFixed(1)}%`}
                  subtitle="% of scan rate used"
                  color="primary.main"
                />
              </Grid>

              {/* Cycles per Second */}
              <Grid item xs={6} sm={4}>
                <MetricCard
                  icon={<SpeedIcon />}
                  title="Cycles/Second"
                  value={`${(resourceData.cyclesPerSecond || 0).toFixed(2)}`}
                  subtitle={`${resourceData.totalCycles || 0} total cycles`}
                  color="success.main"
                />
              </Grid>

              {/* Memory Usage */}
              <Grid item xs={6} sm={4}>
                <MetricCard
                  icon={<MemoryIcon />}
                  title="Memory Peak"
                  value={formatMemory(resourceData.memoryPeakMb)}
                  subtitle="Highest usage"
                  color="secondary.main"
                />
              </Grid>

              <Grid item xs={6} sm={4}>
                <MetricCard
                  icon={<MemoryIcon />}
                  title="Memory Avg"
                  value={formatMemory(resourceData.memoryAvgMb)}
                  subtitle="Average usage"
                  color="secondary.main"
                />
              </Grid>

              {/* Scan Performance */}
              <Grid item xs={6} sm={4}>
                <MetricCard
                  icon={<TimerIcon />}
                  title="Scan Avg"
                  value={`${resourceData.scanDurationAvgMs || 0}ms`}
                  subtitle="Average cycle time"
                  color="info.main"
                />
              </Grid>

              <Grid item xs={6} sm={4}>
                <MetricCard
                  icon={<TimerIcon />}
                  title="Scan Max"
                  value={`${resourceData.scanDurationMaxMs || 0}ms`}
                  subtitle="Longest cycle"
                  color="info.main"
                />
              </Grid>

              {/* Estimated Data Volume - based on this flow's current write rate, resets on restart */}
              <Grid item xs={12}>
                <MetricCard
                  icon={<StorageIcon />}
                  title="Est. Data Volume"
                  value={formatBytesPerDay(resourceData.estimatedTotalBytesPerDay)}
                  subtitle={`${formatBytesPerDay(resourceData.estimatedDataBytesPerDay)} tag writes + ${formatBytesPerDay(resourceData.estimatedDiagBytesPerDay)} diagnostics, at current rate`}
                  color="warning.main"
                  hint={
                    <>
                      <strong>Tag writes</strong>: values this flow's "Tag Output" nodes are persisting to historian tags right now.{' '}
                      <strong>Diagnostics</strong>: this flow's own scan-efficiency/memory/cycle metrics (shown above), written every scan cycle.
                      <br /><br />
                      To reduce: increase the <strong>Scan Rate</strong> (Flow Settings) to write less often, or set "Save to Database" to off on Tag Output nodes that don't need historian data.
                    </>
                  }
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 1.5 }} />

            {/* Session Info */}
            <Box mb={2} sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                Uptime: <strong>{formatDuration((resourceData.uptimeSeconds || 0) * 1000)}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Scan Rate: <strong>{resourceData.scanRateMs || 1000}ms</strong>
              </Typography>
              {resourceData.lastScanAt && (
                <Typography variant="caption" color="text.secondary">
                  Last Scan: <strong>{new Date(resourceData.lastScanAt).toLocaleTimeString()}</strong>
                </Typography>
              )}
            </Box>
          </>
        )}

        {/* Historical Chart - always show if dialog is open */}
        {open && (
          <Box mt={resourceData ? 2 : 0}>
            <Typography variant="subtitle2" gutterBottom>
              {resourceData?.saveUsageData === false ? 'Live Preview (not saved)' : 'Historical Resource Usage'}
            </Typography>
            {resourceData?.saveUsageData === false ? (
              liveBuffer.length < 2 ? (
                <Alert severity="info">Collecting live samples...</Alert>
              ) : (
                <LineChart
                  height={300}
                  xAxis={[{
                    data: liveBuffer.map((s) => s.t),
                    scaleType: 'time',
                    valueFormatter: (v) => new Date(v).toLocaleTimeString(),
                  }]}
                  series={[
                    { data: liveBuffer.map((s) => s.scanEfficiencyPercent), label: 'Scan Efficiency (%)', color: '#1976d2' },
                    { data: liveBuffer.map((s) => s.cyclesPerSecond), label: 'Cycles/Second', color: '#2e7d32' },
                    { data: liveBuffer.map((s) => s.memoryAvgMb), label: 'Memory Avg (MB)', color: '#dc004e' },
                    { data: liveBuffer.map((s) => s.scanDurationAvgMs), label: 'Scan Duration (ms)', color: '#ff9800' },
                  ]}
                />
              )
            ) : loadingChart ? (
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
