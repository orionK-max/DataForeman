import React, { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  CircularProgress,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
  IconButton,
  Collapse,
  Grid,
  Alert,
  AlertTitle,
  Tooltip
} from '@mui/material';
import { apiClient } from '../../services/api';
import diagnosticService from '../../services/diagnosticService';
import { usePermissions } from '../../contexts/PermissionsContext';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return 'n/a';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildHealthRows(summary, servicesStatus) {
  const rows = [];
  
  // Backend (Core)
  rows.push({
    key: 'core',
    label: 'Backend (Core)',
    ok: summary?.core?.health?.status === 'ok' && !!summary?.core?.ready?.ready,
    text: summary?.core?.health?.status === 'ok' ? 'OK' : 'DOWN',
    desc: 'Backend and API logic.',
    restartable: false,
  });

  // Main system DB
  rows.push({
    key: 'db',
    label: 'Postgres',
    ok: summary?.db === 'up',
    text: summary?.db === 'up' ? 'UP' : 'DOWN',
    desc: 'Primary database for configuration.',
    restartable: false,
  });

  // System messaging (NATS)
  rows.push({
    key: 'nats',
    label: 'NATS',
    ok: !!summary?.nats?.ok,
    text: summary?.nats?.ok ? 'OK' : 'DOWN',
    desc: 'NATS server for inter-service messaging.',
    restartable: false,
  });

  // TimescaleDB
  rows.push({
    key: 'tsdb',
    label: 'TimescaleDB',
    ok: summary?.tsdb === 'up',
    text: summary?.tsdb === 'up' ? 'UP' : 'DOWN',
    desc: 'Time-series DB for telemetry data.',
    restartable: false,
  });

  // Connectivity
  const connectivityRunning = servicesStatus?.connectivity?.running ?? true;
  const connectivityOk = !!summary?.connectivity?.ok && connectivityRunning;
  const hasConnections = summary?.connectivity?.hasConnections;
  
  rows.push({
    key: 'connectivity',
    label: 'Connectivity',
    ok: connectivityOk && hasConnections, // Only show green if OK AND has connections
    warning: connectivityOk && !hasConnections, // Show warning if OK but NO connections
    text: connectivityOk ? 'OK' : 'DOWN',
    desc: `Connects to devices · ${summary?.connectivity?.connections ?? 0} active`,
    restartable: true,
    serviceName: 'connectivity',
    containerRunning: connectivityRunning,
  });

  // Frontend
  rows.push({
    key: 'frontend',
    label: 'Frontend',
    ok: !!summary?.front?.ok,
    text: summary?.front?.ok ? 'OK' : 'DOWN',
    desc: 'User Interface',
    restartable: false,
  });

  // Caddy
  rows.push({
    key: 'caddy',
    label: 'Caddy',
    ok: !!summary?.caddy?.ok,
    text: summary?.caddy?.ok ? 'OK' : 'DOWN',
    desc: 'Reverse proxy and TLS termination',
    restartable: false,
  });

  // Core Ingestion (replaces standalone ingestor)
  const coreIngestionActive = summary?.coreIngestion?.activeRecently === true;
  const coreIngestionHasConnections = summary?.coreIngestion?.hasConnections;
  
  rows.push({
    key: 'core-ingestion',
    label: 'Telemetry Ingestion',
    ok: coreIngestionActive && coreIngestionHasConnections, // GREEN: active with connections
    warning: !coreIngestionHasConnections, // ORANGE: no connections (whether active or idle)
    text: coreIngestionActive ? 'ACTIVE' : 'IDLE',
    desc: 'Core service telemetry ingestion',
    restartable: false,
  });

  return rows;
}

