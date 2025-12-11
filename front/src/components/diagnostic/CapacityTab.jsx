import React, { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  Tabs,
  Tab,
  Grid,
  CircularProgress,
  Alert,
  Tooltip,
  TextField,
  Button,
  LinearProgress
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import SpeedIcon from '@mui/icons-material/Speed';
import { apiClient } from '../../services/api';
import adminService from '../../services/adminService';
import ChartLoader from '../chart/ChartLoader';
import { EipTuningPanel } from './EipTuningPanel';
import { EipShardPanel } from './EipShardPanel';
import { ChartComposerProvider } from '../../contexts/ChartComposerContext';

export default function CapacityTab() {
  const [subTab, setSubTab] = useState('system');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Metrics data for stats display
  const [connectivityStatus, setConnectivityStatus] = useState(null);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [ingestorMetrics, setIngestorMetrics] = useState(null);
  
  // Retention policy settings
  const [retentionDays, setRetentionDays] = useState(30);
  const [compressionDays, setCompressionDays] = useState(7);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState('');
  const [policyMessageType, setPolicyMessageType] = useState('success');
  
  // System metrics settings
  const [pollMs, setPollMs] = useState(5000);
  const [metricsRetentionDays, setMetricsRetentionDays] = useState(30);
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [metricsMessage, setMetricsMessage] = useState('');
  const [metricsMessageType, setMetricsMessageType] = useState('success');
  
  // Capacity recalculation
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState('');
  
  // System chart IDs (dynamically loaded from backend)
  const [chartIds, setChartIds] = useState({
    lan: null,
    system: null,
    ingestor: null
  });

  // Fetch capacity charts from backend
  const fetchCapacityCharts = async () => {
    try {
      const response = await apiClient.get('/charts/capacity-charts');
      if (response?.charts) {
        // Map charts by name to IDs
        const idMap = {};
        response.charts.forEach(chart => {
          if (chart.name === 'LAN Throughput') idMap.lan = chart.id;
          if (chart.name === 'System Resources') idMap.system = chart.id;
          if (chart.name === 'Ingestor Flush Metrics') idMap.ingestor = chart.id;
        });
        setChartIds(idMap);
      }
    } catch (err) {
      console.error('Failed to fetch capacity charts:', err);
    }
  };

  // Fetch metrics for stats display only (not for charts - ChartLoader handles that)
  const fetchMetrics = async () => {
    try {
      const [connData, sysData, ingestData] = await Promise.all([
        apiClient.get('/connectivity/status').catch(() => null),
        apiClient.get('/diag/resources').catch(() => null),
        apiClient.get('/connectivity/summary').catch(() => null)
      ]);

      if (connData) setConnectivityStatus(connData);
      if (sysData) setSystemMetrics(sysData);
      if (ingestData) setIngestorMetrics(ingestData);

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch capacity metrics:', err);
      setError('Failed to fetch metrics');
      setLoading(false);
    }
  };

  // Manual capacity recalculation
  const handleRecalculate = async () => {
    setRecalculating(true);
    setRecalcMessage('');
    
    try {
      const response = await apiClient.post('/diag/recalculate-capacity');
      
      if (response.already_running) {
        setRecalcMessage('Calculation already in progress');
      } else {
        setRecalcMessage('Recalculation started - results will update shortly');
        // Refresh metrics after a short delay to get updated data
        setTimeout(() => {
          fetchMetrics();
          setRecalcMessage('');
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to trigger recalculation:', err);
      setRecalcMessage('Failed to trigger recalculation');
    } finally {
      setRecalculating(false);
    }
  };

  // Load retention policy configuration
  const loadRetentionConfig = async () => {
    try {
      const cfg = await adminService.getConfig();
      
      const r = Number(cfg['historian.retention_days'] ?? 30);
      const c = Number(cfg['historian.compression_days'] ?? 7);
      
      const rOk = Number.isFinite(r) && r > 0 ? Math.floor(r) : 30;
      const cOk = Number.isFinite(c) && c > 0 ? Math.floor(c) : Math.max(1, Math.floor(rOk / 2));
      
      setRetentionDays(rOk);
      setCompressionDays(Math.min(cOk, Math.max(1, rOk - 1)));
    } catch (err) {
      console.error('Failed to load retention config:', err);
    }
  };

  // Save retention policy
  const handleSaveRetentionPolicy = async () => {
    setSavingPolicy(true);
    setPolicyMessage('');
    
    try {
      let r = Math.max(1, Math.floor(Number(retentionDays) || 30));
      let c = Math.max(1, Math.floor(Number(compressionDays) || 7));
      
      // Auto-correct: compression must be less than retention
      if (c >= r) {
        c = Math.max(1, Math.floor(r / 2));
        setCompressionDays(c);
      }
      
      const body = {
        'historian.retention_days': r,
        'historian.compression_days': c,
      };
      
      const res = await adminService.updateConfig(body);
      
      if (res?.error) {
        setPolicyMessage(String(res.error));
        setPolicyMessageType('error');
      } else {
        setPolicyMessage('Retention policy saved. Capacity will recalculate shortly.');
        setPolicyMessageType('success');
        // Refresh metrics after a short delay
        setTimeout(fetchMetrics, 2000);
      }
    } catch (err) {
      setPolicyMessage(err.message || 'Failed to save retention policy');
      setPolicyMessageType('error');
    } finally {
      setSavingPolicy(false);
    }
  };

  // Load system metrics config
  const loadMetricsConfig = async () => {
    try {
      const cfg = await adminService.getConfig();
      
      const p = Number(cfg['system_metrics.poll_ms']);
      const r = Number(cfg['system_metrics.retention_days']);
      
      setPollMs(Number.isFinite(p) && p >= 500 ? p : 5000);
      setMetricsRetentionDays(Number.isFinite(r) && r > 0 ? r : 30);
    } catch (err) {
      console.error('Failed to load metrics config:', err);
      setPollMs(5000);
      setMetricsRetentionDays(30);
    }
  };

  // Save system metrics config
  const handleSaveMetricsConfig = async () => {
    setSavingMetrics(true);
    setMetricsMessage('');
    
    try {
      const body = {
        'system_metrics.poll_ms': Math.max(500, Math.floor(Number(pollMs) || 5000)),
        'system_metrics.retention_days': Math.max(1, Math.floor(Number(metricsRetentionDays) || 30)),
      };
      
      const res = await adminService.updateConfig(body);
      
      if (res?.error) {
        setMetricsMessage(String(res.error));
        setMetricsMessageType('error');
      } else {
        setMetricsMessage('System metrics configuration saved successfully');
        setMetricsMessageType('success');
      }
    } catch (err) {
      setMetricsMessage(err.message || 'Failed to save configuration');
      setMetricsMessageType('error');
    } finally {
      setSavingMetrics(false);
    }
  };

  useEffect(() => {
    // Fetch charts and config on mount
    fetchCapacityCharts();
    loadRetentionConfig();
    loadMetricsConfig();
    
    // Fetch metrics and set up polling
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <Paper sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Paper>
    );
  }

  return (
    <ChartComposerProvider>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Capacity</Typography>

        <Tabs value={subTab} onChange={(e, newVal) => setSubTab(newVal)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="System" value="system" />
          <Tab label="Retention Policy" value="retention" />
          <Tab label="System Metrics" value="metrics" />
        </Tabs>

      {subTab === 'system' && (
        <Box>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Capacity Recalculation Control */}
              <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={recalculating ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={handleRecalculate}
                  disabled={recalculating}
                >
                  Recalculate Capacity
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Auto-calculated every 15 minutes
                </Typography>
                {recalcMessage && (
                  <Typography variant="caption" color="primary.main" sx={{ fontWeight: 500 }}>
                    {recalcMessage}
                  </Typography>
                )}
              </Box>

              {/* Metrics Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {/* Disk Capacity Card - Featured */}
                <Grid item xs={12} md={6}>
                  <Paper 
                    sx={{ 
                      p: 2, 
                      height: '100%', 
                      bgcolor: 'background.paper',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      border: systemMetrics?.capacity?.days_remaining != null && systemMetrics.capacity.days_remaining < 30 
                        ? '2px solid' 
                        : 'none',
                      borderColor: 'error.main',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Disk Capacity
                    </Typography>
                    {systemMetrics?.capacity ? (
                      <>
                        {/* Steady State Mode - Retention Active */}
                        {systemMetrics.capacity.mode === 'steady_state' && (
                          <>
                            <Typography 
                              variant="h3" 
                              fontWeight={700} 
                              sx={{ lineHeight: 1 }}
                              color="success.main"
                            >
                              ✓
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                              Steady State
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center' }}>
                              {systemMetrics.capacity.retention_days} day retention · ~{Math.round((systemMetrics.capacity.steady_state_bytes || 0) / 1024 / 1024 / 1024)} GB max
                            </Typography>
                          </>
                        )}
                        
                        {/* Growth Mode with Retention - Heading to Steady State */}
                        {systemMetrics.capacity.mode === 'growth' && systemMetrics.capacity.retention_days && (
                          <>
                            <Typography 
                              variant="h2" 
                              fontWeight={700} 
                              sx={{ lineHeight: 1 }}
                              color="primary.main"
                            >
                              {systemMetrics.capacity.days_until_steady_state}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              days to steady state
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center' }}>
                              {systemMetrics.capacity.retention_days} day retention · ~{Math.round((systemMetrics.capacity.steady_state_bytes || 0) / 1024 / 1024 / 1024)} GB max
                            </Typography>
                          </>
                        )}
                        
                        {/* Growth Mode without Retention - Days Until Full */}
                        {systemMetrics.capacity.mode === 'growth' && !systemMetrics.capacity.retention_days && systemMetrics.capacity.days_remaining != null && (
                          <>
                            <Typography 
                              variant="h2" 
                              fontWeight={700} 
                              sx={{ lineHeight: 1 }}
                              color={systemMetrics.capacity.days_remaining < 30 ? 'error.main' : 'primary.main'}
                            >
                              {systemMetrics.capacity.days_remaining}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              days until full
                            </Typography>
                            <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, textAlign: 'center', fontWeight: 600 }}>
                              ⚠ No retention policy
                            </Typography>
                          </>
                        )}
                        
                        {/* Additional Info */}
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                          {systemMetrics.capacity.rows_last_24h?.toLocaleString()} rows/24h · ~{Math.round((systemMetrics.capacity.estimated_bytes_per_day || 0) / 1024 / 1024)} MB/day
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Calculating...
                      </Typography>
                    )}
                  </Paper>
                </Grid>

                {/* System Card */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'background.paper' }}>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ mb: 2 }}>
                      System Resources
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                      {/* CPU */}
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SpeedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                            <Typography variant="body2" fontWeight={500}>CPU</Typography>
                          </Box>
                          <Typography 
                            variant="body2" 
                            fontWeight={700}
                            color={
                              (systemMetrics?.cpu?.host_pct ?? systemMetrics?.cpu?.usage_pct ?? 0) > 80 ? 'error.main' :
                              (systemMetrics?.cpu?.host_pct ?? systemMetrics?.cpu?.usage_pct ?? 0) > 60 ? 'warning.main' :
                              'success.main'
                            }
                          >
                            {systemMetrics?.cpu?.host_pct?.toFixed(1) ?? systemMetrics?.cpu?.usage_pct?.toFixed(1) ?? '–'}%
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(100, systemMetrics?.cpu?.host_pct ?? systemMetrics?.cpu?.usage_pct ?? 0)}
                          sx={{
                            height: 8,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: 
                                (systemMetrics?.cpu?.host_pct ?? systemMetrics?.cpu?.usage_pct ?? 0) > 80 ? 'error.main' :
                                (systemMetrics?.cpu?.host_pct ?? systemMetrics?.cpu?.usage_pct ?? 0) > 60 ? 'warning.main' :
                                'success.main',
                              borderRadius: 1,
                            }
                          }}
                        />
                      </Box>

                      {/* Memory */}
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MemoryIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                            <Typography variant="body2" fontWeight={500}>Memory</Typography>
                          </Box>
                          <Typography 
                            variant="body2" 
                            fontWeight={700}
                            color={
                              (systemMetrics?.memory?.host_pct ?? 0) > 80 ? 'error.main' :
                              (systemMetrics?.memory?.host_pct ?? 0) > 60 ? 'warning.main' :
                              'success.main'
                            }
                          >
                            {systemMetrics?.memory?.host_pct?.toFixed(1) ?? (systemMetrics?.memory ? ((systemMetrics.memory.used_bytes / systemMetrics.memory.total_bytes) * 100).toFixed(1) : '–')}%
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(100, systemMetrics?.memory?.host_pct ?? (systemMetrics?.memory ? ((systemMetrics.memory.used_bytes / systemMetrics.memory.total_bytes) * 100) : 0))}
                          sx={{
                            height: 8,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: 
                                (systemMetrics?.memory?.host_pct ?? 0) > 80 ? 'error.main' :
                                (systemMetrics?.memory?.host_pct ?? 0) > 60 ? 'warning.main' :
                                'success.main',
                              borderRadius: 1,
                            }
                          }}
                        />
                      </Box>

                      {/* Disk */}
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <StorageIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                            <Typography variant="body2" fontWeight={500}>Disk</Typography>
                          </Box>
                          <Typography 
                            variant="body2" 
                            fontWeight={700}
                            color={
                              (systemMetrics?.disks?.[0] ? ((systemMetrics.disks[0].used_bytes / systemMetrics.disks[0].size_bytes) * 100) : 0) > 80 ? 'error.main' :
                              (systemMetrics?.disks?.[0] ? ((systemMetrics.disks[0].used_bytes / systemMetrics.disks[0].size_bytes) * 100) : 0) > 60 ? 'warning.main' :
                              'success.main'
                            }
                          >
                            {systemMetrics?.disks?.[0] ? ((systemMetrics.disks[0].used_bytes / systemMetrics.disks[0].size_bytes) * 100).toFixed(1) : '–'}%
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(100, systemMetrics?.disks?.[0] ? ((systemMetrics.disks[0].used_bytes / systemMetrics.disks[0].size_bytes) * 100) : 0)}
                          sx={{
                            height: 8,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: 
                                (systemMetrics?.disks?.[0] ? ((systemMetrics.disks[0].used_bytes / systemMetrics.disks[0].size_bytes) * 100) : 0) > 80 ? 'error.main' :
                                (systemMetrics?.disks?.[0] ? ((systemMetrics.disks[0].used_bytes / systemMetrics.disks[0].size_bytes) * 100) : 0) > 60 ? 'warning.main' :
                                'success.main',
                              borderRadius: 1,
                            }
                          }}
                        />
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>

              {/* Charts */}
              <Grid container spacing={2}>
                {/* LAN Throughput Chart */}
                <Grid item xs={12} md={4}>
                  {chartIds.lan ? (
                    <ChartLoader
                      chartId={chartIds.lan}
                      compactMode={true}
                      height={280}
                      showPreferencesButton={true}
                      autoRefreshEnabled={true}
                      refreshInterval={1}
                      contextType="diagnostic"
                    />
                  ) : (
                    <Paper sx={{ p: 2, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Paper>
                  )}
                </Grid>

                {/* System Resources Chart */}
                <Grid item xs={12} md={4}>
                  {chartIds.system ? (
                    <ChartLoader
                      chartId={chartIds.system}
                      compactMode={true}
                      height={280}
                      showPreferencesButton={true}
                      autoRefreshEnabled={true}
                      refreshInterval={1}
                      contextType="diagnostic"
                    />
                  ) : (
                    <Paper sx={{ p: 2, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Paper>
                  )}
                </Grid>

                {/* Ingestor Flush Chart */}
                <Grid item xs={12} md={4}>
                  {chartIds.ingestor ? (
                    <ChartLoader
                      chartId={chartIds.ingestor}
                      compactMode={true}
                      height={280}
                      showPreferencesButton={true}
                      autoRefreshEnabled={true}
                      refreshInterval={1}
                      contextType="diagnostic"
                    />
                  ) : (
                    <Paper sx={{ p: 2, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Paper>
                  )}
                </Grid>
              </Grid>
            </>
          )}
        </Box>
      )}

      {subTab === 'retention' && (
        <Box>
          <Grid container spacing={3} sx={{ maxWidth: 800 }}>
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Data Retention Policy
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Configure how long telemetry data is retained and when it gets compressed. 
                  Retention policies help manage disk space by automatically removing old data.
                </Typography>

                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Retention Period (days)"
                      inputProps={{ min: 1, step: 1 }}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value))}
                      helperText="How long to keep telemetry data before deletion"
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Compression Threshold (days)"
                      inputProps={{ min: 1, step: 1 }}
                      value={compressionDays}
                      onChange={(e) => setCompressionDays(Number(e.target.value))}
                      helperText="When to compress data (must be less than retention)"
                      error={compressionDays >= retentionDays}
                    />
                    {compressionDays >= retentionDays && (
                      <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                        Compression threshold will be auto-adjusted to {Math.max(1, Math.floor(retentionDays / 2))} days on save
                      </Typography>
                    )}
                  </Grid>

                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Current Configuration:</strong>
                        {systemMetrics?.capacity?.retention_days ? (
                          <>
                            <br />• Data will be retained for {systemMetrics.capacity.retention_days} days
                            <br />• Database will reach steady state at ~{Math.round((systemMetrics.capacity.steady_state_bytes || 0) / 1024 / 1024 / 1024)} GB
                            {systemMetrics.capacity.mode === 'growth' && systemMetrics.capacity.days_until_steady_state && (
                              <>
                                <br />• Estimated {systemMetrics.capacity.days_until_steady_state} days until steady state
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <br />• No retention policy configured - data will grow indefinitely
                            <br />• {systemMetrics?.capacity?.days_remaining != null && `Disk will be full in ~${systemMetrics.capacity.days_remaining} days`}
                          </>
                        )}
                      </Typography>
                    </Alert>
                  </Grid>

                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveRetentionPolicy}
                      disabled={savingPolicy}
                    >
                      {savingPolicy ? 'Applying Policy...' : 'Apply Retention Policy'}
                    </Button>
                  </Grid>

                  {policyMessage && (
                    <Grid item xs={12}>
                      <Alert severity={policyMessageType}>{policyMessage}</Alert>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  How Retention Works
                </Typography>
                <Box component="ul" sx={{ pl: 2 }}>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Retention Policy:</strong> Automatically deletes data older than the specified number of days
                  </Typography>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Compression:</strong> Data older than the compression threshold is compressed to save disk space
                  </Typography>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Steady State:</strong> Once retention is active, disk usage stabilizes as old data is deleted at the same rate new data arrives
                  </Typography>
                  <Typography component="li" variant="body2">
                    <strong>Policy Application:</strong> Changes take effect shortly after saving and apply to the TimescaleDB hypertable
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}

      {subTab === 'metrics' && (
        <Box>
          <Grid container spacing={3} sx={{ maxWidth: 800 }}>
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  System Metrics Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Configure how frequently system metrics (CPU, memory, disk, network) are sampled 
                  and how long the historical data is retained.
                </Typography>

                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Metrics Poll Interval (ms)"
                      inputProps={{ min: 500, step: 100 }}
                      value={pollMs}
                      onChange={(e) => setPollMs(Number(e.target.value))}
                      helperText="Minimum 500 ms. Controls server system metrics sampling."
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Metrics Retention (days)"
                      inputProps={{ min: 1, step: 1 }}
                      value={metricsRetentionDays}
                      onChange={(e) => setMetricsRetentionDays(Number(e.target.value))}
                      helperText="How long to keep system metrics data"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <Alert severity="info">
                      <Typography variant="body2">
                        <strong>Current Configuration:</strong>
                        <br />• System metrics sampled every {pollMs} ms ({(1000 / pollMs).toFixed(1)} samples/second)
                        <br />• Historical metrics retained for {metricsRetentionDays} days
                        <br />• Older metrics are automatically pruned
                      </Typography>
                    </Alert>
                  </Grid>

                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveMetricsConfig}
                      disabled={savingMetrics}
                    >
                      {savingMetrics ? 'Saving...' : 'Save Configuration'}
                    </Button>
                  </Grid>

                  {metricsMessage && (
                    <Grid item xs={12}>
                      <Alert severity={metricsMessageType}>{metricsMessage}</Alert>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  About System Metrics
                </Typography>
                <Box component="ul" sx={{ pl: 2 }}>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Poll Interval:</strong> How often the system samples CPU, memory, disk, and network metrics. Lower intervals provide more granular data but increase database writes.
                  </Typography>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Retention:</strong> System metrics are stored separately from telemetry data and have their own retention policy. Old metrics are pruned automatically.
                  </Typography>
                  <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                    <strong>Charts:</strong> The charts on the System tab use this sampled data to display real-time and historical system performance.
                  </Typography>
                  <Typography component="li" variant="body2">
                    <strong>Performance:</strong> A poll interval of 1-5 seconds provides good balance between data granularity and system overhead.
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}
    </Paper>
    </ChartComposerProvider>
  );
}
