import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import mqttService from '../../services/mqttService';

const MqttRecentMessages = ({ subscriptionId, autoRefresh = true, refreshInterval = 3000 }) => {
  const [messages, setMessages] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(autoRefresh);

  const loadMessages = async () => {
    if (!subscriptionId) return;
    
    try {
      setError(null);
      const data = await mqttService.getSubscriptionMessages(subscriptionId, 50);
      setMessages(data.messages || []);
      setSubscription(data.subscription);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    loadMessages();
  };

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(!isAutoRefresh);
  };

  // Initial load
  useEffect(() => {
    loadMessages();
  }, [subscriptionId]);

  // Auto-refresh
  useEffect(() => {
    if (!isAutoRefresh || !subscriptionId) return;

    const interval = setInterval(() => {
      loadMessages();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [isAutoRefresh, subscriptionId, refreshInterval]);

  const formatTimestamp = (ts) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getQualityColor = (quality) => {
    if (!quality || quality === 'good') return 'success';
    if (quality === 'bad') return 'error';
    return 'warning';
  };

  if (!subscriptionId) {
    return (
      <Alert severity="info">
        Select a subscription to view recent messages
      </Alert>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <IconButton size="small" onClick={handleRefresh}>
          <RefreshIcon />
        </IconButton>
      }>
        {error}
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h6">Recent Messages</Typography>
          {subscription && (
            <Typography variant="body2" color="text.secondary" fontFamily="monospace">
              Topic: {subscription.topic} | Tag Prefix: {subscription.tag_prefix}
            </Typography>
          )}
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title={isAutoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}>
            <IconButton 
              size="small" 
              onClick={toggleAutoRefresh}
              color={isAutoRefresh ? 'primary' : 'default'}
            >
              <AutorenewIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh now">
            <IconButton size="small" onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {messages.length === 0 ? (
        <Alert severity="info">
          No messages received yet. Messages will appear here when data is published to the subscribed topic.
        </Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Showing {messages.length} most recent messages
          </Typography>
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Tag Path</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Quality</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((msg, idx) => (
                  <TableRow key={`${msg.tag_path}-${msg.timestamp}-${idx}`}>
                    <TableCell>
                      <Typography variant="body2" fontSize="0.875rem">
                        {formatTimestamp(msg.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.875rem">
                        {msg.tag_path}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.875rem">
                        {formatValue(msg.value)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={msg.quality || 'good'} 
                        size="small" 
                        color={getQualityColor(msg.quality)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );
};

export default MqttRecentMessages;
