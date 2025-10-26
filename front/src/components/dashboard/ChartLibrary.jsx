import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  Typography,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Search,
  Close,
  Add,
  Timeline,
} from '@mui/icons-material';
import chartComposerService from '../../services/chartComposerService';
import { useDashboard } from '../../contexts/DashboardContext';

const ChartLibrary = ({ open, onClose }) => {
  const { addWidget } = useDashboard();
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all'); // all, mine, shared

  useEffect(() => {
    if (open) {
      loadCharts();
    }
  }, [open, scopeFilter]);

  const loadCharts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await chartComposerService.listCharts(scopeFilter, 100, 0);
      setCharts(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load charts');
      console.error('Failed to load charts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChart = (chartId) => {
    addWidget(chartId);
    // Don't close the library so user can add multiple charts
  };

  const filteredCharts = charts.filter(chart => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      chart.name?.toLowerCase().includes(query) ||
      chart.description?.toLowerCase().includes(query)
    );
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: 400 },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Chart Library</Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>

        <Divider />

        {/* Filters */}
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search charts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          <FormControl fullWidth size="small">
            <InputLabel>Scope</InputLabel>
            <Select
              value={scopeFilter}
              label="Scope"
              onChange={(e) => setScopeFilter(e.target.value)}
            >
              <MenuItem value="all">All Charts</MenuItem>
              <MenuItem value="mine">My Charts</MenuItem>
              <MenuItem value="shared">Shared Charts</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Divider />

        {/* Chart List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
          ) : filteredCharts.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Timeline sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography color="text.secondary">
                {searchQuery ? 'No charts match your search' : 'No charts available'}
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {filteredCharts.map((chart) => (
                <ListItem
                  key={chart.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => handleAddChart(chart.id)}
                      color="primary"
                      title="Add to dashboard"
                    >
                      <Add />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => handleAddChart(chart.id)}>
                    <ListItemText
                      primary={chart.name || 'Untitled Chart'}
                      secondary={
                        <>
                          {chart.description && (
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                              {chart.description}
                            </span>
                          )}
                          <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {chart.tags_count > 0 && (
                              <Chip
                                label={`${chart.tags_count} tag${chart.tags_count > 1 ? 's' : ''}`}
                                size="small"
                                variant="outlined"
                              />
                            )}
                            {chart.is_shared && (
                              <Chip
                                label="Shared"
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            )}
                          </span>
                        </>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Footer */}
        <Divider />
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {filteredCharts.length} chart{filteredCharts.length !== 1 ? 's' : ''} available
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default ChartLibrary;
