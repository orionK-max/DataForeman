import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Box,
  Tabs,
  Tab,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CableIcon from '@mui/icons-material/Cable';
import useSetPageTitle from '../hooks/useSetPageTitle';
import { usePermissions } from '../contexts/PermissionsContext';
import SettingsIcon from '@mui/icons-material/Settings';
import LabelIcon from '@mui/icons-material/Label';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import connectivityService from '../services/connectivityService';
import OpcUaConnectionForm from '../components/connectivity/OpcUaConnectionForm';
import SavedConnectionsList from '../components/connectivity/SavedConnectionsList';
import LiveStatusSidebar from '../components/connectivity/LiveStatusSidebar';
import S7ConnectionForm from '../components/connectivity/S7ConnectionForm';
import S7SavedConnectionsList from '../components/connectivity/S7SavedConnectionsList';
import EIPConnectionForm from '../components/connectivity/EIPConnectionForm';
import EIPSavedConnectionsList from '../components/connectivity/EIPSavedConnectionsList';
import DeviceDiscovery from '../components/connectivity/DeviceDiscovery';
import OpcUaTagBrowser from '../components/connectivity/OpcUaTagBrowser';
import S7TagEntry from '../components/connectivity/S7TagEntry';
import EIPTagBrowser from '../components/connectivity/EIPTagBrowser';
import PollGroupsManager from '../components/connectivity/PollGroupsManager';
import UnitsOfMeasure from '../components/connectivity/UnitsOfMeasure';

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`connectivity-tabpanel-${index}`}
      aria-labelledby={`connectivity-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const Connectivity = () => {
  useSetPageTitle('Connectivity', 'Manage device connections for OPC UA, Siemens S7, and EtherNet/IP protocols');
  const { can } = usePermissions();
  
  // Main section: 'devices' or 'tags' or 'settings'
  const [section, setSection] = useState('devices');
  
  // Protocol tabs: 'opcua', 's7', or 'eip'
  const [protocolTab, setProtocolTab] = useState('opcua');
  
  // Settings tabs: 'poll-groups' or 'units'
  const [settingsTab, setSettingsTab] = useState('poll-groups');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Status data with auto-refresh
  const [status, setStatus] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Saved connections
  const [savedConnections, setSavedConnections] = useState([]);
  
  // Form visibility states
  const [showOpcuaForm, setShowOpcuaForm] = useState(false);
  const [showS7Form, setShowS7Form] = useState(false);
  const [showEipForm, setShowEipForm] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  
  // Edit state - tracks connection being edited
  const [editingOpcuaConnection, setEditingOpcuaConnection] = useState(null);
  const [editingS7Connection, setEditingS7Connection] = useState(null);
  const [editingEipConnection, setEditingEipConnection] = useState(null);
  
  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, connection: null });
  
  // Define loadStatus before useEffect to avoid TDZ error
  const loadStatus = useCallback(async () => {
    try {
      const data = await connectivityService.getStatus();
      setStatus(data?.items || []);
    } catch (err) {
      console.error('Failed to load status:', err);
      setError('Failed to load connectivity status.');
    }
  }, []);
  
  // Load status with auto-refresh
  useEffect(() => {
    loadStatus();
    
    let intervalId;
    if (autoRefresh) {
      intervalId = setInterval(() => {
        loadStatus();
      }, 10000); // Refresh every 10 seconds (reduced from 3s to prevent slowness)
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, loadStatus]);
  
  // Load saved connections
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([
          loadConnections(),
          loadStatus(),
        ]);
      } catch (err) {
        console.error('Failed to load initial data:', err);
        setError('Failed to load connectivity data. Please check your authentication.');
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, []);
  
  // Reload connections when switching to tags section
  useEffect(() => {
    if (section === 'tags') {
      loadConnections();
    }
  }, [section]);
  
  const loadConnections = async () => {
    try {
      const data = await connectivityService.getConnections();
      setSavedConnections(data?.items || []);
    } catch (err) {
      console.error('Failed to load connections:', err);
      setError('Failed to load saved connections.');
    }
  };
  
  const handleStartConnection = async (conn) => {
    try {
      await connectivityService.startConnection(conn);
      await Promise.all([
        connectivityService.saveConnection({ ...conn, enabled: true }),
        loadConnections(),
        loadStatus(),
      ]);
      setSnackbar({ open: true, message: `Started ${conn.id}`, severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: `Failed to start ${conn.id}`, severity: 'error' });
    }
  };
  
  const handleStopConnection = async (conn) => {
    try {
      await connectivityService.stopConnection(conn);
      await Promise.all([
        connectivityService.saveConnection({ ...conn, enabled: false }),
        loadConnections(),
        loadStatus(),
      ]);
      setSnackbar({ open: true, message: `Stopped ${conn.id}`, severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: `Failed to stop ${conn.id}`, severity: 'error' });
    }
  };
  
  const handleDeleteConnection = (conn) => {
    setDeleteDialog({ open: true, connection: conn });
  };

  const handleEditOpcuaConnection = (conn) => {
    setEditingOpcuaConnection(conn);
    setShowOpcuaForm(true);
  };

  const handleEditS7Connection = (conn) => {
    setEditingS7Connection(conn);
    setShowS7Form(true);
  };

  const handleEditEipConnection = (conn) => {
    setEditingEipConnection(conn);
    setShowEipForm(true);
  };
  
  const confirmDelete = async () => {
    const conn = deleteDialog.connection;
    if (!conn) return;
    
    try {
      await Promise.all([
        connectivityService.deleteConnection(conn.id),
        connectivityService.deleteConfig(conn.id),
      ]);
      await Promise.all([loadConnections(), loadStatus()]);
      setSnackbar({ open: true, message: `Deleted ${conn.id}`, severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: `Failed to delete ${conn.id}`, severity: 'error' });
    } finally {
      setDeleteDialog({ open: false, connection: null });
    }
  };
  
  const handleToggleAutoRefresh = (enabled) => {
    setAutoRefresh(enabled);
  };
  
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };
  
  const handleConnectionSaved = async (connection) => {
    try {
      // Save the connection to the database
      await connectivityService.saveConnection(connection);
      // Reload connections after saving
      await loadConnections();
      setSnackbar({ open: true, message: 'Connection saved successfully', severity: 'success' });
    } catch (error) {
      console.error('Failed to save connection:', error);
      setSnackbar({ 
        open: true, 
        message: `Failed to save connection: ${error.message}`, 
        severity: 'error' 
      });
    }
  };
  
  const handleConnectionTested = async (connection) => {
    // Return a mock "not implemented" response
    return {
      state: 'error',
      reason: 'Connection test not yet implemented for EIP/S7. Use "Save Connection" to add the connection and it will connect automatically.'
    };
  };
  
  const handleSectionChange = (event, newValue) => {
    setSection(newValue);
  };
  
  const handleProtocolTabChange = (event, newValue) => {
    setProtocolTab(newValue);
  };
  
  // Filter connections by protocol (hide system connections)
  const opcuaConnections = savedConnections
    .filter((c) => !c.is_system_connection)
    .filter((c) => (c?.type || 'opcua-client') === 'opcua-client');
  const s7Connections = savedConnections
    .filter((c) => !c.is_system_connection)
    .filter((c) => c?.type === 's7');
  const eipConnections = savedConnections
    .filter((c) => !c.is_system_connection)
    .filter((c) => c?.type === 'eip');
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box sx={{ position: 'relative' }}>
      {/* Live Status Sidebar */}
      <LiveStatusSidebar
        statuses={status}
        connections={savedConnections}
        autoRefresh={autoRefresh}
        onRefresh={loadStatus}
      />

      {/* Main Content - Add right padding when sidebar might overlap */}
      <Box sx={{ pr: { xs: 0, sm: 6 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      
        {/* Main Section Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={section} onChange={handleSectionChange}>
            <Tab
              icon={<SettingsIcon />}
              iconPosition="start"
              label="Devices"
              value="devices"
            />
            <Tab
              icon={<LabelIcon />}
              iconPosition="start"
              label="Tags"
              value="tags"
            />
            <Tab
              icon={<AccessTimeIcon />}
              iconPosition="start"
              label="Settings"
              value="settings"
            />
          </Tabs>
        </Box>
      
        {/* Devices Section */}
        {section === 'devices' && (
          <Box>
            {/* Protocol Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
              <Tabs value={protocolTab} onChange={handleProtocolTabChange}>
                <Tab label="OPC UA" value="opcua" />
                <Tab label="Siemens S7" value="s7" />
                <Tab label="EtherNet/IP" value="eip" />
              </Tabs>
            </Box>
          
          {/* OPC UA Tab */}
          <TabPanel value={protocolTab} index="opcua">
            {/* Setup New Connection Button */}
            <Box sx={{ mb: 3 }}>
              {can('connectivity.devices', 'create') && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setEditingOpcuaConnection(null);
                    setShowOpcuaForm(!showOpcuaForm);
                  }}
                  sx={{ mb: showOpcuaForm ? 2 : 0 }}
                >
                  {showOpcuaForm ? 'Hide Form' : 'Setup New Connection'}
                </Button>
              )}
              
              {/* Collapsible Form */}
              {showOpcuaForm && (
                <Box sx={{ mt: 2 }}>
                  <OpcUaConnectionForm 
                    initialConnection={editingOpcuaConnection}
                    onSave={(result) => {
                      handleConnectionSaved(result);
                      setShowOpcuaForm(false);
                      setEditingOpcuaConnection(null);
                    }}
                    onTest={handleConnectionTested}
                  />
                </Box>
              )}
            </Box>
            
            {/* Saved Connections List */}
            <SavedConnectionsList
              connections={opcuaConnections}
              statuses={status}
              onStart={handleStartConnection}
              onStop={handleStopConnection}
              onDelete={can('connectivity.devices', 'delete') ? handleDeleteConnection : null}
              onEdit={can('connectivity.devices', 'update') ? handleEditOpcuaConnection : null}
            />
          </TabPanel>
          
          {/* S7 Tab */}
          <TabPanel value={protocolTab} index="s7">
            {/* Setup New Connection Button */}
            <Box sx={{ mb: 3 }}>
              {can('connectivity.devices', 'create') && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setEditingS7Connection(null);
                    setShowS7Form(!showS7Form);
                  }}
                  sx={{ mb: showS7Form ? 2 : 0 }}
                >
                  {showS7Form ? 'Hide Form' : 'Setup New Connection'}
                </Button>
              )}
              
              {/* S7 Connection Form */}
              {showS7Form && (
                <Box sx={{ mt: 2 }}>
                  <S7ConnectionForm 
                    initialConnection={editingS7Connection}
                    onSave={(result) => {
                      handleConnectionSaved(result);
                      setShowS7Form(false);
                      setEditingS7Connection(null);
                    }}
                    onTest={handleConnectionTested}
                  />
                </Box>
              )}
            </Box>
            
            {/* Saved S7 Connections List */}
            <S7SavedConnectionsList
              connections={s7Connections}
              statuses={status}
              onStart={handleStartConnection}
              onStop={handleStopConnection}
              onDelete={can('connectivity.devices', 'delete') ? handleDeleteConnection : null}
              onEdit={can('connectivity.devices', 'update') ? handleEditS7Connection : null}
            />
          </TabPanel>
          
          {/* EIP Tab */}
          <TabPanel value={protocolTab} index="eip">
            {/* Action Buttons */}
            <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
              {can('connectivity.devices', 'create') && (
                <>
                  <Button
                    variant={showDiscovery ? 'outlined' : 'contained'}
                    startIcon={<SearchIcon />}
                    onClick={() => {
                      setShowDiscovery(!showDiscovery);
                      if (showEipForm) setShowEipForm(false);
                    }}
                  >
                    {showDiscovery ? 'Hide Discovery' : 'Discover Devices'}
                  </Button>
                  
                  <Button
                    variant={showEipForm ? 'outlined' : 'contained'}
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setEditingEipConnection(null);
                      setShowEipForm(!showEipForm);
                      if (showDiscovery) setShowDiscovery(false);
                    }}
                  >
                    {showEipForm ? 'Hide Form' : 'Setup New Connection'}
                  </Button>
                </>
              )}
            </Box>

            {/* Device Discovery Panel */}
            {showDiscovery && (
              <Box sx={{ mb: 3 }}>
                <DeviceDiscovery
                  onAddDevice={(deviceInfo) => {
                    // Pre-fill connection form with discovered device info
                    setEditingEipConnection({
                      type: 'eip',
                      name: deviceInfo.name,
                      host: deviceInfo.host,
                      slot: deviceInfo.slot,
                      port: 44818,
                      timeout_ms: 3000,
                      enabled: false,
                      // Store additional metadata for reference
                      _metadata: {
                        product_name: deviceInfo.productName,
                        vendor: deviceInfo.vendor,
                        serial: deviceInfo.serial,
                        revision: deviceInfo.revision,
                      }
                    });
                    setShowDiscovery(false);
                    setShowEipForm(true);
                  }}
                />
              </Box>
            )}
            
            {/* EIP Connection Form */}
            {showEipForm && (
              <Box sx={{ mb: 3 }}>
                <EIPConnectionForm 
                  initialConnection={editingEipConnection}
                  onSave={(result) => {
                    handleConnectionSaved(result);
                    setShowEipForm(false);
                    setEditingEipConnection(null);
                  }}
                  onTest={handleConnectionTested}
                />
              </Box>
            )}
            
            {/* Saved EIP Connections List */}
            <EIPSavedConnectionsList
              connections={eipConnections}
              statuses={status}
              onStart={handleStartConnection}
              onStop={handleStopConnection}
              onDelete={can('connectivity.devices', 'delete') ? handleDeleteConnection : null}
              onEdit={can('connectivity.devices', 'update') ? handleEditEipConnection : null}
            />
          </TabPanel>
        </Box>
      )}
      
      {/* Tags Section */}
      {section === 'tags' && (
        <Box>
          {/* Protocol Tabs for Tags */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={protocolTab} onChange={handleProtocolTabChange}>
              <Tab label="OPC UA" value="opcua" />
              <Tab label="Siemens S7" value="s7" />
              <Tab label="EtherNet/IP" value="eip" />
            </Tabs>
          </Box>

          {/* OPC UA Tags */}
          {protocolTab === 'opcua' && (
            <Box>
              <OpcUaTagBrowser 
                connectionId={null}
                connections={opcuaConnections}
                onTagsSaved={() => {
                  showSnackbar('Tags saved successfully!', 'success');
                }}
              />
            </Box>
          )}
          
          {protocolTab === 'opcua' && opcuaConnections.length === 0 && (
            <Alert severity="info">
              No OPC UA connections configured. Go to the Devices tab to create a connection first.
            </Alert>
          )}

          {/* S7 Tags */}
          {protocolTab === 's7' && s7Connections.length > 0 && (
            <Box>
              <S7TagEntry 
                connectionId={s7Connections[0]?.id}
                connections={s7Connections}
                onTagsSaved={() => {
                  showSnackbar('Tags saved successfully!', 'success');
                }}
              />
            </Box>
          )}
          
          {protocolTab === 's7' && s7Connections.length === 0 && (
            <Alert severity="info">
              No S7 connections configured. Go to the Devices tab to create a connection first.
            </Alert>
          )}

          {/* EIP Tags */}
          {protocolTab === 'eip' && eipConnections.length > 0 && (
            <Box>
              <EIPTagBrowser 
                connections={eipConnections}
                onTagsSaved={() => {
                  showSnackbar('Tags saved successfully!', 'success');
                }}
              />
            </Box>
          )}
          
          {protocolTab === 'eip' && eipConnections.length === 0 && (
            <Alert severity="info">
              No EtherNet/IP connections configured. Go to the Devices tab to create a connection first.
            </Alert>
          )}
        </Box>
      )}

      {/* Settings Section */}
      {section === 'settings' && (
        <Box>
          <Tabs value={settingsTab} onChange={(e, newValue) => setSettingsTab(newValue)}>
            <Tab label="Poll Groups" value="poll-groups" />
            <Tab label="Units of Measure" value="units" />
          </Tabs>
          
          <TabPanel value={settingsTab} index="poll-groups">
            <PollGroupsManager onNotify={showSnackbar} />
          </TabPanel>
          
          <TabPanel value={settingsTab} index="units">
            <UnitsOfMeasure onNotify={showSnackbar} />
          </TabPanel>
        </Box>
      )}
      
        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      
        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialog.open}
          onClose={() => setDeleteDialog({ open: false, connection: null })}
        >
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete connection "{deleteDialog.connection?.id}"?
              This will stop the connection and remove all saved configuration.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialog({ open: false, connection: null })}>
              Cancel
            </Button>
            <Button onClick={confirmDelete} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Connectivity;
