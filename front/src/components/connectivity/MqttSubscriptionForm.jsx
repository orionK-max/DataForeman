import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Alert,
} from '@mui/material';
import mqttService from '../../services/mqttService';

const MqttSubscriptionForm = ({ 
  open, 
  onClose, 
  onSubmit, 
  connectionId,
  initialData = null, 
  isEditing = false 
}) => {
  const [formData, setFormData] = useState({
    connection_id: connectionId || '',
    topic: '',
    qos: 0,
    payload_format: 'json',
    tag_prefix: '',
    message_buffer_size: 100,
    enabled: true,
  });

  const [error, setError] = useState('');
  const [connections, setConnections] = useState([]);

  // Load connections when form opens if no connectionId is provided
  useEffect(() => {
    if (open && !connectionId) {
      mqttService.getConnections()
        .then(data => setConnections(data))
        .catch(err => {
          console.error('Failed to load connections:', err);
          setError('Failed to load connections');
        });
    }
  }, [open, connectionId]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        connection_id: initialData.connection_id || connectionId || '',
        topic: initialData.topic || '',
        qos: initialData.qos ?? 0,
        payload_format: initialData.payload_format || 'json',
        tag_prefix: initialData.tag_prefix || '',
        message_buffer_size: initialData.message_buffer_size ?? 100,
        enabled: initialData.enabled !== false,
      });
    } else if (connectionId) {
      setFormData(prev => ({ ...prev, connection_id: connectionId }));
    }
  }, [initialData, connectionId]);

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.connection_id) {
      setError('Connection ID is required');
      return;
    }

    if (!formData.topic.trim()) {
      setError('Topic is required');
      return;
    }

    // Validate MQTT topic format
    const topicPattern = /^[^+#]*(\+[^+#]*)*(\#)?$/;
    if (!topicPattern.test(formData.topic)) {
      setError('Invalid MQTT topic format. Use + for single-level wildcard, # for multi-level');
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save subscription');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit MQTT Subscription' : 'New MQTT Subscription'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Connection selector - only show if connectionId not provided */}
          {!connectionId && (
            <FormControl fullWidth required>
              <InputLabel>MQTT Connection</InputLabel>
              <Select
                value={formData.connection_id}
                onChange={handleChange('connection_id')}
                label="MQTT Connection"
                disabled={isEditing}
              >
                {connections.map(conn => (
                  <MenuItem key={conn.id} value={conn.id}>
                    {conn.name} ({conn.broker_host}:{conn.broker_port})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            label="MQTT Topic"
            value={formData.topic}
            onChange={handleChange('topic')}
            fullWidth
            required
            placeholder="sensors/temperature or sensors/+/temp or sensors/#"
            helperText="Use + for single-level wildcard, # for multi-level wildcard at end"
          />

          <FormControl fullWidth>
            <InputLabel>QoS Level</InputLabel>
            <Select
              value={formData.qos}
              onChange={handleChange('qos')}
              label="QoS Level"
            >
              <MenuItem value={0}>QoS 0 - At most once</MenuItem>
              <MenuItem value={1}>QoS 1 - At least once</MenuItem>
              <MenuItem value={2}>QoS 2 - Exactly once</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Payload Format</InputLabel>
            <Select
              value={formData.payload_format}
              onChange={handleChange('payload_format')}
              label="Payload Format"
            >
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="text">Plain Text</MenuItem>
              <MenuItem value="binary">Binary</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Tag Prefix"
            value={formData.tag_prefix}
            onChange={handleChange('tag_prefix')}
            fullWidth
            placeholder="mqtt.sensors"
            helperText="Optional prefix for generated tag paths"
          />

          <TextField
            label="Message Buffer Size"
            type="number"
            value={formData.message_buffer_size}
            onChange={handleChange('message_buffer_size')}
            fullWidth
            inputProps={{ min: 10, max: 1000 }}
            helperText="Number of recent messages to store for field analysis (10-1000)"
          />

          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={handleChange('enabled')}
              />
            }
            label="Enable Subscription"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          {isEditing ? 'Save Changes' : 'Create Subscription'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MqttSubscriptionForm;
