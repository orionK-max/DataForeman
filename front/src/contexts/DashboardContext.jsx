import React, { createContext, useContext, useState, useCallback } from 'react';
import dashboardService from '../services/dashboardService';
import chartComposerService from '../services/chartComposerService';

const DashboardContext = createContext();

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};

export const DashboardProvider = ({ children }) => {
  // Dashboard metadata
  const [currentDashboard, setCurrentDashboard] = useState(null); // { id, name, description, is_shared, is_owner }
  const [dashboardList, setDashboardList] = useState([]);
  
  // Layout state
  const [layout, setLayout] = useState(dashboardService.createDefaultLayout());
  const [editMode, setEditMode] = useState(false);
  
  // Selection state (for time sync)
  const [selectedWidgets, setSelectedWidgets] = useState(new Set());
  const [timeSyncGroups, setTimeSyncGroups] = useState(new Map()); // groupId -> Set<widgetId>
  
  // Global controls
  const [globalTimeRange, setGlobalTimeRange] = useState({
    from: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    to: new Date(),
  });
  const [globalAutoRefresh, setGlobalAutoRefresh] = useState(null);
  
  // Widget data - stores query results for each widget
  const [widgetData, setWidgetData] = useState(new Map()); // widgetId -> { items, loading, error, chartConfig }
  
  // TV Mode
  const [tvMode, setTvMode] = useState(false);
  const [tvRotationIndex, setTvRotationIndex] = useState(0);
  
  // Export state
  const [exporting, setExporting] = useState(false);
  
  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load dashboard by ID
  const loadDashboard = useCallback(async (dashboardId) => {
    setLoading(true);
    setError('');
    setSelectedWidgets(new Set());
    setWidgetData(new Map());
    
    try {
      const dashboard = await dashboardService.getDashboard(dashboardId);
      
      setCurrentDashboard({
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        is_shared: dashboard.is_shared,
        is_owner: dashboard.is_owner,
      });
      
      // Set layout
      const dashboardLayout = dashboard.layout || dashboardService.createDefaultLayout();
      setLayout(dashboardLayout);
      
      // Reset time sync groups (temporary troubleshooting tool, not persisted)
      setTimeSyncGroups(new Map());
      
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save current dashboard
  const saveDashboard = useCallback(async () => {
    if (!currentDashboard?.id) {
      setError('No dashboard loaded');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Don't save time sync groups - they're temporary troubleshooting tools
      await dashboardService.updateDashboard(currentDashboard.id, {
        name: currentDashboard.name,
        description: currentDashboard.description,
        is_shared: currentDashboard.is_shared,
        layout: layout,
      });
      
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err.message || 'Failed to save dashboard');
      console.error('Failed to save dashboard:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentDashboard, layout]);

  // Create new dashboard
  const createDashboard = useCallback(async (name, description = '') => {
    setLoading(true);
    setError('');
    
    try {
      const dashboard = await dashboardService.createDashboard({
        name,
        description,
        is_shared: false,
        layout: dashboardService.createDefaultLayout(),
      });
      
      setCurrentDashboard({
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        is_shared: dashboard.is_shared,
        is_owner: dashboard.is_owner,
      });
      
      setLayout(dashboard.layout);
      setHasUnsavedChanges(false);
      
      return dashboard;
    } catch (err) {
      setError(err.message || 'Failed to create dashboard');
      console.error('Failed to create dashboard:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete dashboard
  const deleteDashboard = useCallback(async (dashboardId) => {
    setLoading(true);
    setError('');
    
    try {
      await dashboardService.deleteDashboard(dashboardId);
      
      // If we deleted the current dashboard, clear it
      if (currentDashboard?.id === dashboardId) {
        setCurrentDashboard(null);
        setLayout(dashboardService.createDefaultLayout());
        setWidgetData(new Map());
        setSelectedWidgets(new Set());
        setTimeSyncGroups(new Map());
      }
    } catch (err) {
      setError(err.message || 'Failed to delete dashboard');
      console.error('Failed to delete dashboard:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentDashboard]);

  // Load dashboard list
  const loadDashboardList = useCallback(async (scope = 'all') => {
    setLoading(true);
    setError('');
    
    try {
      const result = await dashboardService.listDashboards(scope);
      setDashboardList(result.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboards');
      console.error('Failed to load dashboards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    setEditMode(prev => !prev);
    // Clear selection and time sync when exiting edit mode
    if (editMode) {
      setSelectedWidgets(new Set());
      // Clear time sync groups and global time range when exiting edit mode
      setTimeSyncGroups(new Map());
      setGlobalTimeRange(null);
    }
  }, [editMode]);

  // Add widget to dashboard
  const addWidget = useCallback((chartId, position = null) => {
    const widgetId = `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate position if not provided
    let x = 0, y = 0;
    if (position) {
      x = position.x;
      y = position.y;
    } else {
      // Find the bottom-most widget and place below it
      const maxY = layout.items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      y = maxY;
    }
    
    const newWidget = {
      i: widgetId,
      type: 'chart', // Explicitly set type for clarity
      x,
      y,
      w: 6, // Default width: half screen
      h: 4, // Default height: 4 rows
      chart_id: chartId,
      title_override: null,
      time_sync_group: null,
      refresh_override: null,
      minW: 2,
      minH: 2,
      maxW: 12,
      maxH: 12,
    };
    
    setLayout(prev => ({
      ...prev,
      items: [...prev.items, newWidget],
    }));
    
    setHasUnsavedChanges(true);
  }, [layout.items]);

  // Add flow widget to dashboard
  const addFlowWidget = useCallback((flowId, position = null) => {
    const widgetId = `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate position if not provided
    let x = 0, y = 0;
    if (position) {
      x = position.x;
      y = position.y;
    } else {
      // Find the bottom-most widget and place below it
      const maxY = layout.items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      y = maxY;
    }
    
    const newWidget = {
      i: widgetId,
      type: 'flow',
      x,
      y,
      w: 4, // Default width: smaller for flow widgets
      h: 3, // Default height: 3 rows
      flow_id: flowId,
      config: {
        title_override: null,
        hide_title: false,
      },
      minW: 2,
      minH: 2,
      maxW: 12,
      maxH: 12,
    };
    
    setLayout(prev => ({
      ...prev,
      items: [...prev.items, newWidget],
    }));
    
    setHasUnsavedChanges(true);
  }, [layout.items]);

  // Remove widget
  const removeWidget = useCallback((widgetId) => {
    setLayout(prev => ({
      ...prev,
      items: prev.items.filter(item => item.i !== widgetId),
    }));
    
    // Remove from widget data
    setWidgetData(prev => {
      const newMap = new Map(prev);
      newMap.delete(widgetId);
      return newMap;
    });
    
    // Remove from any sync groups
    setTimeSyncGroups(prev => {
      const newGroups = new Map();
      prev.forEach((widgetIds, groupId) => {
        const filtered = new Set(Array.from(widgetIds).filter(id => id !== widgetId));
        if (filtered.size > 0) {
          newGroups.set(groupId, filtered);
        }
      });
      return newGroups;
    });
    
    // Remove from selection
    setSelectedWidgets(prev => {
      const newSet = new Set(prev);
      newSet.delete(widgetId);
      return newSet;
    });
    
    setHasUnsavedChanges(true);
  }, []);

  // Update widget property
  const updateWidgetProperty = useCallback((widgetId, property, value) => {
    setLayout(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.i === widgetId 
          ? { ...item, [property]: value }
          : item
      ),
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Update widget position/size
  const updateLayout = useCallback((newLayoutItems) => {
    setLayout(prev => ({
      ...prev,
      items: newLayoutItems,
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Toggle widget selection
  const toggleWidgetSelection = useCallback((widgetId, multiSelect = false) => {
    setSelectedWidgets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(widgetId)) {
        // If already selected, deselect it
        newSet.delete(widgetId);
      } else {
        // If not selected, add it
        // If not in multi-select mode, clear others first
        if (!multiSelect) {
          newSet.clear();
        }
        newSet.add(widgetId);
      }
      return newSet;
    });
  }, []);

  // Create time sync group from selected widgets (temporary session state)
  const createTimeSyncGroup = useCallback((groupName = null) => {
    if (selectedWidgets.size === 0) return null;
    
    const groupId = groupName || `group-${Date.now()}`;
    
    setTimeSyncGroups(prev => {
      const newGroups = new Map(prev);
      newGroups.set(groupId, new Set(selectedWidgets));
      return newGroups;
    });
    
    // Don't mark as unsaved - time sync is temporary
    return groupId;
  }, [selectedWidgets]);

  // Remove time sync group (temporary session state)
  const removeTimeSyncGroup = useCallback((groupId) => {
    setTimeSyncGroups(prev => {
      const newGroups = new Map(prev);
      newGroups.delete(groupId);
      return newGroups;
    });
    // Don't mark as unsaved - time sync is temporary
  }, []);

  // Add widget to sync group (temporary session state, not persisted)
  const addWidgetToSyncGroup = useCallback((widgetId, groupId) => {
    setTimeSyncGroups(prev => {
      const newGroups = new Map(prev);
      const group = newGroups.get(groupId) || new Set();
      group.add(widgetId);
      newGroups.set(groupId, group);
      return newGroups;
    });
    // Don't mark as unsaved - time sync is temporary
  }, []);

  // Remove widget from sync group (temporary session state, not persisted)
  const removeWidgetFromSyncGroup = useCallback((widgetId, groupId) => {
    setTimeSyncGroups(prev => {
      const newGroups = new Map(prev);
      const group = newGroups.get(groupId);
      if (group) {
        group.delete(widgetId);
        if (group.size === 0) {
          newGroups.delete(groupId);
        }
      }
      return newGroups;
    });
    // Don't mark as unsaved - time sync is temporary
  }, []);

  // Set time range for sync group
  const setSyncGroupTimeRange = useCallback((groupId, from, to) => {
    const group = timeSyncGroups.get(groupId);
    if (!group) return;
    
    // Update time range for all widgets in the group
    // This will be handled by individual widgets listening to this change
    // For now, just update global state that widgets can subscribe to
    setGlobalTimeRange({ from, to });
  }, [timeSyncGroups]);

  // Sync time range across multiple widgets (temporary session state)
  const syncTimeRange = useCallback((timeRange, widgetIds) => {
    // Instead of storing in layout, just update the global time range
    // Widgets in sync groups will use globalTimeRange automatically
    setGlobalTimeRange(timeRange);
    // Don't mark as unsaved - time sync is temporary
  }, []);

  // Update widget data (called by widgets when they fetch data)
  const setWidgetDataState = useCallback((widgetId, data) => {
    setWidgetData(prev => {
      const newMap = new Map(prev);
      newMap.set(widgetId, data);
      return newMap;
    });
  }, []);

  // Toggle TV mode
  const toggleTVMode = useCallback(() => {
    setTvMode(prev => !prev);
    if (!tvMode) {
      setEditMode(false); // Exit edit mode when entering TV mode
    }
  }, [tvMode]);

  const value = {
    // Dashboard metadata
    currentDashboard,
    setCurrentDashboard,
    dashboardList,
    
    // Layout state
    layout,
    setLayout,
    editMode,
    setEditMode,
    toggleEditMode,
    
    // Selection state
    selectedWidgets,
    setSelectedWidgets,
    toggleWidgetSelection,
    timeSyncGroups,
    setTimeSyncGroups,
    
    // Global controls
    globalTimeRange,
    setGlobalTimeRange,
    globalAutoRefresh,
    setGlobalAutoRefresh,
    
    // Widget data
    widgetData,
    setWidgetDataState,
    
    // TV Mode
    tvMode,
    setTvMode,
    toggleTVMode,
    tvRotationIndex,
    setTvRotationIndex,
    
    // Export
    exporting,
    setExporting,
    
    // Loading states
    loading,
    error,
    setError,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    
    // Actions
    loadDashboard,
    saveDashboard,
    createDashboard,
    deleteDashboard,
    loadDashboardList,
    addWidget,
    addFlowWidget,
    removeWidget,
    updateWidgetProperty,
    updateLayout,
    createTimeSyncGroup,
    removeTimeSyncGroup,
    addWidgetToSyncGroup,
    removeWidgetFromSyncGroup,
    setSyncGroupTimeRange,
    syncTimeRange,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

