import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Box,
} from '@mui/material';

/**
 * Flow Settings Dialog
 * Edit flow name, description, and sharing settings
 */
export default function FlowSettingsDialog({ open, onClose, flow, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (flow) {
      setName(flow.name || '');
      setDescription(flow.description || '');
      setShared(flow.shared || false);
    }
  }, [flow]);

  const handleSave = () => {
    onSave({ name, description, shared });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Flow Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Flow Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Describe what this flow does..."
          />
          <FormControlLabel
            control={
              <Switch
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
            }
            label="Share with other users"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
