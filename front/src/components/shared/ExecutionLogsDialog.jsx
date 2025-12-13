/**
 * Simplified Execution Logs Dialog
 * For viewing flow execution logs in dashboard widget and parameter execution dialog
 * Focused on essential features: search, level filter, timestamps
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  CircularProgress,
  IconButton,
  Chip,
  FormControlLabel,
  Checkbox,
  Paper,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  BugReport as DebugIcon,
  GetApp as ExportIcon,
  VerticalAlignBottom as ScrollDownIcon,
} from '@mui/icons-material';
import { getExecutionLogs, getFlowLogs } from '../../services/flowsApi';

const getLogLevelConfig = (theme) => ({
  debug: { 
    icon: DebugIcon, 
    color: theme.palette.mode === 'dark' ? '#bdbdbd' : '#757575',
    label: 'Debug' 
  },
  info: { 
    icon: InfoIcon, 
    color: theme.palette.mode === 'dark' ? '#64b5f6' : '#1976d2',
    label: 'Info' 
  },
  warn: { 
    icon: WarningIcon, 
    color: theme.palette.mode === 'dark' ? '#ffb74d' : '#f57c00',
    label: 'Warning' 
  },
  error: { 
    icon: ErrorIcon, 
    color: theme.palette.mode === 'dark' ? '#e57373' : '#d32f2f',
    label: 'Error' 
  },
});

export default function ExecutionLogsDialog({ 
  open, 
  onClose, 
  flowId, 
  flowName,
  executionId = null // If null, shows all recent flow logs
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [nodeFilter, setNodeFilter] = useState('all');
  
  const logContainerRef = useRef(null);
  const theme = useTheme();
  const LOG_LEVELS = useMemo(() => getLogLevelConfig(theme), [theme]);

  // Load logs
  useEffect(() => {
    if (!open || !flowId) return;
    
    const loadLogs = async () => {
      setLoading(true);
      try {
        let response;
        if (executionId) {
          response = await getExecutionLogs(flowId, executionId);
        } else {
          response = await getFlowLogs(flowId, { limit: 200 });
        }
        
        // Reverse to show oldest first (newest at bottom)
        const sortedLogs = (response.logs || []).reverse();
        setLogs(sortedLogs);
      } catch (err) {
        console.error('Failed to load logs:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadLogs();
  }, [open, flowId, executionId]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Get unique node IDs for filter
  const nodeIds = useMemo(() => {
    const unique = new Set(logs.map(log => log.node_id).filter(Boolean));
    return Array.from(unique).sort();
  }, [logs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Node filter
      if (nodeFilter !== 'all' && log.node_id !== nodeFilter) {
        return false;
      }
      
      // Search text
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const messageMatch = log.message?.toLowerCase().includes(searchLower);
        const nodeMatch = log.node_id?.toLowerCase().includes(searchLower);
        return messageMatch || nodeMatch;
      }
      
      return true;
    });
  }, [logs, searchText, nodeFilter]);

  // Export logs
  const handleExport = () => {
    const text = filteredLogs.map(log => {
      const timestamp = new Date(log.timestamp).toISOString();
      const level = (log.level || 'info').toUpperCase();
      const node = log.node_id ? `[${log.node_id}]` : '';
      return `${timestamp} ${level} ${node} ${log.message}`;
    }).join('\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow-${flowId}-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleScrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6" component="span">
              Execution Logs
            </Typography>
            {flowName && (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} component="span">
                {flowName}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Filters */}
        <Box sx={{ p: 2, pb: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            sx={{ minWidth: 200, flex: 1 }}
          />

          {nodeIds.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Node</InputLabel>
              <Select
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
                label="Node"
              >
                <MenuItem value="all">All Nodes</MenuItem>
                {nodeIds.map(nodeId => (
                  <MenuItem key={nodeId} value={nodeId}>{nodeId}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                size="small"
              />
            }
            label="Auto-scroll"
          />
        </Box>

        {/* Logs Display */}
        <Box 
          ref={logContainerRef}
          sx={{ 
            flex: 1, 
            overflow: 'auto', 
            p: 1,
            bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            fontFamily: 'monospace',
            fontSize: '0.75rem'
          }}
        >
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
              <CircularProgress />
            </Box>
          ) : filteredLogs.length === 0 ? (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%" flexDirection="column">
              <Typography color="text.secondary">No logs found</Typography>
              {searchText && (
                <Typography variant="caption" color="text.secondary">
                  Try adjusting your search or filters
                </Typography>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {filteredLogs.map((log, index) => {
                const levelConfig = LOG_LEVELS[log.level] || LOG_LEVELS.info;
                const LevelIcon = levelConfig.icon;
                
                return (
                  <Paper
                    key={index}
                    sx={{
                      p: 1,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                      bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'background.paper',
                      border: 1,
                      borderColor: 'divider'
                    }}
                  >
                    <LevelIcon 
                      sx={{ 
                        fontSize: 16, 
                        color: levelConfig.color,
                        mt: 0.25
                      }} 
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            color: 'text.secondary',
                            fontFamily: 'monospace'
                          }}
                        >
                          {formatTimestamp(log.timestamp)}
                        </Typography>
                        {log.node_id && (
                          <Chip 
                            label={log.node_id} 
                            size="small" 
                            sx={{ 
                              height: 18, 
                              fontSize: '0.65rem',
                              fontFamily: 'monospace'
                            }} 
                          />
                        )}
                        <Chip
                          label={levelConfig.label}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            bgcolor: levelConfig.color,
                            color: 'white'
                          }}
                        />
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {log.message}
                      </Typography>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Scroll to bottom button */}
        {!autoScroll && (
          <IconButton
            onClick={handleScrollToBottom}
            sx={{
              position: 'absolute',
              bottom: 70,
              right: 24,
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': { bgcolor: 'primary.dark' },
              boxShadow: 3
            }}
          >
            <ScrollDownIcon />
          </IconButton>
        )}
      </DialogContent>

      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 1 }}>
          Showing {filteredLogs.length} of {logs.length} logs
        </Typography>
        <Button
          startIcon={<ExportIcon />}
          onClick={handleExport}
          disabled={filteredLogs.length === 0}
        >
          Export
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
