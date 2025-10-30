import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Checkbox,
  TextField,
  Button,
  Box,
  Typography,
  Chip,
  FormControlLabel,
  CircularProgress,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Autocomplete,
  Tooltip,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  FileDownload as DownloadIcon,
  FileUpload as UploadIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import connectivityService from '../../services/connectivityService';
import ConfirmDialog from '../common/ConfirmDialog';

/**
 * Format poll rate for display
 */
const formatPollRate = (ms) => {
  if (!ms || ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min`;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
};

/**
 * Tag Status Badge Component
 */
const TagStatusBadge = ({ status }) => {
  const statusMap = {
    active: { color: 'success', label: 'Active' },
    pending_delete: { color: 'warning', label: 'Pending' },
    deleting: { color: 'info', label: 'Deleting' },
    deleted: { color: 'error', label: 'Deleted' },
  };
  
  const statusInfo = statusMap[status || 'active'] || statusMap.active;
  
  return (
    <Chip 
      label={statusInfo.label} 
      color={statusInfo.color} 
      size="small"
      sx={{ fontSize: 10, height: 20 }}
    />
  );
};

/**
 * SavedTagsList Component
 * Displays all saved tags for a specific connection with batch operations support
 */
const SavedTagsList = ({ connectionId, onTagsChanged, refreshTrigger }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [pollGroups, setPollGroups] = useState([]);
  const [selectedPollGroup, setSelectedPollGroup] = useState(5);
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  // Write on change settings for batch operations
  const [changeDetectionEnabled, setChangeDetectionEnabled] = useState(true);
  const [deadband, setDeadband] = useState(0);
  const [deadbandType, setDeadbandType] = useState('absolute');
  const [forcePublishInterval, setForcePublishInterval] = useState(60); // seconds
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTags, setDeletingTags] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);
  
  const lastAnchorRef = useRef(null);

  // Load poll groups and units
  useEffect(() => {
    const loadPollGroups = async () => {
      try {
        const result = await connectivityService.getPollGroups();
        setPollGroups(result.poll_groups || []);
      } catch (err) {
        console.error('Failed to load poll groups:', err);
      }
    };
    
    const loadUnits = async () => {
      try {
        const result = await connectivityService.getUnits();
        setUnits(result.units || []);
      } catch (err) {
        console.error('Failed to load units:', err);
      }
    };
    
    loadPollGroups();
    loadUnits();
  }, []);

  // Load tags for the connection
  const loadTags = useCallback(async () => {
    if (!connectionId) {
      setTags([]);
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setSelected(new Set());

    try {
      const result = await connectivityService.getTagsByConnection(connectionId, showDeleted);
      setTags(result.tags || []);
    } catch (err) {
      setError('Failed to load tags: ' + (err.message || 'Unknown error'));
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, showDeleted]);

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, showDeleted]); // Only reload when connection or showDeleted changes

  // Reload when refreshTrigger changes (after saving new tags)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

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

  // Shift-click range selection
  const toggleOne = (tagId, event) => {
    const isShift = event?.shiftKey;
    
    setSelected(prev => {
      const tagIds = filteredTags.map(t => t.tag_id);
      const idxMap = new Map(tagIds.map((id, idx) => [id, idx]));

      if (!isShift || lastAnchorRef.current == null || !idxMap.has(lastAnchorRef.current) || !idxMap.has(tagId)) {
        // Simple toggle
        const next = new Set(prev);
        if (next.has(tagId)) {
          next.delete(tagId);
        } else {
          next.add(tagId);
        }
        lastAnchorRef.current = tagId;
        return next;
      }

      // Range selection
      const anchorIdx = idxMap.get(lastAnchorRef.current);
      const currentIdx = idxMap.get(tagId);
      const [start, end] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
      const rangeIds = filteredTags.slice(start, end + 1).map(t => t.tag_id);
      
      const allSelected = rangeIds.every(id => prev.has(id));
      const next = new Set(prev);
      
      if (allSelected) {
        rangeIds.forEach(id => next.delete(id));
      } else {
        rangeIds.forEach(id => next.add(id));
      }
      
      lastAnchorRef.current = tagId;
      return next;
    });
  };

  // Select all / deselect all
  const allChecked = filteredTags.length > 0 && filteredTags.every(t => selected.has(t.tag_id));
  const someChecked = filteredTags.some(t => selected.has(t.tag_id)) && !allChecked;

  const toggleAll = () => {
    setSelected(prev => {
      if (allChecked) {
        // Remove all filtered tags from selection
        return new Set(Array.from(prev).filter(id => !filteredTags.some(t => t.tag_id === id)));
      } else {
        // Add all filtered tags to selection
        const next = new Set(prev);
        filteredTags.forEach(t => next.add(t.tag_id));
        return next;
      }
    });
  };

  // Apply poll group to selected tags
  const applyPollGroup = async () => {
    if (selected.size === 0) {
      setMessage('Select tags to update');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const tag_ids = Array.from(selected);
      await connectivityService.updatePollGroup({
        tag_ids,
        poll_group_id: selectedPollGroup,
      });
      
      setMessage(`Updated ${tag_ids.length} tag${tag_ids.length > 1 ? 's' : ''}`);
      await loadTags();
      if (onTagsChanged) onTagsChanged();
    } catch (err) {
      setError('Failed to update poll group: ' + (err.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  // Apply unit to selected tags
  const applyUnit = async () => {
    if (selected.size === 0) {
      setMessage('Select tags to update');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const tag_ids = Array.from(selected);
      await connectivityService.updateTagUnits({
        tag_ids,
        unit_id: selectedUnit?.id || null,
      });
      
      setMessage(`Updated ${tag_ids.length} tag${tag_ids.length > 1 ? 's' : ''}`);
      await loadTags();
      if (onTagsChanged) onTagsChanged();
    } catch (err) {
      setError('Failed to update unit: ' + (err.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  // Apply write on change settings to selected tags
  const applyChangeDetection = async () => {
    if (selected.size === 0) {
      setMessage('Select tags to update');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const tag_ids = Array.from(selected);
      await connectivityService.updateTagOnChange({
        tag_ids,
        on_change_enabled: changeDetectionEnabled,
        on_change_deadband: deadband,
        on_change_deadband_type: deadbandType,
        on_change_heartbeat_ms: forcePublishInterval * 1000, // Convert seconds to ms
      });
      
      setMessage(`Updated write on change for ${tag_ids.length} tag${tag_ids.length > 1 ? 's' : ''}`);
      await loadTags();
      if (onTagsChanged) onTagsChanged();
    } catch (err) {
      setError('Failed to update write on change: ' + (err.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  // Delete selected tags
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    const count = selected.size;

    setDeletingTags(true);
    setError('');
    setMessage('');

    try {
      // Use batch delete - creates a single job for all tags
      const tagIds = Array.from(selected);
      await connectivityService.deleteTags({ 
        id: connectionId, 
        tag_ids: tagIds 
      });

      await loadTags();
      if (onTagsChanged) onTagsChanged();
      
      setMessage(`Deletion started for ${count} tag${count > 1 ? 's' : ''}. Check Jobs page for progress.`);
      setSelected(new Set());
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

  // Export tags to JSON
  const handleExport = async () => {
    setMenuAnchor(null);
    setExporting(true);
    setError('');
    
    try {
      const blob = await connectivityService.exportTags(connectionId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tags_${connectionId}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setMessage('Tags exported successfully');
    } catch (err) {
      console.error('Failed to export tags:', err);
      setError('Failed to export tags: ' + (err.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  // Import tags from JSON
  const handleImport = () => {
    setMenuAnchor(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setError('');
    setMessage('');
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.tags || !Array.isArray(data.tags)) {
        throw new Error('Invalid import file format');
      }
      
      // Import with 'skip' strategy (don't overwrite existing tags)
      const result = await connectivityService.importTags(connectionId, {
        tags: data.tags,
        merge_strategy: 'skip'
      });
      
      await loadTags();
      if (onTagsChanged) onTagsChanged();
      
      const messages = [];
      if (result.imported > 0) messages.push(`${result.imported} new tag${result.imported > 1 ? 's' : ''} imported`);
      if (result.updated > 0) messages.push(`${result.updated} tag${result.updated > 1 ? 's' : ''} updated`);
      if (result.skipped > 0) messages.push(`${result.skipped} tag${result.skipped > 1 ? 's' : ''} skipped (already exist)`);
      
      setMessage(messages.join(', ') || 'Import completed');
      
      if (result.errors && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
      }
    } catch (err) {
      console.error('Failed to import tags:', err);
      setError('Failed to import tags: ' + (err.message || 'Unknown error'));
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenMenu = (event) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
  };

  // Check if any selected tag has active deletion
  const selectedTags = filteredTags.filter(t => selected.has(t.tag_id));
  const hasActiveDeletion = selectedTags.some(t => 
    ['pending_delete', 'deleting', 'deleted'].includes(t.status)
  );

  if (!connectionId) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Select a device to view its saved tags.
      </Alert>
    );
  }

  return (
    <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            Saved Tags
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 200 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                />
              }
              label="Deleted"
              sx={{ fontSize: 12 }}
            />
            <Tooltip title="Import/Export">
              <IconButton
                size="small"
                onClick={handleOpenMenu}
                disabled={!connectionId || loading}
              >
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Import/Export Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleCloseMenu}
        >
          <MenuItem onClick={handleExport} disabled={exporting || tags.length === 0}>
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export Tags to JSON</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleImport} disabled={importing}>
            <ListItemIcon>
              <UploadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Import Tags from JSON</ListItemText>
          </MenuItem>
        </Menu>

        {/* Hidden file input for import */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Table */}
        <TableContainer sx={{ 
          flex: 1,
          overflow: 'auto'
        }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={someChecked}
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </TableCell>
                <TableCell>Tag ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Poll Group</TableCell>
                <TableCell>Unit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              )}
              
              {!loading && filteredTags.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No tags found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              
              {!loading && paginatedTags.map((tag) => {
                const isDisabled = ['pending_delete', 'deleting', 'deleted'].includes(tag.status);
                return (
                  <TableRow 
                    key={tag.tag_id}
                    hover
                    sx={{ 
                      opacity: isDisabled ? 0.6 : 1,
                      height: '32px',
                      '& td': { py: 0, fontSize: '0.813rem' }
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.has(tag.tag_id)}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOne(tag.tag_id, e);
                        }}
                        sx={{ p: 0.5 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.813rem' }}>{tag.tag_id}</TableCell>
                    <TableCell sx={{ fontSize: '0.813rem' }}>{tag.tag_name || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.813rem' }}>{tag.data_type || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.813rem' }}>
                      <TagStatusBadge status={tag.status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.813rem' }}>
                      {tag.poll_group_name 
                        ? `${tag.poll_group_name} (${formatPollRate(tag.poll_rate_ms)})`
                        : tag.poll_rate_ms 
                          ? formatPollRate(tag.poll_rate_ms)
                          : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.813rem' }}>
                      {tag.unit_symbol || '—'}
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
            rowsPerPageOptions={[25, 50, 100, 250, 500]}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        )}

        {/* Info Footer - matches EIPTagBrowser style */}
        <Alert severity="info" sx={{ mb: 2, mt: 2 }}>
          <Typography variant="caption" component="div">
            <strong>Total Tags:</strong> {filteredTags.length}
            {search && <> | <strong>Filtered from:</strong> {tags.length}</>}
            {filteredTags.length > 0 && <> | <strong>Showing:</strong> {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, filteredTags.length)}</>}
            {selected.size > 0 && <> | <strong>Selected:</strong> {selected.size}</>}
          </Typography>
        </Alert>

        {/* Messages */}
        {exporting && <Alert severity="info" sx={{ mb: 1, py: 0.5 }}>Exporting tags...</Alert>}
        {importing && <Alert severity="info" sx={{ mb: 1, py: 0.5 }}>Importing tags...</Alert>}
        {message && <Alert severity="success" sx={{ mb: 1, py: 0.5 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 1, py: 0.5 }}>{error}</Alert>}
        
        {/* Batch Operation Controls */}
        {selected.size > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            {/* Poll Group and Unit Row */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">Poll Group:</Typography>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select
                  value={selectedPollGroup}
                  onChange={(e) => setSelectedPollGroup(e.target.value)}
                  size="small"
                  sx={{ fontSize: '0.813rem', height: 28 }}
                >
                  {pollGroups.map(pg => (
                    <MenuItem key={pg.group_id} value={pg.group_id}>
                      {pg.name} ({formatPollRate(pg.poll_rate_ms)})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <Button
                size="small"
                variant="outlined"
                onClick={applyPollGroup}
                disabled={busy}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5 }}
              >
                Apply
              </Button>
              
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>Unit:</Typography>
              <Autocomplete
                size="small"
                value={selectedUnit}
                onChange={(e, newValue) => setSelectedUnit(newValue)}
                options={units}
                groupBy={(option) => option.category}
                getOptionLabel={(option) => `${option.name} (${option.symbol})`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Select unit..."
                    size="small"
                  />
                )}
                sx={{ minWidth: 220 }}
                componentsProps={{
                  popper: {
                    sx: { fontSize: '0.813rem' }
                  }
                }}
              />
              
              <Button
                size="small"
                variant="outlined"
                onClick={applyUnit}
                disabled={busy}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5 }}
              >
                Apply
              </Button>
            </Box>

            {/* Write on Change Row */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Tooltip title="Only save tag values to database when they change, reducing writes for stable values">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={changeDetectionEnabled}
                      onChange={(e) => setChangeDetectionEnabled(e.target.checked)}
                      size="small"
                    />
                  }
                  label={<Typography variant="caption">Write on Change</Typography>}
                  sx={{ mr: 1 }}
                />
              </Tooltip>
              
              {changeDetectionEnabled && (
                <>
                  <Typography variant="caption" color="text.secondary">Deadband:</Typography>
                  <Tooltip title="Minimum change required to trigger a write. For absolute: fixed value difference. For percent: percentage of previous value.">
                    <TextField
                      size="small"
                      type="number"
                      value={deadband}
                      onChange={(e) => setDeadband(Number(e.target.value))}
                      inputProps={{ min: 0, step: 0.1 }}
                      sx={{ width: 80, '& input': { fontSize: '0.813rem', py: 0.5 } }}
                    />
                  </Tooltip>
                  
                  <Tooltip title="Absolute: fixed value difference (e.g., 0.5). Percent: percentage of previous value (e.g., 1 = 1%).">
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={deadbandType}
                        onChange={(e) => setDeadbandType(e.target.value)}
                        sx={{ fontSize: '0.813rem', height: 28 }}
                      >
                        <MenuItem value="absolute">Absolute</MenuItem>
                        <MenuItem value="percent">Percent</MenuItem>
                      </Select>
                    </FormControl>
                  </Tooltip>
                  
                  <Typography variant="caption" color="text.secondary">Heartbeat (s):</Typography>
                  <Tooltip title="Force a write after this interval even if value hasn't changed, ensuring connection is alive (heartbeat)">
                    <TextField
                      size="small"
                      type="number"
                      value={forcePublishInterval}
                      onChange={(e) => setForcePublishInterval(Number(e.target.value))}
                      inputProps={{ min: 0, step: 1 }}
                      sx={{ width: 100, '& input': { fontSize: '0.813rem', py: 0.5 } }}
                    />
                  </Tooltip>
                </>
              )}
              
              <Button
                size="small"
                variant="outlined"
                onClick={applyChangeDetection}
                disabled={busy}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5 }}
              >
                Apply
              </Button>
              
              <Button
                size="small"
                variant="contained"
                color="error"
                onClick={deleteSelected}
                disabled={busy || hasActiveDeletion}
                title={hasActiveDeletion ? 'Cannot delete tags with active deletion' : ''}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5, ml: 'auto' }}
              >
                Delete
              </Button>
            </Box>
          </Box>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Tags"
        message={`Delete ${selected.size} tag${selected.size > 1 ? 's' : ''}? All historical data will be permanently deleted and this cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        loading={deletingTags}
        confirmText="Delete"
        confirmColor="error"
      />
    </Card>
  );
};

export default SavedTagsList;
