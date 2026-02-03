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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
    value_path: '',
    timestamp_path: '',
    quality_path: '',
    tag_prefix: '',
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
        value_path: initialData.value_path || '',
        timestamp_path: initialData.timestamp_path || '',
        quality_path: initialData.quality_path || '',
        tag_prefix: initialData.tag_prefix || '',
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

          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={handleChange('enabled')}
              />
            }
            label="Enable Subscription"
          />

          {/* JSON Path Extraction */}
          {formData.payload_format === 'json' && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>JSON Path Extraction</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Alert severity="info" sx={{ mb: 1 }}>
                    Use dot notation to extract values from JSON payloads.
                    <br />
                    Example: <code>sensor.temperature</code> extracts value from{' '}
                    <code>{`{"sensor":{"temperature":25.3}}`}</code>
                  </Alert>

                  <TextField
                    label="Value Path"
                    value={formData.value_path}
                    onChange={handleChange('value_path')}
                    fullWidth
                    placeholder="value or sensor.temperature"
                    helperText="JSON path to the numeric value"
                  />

                  <TextField
                    label="Timestamp Path"
                    value={formData.timestamp_path}
                    onChange={handleChange('timestamp_path')}
                    fullWidth
                    placeholder="timestamp or meta.timestamp"
                    helperText="JSON path to timestamp (ISO 8601 format)"
                  />

                  <TextField
                    label="Quality Path"
                    value={formData.quality_path}
                    onChange={handleChange('quality_path')}
                    fullWidth
                    placeholder="quality or meta.quality"
                    helperText="JSON path to quality indicator"
                  />
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
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
