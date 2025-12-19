import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Tabs,
  Tab,
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
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  PlayArrow as RunIcon,
  CloudUpload as DeployedIcon,
  CloudOff as UndeployedIcon,
  Memory as ResourceIcon,
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
import { listFlows, listSharedFlows, createFlow, deleteFlow, duplicateFlow, executeFlow } from '../services/flowsApi';
import FlowResourceMonitor from '../components/FlowEditor/FlowResourceMonitor';
import ParameterExecutionDialog from '../components/flowStudio/ParameterExecutionDialog';
import { useFlowResources } from '../hooks/useFlowResources';
import { useBrowserFolders } from '../hooks/useBrowserFolders';
import { FOLDER_TYPES } from '../services/folderService';
import FolderTree from '../components/folders/FolderTree';
import FolderDialog from '../components/folders/FolderDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { usePageTitle } from '../contexts/PageTitleContext';
import BrowserCard from '../components/browser/BrowserCard';
import BrowserTable from '../components/browser/BrowserTable';
import BulkActionToolbar from '../components/browser/BulkActionToolbar';
import AddFlowButton from '../components/flowStudio/AddFlowButton';

const FlowBrowser = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [myFlows, setMyFlows] = useState([]);
  const [sharedFlows, setSharedFlows] = useState([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [resourceMonitorOpen, setResourceMonitorOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowToDelete, setFlowToDelete] = useState(null);
  const [flowToDuplicate, setFlowToDuplicate] = useState(null);
  const [duplicateFlowName, setDuplicateFlowName] = useState('');
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [parameterDialogOpen, setParameterDialogOpen] = useState(false);
  const [flowToExecute, setFlowToExecute] = useState(null);

  // Use universal folder management hook (pass null for onReload, we'll call it manually)
  const folderState = useBrowserFolders(FOLDER_TYPES.FLOW, myFlows, null);
  const {
    folders,
    selectedFolderId,
    viewMode,
    displayMode,
    flattenHierarchy,
    filteredItems: filteredFlows,
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
    movingItem: movingFlow,
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
    handleMoveItem: handleMoveFlow,
    handleToggleItem,
    handleSelectAll,
    handleClearSelection,
    handleToggleBulkMode,
    handleToggleDisplayMode,
    handleToggleFlatten,
    handleSort,
    setFolderDialogOpen,
    setError: setFolderError,
  } = folderState;

  const { data: resourceData, loading: resourceLoading, refetch: refetchResources } = useFlowResources(
    selectedFlow?.id,
    resourceMonitorOpen && selectedFlow?.deployed,
    5000
  );

  useEffect(() => {
    setPageTitle('Flows');
    setPageSubtitle('');
  }, [setPageTitle, setPageSubtitle]);

  useEffect(() => {
    loadFlows();
  }, []);

  const loadFlows = async () => {
    try {
      const [myData, sharedData] = await Promise.all([
        listFlows(),
        listSharedFlows()
      ]);
      setMyFlows(myData.flows || []);
      setSharedFlows(sharedData.flows || []);
    } catch (error) {
      showSnackbar('Failed to load flows: ' + error.message, 'error');
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCreateFlow = async () => {
    try {
      const newFlow = await createFlow({
        name: newFlowName,
        description: newFlowDescription,
        execution_mode: 'manual',
        definition: {
          nodes: [],
          edges: []
        }
      });
      setCreateDialogOpen(false);
      setNewFlowName('');
      setNewFlowDescription('');
      navigate(`/flows/${newFlow.flow.id}`);
    } catch (error) {
      showSnackbar('Failed to create flow: ' + error.message, 'error');
    }
  };

  const handleDeleteFlow = (flow) => {
    setFlowToDelete(flow);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteFlow = async () => {
    try {
      await deleteFlow(flowToDelete.id);
      await loadFlows();
      showSnackbar('Flow deleted successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to delete flow: ' + error.message, 'error');
    } finally {
      setDeleteDialogOpen(false);
      setFlowToDelete(null);
    }
  };

  const handleDuplicateFlow = (flow) => {
    setFlowToDuplicate(flow);
    setDuplicateFlowName(`${flow.name} (Copy)`);
    setDuplicateDialogOpen(true);
  };

  const confirmDuplicateFlow = async () => {
    try {
      await duplicateFlow(flowToDuplicate.id, duplicateFlowName.trim());
      await loadFlows();
      showSnackbar('Flow duplicated successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to duplicate flow: ' + error.message, 'error');
    } finally {
      setDuplicateDialogOpen(false);
      setFlowToDuplicate(null);
      setDuplicateFlowName('');
    }
  };

  const handleOpenResourceMonitor = (flow) => {
    setSelectedFlow(flow);
    setResourceMonitorOpen(true);
  };

  const handleExecuteFlow = (flow) => {
    setFlowToExecute(flow);
    setParameterDialogOpen(true);
  };

  const handleExecutionStarted = (result) => {
    showSnackbar(`Flow execution started (Job ID: ${result.jobId})`, 'success');
  };

  // Wrap folder error handler to show snackbar
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

  const handleMoveFlowWithSnackbar = async (folderId) => {
    const result = await handleMoveFlow(folderId);
    if (result.success) {
      await loadFlows();
      showSnackbar('Flow moved successfully', 'success');
    } else {
      showSnackbar(result.error || 'Failed to move flow', 'error');
    }
  };

  // Combine hook's filtered items with shared flows for "shared" view
  const displayFlows = viewMode === 'shared' ? sharedFlows : filteredFlows;

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
              primary="My Flows"
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
                  My Flows
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
                Flows
              </Typography>
            )}
          </Box>
          {viewMode !== 'shared' && (
            <AddFlowButton
              onNewFlow={() => setCreateDialogOpen(true)}
              onImportSuccess={() => {
                loadFlows();
                showSnackbar('Flow imported successfully', 'success');
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
              // Create a pseudo-item representing all selected flows
              const selectedFlowItems = displayFlows.filter(f => selectedItems.has(f.id));
              if (selectedFlowItems.length > 0) {
                handleOpenMoveMenu(e, { id: 'bulk', name: 'Selected Flows', isBulk: true, items: selectedFlowItems });
              }
            }}
            onBulkDelete={() => {
              const selectedFlowItems = displayFlows.filter(f => selectedItems.has(f.id));
              if (selectedFlowItems.length > 0 && confirm(`Delete ${selectedFlowItems.length} flow(s)?`)) {
                Promise.all(selectedFlowItems.map(f => deleteFlow(f.id)))
                  .then(() => {
                    loadFlows();
                    handleClearSelection();
                    showSnackbar(`Deleted ${selectedFlowItems.length} flow(s)`, 'success');
                  })
                  .catch(err => showSnackbar('Error deleting flows: ' + err.message, 'error'));
              }
            }}
          />
        )}

        {/* Card View */}
        {displayMode === 'card' && (
          <Grid container spacing={2}>
          {displayFlows.map((flow) => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={flow.id}>
              <BrowserCard
                item={flow}
                type="flow"
                isOwner={viewMode !== 'shared'}
                viewMode={viewMode}
                onNavigate={(flow) => navigate(`/flows/${flow.id}`)}
                onMove={handleOpenMoveMenu}
                onDuplicate={handleDuplicateFlow}
                onDelete={handleDeleteFlow}
                onExecute={handleExecuteFlow}
                onResourceMonitor={handleOpenResourceMonitor}
              />
            </Grid>
          ))}
          
          {displayFlows.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" align="center">
                {viewMode === 'shared' 
                  ? 'No shared flows' 
                  : viewMode === 'mine'
                    ? 'No flows created yet'
                    : (selectedFolderId === null 
                        ? 'No flows at home level. All flows are in folders.' 
                        : 'No flows in this folder')}
              </Typography>
            </Grid>
          )}
          </Grid>
        )}

        {/* Table View */}
        {displayMode === 'table' && (
          <BrowserTable
            items={displayFlows}
            type="flow"
            selectedItems={selectedItems}
            bulkActionMode={bulkActionMode}
            flattenHierarchy={flattenHierarchy}
            onToggleItem={handleToggleItem}
            onNavigate={(flow) => navigate(`/flows/${flow.id}`)}
            onMove={handleOpenMoveMenu}
            onDuplicate={handleDuplicateFlow}
            onDelete={handleDeleteFlow}
            onExecute={handleExecuteFlow}
            onResourceMonitor={handleOpenResourceMonitor}
            isOwner={viewMode !== 'shared'}
            viewMode={viewMode}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        )}

        {/* Move Flow Dialog */}
        <Dialog
          open={Boolean(moveMenuAnchor && movingFlow)}
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
          <DialogTitle>Move "{movingFlow?.name}" to Folder</DialogTitle>
          <DialogContent>
            <MenuItem onClick={() => handleMoveFlowWithSnackbar(null)} sx={{ borderRadius: 1, mb: 0.5 }}>
              <ListItemIcon>
                <HomeIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Root (No Folder)</ListItemText>
            </MenuItem>
            {flatFolders.map((folder) => (
              <MenuItem 
                key={folder.id} 
                onClick={() => handleMoveFlowWithSnackbar(folder.id)}
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

      {/* Create Flow Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Flow</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Flow Name"
            fullWidth
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            value={newFlowDescription}
            onChange={(e) => setNewFlowDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFlow} variant="contained" disabled={!newFlowName}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Flow</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{flowToDelete?.name}</strong>?
          </Typography>
          {flowToDelete?.deployed && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This flow is currently deployed. Please undeploy it before deleting.
            </Alert>
          )}
          {!flowToDelete?.deployed && (
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              This action cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={confirmDeleteFlow} 
            variant="contained" 
            color="error"
            disabled={flowToDelete?.deployed}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Confirmation Dialog */}
      <Dialog
        open={duplicateDialogOpen}
        onClose={() => setDuplicateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Flow</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Create a copy of <strong>{flowToDuplicate?.name}</strong>
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="New Flow Name"
            type="text"
            fullWidth
            value={duplicateFlowName}
            onChange={(e) => setDuplicateFlowName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && duplicateFlowName.trim()) {
                confirmDuplicateFlow();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={confirmDuplicateFlow} 
            variant="contained"
            disabled={!duplicateFlowName.trim()}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

        {/* Resource Monitor Dialog */}
        {selectedFlow && (
          <FlowResourceMonitor
            open={resourceMonitorOpen}
            onClose={() => {
              setResourceMonitorOpen(false);
              setSelectedFlow(null);
            }}
            flowId={selectedFlow.id}
            flowName={selectedFlow.name}
            resourceData={resourceData}
            loading={resourceLoading}
            onRefresh={refetchResources}
          />
        )}

        {/* Parameter Execution Dialog */}
        <ParameterExecutionDialog
          open={parameterDialogOpen}
          onClose={() => {
            setParameterDialogOpen(false);
            setFlowToExecute(null);
          }}
          flow={flowToExecute}
          onExecutionStarted={handleExecutionStarted}
        />

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

export default FlowBrowser;