export default function OverviewTab() {
  const { can } = usePermissions();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Service status state
  const [servicesStatus, setServicesStatus] = useState(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [restartingService, setRestartingService] = useState(null);
  const [restartMessage, setRestartMessage] = useState(null);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [component, setComponent] = useState('core');
  const [level, setLevel] = useState('');
  const [contains, setContains] = useState('');
  const [limit, setLimit] = useState(100);
  const [tail, setTail] = useState(true);
  const [hideInternalPings, setHideInternalPings] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const componentOptions = [
    'core',
    'connectivity',
    'nats',
    'ops',
    'postgres',
    'tsdb',
    'frontend',
  ];

  const levels = ['', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  const fetchStatus = async () => {
    try {
      const data = await diagnosticService.getSummary();
      setSummary(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch diagnostic summary:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchServicesStatus = async () => {
    setServicesLoading(true);
    try {
      const data = await diagnosticService.getServicesStatus();
      setServicesStatus(data.services);
    } catch (err) {
      console.error('Failed to fetch services status:', err);
    } finally {
      setServicesLoading(false);
    }
  };

  const handleRestartService = async (serviceName) => {
    setRestartingService(serviceName);
    setRestartMessage(null);
    try {
      const result = await diagnosticService.restartService(serviceName);
      setRestartMessage({ 
        type: 'success', 
        text: result.message || `${serviceName} restart initiated successfully` 
      });
      // Refresh both statuses after a delay
      setTimeout(() => {
        fetchStatus();
        fetchServicesStatus();
      }, 2000);
    } catch (err) {
      console.error(`Failed to restart ${serviceName}:`, err);
      setRestartMessage({ 
        type: 'error', 
        text: err.message || `Failed to restart ${serviceName}` 
      });
    } finally {
      setRestartingService(null);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        component,
        limit: limit.toString(),
        tail: tail.toString()
      });
      if (level) params.append('level', level);
      if (contains) params.append('contains', contains);
      if (hideInternalPings) params.append('hideInternalPings', 'true');

      const data = await apiClient.get(`/logs/read?${params}`);
      setLogs(data.entries || []);
      setLogsError(null);
    } catch (err) {
      setLogsError(err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchServicesStatus();
    const interval = setInterval(() => {
      fetchStatus();
      fetchServicesStatus();
    }, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [component, level, contains, limit, tail, hideInternalPings]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, component, level, contains, limit, tail, hideInternalPings]);

  const toggleRowExpand = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const getLevelColor = (lvl) => {
    const l = lvl?.toLowerCase();
    if (l === 'error' || l === 'fatal') return '#ef4444';
    if (l === 'warn') return '#f59e0b';
    if (l === 'info') return '#3b82f6';
    if (l === 'debug') return '#8b5cf6';
    return '#6b7280';
  };

  const formatTimestamp = (ts) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const getHealthColor = (ok, warning) => {
    if (warning) return { bgcolor: '#f59e0b', color: 'white' }; // orange for warning state - check this FIRST
    if (ok) return { bgcolor: '#10b981', color: 'white' };
    return { bgcolor: '#ef4444', color: 'white' };
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom color="error">Error Loading System Status</Typography>
        <Typography color="error" fontSize="0.875rem">{error}</Typography>
        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
          Make sure you're logged in with admin privileges and the diagnostic feature is licensed.
        </Typography>
      </Paper>
    );
  }

  const healthRows = buildHealthRows(summary || {}, servicesStatus);

  return (
    <Box>
      {/* System Health Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>System Health Status</Typography>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <>
            <Typography variant="body2" gutterBottom color="error">Error Loading System Status</Typography>
            <Typography color="error" fontSize="0.875rem">{error}</Typography>
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Make sure you're logged in with admin privileges and the diagnostic feature is licensed.
            </Typography>
          </>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ '& th': { fontWeight: 600, fontSize: '0.75rem' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Component</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {healthRows.map((row) => (
                  <TableRow 
                    key={row.key}
                    sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                      {row.label}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.text}
                        size="small"
                        sx={{
                          ...getHealthColor(row.ok, row.warning),
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          minWidth: 60
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {row.desc}
                    </TableCell>
                    <TableCell align="right">
                      {row.restartable && (
                        can('diagnostic.system', 'update') ? (
                          <Button
                            size="small"
                            startIcon={<RestartAltIcon />}
                            onClick={() => handleRestartService(row.serviceName)}
                            disabled={restartingService === row.serviceName}
                            variant={!row.containerRunning ? "contained" : "outlined"}
                            color={!row.containerRunning ? "primary" : "inherit"}
                          >
                            {restartingService === row.serviceName ? 'Restarting...' : 'Restart'}
                          </Button>
                        ) : (
                          <Tooltip title="Requires 'System Diagnostics' UPDATE permission">
                            <span>
                              <Button
                                size="small"
                                startIcon={<RestartAltIcon />}
                                disabled
                                variant="outlined"
                                color="inherit"
                              >
                                Restart
                              </Button>
                            </span>
                          </Tooltip>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Restart Status Message */}
        {restartMessage && (
          <Alert 
            severity={restartMessage.type} 
            sx={{ mt: 2 }}
            onClose={() => setRestartMessage(null)}
          >
            {restartMessage.text}
          </Alert>
        )}
      </Paper>

      {/* Logs Section */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Logs</Typography>

        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            value={component}
            onChange={(e) => setComponent(e.target.value)}
            size="small"
            sx={{ minWidth: 140, fontSize: '0.75rem' }}
          >
            {componentOptions.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>

          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            size="small"
            displayEmpty
            sx={{ minWidth: 100, fontSize: '0.75rem' }}
          >
            <MenuItem value="">All Levels</MenuItem>
            {levels.filter(l => l).map((l) => (
              <MenuItem key={l} value={l}>{l}</MenuItem>
            ))}
          </Select>

          <TextField
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder="Contains..."
            size="small"
            sx={{ minWidth: 150, fontSize: '0.75rem' }}
          />

          <TextField
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(5000, parseInt(e.target.value) || 100)))}
            type="number"
            label="Limit"
            size="small"
            sx={{ width: 80, fontSize: '0.75rem' }}
            inputProps={{ min: 1, max: 5000 }}
          />

          <FormControlLabel
            control={<Checkbox checked={tail} onChange={(e) => setTail(e.target.checked)} size="small" />}
            label="Newest First"
            sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
          />

          <FormControlLabel
            control={<Checkbox checked={hideInternalPings} onChange={(e) => setHideInternalPings(e.target.checked)} size="small" />}
            label="Hide Pings"
            sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
          />

          <FormControlLabel
            control={<Checkbox checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} size="small" />}
            label="Auto-Refresh"
            sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
          />

          <Button
            variant="contained"
            size="small"
            onClick={fetchLogs}
            startIcon={logsLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
            disabled={logsLoading}
            sx={{ fontSize: '0.75rem' }}
          >
            Refresh
          </Button>
        </Box>

        {logsError && (
          <Box sx={{ 
            mb: 2, 
            p: 1, 
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.1)' : 'error.light',
            border: 1,
            borderColor: 'error.main',
            borderRadius: 1 
          }}>
            <Typography color="error" fontSize="0.75rem">Error: {logsError}</Typography>
          </Box>
        )}

        {/* Logs Table */}
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table size="small" stickyHeader sx={{ '& th': { fontWeight: 600, fontSize: '0.75rem', bgcolor: 'background.paper' } }}>
            <TableHead>
              <TableRow>
                <TableCell width={30}></TableCell>
                <TableCell width={200}>Time</TableCell>
                <TableCell width={80}>Level</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log, idx) => {
                const isExpanded = expandedRows.has(idx);
                const { time, level, msg, message, line, ...rest } = log;
                const hasJson = Object.keys(rest).length > 0;
                const displayMessage = msg || message || line || '';
                
                return (
                  <React.Fragment key={idx}>
                    <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell padding="none" align="center">
                        {hasJson && (
                          <IconButton size="small" onClick={() => toggleRowExpand(idx)}>
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {formatTimestamp(log.time)}
                      </TableCell>
                      <TableCell>
                        <Box
                          component="span"
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: getLevelColor(log.level),
                            textTransform: 'uppercase'
                          }}
                        >
                          {log.level || 'info'}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        {displayMessage}
                      </TableCell>
                    </TableRow>
                    {hasJson && (
                      <TableRow>
                        <TableCell colSpan={4} sx={{ p: 0, borderBottom: isExpanded ? '1px solid' : 'none', borderColor: 'divider' }}>
                          <Collapse in={isExpanded}>
                            <Box sx={{ p: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.4)' : 'grey.100' }}>
                              <pre style={{ 
                                margin: 0, 
                                fontSize: '0.75rem', 
                                overflow: 'auto',
                                color: 'inherit',
                                backgroundColor: 'transparent'
                              }}>
                                {JSON.stringify(rest, null, 2)}
                              </pre>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {logs.length === 0 && !logsLoading && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography color="text.secondary" fontSize="0.75rem">No logs found</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
