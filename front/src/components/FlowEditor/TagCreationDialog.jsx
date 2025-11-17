import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from '@mui/material';
import { createInternalTag } from '../../services/flowsApi';

/**
 * Tag Creation Dialog
 * Create new internal tags from the flow editor
 */
export default function TagCreationDialog({ open, onClose, onTagCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dataType, setDataType] = useState('number');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    setError(null);
    
    if (!name.trim()) {
      setError('Tag name is required');
      return;
    }

    setCreating(true);
    try {
      const newTag = await createInternalTag({
        name: name.trim(),
        description: description.trim(),
        data_type: dataType,
      });
      
      onTagCreated(newTag);
      onClose();
      
      // Reset form
      setName('');
      setDescription('');
      setDataType('number');
    } catch (err) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (!creating) {
      setName('');
      setDescription('');
      setDataType('number');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Internal Tag</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Tag Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
            placeholder="e.g., flow_output_1"
            error={!!error && !name.trim()}
            helperText="Must be unique within internal tags"
          />
          
          <FormControl fullWidth>
            <InputLabel>Data Type</InputLabel>
            <Select
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              label="Data Type"
            >
              <MenuItem value="number">Number</MenuItem>
              <MenuItem value="string">String</MenuItem>
              <MenuItem value="boolean">Boolean</MenuItem>
              <MenuItem value="json">JSON</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Describe what this tag represents..."
          />

          {error && (
            <Box sx={{ color: 'error.main', fontSize: '0.875rem' }}>
              {error}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={creating}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={!name.trim() || creating}
        >
          {creating ? 'Creating...' : 'Create Tag'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
