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
  Chip,
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
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { getInternalTags, createInternalTag, getTagWriters } from '../../services/flowsApi';

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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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

  const handleTagCreated = (newTag) => {
    loadTags();
    if (onSnackbar) {
      onSnackbar('Internal tag created successfully', 'success');
    }
  };

  const handleFlowClick = (flowId, nodeId) => {
    // Navigate to flow editor with node highlight parameter
    navigate(`/flows/${flowId}${nodeId ? `?highlight=${nodeId}` : ''}`);
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
          startIcon={<RefreshIcon />}
          variant="outlined"
          onClick={loadTags}
        >
          Refresh
        </Button>
      </Box>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Internal tags are created and controlled by flows. To configure database saving, edit the tag-output node in your flow.
      </Alert>

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
                <TableCell>Tag Name</TableCell>
                <TableCell>Data Type</TableCell>
                <TableCell>Written By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tags.map((tag) => (
                <TableRow key={tag.tag_id} hover>
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
                    {tagWriters[tag.tag_id] && tagWriters[tag.tag_id].length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {tagWriters[tag.tag_id].map((flow) => (
                          <Link
                            key={flow.flow_id}
                            component="button"
                            variant="caption"
                            onClick={() => handleFlowClick(flow.flow_id, flow.node_id)}
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
    </Box>
  );
}
