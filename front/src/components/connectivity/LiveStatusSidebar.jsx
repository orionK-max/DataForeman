import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  Badge,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';

/**
 * LiveStatusSidebar - Collapsible sidebar showing real-time connection status
 * @param {Object} props
 * @param {Array} props.statuses - Live connection statuses
 * @param {Array} props.connections - Saved connections (for name lookup)
 * @param {boolean} props.autoRefresh - Auto-refresh enabled
 * @param {Function} props.onRefresh - Manual refresh callback
 */
const LiveStatusSidebar = ({ statuses = [], connections = [], autoRefresh = true, onRefresh }) => {
  const [isExpanded, setIsExpanded] = useState(() => {
    // Load saved state from localStorage
    const saved = localStorage.getItem('liveStatusSidebarExpanded');
    return saved ? JSON.parse(saved) : false;
  });

  // Helper to get connection name from ID
  const getConnectionName = (id) => {
    const conn = connections.find(c => c.id === id);
    return conn?.name || id;
  };

  // Save expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('liveStatusSidebarExpanded', JSON.stringify(isExpanded));
  }, [isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Calculate stats
  // Include system connections in connected count (we always show them as connected)
  const connectedCount = statuses.filter(s => {
    const conn = connections.find(c => c.id === s.id);
    const isSystemConnection = conn?.type === 'system' || conn?.is_system_connection;
    return isSystemConnection || s.state === 'connected';
  }).length;
  const errorCount = statuses.filter(s => s.state === 'error').length;
  const connectingCount = statuses.filter(s => s.state === 'connecting').length;
  const totalCount = statuses.length;

  // Format uptime
  const formatUptime = (ms) => {
    if (!ms) return '—';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  // Format timestamp
  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleTimeString();
  };

  // Get status color
  const getStatusColor = (state) => {
    switch (state) {
      case 'connected': return 'success';
      case 'error': return 'error';
      case 'connecting': return 'warning';
      default: return 'default';
    }
  };

  // Sort statuses by connection name alphabetically
  const sortedStatuses = [...statuses].sort((a, b) => {
    const nameA = getConnectionName(a.id).toLowerCase();
    const nameB = getConnectionName(b.id).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <Box
      sx={{
        position: 'fixed',
        right: 0,
        top: '64px', // Below app bar
        bottom: 0,
        zIndex: 1200,
        display: 'flex',
        pointerEvents: 'none', // Allow clicks through to content below
      }}
    >
      {/* Sidebar Panel */}
      <Paper
        elevation={8}
        sx={{
          width: isExpanded ? 420 : 0,
          transition: 'width 0.3s ease-in-out',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
          borderRadius: 0,
          borderLeft: '1px solid',
          borderColor: 'divider',
          bgcolor: 'grey.900',
        }}
      >
        {isExpanded && (
          <>
            {/* Header */}
            <Box
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: 'grey.900',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SignalCellularAltIcon color="primary" />
                <Typography variant="h6">Live Status</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title={autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}>
                  <IconButton size="small" onClick={onRefresh} color={autoRefresh ? 'primary' : 'default'}>
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={toggleExpanded}>
                  <ChevronRightIcon />
                </IconButton>
              </Box>
            </Box>

            {/* Stats Summary */}
            <Box
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                bgcolor: 'grey.800',
              }}
            >
              <Chip
                label={`${connectedCount} Connected`}
                color="success"
                size="small"
                variant="outlined"
              />
              {errorCount > 0 && (
                <Chip
                  label={`${errorCount} Error`}
                  color="error"
                  size="small"
                  variant="outlined"
                />
              )}
              {connectingCount > 0 && (
                <Chip
                  label={`${connectingCount} Connecting`}
                  color="warning"
                  size="small"
                  variant="outlined"
                />
              )}
              <Chip
                label={`${totalCount} Total`}
                size="small"
                variant="outlined"
              />
            </Box>

            {/* Status Table */}
            <TableContainer sx={{ flexGrow: 1, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'grey.900', color: 'text.primary' }}>ID</TableCell>
                    <TableCell sx={{ bgcolor: 'grey.900', color: 'text.primary' }}>State</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'grey.900', color: 'text.primary' }}>Tags</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedStatuses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                          No active connections
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedStatuses.map((status) => {
                      // Check if this is the system connection
                      const conn = connections.find(c => c.id === status.id);
                      const isSystemConnection = conn?.type === 'system' || conn?.is_system_connection;
                      const displayState = isSystemConnection ? 'connected' : status.state;
                      
                      return (
                        <TableRow key={status.id} hover>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                maxWidth: 120,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {getConnectionName(status.id)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={displayState}
                              color={getStatusColor(displayState)}
                              size="small"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontSize="0.75rem">
                              {status.tag_count || 0}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Footer with error info if any */}
            {errorCount > 0 && (
              <Box
                sx={{
                  p: 1.5,
                  borderTop: 1,
                  borderColor: 'divider',
                  bgcolor: 'error.main',
                  color: 'error.contrastText',
                }}
              >
                <Typography variant="caption">
                  ⚠ {errorCount} connection{errorCount > 1 ? 's' : ''} with errors
                </Typography>
              </Box>
            )}
          </>
        )}
      </Paper>

      {/* Collapsed Tab */}
      {!isExpanded && (
        <Paper
          elevation={4}
          sx={{
            width: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 2,
            gap: 1,
            cursor: 'pointer',
            pointerEvents: 'auto',
            borderRadius: '8px 0 0 8px',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': {
              bgcolor: 'primary.dark',
            },
          }}
          onClick={toggleExpanded}
        >
          <Tooltip title="Open Live Status" placement="left">
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <ChevronLeftIcon />
              <SignalCellularAltIcon />
              <Badge
                badgeContent={connectedCount}
                color="success"
                sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    borderRadius: '50%',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                  }}
                >
                  {totalCount}
                </Box>
              </Badge>
              {errorCount > 0 && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    bgcolor: 'error.main',
                    borderRadius: '50%',
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.5 },
                    },
                  }}
                />
              )}
              <Typography
                variant="caption"
                sx={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  mt: 1,
                }}
              >
                LIVE
              </Typography>
            </Box>
          </Tooltip>
        </Paper>
      )}
    </Box>
  );
};

export default LiveStatusSidebar;
