import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Collapse,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { getExecutionHistory } from '../../services/flowsApi';

/**
 * Row component with collapsible details
 */
function HistoryRow({ execution, flowDefinition }) {
  const [open, setOpen] = useState(false);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'running': return 'info';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <SuccessIcon fontSize="small" />;
      case 'failed': return <ErrorIcon fontSize="small" />;
      default: return <PendingIcon fontSize="small" />;
    }
  };

  const getTriggerType = (triggerNodeId) => {
    if (!triggerNodeId || !flowDefinition?.nodes) return null;
    const node = flowDefinition.nodes.find(n => n.id === triggerNodeId);
    if (!node) return null;
    
    if (node.type === 'trigger-manual') return { label: 'Manual', color: 'primary' };
    if (node.type === 'trigger-schedule') return { label: 'Schedule', color: 'secondary' };
    if (node.type === 'trigger-event') return { label: 'Event', color: 'info' };
    return { label: 'Unknown', color: 'default' };
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (started, completed) => {
    if (!started || !completed) return 'N/A';
    const ms = new Date(completed) - new Date(started);
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const triggerType = getTriggerType(execution.trigger_node_id);

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{execution.id?.substring(0, 8)}...</TableCell>
        <TableCell>
          {triggerType && (
            <Chip 
              label={triggerType.label} 
              color={triggerType.color} 
              size="small" 
              sx={{ mr: 1 }} 
            />
          )}
          {formatDate(execution.started_at)}
        </TableCell>
        <TableCell>{formatDuration(execution.started_at, execution.completed_at)}</TableCell>
        <TableCell>
          <Chip
            icon={getStatusIcon(execution.status)}
            label={execution.status}
            color={getStatusColor(execution.status)}
            size="small"
          />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#000' }}>
                Execution Details
              </Typography>
              
              {execution.status === 'failed' && execution.error_log && execution.error_log.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="error">Error Log:</Typography>
                  <Paper sx={{ 
                    p: 1, 
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.1)' : 'error.light',
                    maxHeight: 200, 
                    overflow: 'auto' 
                  }}>
                    {execution.error_log.map((log, idx) => (
                      <Typography
                        key={idx}
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#d32f2f' }}
                      >
                        {log}
                      </Typography>
                    ))}
                  </Paper>
                </Box>
              )}

              {/* Console Logs Section */}
              {execution.node_outputs && (() => {
                const allLogs = [];
                Object.entries(execution.node_outputs).forEach(([nodeId, output]) => {
                  if (output.logs && output.logs.length > 0) {
                    output.logs.forEach(log => {
                      allLogs.push({ nodeId, ...log });
                    });
                  }
                });
                return allLogs.length > 0 ? (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.primary">Console Logs:</Typography>
                    <Paper sx={{ 
                      p: 1, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
                      maxHeight: 200, 
                      overflow: 'auto' 
                    }}>
                      {allLogs.map((log, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            mb: 0.5,
                            p: 0.5,
                            borderRadius: 0.5,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            bgcolor: log.level === 'error' 
                              ? ((theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.2)' : 'error.light')
                              : log.level === 'warn' 
                                ? ((theme) => theme.palette.mode === 'dark' ? 'rgba(245, 124, 0, 0.2)' : 'warning.light')
                                : 'transparent',
                          }}
                        >
                          {log.level === 'error' && <ErrorIcon sx={{ color: '#d32f2f', fontSize: 16 }} />}
                          {log.level === 'warn' && <WarningIcon sx={{ color: '#f57c00', fontSize: 16 }} />}
                          {(log.level === 'log' || log.level === 'info') && <InfoIcon sx={{ color: '#1976d2', fontSize: 16 }} />}
                          <Typography variant="caption" sx={{ mr: 0.5, color: 'text.secondary' }}>
                            [{log.nodeId}]
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.primary' }}>
                            {log.args.join(' ')}
                          </Typography>
                        </Box>
                      ))}
                    </Paper>
                  </Box>
                ) : null;
              })()}

              {/* Node Execution Timeline */}
              {execution.node_outputs && (() => {
                const nodeTimings = Object.entries(execution.node_outputs)
                  .filter(([_, output]) => output.executionTime !== undefined)
                  .map(([nodeId, output]) => ({
                    nodeId,
                    executionTime: output.executionTime,
                    startedAt: output.startedAt,
                    completedAt: output.completedAt,
                    error: output.error
                  }))
                  .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
                
                const maxTime = Math.max(...nodeTimings.map(n => n.executionTime), 1);
                
                return nodeTimings.length > 0 ? (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.primary">Execution Timeline:</Typography>
                    <Paper sx={{ 
                      p: 1, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100'
                    }}>
                      {nodeTimings.map((node, idx) => {
                        const widthPercent = (node.executionTime / maxTime) * 100;
                        return (
                          <Box key={idx} sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                                {node.nodeId}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {node.executionTime}ms
                              </Typography>
                            </Box>
                            <Box sx={{ 
                              width: '100%', 
                              height: 8, 
                              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'grey.300',
                              borderRadius: 1,
                              overflow: 'hidden'
                            }}>
                              <Box sx={{ 
                                width: `${widthPercent}%`, 
                                height: '100%', 
                                bgcolor: node.error ? '#f44336' : '#4caf50',
                                transition: 'width 0.3s ease'
                              }} />
                            </Box>
                          </Box>
                        );
                      })}
                    </Paper>
                  </Box>
                ) : null;
              })()}

              {execution.node_outputs && Object.keys(execution.node_outputs).length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.primary">Node Outputs:</Typography>
                  <Paper sx={{ 
                    p: 1, 
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100'
                  }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                      {JSON.stringify(execution.node_outputs, null, 2)}
                    </Typography>
                  </Paper>
                </Box>
              )}

              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Started: {formatDate(execution.started_at)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  Completed: {formatDate(execution.completed_at)}
                </Typography>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/**
 * Execution History Dialog
 * Shows past flow executions with results
 */
export default function ExecutionHistoryDialog({ open, onClose, flowId, flow }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && flowId) {
      loadHistory();
    }
  }, [open, flowId]);

  // Auto-refresh when there are running executions
  useEffect(() => {
    if (!open || !flowId) return;
    
    const hasRunningExecutions = history.some(exec => exec.status === 'running');
    
    if (hasRunningExecutions) {
      const intervalId = setInterval(() => {
        loadHistory();
      }, 2000); // Poll every 2 seconds
      
      return () => clearInterval(intervalId);
    }
  }, [open, flowId, history]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExecutionHistory(flowId);
      setHistory(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Execution History</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Box sx={{ p: 2 }}>
            <Typography color="error">Error loading history: {error}</Typography>
          </Box>
        )}

        {!loading && !error && history.length === 0 && (
          <Box sx={{ p: 2 }}>
            <Typography color="text.secondary">No execution history found</Typography>
          </Box>
        )}

        {!loading && !error && history.length > 0 && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={50} />
                  <TableCell>Execution ID</TableCell>
                  <TableCell>Trigger & Started</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((execution) => (
                  <HistoryRow key={execution.id} execution={execution} flowDefinition={flow?.definition} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={loadHistory} variant="outlined">
          Refresh
        </Button>
      </DialogActions>
    </Dialog>
  );
}
