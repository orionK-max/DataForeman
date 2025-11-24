/**
 * Log Panel Component
 * Displays execution logs with filtering, grouping, and export capabilities
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormGroup,
  FormControlLabel,
  TextField,
  Chip,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Close as CloseIcon,
  DeleteSweep as ClearIcon,
  GetApp as ExportIcon,
  Refresh as RefreshIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  BugReport as DebugIcon,
  SwapVert as SwapVertIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { getExecutionLogs, getFlowLogs, clearFlowLogs } from '../../services/flowsApi';

const getLogLevels = (theme) => ({
  debug: { 
    icon: DebugIcon, 
    color: theme.palette.mode === 'dark' ? '#bdbdbd' : '#757575', 
    bgColor: theme.palette.mode === 'dark' ? 'rgba(189, 189, 189, 0.1)' : 'rgba(0, 0, 0, 0.04)', 
    label: 'Debug' 
  },
  info: { 
    icon: InfoIcon, 
    color: theme.palette.mode === 'dark' ? '#64b5f6' : '#1976d2', 
    bgColor: theme.palette.mode === 'dark' ? 'rgba(100, 181, 246, 0.1)' : 'rgba(33, 150, 243, 0.08)', 
    label: 'Info' 
  },
  warn: { 
    icon: WarningIcon, 
    color: theme.palette.mode === 'dark' ? '#ffb74d' : '#f57c00', 
    bgColor: theme.palette.mode === 'dark' ? 'rgba(255, 183, 77, 0.1)' : 'rgba(245, 124, 0, 0.08)', 
    label: 'Warning' 
  },
  error: { 
    icon: ErrorIcon, 
    color: theme.palette.mode === 'dark' ? '#e57373' : '#d32f2f', 
    bgColor: theme.palette.mode === 'dark' ? 'rgba(229, 115, 115, 0.1)' : 'rgba(211, 47, 47, 0.08)', 
    label: 'Error' 
  },
});

const GROUPING_MODES = {
  flat: 'Flat/Detailed',
  node: 'By Node',
  level: 'By Level',
  execution: 'By Execution',
};

export default function LogPanel({
  flowId,
  position = 'bottom', // 'bottom' or 'right'
  onPositionChange,
  onClose,
  currentExecutionId = null,
  onNodeHighlight = null, // Callback to highlight node in canvas
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [grouping, setGrouping] = useState('flat');
  const [levelFilters, setLevelFilters] = useState({
    debug: true,
    info: true,
    warn: true,
    error: true,
  });
  const [nodeFilter, setNodeFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  
  // Resize state
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem(`logPanel_${position}_size`);
    return saved ? parseInt(saved) : (position === 'bottom' ? 300 : 400);
  });
  const [isResizing, setIsResizing] = useState(false);
  
  const logContainerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const eventSourceRef = useRef(null);
  const resizeRef = useRef(null);
  const theme = useTheme();
  const LOG_LEVELS = useMemo(() => getLogLevels(theme), [theme]);

  // Load logs (wrapped in useCallback to prevent stale closure in polling)
  const loadLogs = useCallback(async () => {
    if (!flowId) return;
    
    setLoading(true);
    try {
      let response;
      if (currentExecutionId) {
        // Load logs for specific execution
        response = await getExecutionLogs(flowId, currentExecutionId);
        
        // If no logs found for this execution, fall back to all flow logs
        if (!response.logs || response.logs.length === 0) {
          response = await getFlowLogs(flowId, { limit: 100 });
        } else {
          // Also load system logs (with NULL execution_id) to show test mode events
          try {
            const allFlowLogs = await getFlowLogs(flowId, { limit: 100 });
            const systemLogs = allFlowLogs.logs.filter(log => !log.execution_id);
            // Merge execution logs with system logs and sort by timestamp
            response.logs = [...response.logs, ...systemLogs].sort((a, b) => 
              new Date(b.timestamp) - new Date(a.timestamp)
            );
          } catch (err) {
            console.warn('Failed to load system logs:', err);
          }
        }
      } else {
        // Load all flow logs (last 100)
        response = await getFlowLogs(flowId, { limit: 100 });
      }
      
      // Use callback form to ensure we get fresh state
      // Backend returns DESC (newest first), but we want to display ASC (oldest first, newest at bottom)
      setLogs(prevLogs => {
        const newLogs = response.logs || [];
        // Reverse to show oldest first (newest at bottom for natural scrolling)
        return [...newLogs].reverse();
      });
      
      // Auto-scroll to bottom if enabled
      if (autoScroll && logContainerRef.current) {
        setTimeout(() => {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }, [flowId, currentExecutionId, autoScroll]);

  // Initial load
  useEffect(() => {
    loadLogs();
  }, [flowId, currentExecutionId]);

  // Live logs: SSE in production, polling in development
  useEffect(() => {
    if (!flowId || paused) return;

    const isDev = import.meta.env.DEV;

    if (isDev) {
      // Development: Use 1-second polling (Vite proxy doesn't support SSE)
      pollIntervalRef.current = setInterval(loadLogs, 1000);
    } else {
      // Production: Use SSE for real-time updates
      const token = localStorage.getItem('df_token');
      if (!token) return;

      const eventSource = new EventSource(
        `/api/flows/${flowId}/logs/stream?token=${encodeURIComponent(token)}`
      );

      eventSource.onmessage = (event) => {
        try {
          const newLog = JSON.parse(event.data);
          setLogs((prevLogs) => {
            const updated = [newLog, ...prevLogs];
            // Limit to 100 most recent logs to prevent unbounded growth
            return updated.slice(0, 100);
          });
        } catch (err) {
          console.error('Failed to parse SSE log:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        eventSource.close();
        // Fall back to polling on SSE error
        pollIntervalRef.current = setInterval(loadLogs, 5000);
      };

      eventSourceRef.current = eventSource;
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [flowId, paused, currentExecutionId, loadLogs]);

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      if (position === 'bottom') {
        // For bottom position, resize height (measure from bottom)
        const newHeight = window.innerHeight - e.clientY;
        const clampedHeight = Math.max(200, Math.min(800, newHeight));
        setSize(clampedHeight);
      } else {
        // For right position, resize width (measure from right)
        const newWidth = window.innerWidth - e.clientX;
        const clampedWidth = Math.max(300, Math.min(800, newWidth));
        setSize(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        localStorage.setItem(`logPanel_${position}_size`, size.toString());
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = position === 'bottom' ? 'ns-resize' : 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, position, size]);

  // Update size when position changes
  useEffect(() => {
    const saved = localStorage.getItem(`logPanel_${position}_size`);
    setSize(saved ? parseInt(saved) : (position === 'bottom' ? 300 : 400));
  }, [position]);

  // Detect manual scroll (pause auto-scroll)
  const handleScroll = () => {
    if (!logContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
    
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Level filter
      if (!levelFilters[log.log_level]) return false;
      
      // Node filter
      if (nodeFilter && log.node_id !== nodeFilter) return false;
      
      // Search text
      if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [logs, levelFilters, nodeFilter, searchText]);

  // Group logs
  const groupedLogs = useMemo(() => {
    if (grouping === 'flat') {
      return { 'All Logs': filteredLogs };
    }
    
    const groups = {};
    
    filteredLogs.forEach(log => {
      let key;
      switch (grouping) {
        case 'node':
          key = log.node_id || 'System';
          break;
        case 'level':
          key = LOG_LEVELS[log.log_level]?.label || log.log_level;
          break;
        case 'execution':
          key = log.execution_id || 'Unknown';
          break;
        default:
          key = 'All';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    });
    
    return groups;
  }, [filteredLogs, grouping]);

  // Get unique nodes for filter
  const availableNodes = useMemo(() => {
    const nodes = new Set();
    logs.forEach(log => {
      if (log.node_id) nodes.add(log.node_id);
    });
    return Array.from(nodes).sort();
  }, [logs]);

  // Clear logs
  const handleClear = async () => {
    try {
      await clearFlowLogs(flowId);
      setLogs([]);
      setClearDialogOpen(false);
    } catch (error) {
      console.error('Failed to clear logs:', error);
      alert('Failed to clear logs: ' + error.message);
    }
  };

  // Export logs
  const handleExport = (format) => {
    setAnchorEl(null);
    
    let content, filename, mimeType;
    
    switch (format) {
      case 'json':
        content = JSON.stringify(filteredLogs, null, 2);
        filename = `flow-logs-${flowId}-${Date.now()}.json`;
        mimeType = 'application/json';
        break;
      case 'csv':
        const headers = ['Timestamp', 'Level', 'Node', 'Message'];
        const rows = filteredLogs.map(log => [
          new Date(log.timestamp).toISOString(),
          log.log_level,
          log.node_id || 'system',
          log.message.replace(/"/g, '""') // Escape quotes
        ]);
        content = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        filename = `flow-logs-${flowId}-${Date.now()}.csv`;
        mimeType = 'text/csv';
        break;
      case 'txt':
        content = filteredLogs.map(log => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          const level = log.log_level.toUpperCase().padEnd(5);
          const node = (log.node_id || 'SYSTEM').padEnd(20);
          return `${time} [${level}] [${node}] ${log.message}`;
        }).join('\n');
        filename = `flow-logs-${flowId}-${Date.now()}.txt`;
        mimeType = 'text/plain';
        break;
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Toggle level filter
  const toggleLevelFilter = (level) => {
    setLevelFilters(prev => ({ ...prev, [level]: !prev[level] }));
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  };

  // Render log entry
  const renderLogEntry = (log) => {
    const levelInfo = LOG_LEVELS[log.log_level] || LOG_LEVELS.info;
    const LevelIcon = levelInfo.icon;
    
    return (
      <Box
        key={log.id}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: levelInfo.bgColor,
          '&:hover': { 
            bgcolor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.05)' 
              : 'rgba(0, 0, 0, 0.04)',
            cursor: 'default',
          },
          transition: 'background-color 0.15s ease',
        }}
      >
        <LevelIcon sx={{ fontSize: 20, color: levelInfo.color, mt: 0.25, flexShrink: 0 }} />
        <Typography
          variant="caption"
          sx={{
            minWidth: 95,
            color: 'text.secondary',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '0.8rem',
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {formatTimestamp(log.timestamp)}
        </Typography>
        {log.node_id && (
          <Chip
            label={log.node_id}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
              color: 'text.primary',
              '&:hover': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              },
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
            onClick={() => {
              if (onNodeHighlight) {
                onNodeHighlight(log.node_id);
              }
            }}
          />
        )}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            wordBreak: 'break-word',
            color: log.log_level === 'error' ? 'error.dark' : 
                   log.log_level === 'warn' ? 'warning.dark' : 'text.primary',
          }}
        >
          {log.message}
        </Typography>
      </Box>
    );
  };

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: position === 'bottom' ? size : '100%',
        width: position === 'right' ? size : '100%',
        borderRadius: 0,
        borderTop: position === 'bottom' ? 1 : 'none',
        borderLeft: position === 'right' ? 1 : 'none',
        borderColor: 'divider',
        bgcolor: 'transparent',
        position: 'relative',
      }}
    >
      {/* Resize Handle */}
      <Box
        onMouseDown={() => setIsResizing(true)}
        sx={{
          position: 'absolute',
          ...(position === 'bottom' ? {
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            cursor: 'ns-resize',
          } : {
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: 'ew-resize',
          }),
          bgcolor: isResizing ? 'primary.main' : 'transparent',
          '&:hover': {
            bgcolor: 'primary.main',
          },
          transition: 'background-color 0.2s',
          zIndex: 10,
        }}
      />
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          borderBottom: 2,
          borderColor: 'primary.main',
          bgcolor: 'transparent',
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600, color: 'primary.main', fontSize: '0.95rem' }}>
          📋 Execution Logs
        </Typography>

        {/* Grouping Mode */}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <Select
            value={grouping}
            onChange={(e) => setGrouping(e.target.value)}
            sx={{ fontSize: '0.875rem' }}
          >
            {Object.entries(GROUPING_MODES).map(([key, label]) => (
              <MenuItem key={key} value={key}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Level Filters */}
        <Tooltip title="Filter by level">
          <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <FilterIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Refresh */}
        <Tooltip title="Refresh logs">
          <IconButton size="small" onClick={loadLogs}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Pause/Resume auto-refresh */}
        <Tooltip title={paused ? "Resume auto-refresh" : "Pause auto-refresh"}>
          <IconButton size="small" onClick={() => setPaused(!paused)} color={paused ? "warning" : "default"}>
            {paused ? <PlayIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Clear */}
        <Tooltip title="Clear logs">
          <IconButton size="small" onClick={() => setClearDialogOpen(true)}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Position Toggle */}
        <Tooltip title="Toggle position">
          <IconButton
            size="small"
            onClick={() => onPositionChange?.(position === 'bottom' ? 'right' : 'bottom')}
          >
            <SwapVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Close */}
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>

        {/* Filter Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <Box sx={{ p: 2, minWidth: 200 }}>
            <Typography variant="subtitle2" gutterBottom>Log Levels</Typography>
            <FormGroup>
              {Object.entries(LOG_LEVELS).map(([level, info]) => (
                <FormControlLabel
                  key={level}
                  control={
                    <Checkbox
                      checked={levelFilters[level]}
                      onChange={() => toggleLevelFilter(level)}
                      size="small"
                    />
                  }
                  label={info.label}
                />
              ))}
            </FormGroup>
          </Box>
        </Menu>
      </Box>

      {/* Filters Bar */}
      <Box sx={{ 
        display: 'flex', 
        gap: 1, 
        p: 1.5, 
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.50',
        borderBottom: 1,
        borderColor: 'divider' 
      }}>
        <TextField
          size="small"
          placeholder="Search logs..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ flex: 1 }}
        />
        {availableNodes.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Node Filter</InputLabel>
            <Select
              value={nodeFilter}
              label="Node Filter"
              onChange={(e) => setNodeFilter(e.target.value)}
            >
              <MenuItem value="">All Nodes</MenuItem>
              {availableNodes.map(node => (
                <MenuItem key={node} value={node}>{node}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Log Display */}
      <Box
        ref={logContainerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: 'background.paper',
        }}
      >
        {loading && logs.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              ⏳ Loading logs...
            </Typography>
          </Box>
        ) : filteredLogs.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              {logs.length === 0 ? '📭 No logs available' : '🔍 No logs match the current filters'}
            </Typography>
            {logs.length > 0 && (
              <Button 
                size="small" 
                onClick={() => {
                  setLevelFilters({ debug: true, info: true, warn: true, error: true });
                  setNodeFilter('');
                  setSearchText('');
                }}
                sx={{ mt: 1 }}
              >
                Clear Filters
              </Button>
            )}
          </Box>
        ) : grouping === 'flat' ? (
          filteredLogs.map(renderLogEntry)
        ) : (
          Object.entries(groupedLogs).map(([group, groupLogs]) => (
            <Box key={group}>
              <Box sx={{ 
                px: 1.5,
                py: 0.75,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(144, 202, 249, 0.08)' : 'primary.light',
                borderBottom: 1,
                borderColor: theme.palette.mode === 'dark' ? 'rgba(144, 202, 249, 0.3)' : 'primary.main', 
                position: 'sticky', 
                top: 0,
                zIndex: 1,
              }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                  {group} ({groupLogs.length})
                </Typography>
              </Box>
              {groupLogs.map(renderLogEntry)}
            </Box>
          ))
        )}
      </Box>

      {/* Status Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 1.5,
          py: 0.75,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
          fontSize: '0.75rem',
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
          {filteredLogs.length} / {logs.length} logs
        </Typography>
        {!autoScroll && (
          <Chip
            label="Auto-scroll paused"
            size="small"
            color="warning"
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        )}
        {paused && (
          <Chip
            label="Updates paused"
            size="small"
            color="info"
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        )}
      </Box>

      {/* Clear Logs Confirmation Dialog */}
      <Dialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Clear All Logs?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all logs for this flow. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleClear} color="error" variant="contained" autoFocus>
            Clear Logs
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
