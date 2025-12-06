import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Typography,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { exportFlow } from '../../services/flowsApi';

const ExportFlowButton = ({ flowId, flowName }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = () => {
    setOpen(true);
    setError('');
  };

  const handleClose = () => {
    setOpen(false);
    setError('');
  };

  const handleExport = async () => {
    setExporting(true);
    setError('');

    try {
      const exportData = await exportFlow(flowId);

      // Create filename with flow name and date
      const date = new Date().toISOString().split('T')[0];
      const sanitizedName = flowName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const filename = `${sanitizedName}-${date}.json`;

      // Download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      handleClose();
    } catch (err) {
      console.error('Export failed:', err);
      setError(err.message || 'Failed to export flow');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<Download fontSize="small" />}
        onClick={handleOpen}
      >
        Export
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Export Flow</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Export <strong>{flowName}</strong> to a JSON file that can be imported into
            another DataForeman instance.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            variant="contained"
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
          >
            {exporting ? 'Exporting...' : 'Export Flow'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ExportFlowButton;
