import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tooltip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Alert,
  Typography,
  InputAdornment,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
    device_credential_id: null,
  });

  const [error, setError] = useState('');
  const [connections, setConnections] = useState([]);
  const [deviceCredentials, setDeviceCredentials] = useState([]);
  const [selectedConnectionName, setSelectedConnectionName] = useState('');

  const tagPrefixHelpText =
    'Optional namespace prepended to generated tag paths (not the MQTT topic). Useful to keep tags distinct when multiple subscriptions/connections use similar topics (e.g., mqtt.brokerA.tele.sensor1.temp). Note: changing this does not rename existing saved tags; it affects newly created tags going forward.';

  // Load connections when form opens if no connectionId is provided
  useEffect(() => {
    if (open && !connectionId) {
      mqttService.getConnections()
        .then(data => {
          setConnections(data);
          // Find connection name if editing
          if (initialData?.connection_id) {
            const conn = data.find(c => c.id === initialData.connection_id);
            setSelectedConnectionName(conn?.name || '');
          }
        })
        .catch(err => {
          console.error('Failed to load connections:', err);
          setError('Failed to load connections');
        });
    }
    // Load device credentials for internal broker
    if (open) {
      mqttService.getDeviceCredentials()
        .then(data => setDeviceCredentials(data))
        .catch(err => console.error('Failed to load device credentials:', err));
    }
  }, [open, connectionId, initialData]);

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
        device_credential_id: initialData.device_credential_id || null,
      });
      // Find connection name if editing
      if (initialData.connection_name) {
        setSelectedConnectionName(initialData.connection_name);
      }
    } else if (connectionId) {
      setFormData(prev => ({ ...prev, connection_id: connectionId }));
    }
  }, [initialData, connectionId]);

  const handleChange = (field) => (event) => {
    let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    // Trim leading/trailing spaces from topic field
    if (field === 'topic' && typeof value === 'string') {
      value = value.trim();
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    // Sanitize topic - trim leading/trailing spaces
    const sanitizedTopic = formData.topic.trim();
    
    // Validation
    if (!formData.connection_id) {
      setError('Connection ID is required');
      return;
    }

    if (!sanitizedTopic) {
      setError('Topic is required');
      return;
    }

    // Validate MQTT topic format
    const topicPattern = /^[^+#]*(\+[^+#]*)*(\#)?$/;
    if (!topicPattern.test(sanitizedTopic)) {
      setError('Invalid MQTT topic format. Use + for single-level wildcard, # for multi-level');
      return;
    }

    try {
      // Submit with sanitized topic
      await onSubmit({ ...formData, topic: sanitizedTopic });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save subscription');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit MQTT Subscription' : 'New MQTT Subscription'}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 'normal' }}>
          Subscribe to topics from configured devices or brokers to receive data
        </Typography>
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
                onChange={(e) => {
                  handleChange('connection_id')(e);
                  const conn = connections.find(c => c.id === e.target.value);
                  setSelectedConnectionName(conn?.name || '');
                }}
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

          {/* Device Credential Link - only show for internal broker */}
          {selectedConnectionName === 'MQTT - Internal' && (
            <FormControl fullWidth>
              <InputLabel>Link to Device Credential (Optional)</InputLabel>
              <Select
                value={formData.device_credential_id || ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : e.target.value;
                  setFormData(prev => ({ ...prev, device_credential_id: value }));
                }}
                label="Link to Device Credential (Optional)"
              >
                <MenuItem value="">
                  <em>None - No device tracking</em>
                </MenuItem>
                {deviceCredentials.map(cred => (
                  <MenuItem key={cred.id} value={cred.id}>
                    {cred.device_name} ({cred.username})
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                Link this subscription to a device for status tracking and message filtering based on device enabled status
              </Typography>
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
            helperText="Optional namespace prepended to generated tag paths"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={tagPrefixHelpText} arrow>
                    <IconButton
                      size="small"
                      edge="end"
                      tabIndex={-1}
                      aria-label="Tag prefix help"
                    >
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
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
