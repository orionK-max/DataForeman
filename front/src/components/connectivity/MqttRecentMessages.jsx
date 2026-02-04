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
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import CloseIcon from '@mui/icons-material/Close';
import mqttService from '../../services/mqttService';

const MqttRecentMessages = ({ subscriptionId, autoRefresh = true, refreshInterval = 3000 }) => {
  const [messages, setMessages] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(autoRefresh);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [fullscreen, setFullscreen] = useState(false);

  const toggleRow = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
  };

  const loadMessages = async () => {
    if (!subscriptionId) return;
    
    try {
      setError(null);
      const data = await mqttService.getSubscriptionMessages(subscriptionId, 50);
      // Map the backend response to include necessary fields
      const mappedMessages = (data.messages || []).map(msg => ({
        ...msg,
        connection_id: data.subscription?.connection_id,
        subscription_id: data.subscription?.id,
        tag_path: msg.topic || '-',
        value: msg.payload ? (typeof msg.payload === 'object' ? JSON.stringify(msg.payload) : msg.payload) : '-',
        quality: 'good',
        received_at: msg.timestamp
      }));
      setMessages(mappedMessages);
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

  const messageContent = (
    <>
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
          <Tooltip title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <IconButton size="small" onClick={toggleFullscreen}>
              {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
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
          <TableContainer sx={{ maxHeight: fullscreen ? '80vh' : 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell width="40px" />
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Tag Path</TableCell>
                  <TableCell>Quality</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((msg, idx) => (
                  <React.Fragment key={`${msg.tag_path}-${msg.timestamp}-${idx}`}>
                    <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => toggleRow(idx)}
                        >
                          {expandedRows.has(idx) ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      </TableCell>
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
                        <Chip 
                          label={msg.quality || 'good'} 
                          size="small" 
                          color={getQualityColor(msg.quality)}
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
                        <Collapse in={expandedRows.has(idx)} timeout="auto" unmountOnExit>
                          <Box sx={{ margin: 1, bgcolor: 'background.default', p: 2, borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom component="div">
                              Message Details
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 1, mb: 2 }}>
                              <Typography variant="body2" color="text.secondary">Topic:</Typography>
                              <Typography variant="body2" fontFamily="monospace">{msg.topic || '-'}</Typography>
                              
                              <Typography variant="body2" color="text.secondary">QoS:</Typography>
                              <Typography variant="body2">{msg.qos !== undefined ? msg.qos : '-'}</Typography>
                              
                              <Typography variant="body2" color="text.secondary">Retained:</Typography>
                              <Typography variant="body2">{msg.retained ? 'Yes' : 'No'}</Typography>
                              
                              <Typography variant="body2" color="text.secondary">Connection ID:</Typography>
                              <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">{msg.connection_id || '-'}</Typography>
                              
                              <Typography variant="body2" color="text.secondary">Subscription ID:</Typography>
                              <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">{msg.subscription_id || '-'}</Typography>
                              
                              <Typography variant="body2" color="text.secondary">Received At:</Typography>
                              <Typography variant="body2">{formatTimestamp(msg.received_at || msg.timestamp)}</Typography>
                            </Box>
                            
                            {msg.payload && (
                              <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  Raw Payload:
                                </Typography>
                                <Paper 
                                  variant="outlined" 
                                  sx={{ 
                                    p: 1.5, 
                                    bgcolor: 'grey.900', 
                                    maxHeight: 300, 
                                    overflow: 'auto' 
                                  }}
                                >
                                  <pre style={{ 
                                    margin: 0, 
                                    fontFamily: 'monospace', 
                                    fontSize: '0.75rem',
                                    color: '#00ff00',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all'
                                  }}>
                                    {typeof msg.payload === 'object' 
                                      ? JSON.stringify(msg.payload, null, 2)
                                      : msg.payload
                                    }
                                  </pre>
                                </Paper>
                              </Box>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  );

  if (fullscreen) {
    return (
      <Dialog 
        open={fullscreen} 
        onClose={toggleFullscreen}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            width: '95vw',
            height: '95vh',
            maxHeight: '95vh',
          }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Recent Messages - Fullscreen</Typography>
            <IconButton onClick={toggleFullscreen} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {messageContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      {messageContent}
    </Paper>
  );
};

export default MqttRecentMessages;
