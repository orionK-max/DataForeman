import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
} from '@mui/material';
import {
  PushPin as PinIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

/**
 * PinDataDialog - Modal for editing and saving pinned data to a node
 * 
 * Allows users to lock test data to nodes for consistent debugging.
 * Data is stored in the flow definition and used during execution.
 */
const PinDataDialog = ({
  open,
  onClose,
  onSave,
  initialData = null,
  nodeName = 'Node',
}) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');

  // Initialize with data when dialog opens
  useEffect(() => {
    if (open && initialData) {
      try {
        setJsonText(JSON.stringify(initialData, null, 2));
        setError('');
      } catch (err) {
        setJsonText('');
        setError('Invalid data format');
      }
    } else if (open && !initialData) {
      setJsonText('{\n  \n}');
      setError('');
    }
  }, [open, initialData]);

  const handleSave = () => {
    try {
      // Validate JSON
      const parsed = JSON.parse(jsonText);
      
      // Call onSave with parsed data
      onSave(parsed);
      onClose();
    } catch (err) {
      setError('Invalid JSON: ' + err.message);
    }
  };

  const handleChange = (event) => {
    const newValue = event.target.value;
    setJsonText(newValue);
    
    // Try to parse to validate
    try {
      JSON.parse(newValue);
      setError('');
    } catch (err) {
      setError('Invalid JSON: ' + err.message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh', maxHeight: '600px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PinIcon />
          <Typography variant="h6">
            Pin Data - {nodeName}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Alert severity="info">
          Pinned data will be used instead of live data when executing this node.
          This is useful for testing and debugging with consistent values.
        </Alert>

        {error && (
          <Alert severity="error">{error}</Alert>
        )}

        <TextField
          label="JSON Data"
          multiline
          rows={15}
          value={jsonText}
          onChange={handleChange}
          variant="outlined"
          fullWidth
          placeholder='{\n  "value": 42,\n  "quality": 192\n}'
          sx={{
            '& .MuiInputBase-root': {
              fontFamily: 'monospace',
              fontSize: '14px',
            }
          }}
          helperText="Enter valid JSON data to pin to this node"
        />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Example formats:
          </Typography>
          <Box sx={{ fontFamily: 'monospace', fontSize: '12px', mt: 1 }}>
            <div>Object: {`{ "value": 42, "quality": 192 }`}</div>
            <div>Array: {`[{ "value": 1 }, { "value": 2 }]`}</div>
            <div>Simple: {`{ "result": true }`}</div>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
          startIcon={<CancelIcon />}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!!error || !jsonText.trim()}
          startIcon={<PinIcon />}
        >
          Pin Data
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PinDataDialog;
