import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Alert,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const MqttConnectionForm = ({ open, onClose, onSubmit, initialData = null, isEditing = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    broker_host: 'localhost',
    broker_port: 1883,
    protocol: 'mqtt',
    use_tls: false,
    tls_verify_cert: true,
    username: '',
    password: '',
    client_id_prefix: 'dataforeman',
    keep_alive: 60,
    clean_session: true,
    reconnect_period: 5000,
    connect_timeout: 30000,
    enabled: true,
  });

  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        broker_host: initialData.broker_host || 'localhost',
        broker_port: initialData.broker_port || 1883,
        protocol: initialData.protocol || 'mqtt',
        use_tls: initialData.use_tls || false,
        tls_verify_cert: initialData.tls_verify_cert !== false,
        username: initialData.username || '',
        password: '', // Don't prefill password for security
        client_id_prefix: initialData.client_id_prefix || 'dataforeman',
        keep_alive: initialData.keep_alive || 60,
        clean_session: initialData.clean_session !== false,
        reconnect_period: initialData.reconnect_period || 5000,
        connect_timeout: initialData.connect_timeout || 30000,
        enabled: initialData.enabled !== false,
      });
    }
  }, [initialData]);

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      setError('Connection name is required');
      return;
    }

    if (!formData.broker_host.trim()) {
      setError('Broker host is required');
      return;
    }
    if (!formData.broker_port || formData.broker_port < 1 || formData.broker_port > 65535) {
      setError('Valid broker port is required (1-65535)');
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save connection');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit MQTT Connection' : 'New MQTT Connection'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Basic Settings */}
          <TextField
            label="Connection Name"
            value={formData.name}
            onChange={handleChange('name')}
            fullWidth
            required
            helperText="Descriptive name for this MQTT connection"
          />

          <TextField
            label="Broker Host"
            value={formData.broker_host}
            onChange={handleChange('broker_host')}
            fullWidth
            required
            helperText="Hostname or IP address (use 'localhost' for internal nanoMQ broker)"
          />

          <TextField
            label="Broker Port"
            type="number"
            value={formData.broker_port}
            onChange={handleChange('broker_port')}
            fullWidth
            required
            helperText="MQTT broker port (default: 1883, TLS: 8883)"
          />

          <FormControl fullWidth>
            <InputLabel>Protocol</InputLabel>
            <Select
              value={formData.protocol}
              onChange={handleChange('protocol')}
              label="Protocol"
            >
              <MenuItem value="mqtt">Raw MQTT</MenuItem>
              <MenuItem value="sparkplug">Sparkplug B</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={handleChange('enabled')}
              />
            }
            label="Enable Connection"
          />

          {/* Advanced Settings */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Authentication</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Username"
                  value={formData.username}
                  onChange={handleChange('username')}
                  fullWidth
                  helperText="Leave empty if broker doesn't require authentication"
                />

                <TextField
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange('password')}
                  fullWidth
                  helperText={isEditing ? "Leave empty to keep existing password" : ""}
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>TLS/SSL Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.use_tls}
                      onChange={handleChange('use_tls')}
                    />
                  }
                  label="Use TLS/SSL"
                />

                {formData.use_tls && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.tls_verify_cert}
                        onChange={handleChange('tls_verify_cert')}
                      />
                    }
                    label="Verify Server Certificate"
                  />
                )}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Connection Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Client ID Prefix"
                  value={formData.client_id_prefix}
                  onChange={handleChange('client_id_prefix')}
                  fullWidth
                  helperText="Prefix for MQTT client ID (full ID includes connection ID)"
                />

                <TextField
                  label="Keep Alive (seconds)"
                  type="number"
                  value={formData.keep_alive}
                  onChange={handleChange('keep_alive')}
                  fullWidth
                  helperText="MQTT keep-alive interval"
                />

                <TextField
                  label="Reconnect Period (ms)"
                  type="number"
                  value={formData.reconnect_period}
                  onChange={handleChange('reconnect_period')}
                  fullWidth
                  helperText="Time between reconnection attempts"
                />

                <TextField
                  label="Connect Timeout (ms)"
                  type="number"
                  value={formData.connect_timeout}
                  onChange={handleChange('connect_timeout')}
                  fullWidth
                  helperText="Connection timeout duration"
                />

                <FormControl variant="standard">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.clean_session}
                        onChange={handleChange('clean_session')}
                      />
                    }
                    label="Clean Session"
                  />
                  <FormHelperText>Start fresh without restoring previous session</FormHelperText>
                </FormControl>
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          {isEditing ? 'Save Changes' : 'Create Connection'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MqttConnectionForm;
