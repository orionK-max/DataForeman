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
  Alert,
  CircularProgress,
  Chip,
  Drawer,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  FileCopy,
  Dashboard as DashboardIcon,
  FolderOpen as FolderOpenIcon,
  DriveFileMove as MoveIcon,
  Home as HomeIcon,
  People as PeopleIcon,
  FileUpload,
} from '@mui/icons-material';
import dashboardService from '../services/dashboardService';
import folderService, { FOLDER_TYPES } from '../services/folderService';
import { usePageTitle } from '../contexts/PageTitleContext';
import { usePermissions } from '../contexts/PermissionsContext';
import FolderTree from '../components/folders/FolderTree';
import FolderDialog from '../components/folders/FolderDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ImportDashboardButton from '../components/dashboard/ImportDashboardButton';

const DashboardList = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [dashboards, setDashboards] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'shared'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [newDashboardDesc, setNewDashboardDesc] = useState('');
  const [newDashboardShared, setNewDashboardShared] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState('create');
  const [editingFolder, setEditingFolder] = useState(null);
  const [parentFolderId, setParentFolderId] = useState(null);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState(null);
  const [movingDashboard, setMovingDashboard] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  useEffect(() => {
    setPageTitle('Dashboards');
    setPageSubtitle('');
  }, [setPageTitle, setPageSubtitle]);

  useEffect(() => {
    loadDashboards();
    loadFolders();
  }, []);

  useEffect(() => {
    loadDashboards();
  }, [viewMode]);

  const loadDashboards = async () => {
    try {
      setLoading(true);
      const scope = viewMode === 'shared' ? 'shared' : 'all';
      const data = await dashboardService.listDashboards(scope);
      setDashboards(data.items || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const tree = await folderService.getFolderTree(FOLDER_TYPES.DASHBOARD);
      setFolders(tree);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  const handleCreate = async () => {
    try {
      const dashboard = await dashboardService.createDashboard({
        name: newDashboardName,
        description: newDashboardDesc,
        is_shared: newDashboardShared,
        layout: dashboardService.createDefaultLayout(),
      });
      setCreateDialogOpen(false);
      setNewDashboardName('');
      setNewDashboardDesc('');
      setNewDashboardShared(false);
      navigate(`/dashboards/${dashboard.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDuplicate = async (dashboard) => {
    try {
      const duplicated = await dashboardService.duplicateDashboard(dashboard.id);
      navigate(`/dashboards/${duplicated.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this dashboard?')) {
      return;
    }
    try {
      await dashboardService.deleteDashboard(id);
      loadDashboards();
    } catch (err) {
      setError(err.message);
    }
  };

  // Folder management handlers
  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setViewMode('all'); // Switch back to 'all' when selecting a folder
  };

  const handleSelectShared = () => {
    setSelectedFolderId(null);
    setViewMode('shared');
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
      await folderService.deleteFolder(FOLDER_TYPES.DASHBOARD, folderToDelete.id);
      await loadFolders();
      // If currently viewing this folder, switch to all items
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(null);
      }
      setDeleteConfirmOpen(false);
      setFolderToDelete(null);
    } catch (err) {
      setError(err.message);
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
        await folderService.updateFolder(FOLDER_TYPES.DASHBOARD, editingFolder.id, folderData);
      } else {
        await folderService.createFolder(FOLDER_TYPES.DASHBOARD, folderData);
      }
      await loadFolders();
      setFolderDialogOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  // Move dashboard to folder
  const handleOpenMoveMenu = (event, dashboard) => {
    setMoveMenuAnchor(event.currentTarget);
    setMovingDashboard(dashboard);
  };

  const handleCloseMoveMenu = () => {
    setMoveMenuAnchor(null);
    setMovingDashboard(null);
  };

  const handleMoveDashboard = async (folderId) => {
    try {
      await folderService.moveItemToFolder(
        FOLDER_TYPES.DASHBOARD,
        movingDashboard.id,
        folderId,
        0
      );
      await loadDashboards();
      handleCloseMoveMenu();
    } catch (err) {
      setError(err.message);
    }
  };

  // Filter dashboards by selected folder
  const filteredDashboards = viewMode === 'shared' 
    ? dashboards // In shared mode, show all shared dashboards
    : (selectedFolderId === null
        ? dashboards.filter(d => !d.folder_id) // Show only root-level dashboards
        : dashboards.filter(d => d.folder_id === selectedFolderId));

  // Flatten folders for move menu
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

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
          showSharedOption={true}
          onSelectShared={handleSelectShared}
          isSharedView={viewMode === 'shared'}
        />
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
            {selectedFolderId && viewMode !== 'shared' && (
              <>
                <FolderOpenIcon color="primary" />
                <Typography variant="h6" color="primary">
                  {/* Show folder name */}
                </Typography>
              </>
            )}
          </Box>
          {can('dashboards', 'create') && viewMode !== 'shared' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <ImportDashboardButton
                onImportSuccess={loadDashboards}
              />
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setCreateDialogOpen(true)}
              >
                Create Dashboard
              </Button>
            </Box>
          )}
        </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {filteredDashboards.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          {viewMode === 'shared' ? (
            <PeopleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          ) : (
            <DashboardIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          )}
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {viewMode === 'shared' 
              ? 'No dashboards shared with you yet'
              : (selectedFolderId ? 'No dashboards in this folder' : 'No dashboards at home level. All dashboards are in folders.')
            }
          </Typography>
          {can('dashboards', 'create') && viewMode !== 'shared' && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{ mt: 2 }}
            >
              Create Your First Dashboard
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredDashboards.map(dashboard => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={dashboard.id}>
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
                  onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                  sx={{ flexGrow: 1, pb: 1 }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                    <Typography variant="h6" component="div" sx={{ 
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexGrow: 1,
                      mr: 1
                    }}>
                      {dashboard.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                      {dashboard.is_shared && (
                        <Chip label="Shared" size="small" color="primary" />
                      )}
                      {viewMode === 'shared' && !dashboard.is_owner && (
                        <Chip label="Read Only" size="small" variant="outlined" />
                      )}
                    </Box>
                  </Box>
                  {dashboard.description && (
                    <Typography 
                      variant="body2" 
                      color="text.secondary" 
                      sx={{ 
                        mb: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        minHeight: '2.5em',
                      }}
                      title={dashboard.description}
                    >
                      {dashboard.description}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {dashboard.layout?.items?.length || 0} widgets
                  </Typography>
                </CardContent>
                <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
                  {can('dashboards', 'update') && dashboard.is_owner && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenMoveMenu(e, dashboard);
                      }}
                      title="Move to folder"
                    >
                      <MoveIcon fontSize="small" />
                    </IconButton>
                  )}
                  {can('dashboards', 'create') && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(dashboard);
                      }}
                      title="Duplicate"
                    >
                      <FileCopy fontSize="small" />
                    </IconButton>
                  )}
                  {dashboard.is_owner && can('dashboards', 'delete') && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(dashboard.id);
                      }}
                      title="Delete"
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      </Box>

      {/* Move to Folder Menu */}
      <Menu
        anchorEl={moveMenuAnchor}
        open={Boolean(moveMenuAnchor)}
        onClose={handleCloseMoveMenu}
      >
        <MenuItem onClick={() => handleMoveDashboard(null)}>
          <ListItemIcon>
            <HomeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Root (No Folder)</ListItemText>
        </MenuItem>
        {flatFolders.map((folder) => (
          <MenuItem key={folder.id} onClick={() => handleMoveDashboard(folder.id)}>
            <ListItemIcon sx={{ pl: folder.level * 2 }}>
              <FolderOpenIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{folder.name}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* Create Dashboard Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create New Dashboard</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Dashboard Name"
            fullWidth
            value={newDashboardName}
            onChange={(e) => setNewDashboardName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            value={newDashboardDesc}
            onChange={(e) => setNewDashboardDesc(e.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={newDashboardShared}
                onChange={(e) => setNewDashboardShared(e.target.checked)}
              />
            }
            label="Share with other users"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!newDashboardName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Folder Dialog */}
      <FolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        onSave={handleSaveFolder}
        folder={editingFolder}
        parentFolderId={parentFolderId}
        allFolders={folders}
        mode={folderDialogMode}
      />

      {/* Delete Folder Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Folder"
        message={`Are you sure you want to delete the folder "${folderToDelete?.name}"? This action cannot be undone.`}
        onConfirm={confirmDeleteFolder}
        onCancel={cancelDeleteFolder}
        loading={deletingFolder}
        confirmText="Delete"
        confirmColor="error"
      />
    </Box>
  );
};

export default DashboardList;
