import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material';
import { FileDownload } from '@mui/icons-material';
import dashboardService from '../../services/dashboardService';

const ExportDashboardButton = ({ dashboardId, dashboardName }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    setError('');
    setSuccess(false);
  };

  const handleClose = () => {
    setOpen(false);
    setError('');
    setSuccess(false);
  };

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const exportData = await dashboardService.exportDashboard(dashboardId);
      
      // Create filename with dashboard name and date
      const date = new Date().toISOString().split('T')[0];
      const safeName = (dashboardName || 'dashboard')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const filename = `${safeName}-${date}.json`;

      // Create blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to export dashboard:', err);
      setError(err.message || 'Failed to export dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        startIcon={<FileDownload />}
        onClick={handleOpen}
        size="small"
      >
        Export
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Export Dashboard</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Export <strong>{dashboardName || 'this dashboard'}</strong> to a JSON file that can be imported into another DataForeman instance.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Dashboard exported successfully!
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            variant="contained"
            disabled={loading || success}
            startIcon={loading ? <CircularProgress size={16} /> : <FileDownload />}
          >
            Export Dashboard
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ExportDashboardButton;
