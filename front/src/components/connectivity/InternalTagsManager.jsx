import React, { useState, useEffect, useMemo } from 'react';
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
  Checkbox,
  TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { getInternalTags, createInternalTag, getTagWriters } from '../../services/flowsApi';
import connectivityService from '../../services/connectivityService';
import ConfirmDialog from '../common/ConfirmDialog';

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
 * Strip "internal." prefix from tag path for display
 */
const formatTagName = (tagPath) => {
  if (!tagPath) return '';
  return tagPath.replace(/^internal\./, '');
};

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
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTags, setDeletingTags] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      setError('');
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
      setError('Failed to load internal tags: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleTagCreated = (newTag) => {
    loadTags();
    setMessage('Internal tag created successfully');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleFlowClick = (flowId, nodeId) => {
    // Navigate to flow editor with node highlight parameter
    navigate(`/flows/${flowId}${nodeId ? `?highlight=${nodeId}` : ''}`);
  };

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return tags;
    const query = search.trim().toLowerCase();
    return tags.filter(tag =>
      (tag.tag_name || '').toLowerCase().includes(query) ||
      (tag.tag_path || '').toLowerCase().includes(query) ||
      (tag.data_type || '').toLowerCase().includes(query) ||
      String(tag.tag_id || '').includes(query)
    );
  }, [tags, search]);

  // Reset to first page when search changes
  useEffect(() => {
    setPage(0);
  }, [search]);

  // Paginated tags for display
  const paginatedTags = useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredTags.slice(start, end);
  }, [filteredTags, page, rowsPerPage]);

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Selection handlers
  const toggleOne = (tagId) => {
    // Don't allow selection of tags that have writers
    const writers = tagWriters[tagId] || [];
    if (writers.length > 0) return;
    
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  // Filter out tags that can be selected (no writers)
  const selectableTags = filteredTags.filter(t => {
    const writers = tagWriters[t.tag_id] || [];
    return writers.length === 0;
  });
  
  const allChecked = selectableTags.length > 0 && selectableTags.every(t => selected.has(t.tag_id));
  const someChecked = selectableTags.some(t => selected.has(t.tag_id)) && !allChecked;

  const toggleAll = () => {
    setSelected(prev => {
      if (allChecked) {
        // Remove all filtered tags from selection
        return new Set(Array.from(prev).filter(id => !selectableTags.some(t => t.tag_id === id)));
      } else {
        // Add all selectable filtered tags to selection
        const next = new Set(prev);
        selectableTags.forEach(t => next.add(t.tag_id));
        return next;
      }
    });
  };

  // Delete selected tags
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    const count = selected.size;
    const selectedTagsArray = Array.from(selected);
    
    // Get the first selected tag to find the connection_id
    const firstTag = tags.find(t => t.tag_id === selectedTagsArray[0]);
    if (!firstTag) {
      setError('Failed to find selected tags');
      setDeleteDialogOpen(false);
      return;
    }

    setDeletingTags(true);
    setError('');
    setMessage('');

    try {
      // Use batch delete - creates a single job for all tags
      await connectivityService.deleteTags({ 
        id: firstTag.connection_id, 
        tag_ids: selectedTagsArray
      });

      await loadTags();
      
      setMessage(`Deletion started for ${count} tag${count > 1 ? 's' : ''}. Check Jobs page for progress.`);
      setSelected(new Set());
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      console.error('Failed to delete tags:', err);
      setError('Failed to delete tags: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingTags(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper 
      component={Box} 
      sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: 0, 
        height: '100%',
        p: 2
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">
          Internal Tags
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 200 }}
          />
          <Button
            size="small"
            startIcon={<AddIcon />}
            variant="outlined"
            onClick={() => setCreateDialogOpen(true)}
            sx={{ minWidth: 90 }}
          >
            Create Tag
          </Button>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            variant="outlined"
            onClick={loadTags}
            sx={{ minWidth: 90 }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Messages */}
      {message && <Alert severity="success" sx={{ mb: 1, py: 0.5 }}>{message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 1, py: 0.5 }}>{error}</Alert>}

      {/* Tags Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : tags.length === 0 ? (
        <Alert severity="info">
          No internal tags found. Internal tags are created by flows to store intermediate values.
        </Alert>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={someChecked}
                      checked={allChecked}
                      onChange={toggleAll}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>Tag ID</TableCell>
                  <TableCell>Tag Name</TableCell>
                  <TableCell>Data Type</TableCell>
                  <TableCell>Written By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && filteredTags.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No tags found
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                
                {!loading && paginatedTags.map((tag) => {
                  const writers = tagWriters[tag.tag_id] || [];
                  const hasWriters = writers.length > 0;
                  return (
                  <TableRow 
                    key={tag.tag_id}
                    hover
                    sx={{ 
                      height: '32px',
                      '& td': { py: 0.5, fontSize: '0.813rem' },
                      opacity: hasWriters ? 0.7 : 1
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.has(tag.tag_id)}
                        disabled={hasWriters}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOne(tag.tag_id);
                        }}
                        sx={{ p: 0.5 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.813rem' }}>
                      {tag.tag_id}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium" sx={{ fontSize: '0.813rem' }}>
                        {tag.tag_name || formatTagName(tag.tag_path)}
                      </Typography>
                      {tag.description && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {tag.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={tag.data_type || 'number'} 
                        size="small" 
                        variant="outlined"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    </TableCell>
                    <TableCell>
                      {tagWriters[tag.tag_id] && tagWriters[tag.tag_id].length > 0 ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                          {tagWriters[tag.tag_id].map((flow) => (
                            <Link
                              key={flow.flow_id}
                              component="button"
                              variant="caption"
                              onClick={() => handleFlowClick(flow.flow_id, flow.node_id)}
                              sx={{ textDecoration: 'none', fontSize: '0.75rem' }}
                            >
                              {flow.flow_name}
                            </Link>
                          ))}
                          <Chip 
                            label="Protected" 
                            size="small" 
                            color="warning"
                            sx={{ fontSize: '0.65rem', height: 18, ml: 0.5 }}
                          />
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          None
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {!loading && filteredTags.length > 0 && (
            <TablePagination
              component="div"
              count={filteredTags.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[25, 50, 100, 250]}
              sx={{ borderTop: 1, borderColor: 'divider' }}
            />
          )}

          {/* Info Footer */}
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="caption" component="div">
              <strong>Total Tags:</strong> {filteredTags.length}
              {search && <> | <strong>Filtered from:</strong> {tags.length}</>}
              {filteredTags.length > 0 && <> | <strong>Showing:</strong> {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, filteredTags.length)}</>}
              {selected.size > 0 && <> | <strong>Selected:</strong> {selected.size}</>}
              {selectableTags.length < filteredTags.length && <> | <strong>Protected:</strong> {filteredTags.length - selectableTags.length} (in use by flows)</>}
            </Typography>
          </Alert>

          {/* Delete Button */}
          {selected.size > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
              <Button
                size="small"
                variant="contained"
                color="error"
                onClick={deleteSelected}
                disabled={deletingTags}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5 }}
              >
                Delete Selected ({selected.size})
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Dialogs */}
      <CreateTagDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onTagCreated={handleTagCreated}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Internal Tags"
        message={`Delete ${selected.size} internal tag${selected.size > 1 ? 's' : ''}? All historical data will be permanently deleted and this cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        loading={deletingTags}
        confirmText="Delete"
        confirmColor="error"
      />
    </Paper>
  );
}
