import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  Collapse,
  CircularProgress,
  LinearProgress,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import { useJobsPolling } from '../../hooks/useJobsPolling';
import { apiClient } from '../../services/api';

export default function JobsTab() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, jobId: null });

  const { jobs, loading, error, refetch } = useJobsPolling(autoRefresh, 2000);

  const toggleRowExpand = (jobId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
      if (selectedJobId === jobId) setSelectedJobId(null);
    } else {
      newExpanded.add(jobId);
      setSelectedJobId(jobId);
    }
    setExpandedRows(newExpanded);
  };

  const handleCancelJob = async (jobId) => {
    try {
      await apiClient.post(`/jobs/${jobId}/cancel`);
      refetch();
    } catch (err) {
      console.error('Error cancelling job:', err);
    }
    setConfirmDialog({ open: false, action: null, jobId: null });
  };

  const handleDeleteJob = async (jobId) => {
    setConfirmDialog({ open: false, action: null, jobId: null });
    
    try {
      await apiClient.delete(`/jobs/${jobId}`);
      
      // Clean up expanded state
      if (expandedRows.has(jobId)) {
        const newExpanded = new Set(expandedRows);
        newExpanded.delete(jobId);
        setExpandedRows(newExpanded);
      }
      
      // Refresh the jobs list
      await refetch();
    } catch (err) {
      console.error('Error deleting job:', err);
      console.error('Error message:', err?.message);
      console.error('Error response:', err?.response);
      
      // If job not found, it was already deleted - just refresh
      if (err?.message?.includes('not_found')) {
        await refetch();
      } else if (err?.message?.includes('running')) {
        alert('Cannot delete a running job. Cancel it first.');
      } else {
        alert(`Failed to delete job: ${err?.message || err}`);
      }
    }
  };

  const openConfirmDialog = (action, jobId) => {
    setConfirmDialog({ open: true, action, jobId });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'active':
        return { bgcolor: '#3b82f6', color: 'white' };
      case 'completed':
      case 'success':
        return { bgcolor: '#10b981', color: 'white' };
      case 'failed':
      case 'error':
        return { bgcolor: '#ef4444', color: 'white' };
      case 'cancelled':
      case 'canceled':
        return { bgcolor: '#f59e0b', color: 'white' };
      default:
        return { bgcolor: '#6b7280', color: 'white' };
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '–';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const formatDuration = (start, end) => {
    if (!start) return '–';
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diffMs = endTime - startTime;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading && jobs.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Background Jobs</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={<Checkbox checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} size="small" />}
            label="Auto-Refresh"
            sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
          />
          <Button variant="contained" size="small" onClick={refetch} sx={{ fontSize: '0.75rem' }}>
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Box sx={{ 
          mb: 2, 
          p: 1, 
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.1)' : 'error.light',
          border: 1,
          borderColor: 'error.main',
          borderRadius: 1 
        }}>
          <Typography color="error" fontSize="0.75rem">Error: {error}</Typography>
        </Box>
      )}

      <TableContainer>
        <Table size="small" sx={{ '& th': { fontWeight: 600, fontSize: '0.75rem' } }}>
          <TableHead>
            <TableRow>
              <TableCell width={30}></TableCell>
              <TableCell width={60}>ID</TableCell>
              <TableCell width={120}>Type</TableCell>
              <TableCell width={100}>Status</TableCell>
              <TableCell width={120}>Progress</TableCell>
              <TableCell width={150}>Created</TableCell>
              <TableCell width={150}>Started</TableCell>
              <TableCell width={100}>Duration</TableCell>
              <TableCell width={100} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => {
              const isExpanded = expandedRows.has(job.id);
              const isRunning = job.status?.toLowerCase() === 'running' || job.status?.toLowerCase() === 'active';
              const progress = typeof job.progress === 'object' && job.progress?.pct != null 
                ? Number(job.progress.pct) 
                : (typeof job.progress === 'number' ? job.progress : 0);

              return (
                <React.Fragment key={job.id}>
                  <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                    <TableCell padding="none" align="center">
                      <IconButton size="small" onClick={() => toggleRowExpand(job.id)}>
                        {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {job.id}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>
                      {job.type}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={job.status}
                        size="small"
                        sx={{
                          ...getStatusColor(job.status),
                          fontWeight: 600,
                          fontSize: '0.6875rem',
                          minWidth: 80
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {isRunning && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant={progress > 0 ? 'determinate' : 'indeterminate'}
                            value={progress}
                            sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                          />
                          {progress > 0 && (
                            <Typography fontSize="0.6875rem" color="text.secondary">
                              {Math.round(progress)}%
                            </Typography>
                          )}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>
                      {formatTimestamp(job.created_at)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>
                      {formatTimestamp(job.started_at)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>
                      {formatDuration(job.started_at, job.completed_at)}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        {isRunning && (
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => openConfirmDialog('cancel', job.id)}
                            title="Cancel job"
                          >
                            <CancelIcon fontSize="small" />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => openConfirmDialog('delete', job.id)}
                          title="Delete job"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, borderBottom: isExpanded ? '1px solid' : 'none', borderColor: 'divider' }}>
                      <Collapse in={isExpanded}>
                        <Box sx={{ p: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.50' }}>
                          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                            Job Details
                          </Typography>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, fontSize: '0.75rem' }}>
                            <Typography fontWeight={600} color="text.primary">ID:</Typography>
                            <Typography color="text.secondary">{job.id}</Typography>
                            
                            <Typography fontWeight={600} color="text.primary">Type:</Typography>
                            <Typography color="text.secondary">{job.type}</Typography>
                            
                            <Typography fontWeight={600} color="text.primary">Status:</Typography>
                            <Typography color="text.secondary">{job.status}</Typography>
                            
                            <Typography fontWeight={600} color="text.primary">Created:</Typography>
                            <Typography color="text.secondary">{formatTimestamp(job.created_at)}</Typography>
                            
                            <Typography fontWeight={600} color="text.primary">Started:</Typography>
                            <Typography color="text.secondary">{formatTimestamp(job.started_at)}</Typography>
                            
                            <Typography fontWeight={600} color="text.primary">Completed:</Typography>
                            <Typography color="text.secondary">{formatTimestamp(job.completed_at)}</Typography>

                            {job.error && (
                              <>
                                <Typography fontWeight={600} color="error">Error:</Typography>
                                <Typography color="error">{job.error}</Typography>
                              </>
                            )}

                            {job.result && (
                              <>
                                <Typography fontWeight={600} color="text.primary">Result:</Typography>
                                <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto', color: 'inherit' }}>
                                  {JSON.stringify(job.result, null, 2)}
                                </pre>
                              </>
                            )}

                            {job.params && (
                              <>
                                <Typography fontWeight={600} color="text.primary">Parameters:</Typography>
                                <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto', color: 'inherit' }}>
                                  {JSON.stringify(job.params, null, 2)}
                                </pre>
                              </>
                            )}
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {jobs.length === 0 && !loading && (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="text.secondary" fontSize="0.75rem">No jobs found</Typography>
        </Box>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, action: null, jobId: null })}>
        <DialogTitle>
          {confirmDialog.action === 'cancel' ? 'Cancel Job' : 'Delete Job'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {confirmDialog.action === 'cancel'
              ? 'Are you sure you want to cancel this job?'
              : 'Are you sure you want to delete this job? This action cannot be undone.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, action: null, jobId: null })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={confirmDialog.action === 'cancel' ? 'warning' : 'error'}
            onClick={() => {
              if (confirmDialog.action === 'cancel') {
                handleCancelJob(confirmDialog.jobId);
              } else {
                handleDeleteJob(confirmDialog.jobId);
              }
            }}
          >
            {confirmDialog.action === 'cancel' ? 'Cancel Job' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
