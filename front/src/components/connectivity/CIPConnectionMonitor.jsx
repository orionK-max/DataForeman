import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  Alert,
  Tooltip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import connectivityService from '../../services/connectivityService';

/**
 * CIP Connection Monitor Widget
 * 
 * Displays CIP connection capacity and usage for EtherNet/IP devices.
 * Helps users monitor and avoid exceeding PLC connection limits.
 * 
 * Features:
 * - Real-time connection count with progress bar
 * - Color-coded status (green/yellow/red)
 * - Breakdown of active DataForeman connections
 * - Auto-refresh every 30s
 * - Manual refresh button
 */
const CIPConnectionMonitor = ({ connectionId, deviceInfo = {} }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Fetch connection status from API
  const fetchStatus = async () => {
    if (!connectionId) {
      setError('No connection ID provided');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await connectivityService.getConnectionStatus(connectionId);
      setStatus(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch connection status:', err);
      setError(err.message || 'Failed to load connection status');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  // Calculate usage percentage
  const getUsagePercentage = () => {
    if (!status || !status.max_connections || status.max_connections === 0) return 0;
    return Math.round((status.active_connections / status.max_connections) * 100);
  };

  // Determine status level based on usage
  const getStatusLevel = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'critical';
    if (percentage >= 80) return 'warning';
    return 'healthy';
  };

  // Get color for progress bar and status indicators
  const getStatusColor = () => {
    const level = getStatusLevel();
    switch (level) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      case 'healthy':
      default:
        return 'success';
    }
  };

  // Get status icon and message
  const getStatusInfo = () => {
    const level = getStatusLevel();
    const percentage = getUsagePercentage();

    switch (level) {
      case 'critical':
        return {
          icon: <ErrorIcon color="error" />,
          message: `Critical: ${percentage}% capacity used`,
          severity: 'error',
          description: 'Connection limit nearly reached. Consider reducing connections or upgrading PLC.',
        };
      case 'warning':
        return {
          icon: <WarningIcon color="warning" />,
          message: `Warning: ${percentage}% capacity used`,
          severity: 'warning',
          description: 'Approaching connection limit. Monitor usage closely.',
        };
      case 'healthy':
      default:
        return {
          icon: <CheckCircleIcon color="success" />,
          message: `Healthy: ${percentage}% capacity used`,
          severity: 'success',
          description: 'Connection usage is within safe limits.',
        };
    }
  };

  // Format uptime duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'Just started';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    
    return `${minutes}m`;
  };

  if (loading && !status) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            CIP Connection Status
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <Typography color="text.secondary">Loading...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error && !status) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            CIP Connection Status
          </Typography>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return null;
  }

  const statusInfo = getStatusInfo();
  const usagePercentage = getUsagePercentage();
  const available = status.max_connections - status.active_connections;

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            CIP Connection Status
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {lastUpdate && (
              <Typography variant="caption" color="text.secondary">
                Updated {lastUpdate.toLocaleTimeString()}
              </Typography>
            )}
            <Tooltip title="Refresh connection status">
              <IconButton size="small" onClick={fetchStatus} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Device Info */}
        {deviceInfo.product_name && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {deviceInfo.host || 'Unknown Host'}
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {deviceInfo.product_name}
            </Typography>
            {deviceInfo.vendor && (
              <Typography variant="caption" color="text.secondary">
                {deviceInfo.vendor}
              </Typography>
            )}
          </Box>
        )}

        {/* Data Source Indicator */}
        {status.source && (
          <Box sx={{ mb: 2 }}>
            <Chip
              label={
                status.source === 'device_query'
                  ? 'Real-time from device'
                  : status.source === 'estimated'
                  ? 'Estimated (device unavailable)'
                  : status.source
              }
              size="small"
              color={status.source === 'device_query' ? 'success' : 'default'}
              variant="outlined"
              icon={status.source === 'device_query' ? <CheckCircleIcon /> : <InfoIcon />}
            />
            {status.message && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {status.message}
              </Typography>
            )}
          </Box>
        )}

        {/* Connection Progress Bar */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" fontWeight="medium">
              {status.active_connections} / {status.max_connections} connections used
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {usagePercentage}%
            </Typography>
          </Box>
          
          {/* Show breakdown if we have real device data */}
          {status.source === 'device_query' && status.dataforeman_connections > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                DataForeman: {status.dataforeman_connections} • Other software: {status.other_connections}
              </Typography>
            </Box>
          )}
          
          <LinearProgress
            variant="determinate"
            value={usagePercentage}
            color={getStatusColor()}
            sx={{ height: 8, borderRadius: 1 }}
          />
          
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {available} available
          </Typography>
        </Box>

        {/* Status Alert */}
        <Alert 
          severity={statusInfo.severity} 
          icon={statusInfo.icon}
          sx={{ mb: 2 }}
        >
          <Typography variant="body2" fontWeight="medium">
            {statusInfo.message}
          </Typography>
          <Typography variant="caption" display="block">
            {statusInfo.description}
          </Typography>
        </Alert>

        {/* DataForeman Connections Breakdown */}
        {status.connections && status.connections.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" fontWeight="medium">
                  DataForeman Connections
                </Typography>
                <Chip
                  label={status.connections.length}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Box>
              
              <List dense disablePadding>
                {status.connections.map((conn, index) => (
                  <ListItem
                    key={index}
                    disablePadding
                    sx={{ py: 0.5 }}
                  >
                    <ListItemText
                      primary={conn.name || `Connection ${index + 1}`}
                      secondary={formatDuration(conn.uptime_seconds)}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          </>
        )}

        {/* Info Tooltip */}
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <InfoIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            CIP connections are limited by PLC model. Typical limits: Micro800 (4-8), CompactLogix (16-32), ControlLogix (32-250).
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CIPConnectionMonitor;
