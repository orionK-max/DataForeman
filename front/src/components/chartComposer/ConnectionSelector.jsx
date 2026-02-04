import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  Button,
  Box,
  Chip,
  TablePagination,
  Autocomplete,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import chartComposerService from '../../services/chartComposerService';
import mqttService from '../../services/mqttService';

const MAX_TAGS = 50;

const ConnectionSelector = () => {
  const {
    selectedTagIds,
    updateSelectedTags,
    savedTags,
    setSavedTags,
    chartConfig,
    updateChartConfig,
  } = useChartComposer();

  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [loading, setLoading] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Load connections on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await chartComposerService.getConnections();
        if (!alive) return;
        setConnections(res.items || []);
      } catch (err) {
        if (alive) {
          console.error('Failed to load connections:', err);
          setError('Failed to load connections');
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load tags when connection changes
  useEffect(() => {
    if (!selectedConnection) {
      setSavedTags([]);
      setSubscriptions([]);
      setSelectedSubscription('');
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await chartComposerService.getTags(selectedConnection);
        if (!alive) return;
        const tags = res.tags || [];
        setSavedTags(tags);
        
        // If MQTT connection, load subscriptions
        if (tags.length > 0 && tags[0].driver_type === 'MQTT') {
          try {
            const subs = await mqttService.getSubscriptions(selectedConnection);
            if (!alive) return;
            const formatted = (subs || []).map(s => ({
              ...s,
              display_name: `${s.connection_name}: ${s.topic}`
            }));
            setSubscriptions(formatted);
          } catch (err) {
            console.error('Failed to load MQTT subscriptions:', err);
          }
        } else {
          setSubscriptions([]);
          setSelectedSubscription('');
        }
      } catch (err) {
        if (alive) {
          console.error('Failed to load tags:', err);
          setError('Failed to load tags');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedConnection, setSavedTags]);

  // Auto-select connection when savedTags is populated externally (e.g., from loading a chart)
  useEffect(() => {
    // If we have savedTags but no selectedConnection, try to detect and select the connection
    if (savedTags.length > 0 && !selectedConnection && connections.length > 0) {
      // Get the connection_id from the first tag
      const firstTagConnectionId = savedTags[0]?.connection_id;
      if (firstTagConnectionId) {
        // Check if this connection exists in our list
        const connectionExists = connections.some(c => c.id === firstTagConnectionId);
        if (connectionExists) {
          setSelectedConnection(firstTagConnectionId);
        }
      }
    }
  }, [savedTags, selectedConnection, connections]);

  // Filter tags by search
    // Reset page when search or connection changes
  useEffect(() => {
    setPage(0);
  }, [tagSearch, selectedConnection, selectedSubscription]);

  const filteredTags = useMemo(() => {
    let tags = savedTags;
    
    // Filter by subscription if MQTT and subscription selected
    if (selectedSubscription && tags.length > 0 && tags[0].driver_type === 'MQTT') {
      tags = tags.filter(tag => tag.subscription_id === selectedSubscription);
    }
    
    // Filter by search
    if (!tagSearch.trim()) return tags;
    const query = tagSearch.toLowerCase();
    return tags.filter(
      (tag) =>
        String(tag.tag_id).toLowerCase().includes(query) ||
        String(tag.tag_name || '').toLowerCase().includes(query) ||
        String(tag.tag_path || '').toLowerCase().includes(query) ||
        String(tag.data_type || '').toLowerCase().includes(query)
    );
  }, [savedTags, tagSearch, selectedSubscription]);

  // Paginated tags
  const paginatedTags = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredTags.slice(start, start + rowsPerPage);
  }, [filteredTags, page, rowsPerPage]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Check/uncheck tag
  const toggleTag = (tagId) => {
    if (selectedTagIds.includes(tagId)) {
      updateSelectedTags(selectedTagIds.filter(id => id !== tagId));
    } else {
      if (selectedTagIds.length >= MAX_TAGS) {
        alert(`Maximum ${MAX_TAGS} tags can be selected`);
        return;
      }
      updateSelectedTags([...selectedTagIds, tagId]);
    }
  };

  // Select all visible (current page only)
  const selectAll = () => {
    const visibleIds = paginatedTags.map(t => t.tag_id);
    const combined = [...new Set([...selectedTagIds, ...visibleIds])];
    if (combined.length > MAX_TAGS) {
      alert(`Cannot select all. Maximum ${MAX_TAGS} tags allowed.`);
      return;
    }
    updateSelectedTags(combined);
  };

  // Deselect all visible (current page only)
  const deselectAll = () => {
    const visibleIds = new Set(paginatedTags.map(t => t.tag_id));
    updateSelectedTags(selectedTagIds.filter(id => !visibleIds.has(id)));
  };

  // Add to chart
  const handleAddToChart = () => {
    if (selectedTagIds.length === 0) {
      alert('No tags selected');
      return;
    }

    // Get selected tags with metadata
    const selectedTags = savedTags.filter(t => selectedTagIds.includes(t.tag_id));
    
    // Get connection name
    const selectedConnectionData = connections.find(c => c.id === selectedConnection);
    const connectionName = selectedConnectionData?.name || selectedConnection;
    
    // Color palette
    const colors = [
      '#f44336', '#2196f3', '#4caf50', '#ff9800', '#9c27b0',
      '#00bcd4', '#ffeb3b', '#795548', '#607d8b', '#e91e63'
    ];

    // Create tag configs
    const newTagConfigs = selectedTags.map((tag, index) => {
      const existingIndex = chartConfig.tagConfigs.findIndex(t => t.tag_id === tag.tag_id);
      
      if (existingIndex >= 0) {
        // Already in chart, keep existing config
        return chartConfig.tagConfigs[existingIndex];
      } else {
        // New tag, create config
        const colorIndex = (chartConfig.tagConfigs.length + index) % colors.length;
        return {
          tag_id: tag.tag_id,
          name: tag.tag_name || tag.node_id || `Tag ${tag.tag_id}`,
          tag_name: tag.tag_name || tag.node_id || `Tag ${tag.tag_id}`, // For backend validation
          tag_path: tag.tag_path || tag.node_id || '', // For backend validation
          alias: null,
          color: colors[colorIndex],
          thickness: 2,
          strokeType: 'solid',
          axisId: chartConfig.axes[0]?.id || 'default',
          interpolation: 'linear',
          hidden: false,
          connection_id: tag.connection_id || selectedConnection,
          connection_name: connectionName,
          data_type: tag.data_type,
          poll_rate_ms: tag.poll_rate_ms,
          driver_type: tag.driver_type,
        };
      }
    });

    // Merge with existing, preserving order
    const existingIds = new Set(chartConfig.tagConfigs.map(t => t.tag_id));
    const merged = [
      ...chartConfig.tagConfigs,
      ...newTagConfigs.filter(t => !existingIds.has(t.tag_id))
    ];

    updateChartConfig({ tagConfigs: merged });
    
    // Clear selection after adding
    updateSelectedTags([]);
  };

  const isAllSelected = paginatedTags.length > 0 && paginatedTags.every(t => selectedTagIds.includes(t.tag_id));
  const isPartiallySelected = paginatedTags.some(t => selectedTagIds.includes(t.tag_id)) && !isAllSelected;

  return (
    <Card sx={{ height: 570, display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Connection & Selection</Typography>
          <Typography 
            variant="caption" 
            sx={{ color: selectedTagIds.length >= MAX_TAGS ? 'warning.main' : 'text.secondary' }}
          >
            Tags: {selectedTagIds.length}/{MAX_TAGS}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: 'column' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Connection</InputLabel>
            <Select
              value={selectedConnection}
              onChange={(e) => {
                setSelectedConnection(e.target.value);
                setSelectedSubscription('');
              }}
              label="Connection"
            >
              <MenuItem value="">Select connection...</MenuItem>
              {connections.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {subscriptions.length > 0 && (
            <Autocomplete
              size="small"
              value={subscriptions.find(s => s.id === selectedSubscription) || null}
              onChange={(e, newValue) => setSelectedSubscription(newValue?.id || '')}
              options={subscriptions}
              getOptionLabel={(option) => option.display_name}
              renderInput={(params) => (
                <TextField {...params} label="MQTT Subscription" placeholder="All subscriptions" />
              )}
              sx={{ minWidth: 200 }}
            />
          )}

          <TextField
            size="small"
            placeholder="Search tags..."
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            sx={{ minWidth: 150 }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" onClick={selectAll} disabled={!paginatedTags.length}>
              Select Page
            </Button>
            <Button size="small" onClick={deselectAll} disabled={!selectedTagIds.length}>
              Deselect Page
            </Button>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={handleAddToChart}
            disabled={selectedTagIds.length === 0}
          >
            Add to Chart ({selectedTagIds.length})
          </Button>
        </Box>

        {error && (
          <Typography variant="caption" color="error" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        <Box sx={{ 
          flex: 1, 
          minHeight: 0, 
          overflow: 'auto', 
          border: 1, 
          borderColor: 'divider', 
          borderRadius: 1 
        }}>
          {loading ? (
            <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
              Loading tags...
            </Box>
          ) : !selectedConnection ? (
            <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
              Select a connection to view tags
            </Box>
          ) : filteredTags.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
              No tags found
            </Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={isPartiallySelected}
                      checked={isAllSelected}
                      onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                    />
                  </TableCell>
                  <TableCell>Tag ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Poll (ms)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedTags.map((tag) => (
                  <TableRow key={tag.tag_id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedTagIds.includes(tag.tag_id)}
                        onChange={() => toggleTag(tag.tag_id)}
                      />
                    </TableCell>
                    <TableCell>{tag.tag_id}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tag.tag_name || tag.node_id || `Tag ${tag.tag_id}`}
                    </TableCell>
                    <TableCell>
                      {tag.data_type && (
                        <Chip label={tag.data_type} size="small" sx={{ fontSize: 10 }} />
                      )}
                    </TableCell>
                    <TableCell>{tag.poll_rate_ms || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>

        {/* Pagination */}
        {filteredTags.length > 0 && (
          <TablePagination
            component="div"
            count={filteredTags.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
            sx={{ borderTop: 1, borderColor: 'divider', mt: 'auto' }}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default ConnectionSelector;
