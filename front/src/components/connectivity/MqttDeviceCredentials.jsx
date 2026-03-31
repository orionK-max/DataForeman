import { useState, useEffect } from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
import mqttService from '../../services/mqttService';

const MqttDeviceCredentials = ({ onNotify }) => {
  const [credentials, setCredentials] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [requireAuth, setRequireAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState(null);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // Form state
  const [formData, setFormData] = useState({
    device_name: '',
    username: '',
    password: '',
    enabled: true,
    timeout_seconds: 600,
  });

  useEffect(() => {
    loadData();
    loadStatuses();

    // Poll statuses every 5 seconds
    const interval = setInterval(() => {
      loadStatuses();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [credentialsData, authSetting] = await Promise.all([
        mqttService.getDeviceCredentials(),
        mqttService.getAuthSetting(),
      ]);
      setCredentials(credentialsData);
      setRequireAuth(authSetting.mqtt_require_auth);
    } catch (err) {
      console.error('Failed to load device credentials:', err);
      setError('Failed to load device credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadStatuses = async () => {
    try {
      const statusData = await mqttService.getDeviceCredentialStatuses();
      setStatuses(statusData);
    } catch (err) {
      console.error('Failed to load device statuses:', err);
      // Don't show error to user for polling failures
    }
  };

  const getDeviceStatus = (username) => {
    const status = statuses.find(s => s.username === username);
    if (!status) return null;

    // Format lastSeenAgo as human-readable
    const formatTimeAgo = (seconds) => {
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    };

    return {
      status: status.status,
      lastSeenAgo: status.lastSeenAgo ? formatTimeAgo(status.lastSeenAgo) : null,
      authFailure: status.authFailure
    };
  };

  const handleAuthToggle = async () => {
    try {
      const newValue = !requireAuth;
      await mqttService.updateAuthSetting(newValue);
      setRequireAuth(newValue);
      onNotify?.(
        newValue
          ? 'MQTT authentication enabled. Devices must provide credentials.'
          : 'MQTT authentication disabled. Anonymous connections allowed.',
        'success'
      );
    } catch (err) {
      console.error('Failed to update auth setting:', err);
      onNotify?.('Failed to update authentication setting', 'error');
    }
  };

  const handleOpenDialog = (credential = null) => {
    if (credential) {
      setEditingCredential(credential);
      setFormData({
        device_name: credential.device_name,
        username: credential.username,
        password: '', // Don't pre-fill password
        enabled: credential.enabled,
        timeout_seconds: credential.timeout_seconds || 600,
      });
    } else {
      setEditingCredential(null);
      setFormData({
        device_name: '',
        username: '',
        password: '',
        enabled: true,
        timeout_seconds: 600,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCredential(null);
    setValidationErrors({});
    setFormData({
      device_name: '',
      username: '',
      password: '',
      enabled: true,
      timeout_seconds: 600,
    });
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.device_name.trim()) {
      errors.device_name = 'Device name is required';
    }
    
    if (!editingCredential && !formData.username.trim()) {
      errors.username = 'Username is required';
    }
    
    // Password is optional - only validate if provided
    // (useful when auth is disabled, or can be set later)
    
    const timeout = parseInt(formData.timeout_seconds);
    if (isNaN(timeout) || timeout < 1 || timeout > 86400) {
      errors.timeout_seconds = 'Timeout must be between 1 and 86400 seconds';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }
    
    try {
      if (editingCredential) {
        // Update - only send changed fields
        const updates = {
          device_name: formData.device_name.trim(),
          enabled: formData.enabled,
          timeout_seconds: formData.timeout_seconds,
        };
        if (formData.password) {
          updates.password = formData.password.trim();
        }
        await mqttService.updateDeviceCredential(editingCredential.id, updates);
        onNotify?.('Device credential updated successfully', 'success');
      } else {
        // Create - require device_name and username, password is optional
        const sanitizedDeviceName = formData.device_name.trim();
        const sanitizedUsername = formData.username.trim();
        const sanitizedPassword = formData.password.trim();
        
        if (!sanitizedDeviceName || !sanitizedUsername) {
          onNotify?.('Device name and username are required', 'error');
          return;
        }
        
        const payload = {
          device_name: sanitizedDeviceName,
          username: sanitizedUsername,
          enabled: formData.enabled,
          timeout_seconds: formData.timeout_seconds,
        };
        
        // Only include password if provided
        if (sanitizedPassword) {
          payload.password = sanitizedPassword;
        }
        
        await mqttService.createDeviceCredential(payload);
        onNotify?.('Device credential created successfully', 'success');
      }
      handleCloseDialog();
      loadData();
    } catch (err) {
      console.error('Failed to save credential:', err);
      onNotify?.('Failed to save device credential', 'error');
    }
  };

  const handleToggleEnabled = async (credential) => {
    try {
      await mqttService.updateDeviceCredential(credential.id, {
        enabled: !credential.enabled,
      });
      onNotify?.(
        credential.enabled ? 'Device disabled' : 'Device enabled',
        'success'
      );
      loadData();
    } catch (err) {
      console.error('Failed to toggle credential:', err);
      onNotify?.('Failed to update device status', 'error');
    }
  };

  const handleOpenDeleteDialog = (credential) => {
    setCredentialToDelete(credential);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setCredentialToDelete(null);
  };

  const handleDelete = async () => {
    if (!credentialToDelete) return;

    try {
      await mqttService.deleteDeviceCredential(credentialToDelete.id);
      onNotify?.('Device credential deleted successfully', 'success');
      handleCloseDeleteDialog();
      loadData();
    } catch (err) {
      console.error('Failed to delete credential:', err);
      onNotify?.('Failed to delete device credential', 'error');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <SecurityIcon />
              <Typography variant="h6">MQTT Authentication</Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={requireAuth}
                  onChange={handleAuthToggle}
                  color="primary"
                />
              }
              label="Require Authentication"
            />
          </Box>
          <Alert severity={requireAuth ? 'warning' : 'info'}>
            {requireAuth
              ? 'Device authentication is enabled. Only devices with valid credentials can connect to the DataForeman internal MQTT broker.'
              : 'Anonymous mode is active. Any device can connect to the DataForeman internal MQTT broker without credentials.'}
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Devices Connecting to Internal Broker</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Add Device
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Device Name</TableCell>
                  <TableCell>Username</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Message</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {credentials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="textSecondary" sx={{ py: 3 }}>
                        No device credentials configured. Add a device to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  credentials.map((credential) => (
                    <TableRow key={credential.id}>
                      <TableCell>{credential.device_name}</TableCell>
                      <TableCell>
                        <code>{credential.username}</code>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const deviceStatus = getDeviceStatus(credential.username);
                          if (!deviceStatus) {
                            // No status data yet - don't show anything
                            return null;
                          }
                          if (deviceStatus.status === 'disabled') {
                            return <Chip label="Disabled" color="default" size="small" />;
                          }
                          if (deviceStatus.status === 'auth_failed') {
                            return (
                              <Chip 
                                label={`Auth Failed${deviceStatus.authFailure ? ` (${deviceStatus.authFailure.failureCount})` : ''}`}
                                color="error" 
                                size="small"
                              />
                            );
                          }
                          if (deviceStatus.status === 'ready') {
                            return <Chip label="Ready - No data yet" color="warning" size="small" />;
                          }
                          if (deviceStatus.status === 'not_active') {
                            return (
                              <Chip 
                                label="Not Active"
                                sx={{ bgcolor: '#ff9800', color: 'white' }}
                                size="small"
                              />
                            );
                          }
                          if (deviceStatus.status === 'connected') {
                            return <Chip label="Connected" color="success" size="small" />;
                          }
                          return <Chip label="Unknown" color="default" size="small" />;
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const deviceStatus = getDeviceStatus(credential.username);
                          if (deviceStatus?.lastSeenAgo) {
                            return <Typography variant="body2">{deviceStatus.lastSeenAgo}</Typography>;
                          }
                          return <Typography variant="body2" color="text.secondary">-</Typography>;
                        })()}
                      </TableCell>
                      <TableCell>
                        {new Date(credential.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleToggleEnabled(credential)}
                          title={credential.enabled ? 'Disable' : 'Enable'}
                        >
                          <Switch checked={credential.enabled} size="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(credential)}
                          title="Edit"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDeleteDialog(credential)}
                          title="Delete"
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
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCredential ? 'Edit Device Credential' : 'Add Device Credential'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Device Name"
              value={formData.device_name}
              onChange={(e) => {
                const trimmed = e.target.value.trim();
                setFormData({ ...formData, device_name: trimmed });
                if (validationErrors.device_name && trimmed) {
                  setValidationErrors({ ...validationErrors, device_name: undefined });
                }
              }}
              fullWidth
              required
              error={!!validationErrors.device_name}
              helperText={validationErrors.device_name || "A friendly name for this device"}
              autoComplete="off"
            />
            <TextField
              label="Username"
              value={formData.username}
              onChange={(e) => {
                const trimmed = e.target.value.trim();
                setFormData({ ...formData, username: trimmed });
                if (validationErrors.username && trimmed) {
                  setValidationErrors({ ...validationErrors, username: undefined });
                }
              }}
              fullWidth
              required
              disabled={!!editingCredential}
              error={!!validationErrors.username}
              helperText={
                validationErrors.username ||
                (editingCredential
                  ? 'Username cannot be changed'
                  : 'MQTT username for device authentication')
              }
              autoComplete="off"
              inputProps={{
                autoComplete: 'new-username'
              }}
            />
            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => {
                const trimmed = e.target.value.trim();
                setFormData({ ...formData, password: trimmed });
                if (validationErrors.password && trimmed) {
                  setValidationErrors({ ...validationErrors, password: undefined });
                }
              }}
              fullWidth
              error={!!validationErrors.password}
              helperText={
                validationErrors.password ||
                (editingCredential
                  ? 'Leave blank to keep current password'
                  : 'MQTT password (optional when authentication is disabled)')
              }
              autoComplete="new-password"
              inputProps={{
                autoComplete: 'new-password'
              }}
            />
            <TextField
              label="Timeout (seconds)"
              type="number"
              value={formData.timeout_seconds}
              onChange={(e) => {
                const value = e.target.value === '' ? '' : parseInt(e.target.value);
                setFormData({ ...formData, timeout_seconds: value });
                if (validationErrors.timeout_seconds) {
                  const num = parseInt(value);
                  if (!isNaN(num) && num >= 1 && num <= 86400) {
                    setValidationErrors({ ...validationErrors, timeout_seconds: undefined });
                  }
                }
              }}
              fullWidth
              required
              error={!!validationErrors.timeout_seconds}
              helperText={validationErrors.timeout_seconds || "Longest expected period between messages before device considered 'Not Active' (1-86400)"}
              inputProps={{
                min: 1,
                max: 86400
              }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) =>
                    setFormData({ ...formData, enabled: e.target.checked })
                  }
                />
              }
              label="Enabled"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            color="primary"
            disabled={Object.keys(validationErrors).length > 0 || 
                     !formData.device_name.trim() || 
                     (!editingCredential && !formData.username.trim()) ||
                     formData.timeout_seconds === '' ||
                     isNaN(parseInt(formData.timeout_seconds)) ||
                     parseInt(formData.timeout_seconds) < 1 ||
                     parseInt(formData.timeout_seconds) > 86400}
          >
            {editingCredential ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete Device Credential</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the credential for{' '}
            <strong>{credentialToDelete?.device_name}</strong>?
          </Typography>
          <Typography color="error" sx={{ mt: 2 }}>
            This device will no longer be able to connect to the MQTT broker.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MqttDeviceCredentials;
