import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Box,
  CircularProgress,
  Alert,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  Button,
  Select,
  FormControl,
  InputLabel,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  MoreVert,
  Delete,
  FileCopy,
  Visibility,
  Person,
  People,
  ListAlt,
  Add,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Home as HomeIcon,
  DriveFileMove as MoveIcon,
  CreateNewFolder as CreateNewFolderIcon,
} from '@mui/icons-material';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import chartComposerService from '../../services/chartComposerService';
import folderService, { FOLDER_TYPES } from '../../services/folderService';
import FolderDialog from '../folders/FolderDialog';

const ChartsLibrary = () => {
  const { loadChart, newChart } = useChartComposer();
  
  const [charts, setCharts] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [selectedFolderId, setSelectedFolderId] = React.useState('all'); // 'all', 'mine', 'shared', 'root', or folder ID
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [selectedChart, setSelectedChart] = React.useState(null);
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
  const [movingChart, setMovingChart] = React.useState(null);

  // Load charts from API - always load 'all', filtering happens client-side
  const loadCharts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = 0;
      const limit = 50;
      const response = await chartComposerService.listCharts('all', limit, offset); // Always load all charts
      setCharts(response.items || []);
    } catch (err) {
      console.error('Failed to load charts:', err);
      setError(err.message || 'Failed to load charts');
      setCharts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load charts on mount
  useEffect(() => {
    loadCharts();
    loadFolders();
  }, [loadCharts]);

  const loadFolders = async () => {
    try {
      const tree = await folderService.getFolderTree(FOLDER_TYPES.CHART);
      setFolders(tree);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  const handleMenuOpen = (event, chart) => {
    setAnchorEl(event.currentTarget);
    setSelectedChart(chart);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedChart(null);
  };

  const handleLoadChart = async (chart) => {
    try {
      await loadChart(chart.id);
      handleMenuClose();
    } catch (err) {
      console.error('Failed to load chart:', err);
      alert(`Failed to load chart: ${err.message}`);
    }
  };

  const handleDeleteChart = async (chart) => {
    handleMenuClose();
    if (!chart.is_owner) {
      alert('You can only delete charts you own');
      return;
    }
    if (!confirm(`Delete chart "${chart.name}"?`)) {
      return;
    }
    try {
      await chartComposerService.deleteChart(chart.id);
      setCharts(prev => prev.filter(c => c.id !== chart.id));
    } catch (err) {
      console.error('Failed to delete chart:', err);
      alert(`Failed to delete chart: ${err.message}`);
    }
  };

  const handleDuplicateChart = async (chart) => {
    handleMenuClose();
    try {
      const duplicated = await chartComposerService.duplicateChart(chart.id);
      setCharts(prev => [duplicated, ...prev]);
    } catch (err) {
      console.error('Failed to duplicate chart:', err);
      alert(`Failed to duplicate chart: ${err.message}`);
    }
  };

  // Folder management
  const handleCreateFolder = () => {
    setFolderDialogOpen(true);
  };

  const handleSaveFolder = async (folderData) => {
    try {
      await folderService.createFolder(FOLDER_TYPES.CHART, folderData);
      await loadFolders();
      setFolderDialogOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFolderChange = (event) => {
    setSelectedFolderId(event.target.value);
  };

  // Move chart to folder
  const handleOpenMoveDialog = (chart) => {
    setMovingChart(chart);
    setMoveDialogOpen(true);
    handleMenuClose();
  };

  const handleCloseMoveDialog = () => {
    setMoveDialogOpen(false);
    setMovingChart(null);
  };

  const handleMoveChart = async (folderId) => {
    try {
      await folderService.moveItemToFolder(
        FOLDER_TYPES.CHART,
        movingChart.id,
        folderId,
        0
      );
      await loadCharts();
      handleCloseMoveDialog();
    } catch (err) {
      setError(err.message);
    }
  };

  // Flatten folders for dropdown
  const flattenFolders = (folders, level = 0) => {
    let result = [];
    for (const folder of folders) {
      result.push({ ...folder, level });
      if (folder.children && folder.children.length > 0) {
        result = result.concat(flattenFolders(folder.children, level + 1));
      }
    }
    return result;
  };

  const flatFolders = flattenFolders(folders);

  const formatDate = (isoString) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  // Filter charts based on selection
  const filteredCharts = React.useMemo(() => {
    if (selectedFolderId === 'all') {
      // 'all' now means Home - charts without folders
      return charts.filter(c => !c.options?.folder_id);
    } else if (selectedFolderId === 'mine') {
      return charts.filter(c => c.is_owner);
    } else if (selectedFolderId === 'shared') {
      return charts.filter(c => !c.is_owner);
    } else if (selectedFolderId === 'root') {
      // Backward compatibility (same as 'all' now)
      return charts.filter(c => !c.options?.folder_id);
    } else {
      return charts.filter(c => c.options?.folder_id === selectedFolderId);
    }
  }, [charts, selectedFolderId]);



  return (
    <Card sx={{ height: 570, display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Saved Charts
          </Typography>
        </Box>

        {/* New Chart Button */}
        <Button
          variant="contained"
          color="primary"
          startIcon={<Add />}
          onClick={newChart}
          fullWidth
          sx={{ mb: 2 }}
        >
          New Chart
        </Button>

        {/* Folder Filter */}
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Filter</InputLabel>
            <Select
              value={selectedFolderId}
              onChange={handleFolderChange}
              label="Filter"
            >
              <MenuItem value="all">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HomeIcon fontSize="small" />
                  <span>Home</span>
                </Box>
              </MenuItem>
              <MenuItem value="mine">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person fontSize="small" />
                  <span>My Charts</span>
                </Box>
              </MenuItem>
              <MenuItem value="shared">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <People fontSize="small" />
                  <span>Shared</span>
                </Box>
              </MenuItem>
              <Divider sx={{ my: 1 }} />
              {flatFolders.map((folder) => (
                <MenuItem key={folder.id} value={folder.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: folder.level * 2 }}>
                    <FolderIcon fontSize="small" />
                    <span>{folder.name}</span>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Create new folder">
            <IconButton 
              size="small" 
              onClick={handleCreateFolder}
              sx={{ border: 1, borderColor: 'divider' }}
            >
              <CreateNewFolderIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Empty State */}
        {!isLoading && filteredCharts.length === 0 && (
          <Alert severity="info">
            {selectedFolderId === 'mine' && 'You have no saved charts yet'}
            {selectedFolderId === 'shared' && 'No charts have been shared with you'}
            {selectedFolderId === 'all' && 'No charts at home level. All charts are in folders.'}
            {selectedFolderId === 'root' && 'No charts at home level. All charts are in folders.'}
            {selectedFolderId !== 'mine' && selectedFolderId !== 'shared' && selectedFolderId !== 'all' && selectedFolderId !== 'root' && 'No charts in this folder'}
          </Alert>
        )}

        {/* Charts List */}
        {!isLoading && filteredCharts.length > 0 && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <List dense>
              {filteredCharts.map((chart, index) => (
                <React.Fragment key={chart.id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    sx={{
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        cursor: 'pointer',
                      },
                    }}
                    onClick={() => handleLoadChart(chart)}
                  >
                    <ListItemText
                      primaryTypographyProps={{ component: 'div' }}
                      secondaryTypographyProps={{ component: 'div' }}
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {chart.name}
                          </Typography>
                          {chart.is_system_chart ? (
                            <Chip
                              label="System"
                              size="small"
                              sx={{ 
                                height: 20,
                                backgroundColor: '#4caf50',
                                color: '#fff',
                                borderColor: '#4caf50',
                                '& .MuiChip-label': { fontWeight: 500 }
                              }}
                            />
                          ) : chart.is_shared && (
                            <Chip
                              label="Shared"
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ height: 20 }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {chart.tag_count} {chart.tag_count === 1 ? 'tag' : 'tags'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            •
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(chart.updated_at)}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuOpen(e, chart);
                        }}
                      >
                        <MoreVert />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          </Box>
        )}

        {/* Context Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => handleLoadChart(selectedChart)}>
            <Visibility fontSize="small" sx={{ mr: 1 }} />
            Load Chart
          </MenuItem>
          <MenuItem onClick={() => handleDuplicateChart(selectedChart)}>
            <FileCopy fontSize="small" sx={{ mr: 1 }} />
            Duplicate
          </MenuItem>
          {selectedChart?.is_owner && (
            <>
              <MenuItem onClick={() => handleOpenMoveDialog(selectedChart)}>
                <MoveIcon fontSize="small" sx={{ mr: 1 }} />
                Move to Folder
              </MenuItem>
              <MenuItem onClick={() => handleDeleteChart(selectedChart)}>
                <Delete fontSize="small" sx={{ mr: 1 }} />
                Delete
              </MenuItem>
            </>
          )}
        </Menu>

        {/* Move to Folder Dialog */}
        <Dialog
          open={moveDialogOpen}
          onClose={handleCloseMoveDialog}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Move Chart to Folder</DialogTitle>
          <DialogContent>
            <List>
              <ListItem 
                onClick={() => handleMoveChart(null)}
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' } 
                }}
              >
                <ListItemIcon>
                  <HomeIcon />
                </ListItemIcon>
                <ListItemText primary="No Folder" />
              </ListItem>
              <Divider />
              {flatFolders.map((folder) => (
                <ListItem 
                  key={folder.id} 
                  onClick={() => handleMoveChart(folder.id)}
                  sx={{ 
                    cursor: 'pointer',
                    pl: 2 + folder.level * 2,
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <ListItemIcon>
                    <FolderIcon />
                  </ListItemIcon>
                  <ListItemText primary={folder.name} />
                </ListItem>
              ))}
            </List>
          </DialogContent>
        </Dialog>

        {/* Folder Dialog */}
        <FolderDialog
          open={folderDialogOpen}
          onClose={() => setFolderDialogOpen(false)}
          onSave={handleSaveFolder}
          allFolders={folders}
          mode="create"
        />
      </CardContent>
    </Card>
  );
};

export default ChartsLibrary;
