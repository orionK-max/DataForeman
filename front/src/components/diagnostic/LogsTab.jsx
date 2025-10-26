import React, { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  IconButton,
  Collapse
} from '@mui/material';
import { apiClient } from '../../services/api';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

export default function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters
  const [component, setComponent] = useState('frontend');
  const [level, setLevel] = useState('');
  const [contains, setContains] = useState('');
  const [limit, setLimit] = useState(100);
  const [tail, setTail] = useState(true);
  const [hideInternalPings, setHideInternalPings] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Expanded JSON rows
  const [expandedRows, setExpandedRows] = useState(new Set());

  const componentOptions = [
    'frontend',
    'core',
    'connectivity',
    'nats',
    'ops',
    'postgres',
  ];

  const levels = ['', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  const fetchLogs = async () => {
    setLoading(true);
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
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  return (
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
          label="Tail"
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
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          disabled={loading}
          sx={{ fontSize: '0.75rem' }}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Box sx={{ mb: 2, p: 1, bgcolor: '#fef2f2', border: '1px solid #ef4444', borderRadius: 1 }}>
          <Typography color="error" fontSize="0.75rem">Error: {error}</Typography>
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
              // Check if there's additional JSON data beyond the basic fields
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
                          <Box sx={{ p: 2, bgcolor: '#1e1e1e' }}>
                            <pre style={{ 
                              margin: 0, 
                              fontSize: '0.75rem', 
                              overflow: 'auto',
                              color: '#d4d4d4',
                              backgroundColor: '#1e1e1e'
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

      {logs.length === 0 && !loading && (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="text.secondary" fontSize="0.75rem">No logs found</Typography>
        </Box>
      )}
    </Paper>
  );
}
