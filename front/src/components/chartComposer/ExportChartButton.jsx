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
  Box
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import { usePermissions } from '../../contexts/PermissionContext';
import chartComposerService from '../../services/chartComposerService';

const ExportChartButton = () => {
  const { can } = usePermissions();
  const { loadedChart } = useChartComposer();
  
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleOpen = () => {
    setError('');
    setSuccess(false);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setError('');
    setSuccess(false);
  };

  const handleExport = async () => {
    if (!loadedChart?.id) return;

    setExporting(true);
    setError('');
    setSuccess(false);

    try {
      const response = await chartComposerService.exportChart(loadedChart.id);
      
      // Create blob and download
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${loadedChart.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err.response?.data?.message || err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Only show if user has read permission and chart is loaded
  if (!can('chart_composer', 'read') || !loadedChart?.id) {
    return null;
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Download fontSize="small" />}
        onClick={handleOpen}
        size="small"
        sx={{ minWidth: 80 }}
      >
        Export
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Export Chart</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            
            {success ? (
              <Alert severity="success">
                Chart exported successfully!
              </Alert>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Export <strong>{loadedChart.name}</strong> as a JSON file including:
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 3 }}>
                  <Typography component="li" variant="body2">Chart configuration</Typography>
                  <Typography component="li" variant="body2">Tag references with connection info</Typography>
                  <Typography component="li" variant="body2">Visualization settings</Typography>
                </Box>
                <Alert severity="info" sx={{ mt: 1 }}>
                  Import this file into another DataForeman instance. Tags and connections must exist in the target environment.
                </Alert>
              </>
            )}
          </Box>
        </DialogContent>
        {!success && (
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
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
};

export default ExportChartButton;
