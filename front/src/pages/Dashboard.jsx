import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  TextField,
  Chip,
  Divider,
  Paper,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Fullscreen as FullscreenIcon,
  AccessTime as AccessTimeIcon,
  FileDownload as FileDownloadIcon,
  Settings as SettingsIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { DashboardProvider, useDashboard } from '../contexts/DashboardContext';
import { ChartComposerProvider } from '../contexts/ChartComposerContext';
import DashboardWidget from '../components/dashboard/DashboardWidget';
import ChartLibrary from '../components/dashboard/ChartLibrary';
import TimeSyncDialog from '../components/dashboard/TimeSyncDialog';
import ExportDialog from '../components/dashboard/ExportDialog';
import ExportDashboardButton from '../components/dashboard/ExportDashboardButton';
import DashboardSettingsDialog from '../components/dashboard/DashboardSettingsDialog';
import TVMode from '../components/dashboard/TVMode';
import TVModeDialog from '../components/dashboard/TVModeDialog';
import dashboardService from '../services/dashboardService';
import '../styles/dashboard.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const DashboardContent = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const {
    currentDashboard,
    setCurrentDashboard,
    layout,
    editMode,
    loading,
    error,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    selectedWidgets,
    toggleEditMode,
    loadDashboard,
    saveDashboard,
    updateLayout,
    timeSyncGroups,
  } = useDashboard();

  const [showAddChart, setShowAddChart] = useState(false);
  const [showSyncTimeDialog, setShowSyncTimeDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showTVModeDialog, setShowTVModeDialog] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [tvConfig, setTvConfig] = useState(null);
  const [tvDashboardIndex, setTvDashboardIndex] = useState(0);
  const [tvDashboards, setTvDashboards] = useState([]);
  const [editedName, setEditedName] = useState('');

  // Load dashboard on mount
  useEffect(() => {
    if (id) {
      loadDashboard(id);
    }
  }, [id, loadDashboard]);

  // Sync edited name when dashboard loads or edit mode changes
  useEffect(() => {
    if (currentDashboard) {
      setEditedName(currentDashboard.name || '');
    }
  }, [currentDashboard, editMode]);

  // Handle layout change from react-grid-layout
  const handleLayoutChange = (newLayout) => {
    if (!editMode) return;
    
    // Update layout items with new positions
    const updatedItems = layout.items.map(item => {
      const layoutItem = newLayout.find(l => l.i === item.i);
      if (layoutItem) {
        return {
          ...item,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        };
      }
      return item;
    });
    
    updateLayout(updatedItems);
  };

  const handleNameChange = (event) => {
    const newName = event.target.value;
    setEditedName(newName);
    setCurrentDashboard({
      ...currentDashboard,
      name: newName,
    });
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    try {
      await saveDashboard();
      toggleEditMode();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Discard them?')) {
        return;
      }
      // Reload dashboard to discard changes
      if (id) {
        loadDashboard(id);
      }
    }
    toggleEditMode();
  };

  // Settings handler
  const handleSaveSettings = async (settings) => {
    try {
      const updatedDashboard = {
        ...currentDashboard,
        ...settings,
      };
      setCurrentDashboard(updatedDashboard);
      setHasUnsavedChanges(true);
      
      // Save immediately with the updated settings
      await dashboardService.updateDashboard(currentDashboard.id, {
        name: settings.name,
        description: settings.description,
        is_shared: settings.is_shared,
        layout: layout,
      });
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
      throw err;
    }
  };

  // TV Mode handlers 
  const handleStartTVMode = async (config) => {
    try {
      // Load all selected dashboards directly from the service
      const dashboardPromises = config.dashboards.map(dashboardId => 
        dashboardService.getDashboard(dashboardId)
      );
      const loadedDashboards = await Promise.all(dashboardPromises);
      
      setTvDashboards(loadedDashboards);
      setTvConfig(config);
      setTvDashboardIndex(config.dashboards.indexOf(id) >= 0 ? config.dashboards.indexOf(id) : 0);
      setTvMode(true);
    } catch (err) {
      console.error('Failed to start TV mode:', err);
    }
  };

  const handleExitTVMode = () => {
    setTvMode(false);
    setTvDashboards([]);
    setTvConfig(null);
    // Reload current dashboard
    if (id) {
      loadDashboard(id);
    }
  };

  const handleTVDashboardChange = (indexOrUpdater) => {
    setTvDashboardIndex(indexOrUpdater);
    // Don't navigate during TV mode - TVMode component manages its own state
  };

  // Get sync group index for a widget
  const getWidgetSyncGroup = (widgetId) => {
    const groups = Array.from(timeSyncGroups.entries());
    for (let i = 0; i < groups.length; i++) {
      const [groupId, widgetIds] = groups[i];
      if (widgetIds.has(widgetId)) {
        return i;
      }
    }
    return null;
  };

  if (loading && !currentDashboard) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !currentDashboard) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button onClick={() => navigate('/dashboards')} sx={{ mt: 2 }}>
          Back to Dashboards
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper className="export-hide" elevation={2} sx={{ mb: 2 }}>
        <Toolbar sx={{ gap: 2, py: 1 }}>
          {/* Navigation */}
          <IconButton onClick={() => navigate('/dashboards')} edge="start" size="small">
            <BackIcon />
          </IconButton>
          
          {editMode ? (
            <TextField
              value={editedName}
              onChange={handleNameChange}
              variant="standard"
              placeholder="Dashboard Name"
              sx={{ 
                flexGrow: 1,
                ml: 2,
                '& .MuiInput-root': {
                  fontSize: '1.25rem',
                  fontWeight: 500,
                },
              }}
            />
          ) : (
            <Typography variant="h6" sx={{ ml: 2, flexGrow: 1 }}>
              {currentDashboard?.name || 'Dashboard'}
              {currentDashboard?.is_shared && (
                <Chip
                  label="Shared"
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ ml: 2, height: 24 }}
                />
              )}
            </Typography>
          )}

          {hasUnsavedChanges && (
            <Chip label="Unsaved" color="warning" size="small" sx={{ mr: 2 }} />
          )}

          {editMode ? (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              
              {/* Primary Group */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                  PRIMARY
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip 
                    title="Save dashboard changes"
                    PopperProps={{
                      modifiers: [
                        {
                          name: 'preventOverflow',
                          options: {
                            boundary: 'window',
                          },
                        },
                      ],
                    }}
                  >
                    <span>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={<SaveIcon />}
                        onClick={handleSave}
                        disabled={!hasUnsavedChanges}
                        sx={{ minWidth: 90 }}
                      >
                        Save
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title="Cancel editing">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CancelIcon />}
                      onClick={handleCancel}
                      sx={{ minWidth: 90 }}
                    >
                      Cancel
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
              
              <Divider orientation="vertical" flexItem />
              
              {/* Edit Tools Group */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                  EDIT
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Add chart widget">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => setShowAddChart(true)}
                      sx={{ minWidth: 100 }}
                    >
                      Add Chart
                    </Button>
                  </Tooltip>
                  {selectedWidgets.size > 1 && (
                    <Tooltip title="Synchronize time range for selected widgets">
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<AccessTimeIcon />}
                        onClick={() => setShowSyncTimeDialog(true)}
                        sx={{ minWidth: 90 }}
                      >
                        Sync ({selectedWidgets.size})
                      </Button>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            </>
          ) : (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              
              {/* View Group */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                  VIEW
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="TV Mode - Fullscreen presentation">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<FullscreenIcon />}
                      onClick={() => setShowTVModeDialog(true)}
                      sx={{ minWidth: 100 }}
                    >
                      TV Mode
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
              
              <Divider orientation="vertical" flexItem />
              
              {/* Tools Group */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                  TOOLS
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Edit dashboard layout">
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={toggleEditMode}
                        disabled={!currentDashboard?.is_owner}
                        sx={{ minWidth: 90 }}
                      >
                        Edit
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title="Dashboard settings">
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SettingsIcon />}
                        onClick={() => setShowSettingsDialog(true)}
                        disabled={!currentDashboard?.is_owner}
                        sx={{ minWidth: 100 }}
                      >
                        Settings
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title="Export dashboard configuration">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<FileDownloadIcon />}
                      onClick={() => setShowExportDialog(true)}
                      sx={{ minWidth: 90 }}
                    >
                      Export
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
            </>
          )}
        </Toolbar>
      </Paper>

      {/* Dashboard Grid */}
      <Box className="dashboard-grid-container" sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: 'background.default' }}>
        {layout.items.length === 0 ? (
          <Box sx={{ 
            textAlign: 'center', 
            py: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}>
            <Typography variant="h6" color="text.secondary">
              This dashboard is empty
            </Typography>
            {currentDashboard?.is_owner ? (
              <Alert severity="info" sx={{ maxWidth: 500 }}>
                <Typography variant="body2">
                  Click the <strong>Edit</strong> button in the toolbar, then use <strong>Add Chart</strong> to add widgets to this dashboard.
                </Typography>
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                This dashboard has no widgets yet.
              </Typography>
            )}
          </Box>
        ) : (
          <ResponsiveGridLayout
            className={`dashboard-grid ${editMode ? 'edit-mode' : ''}`}
            layouts={{ lg: layout.items }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={layout.row_height || 80}
            margin={editMode ? [10, 10] : [4, 4]}
            containerPadding={editMode ? [10, 10] : [4, 4]}
            isDraggable={editMode}
            isResizable={editMode}
            compactType={null}
            preventCollision={false}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
          >
            {layout.items.map(item => {
              // Recalculate sync group index on every render (depends on timeSyncGroups)
              const syncGroupIndex = getWidgetSyncGroup(item.i);
              return (
                <div key={item.i}>
                  <DashboardWidget
                    widgetConfig={item}
                    syncGroupIndex={syncGroupIndex}
                  />
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </Box>

      {/* Chart Library Sidebar */}
      <ChartLibrary
        open={showAddChart}
        onClose={() => setShowAddChart(false)}
      />

      {/* Time Sync Dialog */}
      <TimeSyncDialog
        open={showSyncTimeDialog}
        onClose={() => setShowSyncTimeDialog(false)}
      />

      {/* Settings Dialog */}
      <DashboardSettingsDialog
        open={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        onSave={handleSaveSettings}
        dashboard={currentDashboard}
      />

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        dashboardName={currentDashboard?.name}
      />

      {/* TV Mode Dialog */}
      <TVModeDialog
        open={showTVModeDialog}
        onClose={() => setShowTVModeDialog(false)}
        onStart={handleStartTVMode}
        currentDashboardId={id}
      />

      {/* TV Mode */}
      {tvMode && tvConfig && (
        <TVMode
          dashboards={tvDashboards}
          currentIndex={tvDashboardIndex}
          onIndexChange={handleTVDashboardChange}
          rotationInterval={tvConfig.rotationInterval}
          autoRotate={true}
          onExit={handleExitTVMode}
        />
      )}
    </Box>
  );
};

const Dashboard = () => {
  return (
    <DashboardProvider>
      <ChartComposerProvider>
        <DashboardContent />
      </ChartComposerProvider>
    </DashboardProvider>
  );
};

export default Dashboard;
