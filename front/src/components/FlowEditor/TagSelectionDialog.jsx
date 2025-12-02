import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Radio,
  RadioGroup,
  FormControlLabel,
} from '@mui/material';
import connectivityService from '../../services/connectivityService';

/**
 * TagSelectionDialog - Unified tag selector for Flow Studio nodes
 * 
 * Features:
 * - Source selection (Internal, Connectivity, System)
 * - Connection filtering (for Connectivity tags)
 * - Searchable, paginated table
 * - Single tag selection
 * 
 * Props:
 * - open: boolean - dialog open state
 * - onClose: function - close handler
 * - onSelect: function(tag) - tag selection handler
 * - mode: 'input' | 'output' - determines available sources
 *   - 'input': Can read from Internal, Connectivity, and System tags
 *   - 'output': Can write to Internal tags only
 * - title: string - dialog title
 * - selectedTag: object - currently selected tag
 */
const TagSelectionDialog = ({ 
  open, 
  onClose, 
  onSelect, 
  mode = 'input',
  title = 'Select Tag',
  selectedTag = null 
}) => {
  // Source selection
  const [source, setSource] = useState('internal'); // 'internal' | 'connectivity' | 'system'
  
  // For connectivity source
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  
  // Tags data
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Table controls
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  
  // Selected tag (temporary until user clicks Select)
  const [tempSelectedTag, setTempSelectedTag] = useState(null);

  // Load connections on mount
  useEffect(() => {
    if (open && mode === 'input') {
      loadConnections();
    }
  }, [open, mode]);

  // Load tags when source changes
  useEffect(() => {
    if (open) {
      if (source === 'internal') {
        loadInternalTags();
      } else if (source === 'system') {
        loadSystemTags();
      } else if (source === 'connectivity' && selectedConnection) {
        loadConnectionTags(selectedConnection);
      } else {
        setTags([]);
      }
    }
  }, [open, source, selectedConnection]);

  // Reset temp selection when dialog closes
  useEffect(() => {
    if (!open) {
      setTempSelectedTag(null);
    }
  }, [open]);

  const loadConnections = async () => {
    try {
      const data = await connectivityService.getConnections();
      setConnections((data?.items || []).filter(c => c.type !== 'system')); // Exclude System connection
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const loadInternalTags = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await connectivityService.getInternalTags();
      setTags(response.tags || []);
    } catch (err) {
      setError('Failed to load internal tags');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemTags = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await connectivityService.getConnections();
      const systemConn = (data?.items || []).find(c => c.type === 'system');
      if (systemConn) {
        const response = await connectivityService.getTags(systemConn.id);
        setTags(response.tags || []);
      } else {
        setError('System connection not found');
        setTags([]);
      }
    } catch (err) {
      setError('Failed to load system tags');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadConnectionTags = async (connectionId) => {
    setLoading(true);
    setError('');
    try {
      const response = await connectivityService.getTags(connectionId);
      setTags(response.tags || []);
    } catch (err) {
      setError('Failed to load connection tags');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!searchTerm.trim()) return tags;
    const query = searchTerm.toLowerCase();
    return tags.filter(tag =>
      (tag.tag_name || '').toLowerCase().includes(query) ||
      (tag.tag_path || '').toLowerCase().includes(query) ||
      String(tag.tag_id || '').includes(query) ||
      (tag.data_type || '').toLowerCase().includes(query)
    );
  }, [tags, searchTerm]);

  // Paginated tags
  const paginatedTags = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredTags.slice(start, start + rowsPerPage);
  }, [filteredTags, page, rowsPerPage]);

  // Reset page when search changes
  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSourceChange = (event) => {
    setSource(event.target.value);
    setSelectedConnection('');
    setTags([]);
    setTempSelectedTag(null);
  };

  const handleConnectionChange = (event) => {
    setSelectedConnection(event.target.value);
  };

  const handleRowClick = (tag) => {
    setTempSelectedTag(tag);
  };

  const handleSelect = () => {
    if (tempSelectedTag) {
      // Find connection name if this is a connectivity tag
      let connectionName = null;
      if (source === 'connectivity' && selectedConnection) {
        const connection = connections.find(c => c.id === selectedConnection);
        connectionName = connection?.name || null;
      } else if (source === 'internal') {
        connectionName = 'Internal';
      } else if (source === 'system') {
        connectionName = 'System';
      }
      
      onSelect({
        ...tempSelectedTag,
        source,
        connectionId: source === 'connectivity' ? selectedConnection : null,
        connectionName
      });
      onClose();
    }
  };

  const handleCancel = () => {
    setTempSelectedTag(null);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Source Selection */}
          <FormControl component="fieldset">
            <Typography variant="subtitle2" gutterBottom>Tag Source</Typography>
            <RadioGroup
              row
              value={source}
              onChange={handleSourceChange}
            >
              <FormControlLabel 
                value="internal" 
                control={<Radio />} 
                label="Internal Tags" 
              />
              {mode === 'input' && (
                <>
                  <FormControlLabel 
                    value="connectivity" 
                    control={<Radio />} 
                    label="Connectivity Tags" 
                  />
                  <FormControlLabel 
                    value="system" 
                    control={<Radio />} 
                    label="System Tags" 
                  />
                </>
              )}
            </RadioGroup>
          </FormControl>

          {/* Connection Selector (only for connectivity source) */}
          {source === 'connectivity' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Connection</InputLabel>
              <Select
                value={selectedConnection}
                onChange={handleConnectionChange}
                label="Connection"
              >
                <MenuItem value="">Select a connection...</MenuItem>
                {connections.map((conn) => (
                  <MenuItem key={conn.id} value={conn.id}>
                    {conn.name} ({conn.type})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Search Field */}
          {(source !== 'connectivity' || selectedConnection) && (
            <TextField
              size="small"
              placeholder="Search tags by name, path, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              fullWidth
            />
          )}

          {/* Error Alert */}
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Tags Table */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : source === 'connectivity' && !selectedConnection ? (
            <Alert severity="info">Select a connection to view tags</Alert>
          ) : filteredTags.length === 0 ? (
            <Alert severity="info">
              {searchTerm ? 'No tags match your search' : 'No tags available'}
            </Alert>
          ) : (
            <>
              <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell width="40px"></TableCell>
                      <TableCell>Tag Name</TableCell>
                      <TableCell>Tag Path</TableCell>
                      <TableCell>Data Type</TableCell>
                      <TableCell>Poll Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedTags.map((tag) => {
                      const isSelected = tempSelectedTag?.tag_id === tag.tag_id;
                      return (
                        <TableRow
                          key={tag.tag_id}
                          hover
                          onClick={() => handleRowClick(tag)}
                          selected={isSelected}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell padding="checkbox">
                            <Radio checked={isSelected} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap>
                              {tag.tag_name || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontFamily: 'monospace', 
                                fontSize: '0.813rem',
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {tag.tag_path || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {tag.data_type && (
                              <Chip 
                                label={tag.data_type} 
                                size="small" 
                                sx={{ fontSize: 10, height: 20 }} 
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize="0.813rem">
                              {tag.poll_rate_ms ? `${tag.poll_rate_ms}ms` : '—'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <TablePagination
                component="div"
                count={filteredTags.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[25, 50, 100, 250]}
              />

              {/* Info */}
              <Typography variant="caption" color="text.secondary">
                Showing {paginatedTags.length} of {filteredTags.length} tags
                {searchTerm && filteredTags.length !== tags.length && 
                  ` (filtered from ${tags.length} total)`}
              </Typography>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button 
          onClick={handleSelect} 
          variant="contained" 
          disabled={!tempSelectedTag}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagSelectionDialog;
