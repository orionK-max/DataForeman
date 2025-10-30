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
} from '@mui/material';
import {
  Edit,
  Save,
  Cancel,
  Add,
  Fullscreen,
  AccessTime,
  FileDownload,
  Settings,
} from '@mui/icons-material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { DashboardProvider, useDashboard } from '../contexts/DashboardContext';
import { ChartComposerProvider } from '../contexts/ChartComposerContext';
import DashboardWidget from '../components/dashboard/DashboardWidget';
import ChartLibrary from '../components/dashboard/ChartLibrary';
import TimeSyncDialog from '../components/dashboard/TimeSyncDialog';
import ExportDialog from '../components/dashboard/ExportDialog';
import DashboardSettingsDialog from '../components/dashboard/DashboardSettingsDialog';
import TVMode from '../components/dashboard/TVMode';
import TVModeDialog from '../components/dashboard/TVModeDialog';
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
      setCurrentDashboard({
        ...currentDashboard,
        ...settings,
      });
      setHasUnsavedChanges(true);
      await saveDashboard();
    } catch (err) {
      console.error('Failed to save settings:', err);
      throw err;
    }
  };

  // TV Mode handlers
  const handleStartTVMode = async (config) => {
    try {
      // Load all selected dashboards
      const dashboardPromises = config.dashboards.map(dashboardId => 
        loadDashboard(dashboardId)
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

  const handleTVDashboardChange = (index) => {
    setTvDashboardIndex(index);
    const dashboardId = tvConfig.dashboards[index];
    navigate(`/dashboards/${dashboardId}`);
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
      <AppBar className="export-hide" position="static" color="default" elevation={1}>
        <Toolbar>
          {editMode ? (
            <TextField
              value={editedName}
              onChange={handleNameChange}
              variant="standard"
              placeholder="Dashboard Name"
              sx={{ 
                flexGrow: 1,
                '& .MuiInput-root': {
                  fontSize: '1.25rem',
                  fontWeight: 500,
                },
              }}
            />
          ) : (
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
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

          {hasUnsavedChanges && !editMode && (
            <Typography variant="caption" color="warning.main" sx={{ mr: 2 }}>
              Unsaved changes
            </Typography>
          )}

          {editMode ? (
            <>
              <Button
                startIcon={<Add />}
                onClick={() => setShowAddChart(true)}
                sx={{ mr: 1 }}
              >
                Add Chart
              </Button>
              {selectedWidgets.size > 1 && (
                <Button
                  startIcon={<AccessTime />}
                  onClick={() => setShowSyncTimeDialog(true)}
                  variant="outlined"
                  color="primary"
                  sx={{ mr: 1 }}
                >
                  Sync Time ({selectedWidgets.size} selected)
                </Button>
              )}
              <Button
                startIcon={<Save />}
                onClick={handleSave}
                variant="contained"
                color="primary"
                sx={{ mr: 1 }}
                disabled={!hasUnsavedChanges}
              >
                Save
              </Button>
              <Button
                startIcon={<Cancel />}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Tooltip title="Settings">
                <span>
                  <IconButton 
                    onClick={() => setShowSettingsDialog(true)}
                    disabled={!currentDashboard?.is_owner}
                  >
                    <Settings />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Export Dashboard">
                <IconButton onClick={() => setShowExportDialog(true)}>
                  <FileDownload />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit Dashboard">
                <span>
                  <IconButton onClick={toggleEditMode} disabled={!currentDashboard?.is_owner}>
                    <Edit />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="TV Mode">
                <IconButton onClick={() => setShowTVModeDialog(true)}>
                  <Fullscreen />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Dashboard Grid */}
      <Box className="dashboard-grid-container" sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: 'background.default' }}>
        {layout.items.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No widgets in this dashboard
            </Typography>
            {currentDashboard?.is_owner && (
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowAddChart(true)}
                sx={{ mt: 2 }}
              >
                Add Your First Chart
              </Button>
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
          currentDashboard={currentDashboard}
          layout={layout}
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
