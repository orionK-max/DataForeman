import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon,
  PlayArrow as ManualIcon,
} from '@mui/icons-material';
import { listFlows } from '../../services/flowsApi';

/**
 * AddFlowDialog Component
 * Dialog for selecting flows to add to dashboard
 * Only shows manual flows (can be executed on-demand)
 */
export default function AddFlowDialog({ open, onClose, onFlowSelected }) {
  const [flows, setFlows] = useState([]);
  const [filteredFlows, setFilteredFlows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFlow, setSelectedFlow] = useState(null);

  // Load flows when dialog opens
  useEffect(() => {
    if (open) {
      loadFlows();
      setSearchQuery('');
      setSelectedFlow(null);
    }
  }, [open]);

  // Filter flows based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFlows(flows);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = flows.filter(flow => 
      flow.name.toLowerCase().includes(query) ||
      (flow.description && flow.description.toLowerCase().includes(query))
    );
    setFilteredFlows(filtered);
  }, [searchQuery, flows]);

  const loadFlows = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Load all flows and filter for manual ones
      const response = await listFlows();
      const allFlows = response.flows || [];
      
      // Filter for manual flows only
      const manualFlows = allFlows.filter(flow => 
        flow.execution_mode === 'manual'
      );
      
      setFlows(manualFlows);
      setFilteredFlows(manualFlows);
      
      if (manualFlows.length === 0) {
        setError('No manual flows available. Create a manual flow in Flow Studio first.');
      }
    } catch (err) {
      console.error('Failed to load flows:', err);
      setError(err.message || 'Failed to load flows');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFlow = (flow) => {
    setSelectedFlow(flow);
  };

  const handleAdd = () => {
    if (selectedFlow) {
      onFlowSelected(selectedFlow);
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedFlow(null);
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          height: '70vh',
          maxHeight: '600px',
        }
      }}
    >
      <DialogTitle>Add Flow to Dashboard</DialogTitle>
      
      <DialogContent>
        {/* Search Box */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search flows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && !loading && (
          <Alert severity="warning">{error}</Alert>
        )}

        {/* Flow List */}
        {!loading && !error && (
          <>
            {filteredFlows.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  {searchQuery ? 'No flows match your search' : 'No manual flows available'}
                </Typography>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {filteredFlows.map((flow) => {
                  const paramCount = flow.exposed_parameters?.length || 0;
                  const isSelected = selectedFlow?.id === flow.id;
                  
                  return (
                    <ListItem 
                      key={flow.id} 
                      disablePadding
                      sx={{
                        mb: 1,
                        border: '1px solid',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        bgcolor: isSelected ? 'action.selected' : 'transparent',
                      }}
                    >
                      <ListItemButton 
                        onClick={() => handleSelectFlow(flow)}
                        selected={isSelected}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <ManualIcon fontSize="small" color="action" />
                              <Typography variant="subtitle2">
                                {flow.name}
                              </Typography>
                              {paramCount > 0 && (
                                <Chip
                                  label={`${paramCount} param${paramCount !== 1 ? 's' : ''}`}
                                  size="small"
                                  variant="outlined"
                                  color="primary"
                                  sx={{ ml: 'auto' }}
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            flow.description && (
                              <Typography 
                                variant="body2" 
                                color="text.secondary"
                                sx={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  mt: 0.5,
                                }}
                              >
                                {flow.description}
                              </Typography>
                            )
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          onClick={handleAdd} 
          variant="contained" 
          disabled={!selectedFlow}
        >
          Add Flow
        </Button>
      </DialogActions>
    </Dialog>
  );
}
