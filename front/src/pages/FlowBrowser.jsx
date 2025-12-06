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
} from '@mui/icons-material';
import { listFlows, listSharedFlows, createFlow, deleteFlow, duplicateFlow } from '../services/flowsApi';
import FlowResourceMonitor from '../components/FlowEditor/FlowResourceMonitor';
import { useFlowResources } from '../hooks/useFlowResources';
import folderService, { FOLDER_TYPES } from '../services/folderService';
import FolderTree from '../components/folders/FolderTree';
import FolderDialog from '../components/folders/FolderDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { usePageTitle } from '../contexts/PageTitleContext';
import AddFlowButton from '../components/flowStudio/AddFlowButton';

const FlowBrowser = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [myFlows, setMyFlows] = useState([]);
  const [sharedFlows, setSharedFlows] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'shared'
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
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState('create');
  const [editingFolder, setEditingFolder] = useState(null);
  const [parentFolderId, setParentFolderId] = useState(null);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState(null);
  const [movingFlow, setMovingFlow] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

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
    loadFolders();
  }, []);

  useEffect(() => {
    loadFlows();
  }, [viewMode]);

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

  const loadFolders = async () => {
    try {
      const tree = await folderService.getFolderTree(FOLDER_TYPES.FLOW);
      setFolders(tree);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCreateFlow = async () => {
    try {
      const result = await createFlow({
        name: newFlowName,
        description: newFlowDescription,
        definition: {
          nodes: [],
          edges: []
        }
      });
      setCreateDialogOpen(false);
      setNewFlowName('');
      setNewFlowDescription('');
      navigate(`/flows/${result.flow.id}`);
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

  // Folder management handlers
  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setViewMode('all');
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
      await folderService.deleteFolder(FOLDER_TYPES.FLOW, folderToDelete.id);
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
        await folderService.updateFolder(FOLDER_TYPES.FLOW, editingFolder.id, folderData);
      } else {
        await folderService.createFolder(FOLDER_TYPES.FLOW, folderData);
      }
      await loadFolders();
      setFolderDialogOpen(false);
    } catch (err) {
      showSnackbar('Failed to save folder: ' + err.message, 'error');
    }
  };

  // Move flow to folder
  const handleOpenMoveMenu = (event, flow) => {
    event.stopPropagation();
    setMovingFlow(flow);
    setMoveMenuAnchor(true); // Just use boolean for dialog
  };

  const handleCloseMoveMenu = () => {
    setMoveMenuAnchor(false);
    setMovingFlow(null);
  };

  const handleMoveFlow = async (folderId) => {
    try {
      await folderService.moveItemToFolder(
        FOLDER_TYPES.FLOW,
        movingFlow.id,
        folderId,
        0
      );
      await loadFlows();
      handleCloseMoveMenu();
    } catch (err) {
      showSnackbar('Failed to move flow: ' + err.message, 'error');
    }
  };

  // Filter flows by selected folder
  const filteredFlows = viewMode === 'shared' 
    ? sharedFlows
    : (selectedFolderId === null
        ? myFlows.filter(f => f.folder_id === null || f.folder_id === undefined) // Show only root-level flows
        : myFlows.filter(f => f.folder_id === selectedFolderId));

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

  const FlowCard = ({ flow, isOwner }) => (
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
        onClick={() => navigate(`/flows/${flow.id}`)}
        sx={{ flexGrow: 1, pb: 1 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
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
            {flow.name}
          </Typography>
          {flow.deployed ? (
            <Chip icon={<DeployedIcon />} label="Deployed" size="small" color="primary" />
          ) : (
            <Chip icon={<UndeployedIcon />} label="Not Deployed" size="small" />
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
          title={flow.description || 'No description'}
        >
          {flow.description || 'No description'}
        </Typography>
        
        {flow.shared && !isOwner && (
          <Chip label="Shared" size="small" sx={{ mt: 1 }} />
        )}
      </CardContent>
      
      <CardActions sx={{ pt: 0, justifyContent: 'flex-end', px: 2, pb: 2 }}>
        {flow.deployed && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              handleOpenResourceMonitor(flow);
            }}
            title="View Resource Monitor"
          >
            <ResourceIcon fontSize="small" />
          </IconButton>
        )}
        {isOwner && viewMode !== 'shared' && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              handleOpenMoveMenu(e, flow);
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
                handleDuplicateFlow(flow);
              }}
              title="Duplicate"
            >
              <DuplicateIcon fontSize="small" />
            </IconButton>
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFlow(flow);
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
            {!selectedFolderId && viewMode !== 'shared' && (
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

        <Grid container spacing={2}>
          {filteredFlows.map((flow) => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={flow.id}>
              <FlowCard flow={flow} isOwner={viewMode !== 'shared'} />
            </Grid>
          ))}
          
          {filteredFlows.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" align="center">
                {viewMode === 'shared' 
                  ? 'No shared flows' 
                  : (selectedFolderId === null 
                      ? 'No flows at home level. All flows are in folders.' 
                      : 'No flows in this folder')}
              </Typography>
            </Grid>
          )}
        </Grid>

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
            <MenuItem onClick={() => handleMoveFlow(null)} sx={{ borderRadius: 1, mb: 0.5 }}>
              <ListItemIcon>
                <HomeIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Root (No Folder)</ListItemText>
            </MenuItem>
            {flatFolders.map((folder) => (
              <MenuItem 
                key={folder.id} 
                onClick={() => handleMoveFlow(folder.id)}
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

export default FlowBrowser;
