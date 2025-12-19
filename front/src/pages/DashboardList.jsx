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
  Snackbar,
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
  Person as PersonIcon,
  FileUpload,
  ViewModule as CardViewIcon,
  TableRows as TableViewIcon,
  CheckBox as BulkModeIcon,
  AccountTree as HierarchyIcon,
  ViewList as FlattenIcon,
} from '@mui/icons-material';
import dashboardService from '../services/dashboardService';
import { useBrowserFolders } from '../hooks/useBrowserFolders';
import { FOLDER_TYPES } from '../services/folderService';
import { usePageTitle } from '../contexts/PageTitleContext';
import { usePermissions } from '../contexts/PermissionsContext';
import FolderTree from '../components/folders/FolderTree';
import FolderDialog from '../components/folders/FolderDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ImportDashboardButton from '../components/dashboard/ImportDashboardButton';
import BrowserCard from '../components/browser/BrowserCard';
import BrowserTable from '../components/browser/BrowserTable';
import BulkActionToolbar from '../components/browser/BulkActionToolbar';

const DashboardList = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [newDashboardDesc, setNewDashboardDesc] = useState('');
  const [newDashboardShared, setNewDashboardShared] = useState(false);
  const [deleteDashboardOpen, setDeleteDashboardOpen] = useState(false);
  const [dashboardToDelete, setDashboardToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Use universal folder management hook (pass null for onReload, we'll call it manually)
  const folderState = useBrowserFolders(FOLDER_TYPES.DASHBOARD, dashboards, null);
  const {
    folders,
    selectedFolderId,
    viewMode,
    displayMode,
    flattenHierarchy,
    filteredItems: filteredDashboards,
    flatFolders,
    sortColumn,
    sortDirection,
    selectedItems,
    bulkActionMode,
    folderDialogOpen,
    folderDialogMode,
    editingFolder,
    parentFolderId,
    moveMenuAnchor,
    movingItem: movingDashboard,
    deleteConfirmOpen,
    folderToDelete,
    deletingFolder,
    handleSelectFolder,
    handleSelectShared,
    handleSelectMine,
    handleCreateFolder,
    handleEditFolder,
    handleDeleteFolder,
    confirmDeleteFolder,
    cancelDeleteFolder,
    handleSaveFolder,
    handleOpenMoveMenu,
    handleCloseMoveMenu,
    handleMoveItem: handleMoveDashboard,
    handleToggleItem,
    handleSelectAll,
    handleClearSelection,
    handleToggleBulkMode,
    handleToggleDisplayMode,
    handleToggleFlatten,
    handleSort,
    setFolderDialogOpen,
  } = folderState;

  useEffect(() => {
    setPageTitle('Dashboards');
    setPageSubtitle('');
  }, [setPageTitle, setPageSubtitle]);

  useEffect(() => {
    loadDashboards();
  }, []);

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

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleDuplicate = async (dashboard) => {
    try {
      // Backend will default to source name + " (Copy)" if no name provided
      await dashboardService.duplicateDashboard(dashboard.id);
      await loadDashboards();
      showSnackbar('Dashboard duplicated successfully', 'success');
    } catch (err) {
      showSnackbar('Failed to duplicate dashboard: ' + err.message, 'error');
    }
  };

  const handleDelete = (dashboard) => {
    setDashboardToDelete(dashboard);
    setDeleteDashboardOpen(true);
  };

  const confirmDeleteDashboard = async () => {
    if (!dashboardToDelete) return;
    
    try {
      await dashboardService.deleteDashboard(dashboardToDelete.id);
      await loadDashboards();
      setDeleteDashboardOpen(false);
      setDashboardToDelete(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelDeleteDashboard = () => {
    setDeleteDashboardOpen(false);
    setDashboardToDelete(null);
  };

  // Wrap folder handlers to show errors properly
  const handleFolderSaveWithError = async (folderData) => {
    const result = await handleSaveFolder(folderData);
    if (!result.success) {
      setError(result.error || 'Failed to save folder');
    }
    return result;
  };

  const handleFolderDeleteWithError = async () => {
    const result = await confirmDeleteFolder();
    if (!result.success) {
      setError(result.error || 'Failed to delete folder');
    }
  };

  const handleMoveDashboardWithError = async (folderId) => {
    const result = await handleMoveDashboard(folderId);
    if (result.success) {
      await loadDashboards();
      handleCloseMoveMenu();
    } else {
      setError(result.error || 'Failed to move dashboard');
    }
  };

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
              primary="My Dashboards"
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
                  My Dashboards
                </Typography>
              </>
            )}
            {selectedFolderId && viewMode === 'all' && (
              <>
                <FolderOpenIcon color="primary" />
                <Typography variant="h6" color="primary">
                  {/* Show folder name */}
                </Typography>
              </>
            )}
            {!selectedFolderId && viewMode === 'all' && (
              <Typography variant="h4">
                Dashboards
              </Typography>
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

        {/* View Controls */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
          <Button
            size="small"
            variant={displayMode === 'card' ? 'contained' : 'outlined'}
            startIcon={<CardViewIcon />}
            onClick={handleToggleDisplayMode}
          >
            Card
          </Button>
          <Button
            size="small"
            variant={displayMode === 'table' ? 'contained' : 'outlined'}
            startIcon={<TableViewIcon />}
            onClick={handleToggleDisplayMode}
          >
            Table
          </Button>
          {displayMode === 'table' && (
            <>
              {/* Bulk mode always enabled in table view - toggle button removed but state kept for future use */}
              <Button
                size="small"
                variant={flattenHierarchy ? 'contained' : 'outlined'}
                startIcon={flattenHierarchy ? <FlattenIcon /> : <HierarchyIcon />}
                onClick={handleToggleFlatten}
              >
                {flattenHierarchy ? 'Flattened' : 'Hierarchy'}
              </Button>
            </>
          )}
        </Box>

        {/* Bulk Action Toolbar - always visible, greyed out when no selection */}
        {bulkActionMode && (
          <BulkActionToolbar
            selectedCount={selectedItems.size}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onBulkMove={(e) => {
              const selectedDashboardItems = filteredDashboards.filter(d => selectedItems.has(d.id));
              if (selectedDashboardItems.length > 0) {
                handleOpenMoveMenu(e, { id: 'bulk', name: 'Selected Dashboards', isBulk: true, items: selectedDashboardItems });
              }
            }}
            onBulkDelete={() => {
              const selectedDashboardItems = filteredDashboards.filter(d => selectedItems.has(d.id));
              if (selectedDashboardItems.length > 0 && confirm(`Delete ${selectedDashboardItems.length} dashboard(s)?`)) {
                Promise.all(selectedDashboardItems.map(d => dashboardService.deleteDashboard(d.id)))
                  .then(() => {
                    loadDashboards();
                    handleClearSelection();
                    showSnackbar(`Deleted ${selectedDashboardItems.length} dashboard(s)`, 'success');
                  })
                  .catch(err => showSnackbar('Error deleting dashboards: ' + err.message, 'error'));
              }
            }}
          />
        )}

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
              : viewMode === 'mine'
                ? 'No dashboards created yet'
                : (selectedFolderId ? 'No dashboards in this folder' : 'No dashboards at home level. All dashboards are in folders.')}
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
        <>
          {/* Card View */}
          {displayMode === 'card' && (
            <Grid container spacing={3}>
              {filteredDashboards.map(dashboard => (
                <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={dashboard.id}>
                  <BrowserCard
                    item={dashboard}
                    type="dashboard"
                    isOwner={dashboard.is_owner}
                    viewMode={viewMode}
                    onNavigate={(dashboard) => navigate(`/dashboards/${dashboard.id}`)}
                    onMove={handleOpenMoveMenu}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    permissions={{
                      canUpdate: can('dashboards', 'update'),
                      canCreate: can('dashboards', 'create'),
                      canDelete: can('dashboards', 'delete'),
                    }}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Table View */}
          {displayMode === 'table' && (
            <BrowserTable
              items={filteredDashboards}
              type="dashboard"
              selectedItems={selectedItems}
              bulkActionMode={bulkActionMode}
              flattenHierarchy={flattenHierarchy}
              onToggleItem={handleToggleItem}
              onNavigate={(dashboard) => navigate(`/dashboards/${dashboard.id}`)}
              onMove={handleOpenMoveMenu}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              isOwner={true}
              viewMode={viewMode}
              permissions={{
                canUpdate: can('dashboards', 'update'),
                canCreate: can('dashboards', 'create'),
                canDelete: can('dashboards', 'delete'),
              }}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          )}
        </>
      )}
      </Box>

      {/* Move to Folder Menu */}
      <Menu
        anchorEl={moveMenuAnchor}
        open={Boolean(moveMenuAnchor)}
        onClose={handleCloseMoveMenu}
      >
        <MenuItem onClick={() => handleMoveDashboardWithError(null)}>
          <ListItemIcon>
            <HomeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Root (No Folder)</ListItemText>
        </MenuItem>
        {flatFolders.map((folder) => (
          <MenuItem key={folder.id} onClick={() => handleMoveDashboardWithError(folder.id)}>
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
        onSave={handleFolderSaveWithError}
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
        onConfirm={handleFolderDeleteWithError}
        onCancel={cancelDeleteFolder}
        loading={deletingFolder}
        confirmText="Delete"
        confirmColor="error"
      />

      {/* Delete Dashboard Confirmation */}
      <ConfirmDialog
        open={deleteDashboardOpen}
        title="Delete Dashboard"
        message={`Are you sure you want to delete the dashboard "${dashboardToDelete?.name}"? This action cannot be undone.`}
        onConfirm={confirmDeleteDashboard}
        onCancel={cancelDeleteDashboard}
        confirmText="Delete"
        confirmColor="error"
      />

      {/* Snackbar for notifications */}
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
  );
};

export default DashboardList;
