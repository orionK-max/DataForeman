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
  ViewModule as CardViewIcon,
  TableRows as TableViewIcon,
  CheckBox as BulkModeIcon,
  AccountTree as HierarchyIcon,
  ViewList as FlattenIcon,
} from '@mui/icons-material';
import chartComposerService from '../services/chartComposerService';
import { useBrowserFolders } from '../hooks/useBrowserFolders';
import { FOLDER_TYPES } from '../services/folderService';
import FolderTree from '../components/folders/FolderTree';
import FolderDialog from '../components/folders/FolderDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { usePageTitle } from '../contexts/PageTitleContext';
import AddChartButton from '../components/chartComposer/AddChartButton';
import BrowserCard from '../components/browser/BrowserCard';
import BrowserTable from '../components/browser/BrowserTable';
import BulkActionToolbar from '../components/browser/BulkActionToolbar';

const ChartBrowser = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const navigate = useNavigate();
  const [charts, setCharts] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Use universal folder management hook (pass null for onReload, we'll call it manually)
  const folderState = useBrowserFolders(FOLDER_TYPES.CHART, charts, null);
  const {
    folders,
    selectedFolderId,
    viewMode,
    displayMode,
    flattenHierarchy,
    filteredItems: filteredCharts,
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
    movingItem: movingChart,
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
    handleMoveItem: handleMoveChart,
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
    setPageTitle('Charts');
    setPageSubtitle('');
  }, [setPageTitle, setPageSubtitle]);

  useEffect(() => {
    loadCharts();
  }, []);

  const loadCharts = async () => {
    try {
      const response = await chartComposerService.listCharts('all', 200, 0);
      setCharts(response.items || []);
    } catch (error) {
      showSnackbar('Failed to load charts: ' + error.message, 'error');
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

  // Wrap folder handlers to show snackbar
  const handleFolderSaveWithSnackbar = async (folderData) => {
    const result = await handleSaveFolder(folderData);
    if (result.success) {
      showSnackbar('Folder saved successfully', 'success');
    } else {
      showSnackbar(result.error || 'Failed to save folder', 'error');
    }
    return result;
  };

  const handleFolderDeleteWithSnackbar = async () => {
    const result = await confirmDeleteFolder();
    if (result.success) {
      showSnackbar('Folder deleted successfully', 'success');
    } else {
      showSnackbar(result.error || 'Failed to delete folder', 'error');
    }
  };

  const handleMoveChartWithSnackbar = async (folderId) => {
    const result = await handleMoveChart(folderId);
    if (result.success) {
      await loadCharts();
      showSnackbar('Chart moved successfully', 'success');
    } else {
      showSnackbar(result.error || 'Failed to move chart', 'error');
    }
  };

  const formatDate = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };



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
              const selectedChartItems = filteredCharts.filter(c => selectedItems.has(c.id));
              if (selectedChartItems.length > 0) {
                handleOpenMoveMenu(e, { id: 'bulk', name: 'Selected Charts', isBulk: true, items: selectedChartItems });
              }
            }}
            onBulkDelete={() => {
              const selectedChartItems = filteredCharts.filter(c => selectedItems.has(c.id));
              if (selectedChartItems.length > 0 && confirm(`Delete ${selectedChartItems.length} chart(s)?`)) {
                Promise.all(selectedChartItems.map(c => chartComposerService.deleteChart(c.id)))
                  .then(() => {
                    loadCharts();
                    handleClearSelection();
                    showSnackbar(`Deleted ${selectedChartItems.length} chart(s)`, 'success');
                  })
                  .catch(err => showSnackbar('Error deleting charts: ' + err.message, 'error'));
              }
            }}
          />
        )}

        {/* Card View */}
        {displayMode === 'card' && (
          <Grid container spacing={2}>
          {filteredCharts.map((chart) => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={chart.id}>
              <BrowserCard
                item={chart}
                type="chart"
                isOwner={chart.is_owner}
                viewMode={viewMode}
                onNavigate={(chart) => navigate(`/charts/${chart.id}`)}
                onMove={handleOpenMoveMenu}
                onDuplicate={handleDuplicateChart}
                onDelete={handleDeleteChart}
              />
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
        )}

        {/* Table View */}
        {displayMode === 'table' && (
          <BrowserTable
            items={filteredCharts}
            type="chart"
            selectedItems={selectedItems}
            bulkActionMode={bulkActionMode}
            flattenHierarchy={flattenHierarchy}
            onToggleItem={handleToggleItem}
            onNavigate={(chart) => navigate(`/charts/${chart.id}`)}
            onMove={handleOpenMoveMenu}
            onDuplicate={handleDuplicateChart}
            onDelete={handleDeleteChart}
            isOwner={true}
            viewMode={viewMode}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        )}

        {/* Move Chart Dialog */}
        <Dialog
          open={Boolean(moveMenuAnchor && movingChart)}
          onClose={handleCloseMoveMenu}
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
            <MenuItem onClick={() => handleMoveChartWithSnackbar(null)} sx={{ borderRadius: 1, mb: 0.5 }}>
              <ListItemIcon>
                <HomeIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Root (No Folder)</ListItemText>
            </MenuItem>
            {flatFolders.map((folder) => (
              <MenuItem 
                key={folder.id} 
                onClick={() => handleMoveChartWithSnackbar(folder.id)}
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
            <Button onClick={handleCloseMoveMenu}>Cancel</Button>
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
          onSave={handleFolderSaveWithSnackbar}
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
          onConfirm={handleFolderDeleteWithSnackbar}
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
