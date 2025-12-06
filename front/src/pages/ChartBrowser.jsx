import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  Snackbar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  Timeline as ChartIcon,
  DriveFileMove as MoveIcon,
  Home as HomeIcon,
  FolderOpen as FolderOpenIcon,
  People as PeopleIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import chartComposerService from '../services/chartComposerService';
import folderService, { FOLDER_TYPES } from '../services/folderService';
import FolderTree from '../components/folders/FolderTree';
import FolderDialog from '../components/folders/FolderDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { usePageTitle } from '../contexts/PageTitleContext';
import AddChartButton from '../components/chartComposer/AddChartButton';

const ChartBrowser = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const navigate = useNavigate();
  const [charts, setCharts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'mine' | 'shared'
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState('create');
  const [editingFolder, setEditingFolder] = useState(null);
  const [parentFolderId, setParentFolderId] = useState(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingChart, setMovingChart] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  useEffect(() => {
    setPageTitle('Charts');
    setPageSubtitle('');
  }, [setPageTitle, setPageSubtitle]);

  useEffect(() => {
    loadCharts();
    loadFolders();
  }, []);

  useEffect(() => {
    loadCharts();
  }, [viewMode]);

  const loadCharts = async () => {
    try {
      const response = await chartComposerService.listCharts('all', 200, 0);
      setCharts(response.items || []);
    } catch (error) {
      showSnackbar('Failed to load charts: ' + error.message, 'error');
    }
  };

  const loadFolders = async () => {
    try {
      const tree = await folderService.getFolderTree(FOLDER_TYPES.CHART);
      setFolders(tree);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleDeleteChart = (chart) => {
    setChartToDelete(chart);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteChart = async () => {
    try {
      await chartComposerService.deleteChart(chartToDelete.id);
      await loadCharts();
      showSnackbar('Chart deleted successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to delete chart: ' + error.message, 'error');
    } finally {
      setDeleteDialogOpen(false);
      setChartToDelete(null);
    }
  };

  const handleDuplicateChart = async (chart) => {
    try {
      const duplicated = await chartComposerService.duplicateChart(chart.id);
      await loadCharts();
      showSnackbar('Chart duplicated successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to duplicate chart: ' + error.message, 'error');
    }
  };

  // Folder management handlers
  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setViewMode('all');
  };

  const handleSelectShared = () => {
    setSelectedFolderId(null);
    setViewMode('shared');
  };

  const handleSelectMine = () => {
    setSelectedFolderId(null);
    setViewMode('mine');
  };

  const handleCreateFolder = (parentId = null) => {
    setParentFolderId(parentId);
    setEditingFolder(null);
    setFolderDialogMode('create');
    setFolderDialogOpen(true);
  };

  const handleEditFolder = (folder) => {
    setEditingFolder(folder);
    setFolderDialogMode('edit');
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = async (folder) => {
    setFolderToDelete(folder);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    
    try {
      setDeletingFolder(true);
      await folderService.deleteFolder(FOLDER_TYPES.CHART, folderToDelete.id);
      await loadFolders();
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(null);
      }
      setDeleteConfirmOpen(false);
      setFolderToDelete(null);
    } catch (err) {
      showSnackbar('Failed to delete folder: ' + err.message, 'error');
    } finally {
      setDeletingFolder(false);
    }
  };

  const cancelDeleteFolder = () => {
    setDeleteConfirmOpen(false);
    setFolderToDelete(null);
  };

  const handleSaveFolder = async (folderData) => {
    try {
      if (folderDialogMode === 'edit' && editingFolder) {
        await folderService.updateFolder(FOLDER_TYPES.CHART, editingFolder.id, folderData);
      } else {
        await folderService.createFolder(FOLDER_TYPES.CHART, folderData);
      }
      await loadFolders();
      setFolderDialogOpen(false);
    } catch (err) {
      showSnackbar('Failed to save folder: ' + err.message, 'error');
    }
  };

  // Move chart to folder
  const handleOpenMoveDialog = (event, chart) => {
    event.stopPropagation();
    setMovingChart(chart);
    setMoveDialogOpen(true);
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
      showSnackbar('Failed to move chart: ' + err.message, 'error');
    }
  };

  // Filter charts by selected folder and view mode
  const filteredCharts = (() => {
    let filtered = charts;

    // Apply view mode filter
    if (viewMode === 'mine') {
      filtered = filtered.filter(c => c.is_owner);
    } else if (viewMode === 'shared') {
      filtered = filtered.filter(c => !c.is_owner);
    }

    // Apply folder filter
    if (viewMode !== 'shared' && viewMode !== 'mine') {
      if (selectedFolderId === null) {
        filtered = filtered.filter(c => !c.options?.folder_id);
      } else {
        filtered = filtered.filter(c => c.options?.folder_id === selectedFolderId);
      }
    }

    return filtered;
  })();

  // Flatten folders for move dialog
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
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  const ChartCard = ({ chart, isOwner }) => (
    <Card 
      sx={{ 
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': { 
          boxShadow: 4,
          transform: 'translateY(-2px)',
          transition: 'all 0.2s'
        }
      }}
    >
      <CardContent 
        onClick={() => navigate(`/charts/${chart.id}`)}
        sx={{ flexGrow: 1, pb: 1 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <ChartIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography 
            variant="h6" 
            sx={{ 
              flexGrow: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mr: 1
            }}
          >
            {chart.name}
          </Typography>
          {chart.is_shared && (
            <Chip label="Shared" size="small" color="info" />
          )}
        </Box>
        
        <Typography 
          variant="body2" 
          color="text.secondary" 
          gutterBottom
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: '2.5em',
          }}
          title={chart.description || 'No description'}
        >
          {chart.description || 'No description'}
        </Typography>
        
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Updated: {formatDate(chart.updated_at)}
        </Typography>
      </CardContent>
      
      <CardActions sx={{ pt: 0, justifyContent: 'flex-end', px: 2, pb: 2 }}>
        {isOwner && viewMode !== 'shared' && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              handleOpenMoveDialog(e, chart);
            }}
            title="Move to folder"
          >
            <MoveIcon fontSize="small" />
          </IconButton>
        )}
        {isOwner && (
          <>
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicateChart(chart);
              }}
              title="Duplicate"
            >
              <DuplicateIcon fontSize="small" />
            </IconButton>
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChart(chart);
              }}
              title="Delete"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </CardActions>
    </Card>
  );

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* Folder Sidebar */}
      <Box
        sx={{
          width: 280,
          borderRight: 1,
          borderColor: 'divider',
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        <FolderTree
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onEditFolder={handleEditFolder}
          onDeleteFolder={handleDeleteFolder}
          showSharedOption={false}
          isSharedView={false}
        />
        
        {/* Additional filters below folder tree */}
        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
          <MenuItem 
            onClick={handleSelectMine}
            selected={viewMode === 'mine'}
            sx={{ borderRadius: 1 }}
          >
            <ListItemIcon>
              <PersonIcon fontSize="small" color={viewMode === 'mine' ? 'primary' : 'action'} />
            </ListItemIcon>
            <ListItemText 
              primary="My Charts"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: viewMode === 'mine' ? 600 : 400,
              }}
            />
          </MenuItem>
          <MenuItem 
            onClick={handleSelectShared}
            selected={viewMode === 'shared'}
            sx={{ borderRadius: 1 }}
          >
            <ListItemIcon>
              <PeopleIcon fontSize="small" color={viewMode === 'shared' ? 'primary' : 'action'} />
            </ListItemIcon>
            <ListItemText 
              primary="Shared with Me"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: viewMode === 'shared' ? 600 : 400,
              }}
            />
          </MenuItem>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, p: 3, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {viewMode === 'shared' && (
              <>
                <PeopleIcon color="primary" />
                <Typography variant="h6" color="primary">
                  Shared with Me
                </Typography>
              </>
            )}
            {viewMode === 'mine' && (
              <>
                <PersonIcon color="primary" />
                <Typography variant="h6" color="primary">
                  My Charts
                </Typography>
              </>
            )}
            {selectedFolderId && viewMode === 'all' && (
              <>
                <FolderOpenIcon color="primary" />
                <Typography variant="h6" color="primary">
                  {/* Folder name would go here */}
                </Typography>
              </>
            )}
            {!selectedFolderId && viewMode === 'all' && (
              <Typography variant="h4">
                Charts
              </Typography>
            )}
          </Box>
          {viewMode !== 'shared' && (
            <AddChartButton 
              onNewChart={() => navigate('/charts/new')}
              onImportSuccess={() => {
                loadCharts();
                showSnackbar('Chart imported successfully', 'success');
              }}
            />
          )}
        </Box>

        <Grid container spacing={2}>
          {filteredCharts.map((chart) => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={chart.id}>
              <ChartCard chart={chart} isOwner={chart.is_owner} />
            </Grid>
          ))}
          
          {filteredCharts.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" align="center">
                {viewMode === 'shared' 
                  ? 'No shared charts' 
                  : viewMode === 'mine'
                  ? 'You have no charts yet'
                  : (selectedFolderId === null 
                      ? 'No charts at home level. All charts are in folders.' 
                      : 'No charts in this folder')}
              </Typography>
            </Grid>
          )}
        </Grid>

        {/* Move Chart Dialog */}
        <Dialog
          open={moveDialogOpen && movingChart}
          onClose={handleCloseMoveDialog}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              minHeight: 200,
              bgcolor: 'background.paper'
            }
          }}
        >
          <DialogTitle>Move "{movingChart?.name}" to Folder</DialogTitle>
          <DialogContent>
            <MenuItem onClick={() => handleMoveChart(null)} sx={{ borderRadius: 1, mb: 0.5 }}>
              <ListItemIcon>
                <HomeIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Home (No Folder)</ListItemText>
            </MenuItem>
            {flatFolders.map((folder) => (
              <MenuItem 
                key={folder.id} 
                onClick={() => handleMoveChart(folder.id)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ pl: folder.level * 2 }}>
                  <FolderOpenIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{folder.name}</ListItemText>
              </MenuItem>
            ))}
            {flatFolders.length === 0 && (
              <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                No folders yet. Create a folder first.
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseMoveDialog}>Cancel</Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Delete Chart</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete <strong>{chartToDelete?.name}</strong>?
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={confirmDeleteChart} 
              variant="contained" 
              color="error"
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Folder Dialog */}
        <FolderDialog
          open={folderDialogOpen}
          onClose={() => setFolderDialogOpen(false)}
          onSave={handleSaveFolder}
          allFolders={folders}
          folder={editingFolder}
          parentFolderId={parentFolderId}
          mode={folderDialogMode}
        />

        {/* Folder Delete Confirmation */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          title="Delete Folder"
          message={`Are you sure you want to delete the folder "${folderToDelete?.name}"? The folder must be empty.`}
          confirmText="Delete"
          confirmColor="error"
          onConfirm={confirmDeleteFolder}
          onCancel={cancelDeleteFolder}
          loading={deletingFolder}
        />

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
};

export default ChartBrowser;
