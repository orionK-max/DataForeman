import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Alert,
} from '@mui/material';
import { Tv } from '@mui/icons-material';
import dashboardService from '../../services/dashboardService';

const TVModeDialog = ({ open, onClose, onStart, currentDashboardId }) => {
  const [rotationInterval, setRotationInterval] = useState(10);
  const [selectedDashboards, setSelectedDashboards] = useState([currentDashboardId]);
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load dashboards
  useEffect(() => {
    const loadDashboards = async () => {
      setLoading(true);
      try {
        const response = await dashboardService.listDashboards('all', 100, 0);
        setDashboards(response.items || []);
      } catch (err) {
        console.error('Failed to load dashboards:', err);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadDashboards();
      // Reset selection to include current dashboard
      setSelectedDashboards([currentDashboardId]);
    }
  }, [open, currentDashboardId]);

  const handleToggleDashboard = (dashboardId) => {
    setSelectedDashboards(prev => {
      if (prev.includes(dashboardId)) {
        return prev.filter(id => id !== dashboardId);
      } else {
        return [...prev, dashboardId];
      }
    });
  };

  const handleStart = () => {
    if (selectedDashboards.length === 0) {
      alert('Please select at least one dashboard');
      return;
    }
    onStart({
      dashboards: selectedDashboards,
      rotationInterval,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tv />
          TV Mode Settings
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* Rotation Interval */}
          <FormControl fullWidth>
            <FormLabel>Rotation Interval</FormLabel>
            <Select
              value={rotationInterval}
              onChange={(e) => setRotationInterval(e.target.value)}
              size="small"
            >
              <MenuItem value={5}>5 seconds</MenuItem>
              <MenuItem value={10}>10 seconds</MenuItem>
              <MenuItem value={15}>15 seconds</MenuItem>
              <MenuItem value={30}>30 seconds</MenuItem>
              <MenuItem value={60}>1 minute</MenuItem>
              <MenuItem value={120}>2 minutes</MenuItem>
              <MenuItem value={300}>5 minutes</MenuItem>
            </Select>
          </FormControl>

          {/* Dashboard Selection */}
          <Box>
            <FormLabel>Select Dashboards to Rotate</FormLabel>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Select one or more dashboards to include in rotation
            </Typography>
            
            {loading ? (
              <Typography variant="body2" color="text.secondary">
                Loading dashboards...
              </Typography>
            ) : (
              <List sx={{ maxHeight: 300, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {dashboards.map((dashboard) => (
                  <ListItem
                    key={dashboard.id}
                    dense
                    button
                    onClick={() => handleToggleDashboard(dashboard.id)}
                  >
                    <Checkbox
                      edge="start"
                      checked={selectedDashboards.includes(dashboard.id)}
                      tabIndex={-1}
                      disableRipple
                    />
                    <ListItemText
                      primary={dashboard.name}
                      secondary={dashboard.description}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Info */}
          <Alert severity="info">
            TV Mode displays dashboards in fullscreen with auto-rotation. 
            Press ESC to exit, Space to pause, or use arrow keys to navigate.
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleStart}
          variant="contained"
          color="primary"
          disabled={selectedDashboards.length === 0}
          startIcon={<Tv />}
        >
          Start TV Mode
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TVModeDialog;
