import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  Box,
  Typography,
  LinearProgress,
  Alert,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const ExportDialog = ({ open, onClose, dashboardName }) => {
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState('high');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const qualitySettings = {
    low: { scale: 1, quality: 0.7 },
    medium: { scale: 2, quality: 0.85 },
    high: { scale: 3, quality: 0.95 },
  };

  const handleExport = async () => {
    setExporting(true);
    setError('');

    try {
      // Find the dashboard grid element
      const dashboardElement = document.querySelector('.dashboard-grid-container');
      if (!dashboardElement) {
        throw new Error('Dashboard not found');
      }

      // Temporarily hide controls for export
      const controls = document.querySelectorAll('.export-hide');
      controls.forEach(el => el.style.display = 'none');

      // Capture the dashboard
      const canvas = await html2canvas(dashboardElement, {
        scale: qualitySettings[quality].scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // Restore controls
      controls.forEach(el => el.style.display = '');

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${dashboardName || 'dashboard'}_${timestamp}`;

      if (format === 'pdf') {
        // Export as PDF
        const imgData = canvas.toDataURL('image/jpeg', qualitySettings[quality].quality);
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });
        
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${filename}.pdf`);
      } else {
        // Export as PNG or JPG
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.${format}`;
            link.click();
            URL.revokeObjectURL(url);
          },
          mimeType,
          qualitySettings[quality].quality
        );
      }

      // Close dialog after successful export
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err.message || 'Failed to export dashboard');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export Dashboard</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* Format Selection */}
          <FormControl>
            <FormLabel>Format</FormLabel>
            <RadioGroup value={format} onChange={(e) => setFormat(e.target.value)}>
              <FormControlLabel value="png" control={<Radio />} label="PNG (Lossless)" />
              <FormControlLabel value="jpg" control={<Radio />} label="JPG (Smaller file size)" />
              <FormControlLabel value="pdf" control={<Radio />} label="PDF Document" />
            </RadioGroup>
          </FormControl>

          {/* Quality Selection */}
          <FormControl fullWidth>
            <FormLabel>Quality</FormLabel>
            <Select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              size="small"
            >
              <MenuItem value="low">Low (Faster, smaller file)</MenuItem>
              <MenuItem value="medium">Medium (Balanced)</MenuItem>
              <MenuItem value="high">High (Best quality, larger file)</MenuItem>
            </Select>
          </FormControl>

          {/* Info Text */}
          <Typography variant="body2" color="text.secondary">
            The export will capture the current view of your dashboard without toolbars and controls.
          </Typography>

          {/* Error Message */}
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Progress Bar */}
          {exporting && (
            <Box>
              <Typography variant="body2" gutterBottom>
                Exporting dashboard...
              </Typography>
              <LinearProgress />
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          color="primary"
          disabled={exporting}
          startIcon={<Download />}
        >
          Export
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportDialog;
