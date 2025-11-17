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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  PlayArrow as RunIcon,
  CloudUpload as DeployedIcon,
  CloudOff as UndeployedIcon,
} from '@mui/icons-material';
import { listFlows, listSharedFlows, createFlow, deleteFlow, duplicateFlow } from '../services/flowsApi';

const FlowBrowser = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [myFlows, setMyFlows] = useState([]);
  const [sharedFlows, setSharedFlows] = useState([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

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

  const handleDeleteFlow = async (id) => {
    if (!window.confirm('Are you sure you want to delete this flow?')) {
      return;
    }
    try {
      await deleteFlow(id);
      await loadFlows();
      showSnackbar('Flow deleted successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to delete flow: ' + error.message, 'error');
    }
  };

  const handleDuplicateFlow = async (id) => {
    try {
      await duplicateFlow(id);
      await loadFlows();
      showSnackbar('Flow duplicated successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to duplicate flow: ' + error.message, 'error');
    }
  };

  const FlowCard = ({ flow, isOwner }) => (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {flow.name}
          </Typography>
          {flow.deployed ? (
            <Chip icon={<DeployedIcon />} label="Deployed" size="small" color="primary" />
          ) : (
            <Chip icon={<UndeployedIcon />} label="Not Deployed" size="small" />
          )}
        </Box>
        
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {flow.description || 'No description'}
        </Typography>
        
        {flow.shared && !isOwner && (
          <Chip label="Shared" size="small" sx={{ mt: 1 }} />
        )}
      </CardContent>
      
      <CardActions>
        <Button
          size="small"
          startIcon={<EditIcon />}
          onClick={() => navigate(`/flows/${flow.id}`)}
        >
          Edit
        </Button>
        
        {isOwner && (
          <>
            <IconButton size="small" onClick={() => handleDuplicateFlow(flow.id)}>
              <DuplicateIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => handleDeleteFlow(flow.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </CardActions>
    </Card>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Flow Studio
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Flow
        </Button>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
          <Tab label="My Flows" />
          <Tab label="Shared Flows" />
        </Tabs>
      </Paper>

      <Grid container spacing={2}>
        {tab === 0 && myFlows.map((flow) => (
          <Grid item xs={12} sm={6} md={4} key={flow.id}>
            <FlowCard flow={flow} isOwner={true} />
          </Grid>
        ))}
        
        {tab === 1 && sharedFlows.map((flow) => (
          <Grid item xs={12} sm={6} md={4} key={flow.id}>
            <FlowCard flow={flow} isOwner={false} />
          </Grid>
        ))}
        
        {((tab === 0 && myFlows.length === 0) || (tab === 1 && sharedFlows.length === 0)) && (
          <Grid item xs={12}>
            <Typography color="text.secondary" align="center">
              No flows found
            </Typography>
          </Grid>
        )}
      </Grid>

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
  );
};

export default FlowBrowser;
