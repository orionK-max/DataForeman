import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  FormControlLabel,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
import DevicesIcon from '@mui/icons-material/Devices';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import mqttService from '../../services/mqttService';

const STATUS_CHIP = {
  disabled:    <Chip label="Disabled" color="default" size="small" />,
  ready:       <Chip label="Ready - No data yet" color="warning" size="small" />,
  not_active:  <Chip label="Not Active" sx={{ bgcolor: '#ff9800', color: 'white' }} size="small" />,
  connected:   <Chip label="Connected" color="success" size="small" />,
};

const formatTimeAgo = (seconds) => {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const MqttDeviceCredentials = ({ onNotify, requireAuth, onAuthChange, section = 'both' }) => {
  const [credentials, setCredentials] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Credential group form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    enabled: true,
    timeout_seconds: 600,
  });
  const [validationErrors, setValidationErrors] = useState({});

  // Delete dialogs
  const [deleteCredentialDialog, setDeleteCredentialDialog] = useState(null);
  const [deleteDeviceDialog, setDeleteDeviceDialog] = useState(null);

  // Edit display name dialog
  const [editNameDialog, setEditNameDialog] = useState(null); // holds device object
  const [editNameValue, setEditNameValue] = useState('');

  // Expanded device rows (Set of device IDs)
  const [expandedDevices, setExpandedDevices] = useState(new Set());

  const toggleExpanded = (deviceId) => {
    setExpandedDevices(prev => {
      const next = new Set(prev);
      next.has(deviceId) ? next.delete(deviceId) : next.add(deviceId);
      return next;
    });
  };

  useEffect(() => {
    loadAll();
    if (section !== 'credentials') {
      const interval = setInterval(loadDevices, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [creds, devs, authSetting] = await Promise.all([
        mqttService.getDeviceCredentials(),
        mqttService.getDevices(),
        mqttService.getAuthSetting(),
      ]);
      setCredentials(creds);
      setDevices(devs);
      onAuthChange?.(authSetting.mqtt_require_auth);
    } catch (err) {
      console.error('Failed to load MQTT device data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const devs = await mqttService.getDevices();
      setDevices(devs);
    } catch (err) {
      // Polling — don't surface errors
    }
  };

  const handleAuthToggle = async () => {
    try {
      const newValue = !requireAuth;
      await mqttService.updateAuthSetting(newValue);
      onAuthChange?.(newValue);
      onNotify?.(
        newValue
          ? 'Authentication enabled. Devices must provide credentials.'
          : 'Anonymous mode active. Any device can connect.',
        'success'
      );
    } catch (err) {
      onNotify?.('Failed to update authentication setting', 'error');
    }
  };

  // ─── Credential Group CRUD ───────────────────────────────────────────────

  const openCredentialDialog = (credential = null) => {
    setEditingCredential(credential);
    setValidationErrors({});
    setFormData(credential
      ? { name: credential.name, username: credential.username, password: '', enabled: credential.enabled, timeout_seconds: credential.timeout_seconds || 600 }
      : { name: '', username: '', password: '', enabled: true, timeout_seconds: 600 }
    );
    setDialogOpen(true);
  };

  const closeCredentialDialog = () => {
    setDialogOpen(false);
    setEditingCredential(null);
    setValidationErrors({});
  };

  const validateCredentialForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!editingCredential && !formData.username.trim()) errors.username = 'Username is required';
    const t = parseInt(formData.timeout_seconds);
    if (isNaN(t) || t < 1 || t > 86400) errors.timeout_seconds = 'Must be between 1 and 86400 seconds';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveCredential = async () => {
    if (!validateCredentialForm()) return;
    try {
      if (editingCredential) {
        const updates = { name: formData.name.trim(), enabled: formData.enabled, timeout_seconds: formData.timeout_seconds };
        if (formData.password) updates.password = formData.password.trim();
        await mqttService.updateDeviceCredential(editingCredential.id, updates);
        onNotify?.('Credential group updated', 'success');
      } else {
        const payload = {
          name: formData.name.trim(),
          username: formData.username.trim(),
          enabled: formData.enabled,
          timeout_seconds: formData.timeout_seconds,
        };
        if (formData.password.trim()) payload.password = formData.password.trim();
        await mqttService.createDeviceCredential(payload);
        onNotify?.('Credential group created', 'success');
      }
      closeCredentialDialog();
      loadAll();
    } catch (err) {
      onNotify?.('Failed to save credential group', 'error');
    }
  };

  const deleteCredential = async () => {
    try {
      await mqttService.deleteDeviceCredential(deleteCredentialDialog.id);
      onNotify?.('Credential group deleted', 'success');
      setDeleteCredentialDialog(null);
      loadAll();
    } catch (err) {
      onNotify?.('Failed to delete credential group', 'error');
    }
  };

  const toggleCredentialEnabled = async (credential) => {
    try {
      await mqttService.updateDeviceCredential(credential.id, { enabled: !credential.enabled });
      onNotify?.(credential.enabled ? 'Group disabled' : 'Group enabled', 'success');
      loadAll();
    } catch (err) {
      onNotify?.('Failed to update credential group', 'error');
    }
  };

  // ─── Device CRUD ─────────────────────────────────────────────────────────

  const toggleDeviceEnabled = async (device) => {
    try {
      await mqttService.updateDevice(device.id, { enabled: !device.enabled });
      onNotify?.(device.enabled ? 'Device disabled' : 'Device enabled', 'success');
      loadDevices();
    } catch (err) {
      onNotify?.('Failed to update device', 'error');
    }
  };

  const openEditName = (device) => {
    setEditNameDialog(device);
    setEditNameValue(device.display_name || '');
  };

  const saveDisplayName = async () => {
    try {
      await mqttService.updateDevice(editNameDialog.id, { display_name: editNameValue.trim() || null });
      onNotify?.('Display name updated', 'success');
      setEditNameDialog(null);
      loadDevices();
    } catch (err) {
      onNotify?.('Failed to update display name', 'error');
    }
  };

  const deleteDevice = async () => {
    try {
      await mqttService.deleteDevice(deleteDeviceDialog.id);
      onNotify?.('Device removed', 'success');
      setDeleteDeviceDialog(null);
      loadDevices();
    } catch (err) {
      onNotify?.('Failed to remove device', 'error');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  const isSaveDisabled =
    !formData.name.trim() ||
    (!editingCredential && !formData.username.trim()) ||
    formData.timeout_seconds === '' ||
    isNaN(parseInt(formData.timeout_seconds)) ||
    parseInt(formData.timeout_seconds) < 1 ||
    parseInt(formData.timeout_seconds) > 86400;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Credential Groups */}
      {section !== 'devices' && (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <SecurityIcon fontSize="small" />
              <Typography variant="h6">Credential Groups</Typography>
            </Box>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCredentialDialog()}>
              Add Group
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            Devices share credentials within a group. Each device connecting with the correct
            username/password is automatically registered using its MQTT client ID.
          </Alert>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Username</TableCell>
                  <TableCell align="center">Devices</TableCell>
                  <TableCell>Timeout</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {credentials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="textSecondary" sx={{ py: 3 }}>
                        No credential groups yet. Add one to allow devices to connect.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  credentials.map((cred) => (
                    <TableRow key={cred.id}>
                      <TableCell>{cred.name}</TableCell>
                      <TableCell><code>{cred.username}</code></TableCell>
                      <TableCell align="center">{cred.device_count ?? 0}</TableCell>
                      <TableCell>{cred.timeout_seconds}s</TableCell>
                      <TableCell>
                        <Switch
                          checked={cred.enabled}
                          size="small"
                          onChange={() => toggleCredentialEnabled(cred)}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openCredentialDialog(cred)} title="Edit">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => setDeleteCredentialDialog(cred)} title="Delete">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      )}

      {/* Registered Devices */}
      {section !== 'credentials' && (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <DevicesIcon fontSize="small" />
            <Typography variant="h6">Registered Devices</Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            Devices are registered automatically when they first connect with valid credentials.
            Status tracks the last known connection time.
          </Alert>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={32} />
                  <TableCell>Client ID</TableCell>
                  <TableCell>Display Name</TableCell>
                  <TableCell>Group</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Seen</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="textSecondary" sx={{ py: 3 }}>
                        No devices registered yet. Devices appear here after their first successful connection.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((device) => (
                    <React.Fragment key={device.id}>
                    <TableRow>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleExpanded(device.id)}>
                          {expandedDevices.has(device.id) ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell><code>{device.client_id}</code></TableCell>
                      <TableCell>
                        <Typography variant="body2" color={device.display_name ? 'textPrimary' : 'textSecondary'}>
                          {device.display_name || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>{device.group_name}</TableCell>
                      <TableCell>
                        {device.status === 'auth_failed'
                          ? <Chip
                              label={`Auth Failed${device.authFailure ? ` (${device.authFailure.failureCount})` : ''}`}
                              color="error"
                              size="small"
                            />
                          : STATUS_CHIP[device.status] ?? <Chip label="Unknown" color="default" size="small" />
                        }
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={device.lastSeenAgo ? 'textPrimary' : 'textSecondary'}>
                          {formatTimeAgo(device.lastSeenAgo) ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={device.enabled}
                          size="small"
                          onChange={() => toggleDeviceEnabled(device)}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditName(device)} title="Edit display name">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => setDeleteDeviceDialog(device)} title="Remove">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow key={`${device.id}-topics`}>
                      <TableCell colSpan={8} sx={{ py: 0, borderBottom: expandedDevices.has(device.id) ? undefined : 'none' }}>
                        <Collapse in={expandedDevices.has(device.id)} timeout="auto" unmountOnExit>
                          <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderRadius: 1, my: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                              Published Topics
                            </Typography>
                            {(!device.topics || device.topics.length === 0) ? (
                              <Typography variant="body2" color="text.secondary">
                                No topics recorded yet. Topics appear here as the device publishes messages.
                              </Typography>
                            ) : (
                              <Box component="ul" sx={{ m: 0, pl: 2, listStyle: 'disc' }}>
                                {device.topics.map(t => (
                                  <Box component="li" key={t.topic} sx={{ py: 0.25 }}>
                                    <Typography
                                      variant="body2"
                                      title={`Last seen: ${t.last_seen ? new Date(t.last_seen).toLocaleString() : '—'}`}
                                      sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                                    >
                                      {t.topic}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      )}

      {/* Create/Edit Credential Group Dialog */}
      <Dialog open={dialogOpen} onClose={closeCredentialDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCredential ? 'Edit Credential Group' : 'Add Credential Group'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Group Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
              error={!!validationErrors.name}
              helperText={validationErrors.name || 'A descriptive label for this credential group'}
              autoComplete="off"
            />
            <TextField
              label="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value.trim() })}
              fullWidth
              required
              disabled={!!editingCredential}
              error={!!validationErrors.username}
              helperText={validationErrors.username || (editingCredential ? 'Username cannot be changed' : 'MQTT username shared by all devices in this group')}
              autoComplete="off"
              inputProps={{ autoComplete: 'new-username' }}
            />
            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              fullWidth
              error={!!validationErrors.password}
              helperText={editingCredential ? 'Leave blank to keep current password' : 'MQTT password (optional when authentication is disabled)'}
              autoComplete="new-password"
              inputProps={{ autoComplete: 'new-password' }}
            />
            <TextField
              label="Timeout (seconds)"
              type="number"
              value={formData.timeout_seconds}
              onChange={(e) => setFormData({ ...formData, timeout_seconds: e.target.value === '' ? '' : parseInt(e.target.value) })}
              fullWidth
              required
              error={!!validationErrors.timeout_seconds}
              helperText={validationErrors.timeout_seconds || 'Time since last connection before device is considered Not Active (1–86400)'}
              inputProps={{ min: 1, max: 86400 }}
            />
            <FormControlLabel
              control={<Switch checked={formData.enabled} onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} />}
              label="Enabled"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCredentialDialog}>Cancel</Button>
          <Button onClick={saveCredential} variant="contained" disabled={isSaveDisabled}>
            {editingCredential ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Credential Group Dialog */}
      <Dialog open={!!deleteCredentialDialog} onClose={() => setDeleteCredentialDialog(null)}>
        <DialogTitle>Delete Credential Group</DialogTitle>
        <DialogContent>
          <Typography>
            Delete credential group <strong>{deleteCredentialDialog?.name}</strong>?
          </Typography>
          <Typography color="error" sx={{ mt: 1 }}>
            All devices registered under this group will be disconnected and removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCredentialDialog(null)}>Cancel</Button>
          <Button onClick={deleteCredential} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Display Name Dialog */}
      <Dialog open={!!editNameDialog} onClose={() => setEditNameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Set Display Name</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Client ID: <code>{editNameDialog?.client_id}</code>
          </Typography>
          <TextField
            label="Display Name"
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            fullWidth
            autoFocus
            helperText="Human-friendly label. Supports spaces and special characters. Leave blank to clear."
            onKeyDown={(e) => e.key === 'Enter' && saveDisplayName()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditNameDialog(null)}>Cancel</Button>
          <Button onClick={saveDisplayName} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Device Dialog */}
      <Dialog open={!!deleteDeviceDialog} onClose={() => setDeleteDeviceDialog(null)}>
        <DialogTitle>Remove Device</DialogTitle>
        <DialogContent>
          <Typography>
            Remove device <strong>{deleteDeviceDialog?.client_id}</strong>?
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            The device will be disconnected from the broker. It will re-register automatically on its next successful connection.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDeviceDialog(null)}>Cancel</Button>
          <Button onClick={deleteDevice} color="error" variant="contained">Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MqttDeviceCredentials;
