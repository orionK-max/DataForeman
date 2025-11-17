import React, { useState } from 'react';
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  TableChart as TableIcon,
  Code as JsonIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import DataTable from './DataTable';
import DataJson from './DataJson';

/**
 * DataDisplayPanel - Displays data in table or JSON format
 * 
 * Features:
 * - Toggle between table and JSON views
 * - Copy to clipboard
 * - Download as JSON file
 * - No data state
 */
const DataDisplayPanel = ({
  title,
  data,
  displayMode = 'table',
  onDisplayModeChange,
  noDataMessage = 'No data available',
  showActions = false,
}) => {
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const handleCopy = async () => {
    if (data) {
      try {
        const jsonString = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(jsonString);
        setSnackbar({ open: true, message: 'Copied to clipboard!' });
      } catch (error) {
        console.error('Error copying to clipboard:', error);
        setSnackbar({ open: true, message: 'Failed to copy' });
      }
    }
  };

  const handleDownload = () => {
    if (data) {
      try {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSnackbar({ open: true, message: 'Downloaded successfully!' });
      } catch (error) {
        console.error('Error downloading file:', error);
        setSnackbar({ open: true, message: 'Failed to download' });
      }
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ open: false, message: '' });
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header with controls */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2">{title}</Typography>
        
        {data && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Display mode toggle */}
            <ToggleButtonGroup
              value={displayMode}
              exclusive
              onChange={(e, value) => value && onDisplayModeChange(value)}
              size="small"
            >
              <ToggleButton value="table">
                <Tooltip title="Table View">
                  <TableIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="json">
                <Tooltip title="JSON View">
                  <JsonIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Actions */}
            {showActions && (
              <>
                <Tooltip title="Copy to clipboard">
                  <IconButton size="small" onClick={handleCopy}>
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Download as JSON">
                  <IconButton size="small" onClick={handleDownload}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {!data ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary',
            }}
          >
            <Typography variant="body2">{noDataMessage}</Typography>
          </Box>
        ) : displayMode === 'table' ? (
          <DataTable data={data} />
        ) : (
          <DataJson data={data} />
        )}
      </Box>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity="success" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DataDisplayPanel;
