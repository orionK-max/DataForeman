import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { getInternalTags, createInternalTag, enableTagSaving, disableTagSaving, getTagWriters } from '../../services/flowsApi';

/**
 * Save Configuration Dialog
 * Configure on-change or interval saving for selected tags
 */
function SaveConfigDialog({ open, onClose, selectedTags, onSave }) {
  const [saveType, setSaveType] = useState('on-change');
  const [deadband, setDeadband] = useState(0.1);
  const [interval, setInterval] = useState(1000);

  const handleSave = () => {
    onSave({
      saveType,
      deadband: saveType === 'on-change' ? parseFloat(deadband) : null,
      interval: saveType === 'interval' ? parseInt(interval) : null,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure Tag Saving</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Alert severity="info">
            {selectedTags.length} tag(s) selected. Configure when to save values to TimescaleDB.
          </Alert>

          <FormControl fullWidth>
            <InputLabel>Save Type</InputLabel>
            <Select
              value={saveType}
              onChange={(e) => setSaveType(e.target.value)}
              label="Save Type"
            >
              <MenuItem value="on-change">On Change (with deadband)</MenuItem>
              <MenuItem value="interval">Interval (periodic)</MenuItem>
            </Select>
          </FormControl>

          {saveType === 'on-change' && (
            <TextField
              label="Deadband"
              type="number"
              value={deadband}
              onChange={(e) => setDeadband(e.target.value)}
              fullWidth
              helperText="Minimum change required to trigger save (e.g., 0.1)"
              inputProps={{ step: 0.01, min: 0 }}
            />
          )}

          {saveType === 'interval' && (
            <TextField
              label="Interval (ms)"
              type="number"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              fullWidth
              helperText="How often to save values (milliseconds)"
              inputProps={{ step: 100, min: 100 }}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Configuration
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Stop Saving Dialog
 * Warning dialog for stopping tag saving
 */
function StopSavingDialog({ open, onClose, selectedTags, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Stop Saving Tags?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>Warning:</strong> Stopping saving will keep historical data but prevent new values from being saved to TimescaleDB.
        </Alert>
        <Typography variant="body2">
          {selectedTags.length} tag(s) will stop saving values.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} variant="contained" color="warning">
          Stop Saving
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Create Tag Dialog
 */
function CreateTagDialog({ open, onClose, onTagCreated }) {
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
      // Convert tag name to a valid tag_path format (internal.xxx)
      const tagPath = `internal.${name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      
      const newTag = await createInternalTag({
        tag_path: tagPath,
        tag_name: name.trim(),
        description: description.trim(),
        data_type: dataType === 'number' ? 'float' : 
                   dataType === 'boolean' ? 'bool' : 
                   dataType === 'json' ? 'object' : 'string',
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
            <Alert severity="error">{error}</Alert>
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

/**
 * Internal Tags Manager Component
 * Manages internal tags created by flows
 */
export default function InternalTagsManager({ onSnackbar }) {
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [tagWriters, setTagWriters] = useState({});

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      const data = await getInternalTags();
      setTags(data.tags || []);
      
      // Load writers for each tag
      const writers = {};
      for (const tag of data.tags || []) {
        try {
          const writerData = await getTagWriters(tag.tag_id);
          writers[tag.tag_id] = writerData.writers || [];
        } catch (err) {
          console.error(`Failed to load writers for tag ${tag.tag_id}:`, err);
          writers[tag.tag_id] = [];
        }
      }
      setTagWriters(writers);
    } catch (error) {
      console.error('Failed to load internal tags:', error);
      if (onSnackbar) {
        onSnackbar('Failed to load internal tags', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelected(tags.map(t => t.tag_id));
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (tagId) => {
    setSelected(prev => 
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleTagCreated = (newTag) => {
    loadTags();
    if (onSnackbar) {
      onSnackbar('Internal tag created successfully', 'success');
    }
  };

  const handleSaveConfig = async (config) => {
    try {
      for (const tagId of selected) {
        await enableTagSaving(tagId, {
          on_change_enabled: config.saveType === 'on-change',
          on_change_deadband: config.deadband,
          poll_interval_ms: config.interval,
        });
      }
      
      await loadTags();
      setSelected([]);
      if (onSnackbar) {
        onSnackbar(`${selected.length} tag(s) configured for saving`, 'success');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      if (onSnackbar) {
        onSnackbar('Failed to save configuration', 'error');
      }
    }
  };

  const handleStopSaving = async () => {
    try {
      for (const tagId of selected) {
        await disableTagSaving(tagId);
      }
      
      await loadTags();
      setSelected([]);
      setStopDialogOpen(false);
      if (onSnackbar) {
        onSnackbar(`${selected.length} tag(s) stopped saving`, 'success');
      }
    } catch (error) {
      console.error('Failed to stop saving:', error);
      if (onSnackbar) {
        onSnackbar('Failed to stop saving', 'error');
      }
    }
  };

  const getSaveTrigger = (tag) => {
    if (!tag.is_subscribed) return '-';
    if (tag.on_change_enabled) return `On Change (${tag.on_change_deadband || 0.1})`;
    return `Interval (${tag.poll_interval_ms || 1000}ms)`;
  };

  const handleFlowClick = (flowId) => {
    navigate(`/flows/${flowId}`);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Tag
        </Button>
        <Button
          startIcon={<SaveIcon />}
          variant="outlined"
          disabled={selected.length === 0}
          onClick={() => setSaveDialogOpen(true)}
        >
          Save Selected
        </Button>
        <Button
          startIcon={<StopIcon />}
          variant="outlined"
          color="warning"
          disabled={selected.length === 0}
          onClick={() => setStopDialogOpen(true)}
        >
          Stop Saving
        </Button>
        <Button
          startIcon={<RefreshIcon />}
          variant="outlined"
          onClick={loadTags}
        >
          Refresh
        </Button>
      </Box>

      {/* Tags Table */}
      {tags.length === 0 ? (
        <Alert severity="info">
          No internal tags found. Internal tags are created by flows to store intermediate values.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === tags.length && tags.length > 0}
                    indeterminate={selected.length > 0 && selected.length < tags.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell>Tag Name</TableCell>
                <TableCell>Data Type</TableCell>
                <TableCell>Saved</TableCell>
                <TableCell>Save Trigger</TableCell>
                <TableCell>Written By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tags.map((tag) => (
                <TableRow key={tag.tag_id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(tag.tag_id)}
                      onChange={() => handleSelectOne(tag.tag_id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {tag.tag_path}
                    </Typography>
                    {tag.description && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {tag.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={tag.data_type || 'number'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={tag.is_subscribed ? 'Yes' : 'No'}
                      size="small"
                      color={tag.is_subscribed ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{getSaveTrigger(tag)}</TableCell>
                  <TableCell>
                    {tagWriters[tag.tag_id] && tagWriters[tag.tag_id].length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {tagWriters[tag.tag_id].map((flow) => (
                          <Link
                            key={flow.flow_id}
                            component="button"
                            variant="caption"
                            onClick={() => handleFlowClick(flow.flow_id)}
                            sx={{ textDecoration: 'none' }}
                          >
                            {flow.flow_name}
                          </Link>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        None
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialogs */}
      <CreateTagDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onTagCreated={handleTagCreated}
      />

      <SaveConfigDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        selectedTags={selected}
        onSave={handleSaveConfig}
      />

      <StopSavingDialog
        open={stopDialogOpen}
        onClose={() => setStopDialogOpen(false)}
        selectedTags={selected}
        onConfirm={handleStopSaving}
      />
    </Box>
  );
}
