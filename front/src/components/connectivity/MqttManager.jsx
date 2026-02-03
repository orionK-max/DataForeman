import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  CircularProgress,
  Tooltip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudIcon from '@mui/icons-material/Cloud';
import RouterIcon from '@mui/icons-material/Router';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import PublishIcon from '@mui/icons-material/Publish';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import mqttService from '../../services/mqttService';
import MqttConnectionForm from './MqttConnectionForm';
import MqttSubscriptionForm from './MqttSubscriptionForm';
import MqttPublisherForm from './MqttPublisherForm';
import MqttRecentMessages from './MqttRecentMessages';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const MqttManager = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [publishers, setPublishers] = useState([]);
  const [brokerStatus, setBrokerStatus] = useState(null);
  const [clients, setClients] = useState([]);
  
  // Form dialogs
  const [connectionFormOpen, setConnectionFormOpen] = useState(false);
  const [subscriptionFormOpen, setSubscriptionFormOpen] = useState(false);
  const [publisherFormOpen, setPublisherFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [editingPublisher, setEditingPublisher] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  
  // Recent messages viewer
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(null);
  
  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: null, item: null });
  
  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  // Load data
  const loadConnections = useCallback(async () => {
    try {
      const data = await mqttService.getConnections();
      setConnections(data);
    } catch (err) {
      console.error('Failed to load connections:', err);
      showSnackbar('Failed to load MQTT connections', 'error');
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    try {
      const data = await mqttService.getSubscriptions();
      setSubscriptions(data);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      showSnackbar('Failed to load subscriptions', 'error');
    }
  }, []);

  const loadPublishers = useCallback(async () => {
    try {
      const data = await mqttService.getPublishers();
      setPublishers(data);
    } catch (err) {
      console.error('Failed to load publishers:', err);
      showSnackbar('Failed to load publishers', 'error');
    }
  }, []);

  const loadBrokerStatus = useCallback(async () => {
    try {
      const status = await mqttService.getBrokerStatus();
      setBrokerStatus(status);
      
      const clientsData = await mqttService.getClients();
      setClients(clientsData);
    } catch (err) {
      console.error('Failed to load broker status:', err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadConnections(),
        loadSubscriptions(),
        loadPublishers(),
        loadBrokerStatus(),
      ]);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [loadConnections, loadSubscriptions, loadPublishers, loadBrokerStatus]);

  useEffect(() => {
    loadAll();
    
    // Auto-refresh broker status every 10 seconds
    const interval = setInterval(loadBrokerStatus, 10000);
    return () => clearInterval(interval);
  }, [loadAll, loadBrokerStatus]);

  // Connection handlers
  const handleCreateConnection = async (formData) => {
    try {
      await mqttService.createConnection(formData);
      showSnackbar('MQTT connection created successfully');
      loadConnections();
      setConnectionFormOpen(false);
    } catch (err) {
      throw new Error(err.message || 'Failed to create connection');
    }
  };

  const handleUpdateConnection = async (formData) => {
    try {
      await mqttService.updateConnection(editingConnection.connection_id, formData);
      showSnackbar('Connection updated successfully');
      loadConnections();
      setConnectionFormOpen(false);
      setEditingConnection(null);
    } catch (err) {
      throw new Error(err.message || 'Failed to update connection');
    }
  };

  const handleDeleteConnection = async () => {
    try {
      await mqttService.deleteConnection(deleteDialog.item.connection_id);
      showSnackbar('Connection deleted successfully');
      loadConnections();
      setDeleteDialog({ open: false, type: null, item: null });
    } catch (err) {
      showSnackbar('Failed to delete connection', 'error');
    }
  };

  // Subscription handlers
  const handleCreateSubscription = async (formData) => {
    try {
      await mqttService.createSubscription(formData);
      showSnackbar('Subscription created successfully');
      loadSubscriptions();
      setSubscriptionFormOpen(false);
    } catch (err) {
      throw new Error(err.message || 'Failed to create subscription');
    }
  };

  const handleUpdateSubscription = async (formData) => {
    try {
      await mqttService.updateSubscription(editingSubscription.id, formData);
      showSnackbar('Subscription updated successfully');
      loadSubscriptions();
      setSubscriptionFormOpen(false);
      setEditingSubscription(null);
    } catch (err) {
      throw new Error(err.message || 'Failed to update subscription');
    }
  };

  const handleDeleteSubscription = async () => {
    try {
      await mqttService.deleteSubscription(deleteDialog.item.id);
      showSnackbar('Subscription deleted successfully');
      loadSubscriptions();
      setDeleteDialog({ open: false, type: null, item: null });
    } catch (err) {
      showSnackbar('Failed to delete subscription', 'error');
    }
  };

  // Publisher handlers
  const handleOpenPublisherForm = (connectionId, publisher = null) => {
    setSelectedConnectionId(connectionId);
    setEditingPublisher(publisher);
    setPublisherFormOpen(true);
  };

  const handleClosePublisherForm = () => {
    setPublisherFormOpen(false);
    setEditingPublisher(null);
    setSelectedConnectionId(null);
  };

  const handleSavePublisher = () => {
    showSnackbar(editingPublisher ? 'Publisher updated successfully' : 'Publisher created successfully');
    loadPublishers();
    handleClosePublisherForm();
  };

  const handleDeletePublisher = async () => {
    try {
      await mqttService.deletePublisher(deleteDialog.item.id);
      showSnackbar('Publisher deleted successfully');
      loadPublishers();
      setDeleteDialog({ open: false, type: null, item: null });
    } catch (err) {
      showSnackbar('Failed to delete publisher', 'error');
    }
  };

  const openEditConnection = (connection) => {
    setEditingConnection(connection);
    setConnectionFormOpen(true);
  };

  const openEditSubscription = (subscription) => {
    setEditingSubscription(subscription);
    setSubscriptionFormOpen(true);
  };

  const openDeleteDialog = (type, item) => {
    setDeleteDialog({ open: true, type, item });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab icon={<RouterIcon />} label="Connections" iconPosition="start" />
          <Tab icon={<SubscriptionsIcon />} label="Subscriptions" iconPosition="start" />
          <Tab icon={<PublishIcon />} label="Publishers" iconPosition="start" />
        </Tabs>
      </Box>

      {/* Connections Tab */}
      <TabPanel value={tabValue} index={0}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">MQTT Connections</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingConnection(null);
              setConnectionFormOpen(true);
            }}
          >
            New Connection
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Protocol</TableCell>
                <TableCell>Broker</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      No MQTT connections configured. Click "New Connection" to add one.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                connections.map((conn, idx) => (
                  <TableRow key={conn.connection_id ?? conn.id ?? conn.name ?? `conn-${idx}`}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {conn.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={conn.protocol} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {conn.broker_host}:{conn.broker_port}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {conn.enabled ? (
                        <Chip 
                          icon={<CheckCircleIcon />}
                          label="Enabled" 
                          size="small" 
                          color="success"
                        />
                      ) : (
                        <Chip 
                          icon={<ErrorIcon />}
                          label="Disabled" 
                          size="small"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        size="small" 
                        onClick={() => openEditConnection(conn)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        onClick={() => openDeleteDialog('connection', conn)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Subscriptions Tab */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">MQTT Subscriptions</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingSubscription(null);
              setSelectedConnectionId(connections[0]?.connection_id || null);
              setSubscriptionFormOpen(true);
            }}
            disabled={connections.length === 0}
          >
            New Subscription
          </Button>
        </Box>

        {connections.length === 0 ? (
          <Alert severity="info">
            Create an MQTT connection first before adding subscriptions.
          </Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Connection</TableCell>
                  <TableCell>Topic</TableCell>
                  <TableCell>QoS</TableCell>
                  <TableCell>Format</TableCell>
                  <TableCell>Tag Prefix</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary" sx={{ py: 3 }}>
                        No subscriptions configured. Click "New Subscription" to add one.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((sub, idx) => {
                    const conn = connections.find(c => c.connection_id === sub.connection_id);
                    const rowKey = sub.id ?? sub.subscription_id ?? `${sub.connection_id ?? 'unknown'}:${sub.topic ?? 'unknown'}:${idx}`;
                    return (
                      <TableRow key={rowKey}>
                        <TableCell>
                          <Typography variant="body2">
                            {conn?.name || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace">
                            {sub.topic}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={`QoS ${sub.qos}`} size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip label={sub.payload_format} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace">
                            {sub.tag_prefix || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {sub.enabled ? (
                            <Chip 
                              icon={<CheckCircleIcon />}
                              label="Enabled" 
                              size="small" 
                              color="success"
                            />
                          ) : (
                            <Chip 
                              icon={<ErrorIcon />}
                              label="Disabled" 
                              size="small"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <IconButton 
                            size="small" 
                            onClick={() => openEditSubscription(sub)}
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            onClick={() => openDeleteDialog('subscription', sub)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                          <Tooltip title="View recent messages">
                            <IconButton
                              size="small"
                              onClick={() => setSelectedSubscriptionId(sub.id)}
                              color={selectedSubscriptionId === sub.id ? 'primary' : 'default'}
                            >
                              <SubscriptionsIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Recent Messages Viewer */}
        {selectedSubscriptionId && (
          <MqttRecentMessages 
            subscriptionId={selectedSubscriptionId}
            autoRefresh={true}
            refreshInterval={3000}
          />
        )}
      </TabPanel>

      {/* Publishers Tab */}
      <TabPanel value={tabValue} index={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">MQTT Publishers</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenPublisherForm(connections[0]?.connection_id || null)}
            disabled={connections.length === 0}
          >
            New Publisher
          </Button>
        </Box>

        {connections.length === 0 ? (
          <Alert severity="info">
            Create an MQTT connection first before adding publishers.
          </Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Connection</TableCell>
                  <TableCell>Publisher Name</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Interval</TableCell>
                  <TableCell>Format</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {publishers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography color="text.secondary" sx={{ py: 3 }}>
                        No publishers configured. Click "New Publisher" to add one.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  publishers.map((pub, idx) => {
                    const conn = connections.find(c => c.connection_id === pub.connection_id);
                    const rowKey = pub.id ?? pub.publisher_id ?? `${pub.connection_id ?? 'unknown'}:${pub.name ?? 'unknown'}:${idx}`;
                    return (
                      <TableRow key={rowKey}>
                        <TableCell>
                          <Typography variant="body2">
                            {conn?.name || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {pub.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={pub.publish_mode} 
                            size="small" 
                            color={pub.publish_mode === 'both' ? 'primary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {pub.interval_ms ? `${pub.interval_ms}ms` : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip label={pub.payload_format} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={`${pub.mappings?.length || 0} tags`} 
                            size="small" 
                            color="info"
                          />
                        </TableCell>
                        <TableCell>
                          {pub.enabled ? (
                            <Chip 
                              icon={<CheckCircleIcon />}
                              label="Enabled" 
                              size="small" 
                              color="success"
                            />
                          ) : (
                            <Chip 
                              icon={<ErrorIcon />}
                              label="Disabled" 
                              size="small"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <IconButton 
                            size="small" 
                            onClick={() => handleOpenPublisherForm(pub.connection_id, pub)}
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            onClick={() => openDeleteDialog('publisher', pub)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Connection Form Dialog */}
      <MqttConnectionForm
        open={connectionFormOpen}
        onClose={() => {
          setConnectionFormOpen(false);
          setEditingConnection(null);
        }}
        onSubmit={editingConnection ? handleUpdateConnection : handleCreateConnection}
        initialData={editingConnection}
        isEditing={!!editingConnection}
      />

      {/* Subscription Form Dialog */}
      <MqttSubscriptionForm
        open={subscriptionFormOpen}
        onClose={() => {
          setSubscriptionFormOpen(false);
          setEditingSubscription(null);
        }}
        onSubmit={editingSubscription ? handleUpdateSubscription : handleCreateSubscription}
        connectionId={selectedConnectionId}
        initialData={editingSubscription}
        isEditing={!!editingSubscription}
      />

      {/* Publisher Form Dialog */}
      <MqttPublisherForm
        open={publisherFormOpen}
        onClose={handleClosePublisherForm}
        onSave={handleSavePublisher}
        connectionId={selectedConnectionId}
        publisher={editingPublisher}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, type: null, item: null })}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this {deleteDialog.type}?
            {deleteDialog.type === 'connection' && ' This will also delete all associated subscriptions and publishers.'}
            {deleteDialog.type === 'publisher' && ' This will also delete all tag mappings for this publisher.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, type: null, item: null })}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (deleteDialog.type === 'connection') handleDeleteConnection();
              else if (deleteDialog.type === 'subscription') handleDeleteSubscription();
              else if (deleteDialog.type === 'publisher') handleDeletePublisher();
            }}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MqttManager;
