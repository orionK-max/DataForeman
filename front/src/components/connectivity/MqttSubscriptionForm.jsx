import React, { useState, useEffect, useMemo } from 'react';
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
  Autocomplete,
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
  });

  const [error, setError] = useState('');
  const [connections, setConnections] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [selectedConnectionName, setSelectedConnectionName] = useState('');

  const tagPrefixHelpText =
    'Optional namespace prepended to generated tag paths (not the MQTT topic). Useful to keep tags distinct when multiple subscriptions/connections use similar topics (e.g., mqtt.brokerA.tele.sensor1.temp). Note: changing this does not rename existing saved tags; it affects newly created tags going forward.';

  // Topics available for the selected device
  const deviceTopics = useMemo(() => {
    if (!selectedDeviceId) return [];
    const dev = devices.find(d => d.id === selectedDeviceId);
    return (dev?.topics || []).map(t => t.topic).sort();
  }, [selectedDeviceId, devices]);

  // Load connections and devices when form opens
  useEffect(() => {
    if (!open) return;
    if (!connectionId) {
      mqttService.getConnections()
        .then(data => {
          setConnections(data);
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
    mqttService.getDevices()
      .then(data => setDevices(data))
      .catch(err => console.error('Failed to load devices:', err));
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
      });
      if (initialData.connection_name) {
        setSelectedConnectionName(initialData.connection_name);
      }
    } else if (connectionId) {
      setFormData(prev => ({ ...prev, connection_id: connectionId }));
    }
    // Reset device selection when form reopens
    setSelectedDeviceId(null);
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

          {/* Link to Device - only show for internal broker */}
          {selectedConnectionName === 'MQTT - Internal' && (
            <FormControl fullWidth>
              <InputLabel>Filter by Device (Optional)</InputLabel>
              <Select
                value={selectedDeviceId || ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : e.target.value;
                  setSelectedDeviceId(value);
                  // Clear topic when device changes so user picks a known topic or types one
                  setFormData(prev => ({ ...prev, topic: '' }));
                }}
                label="Filter by Device (Optional)"
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {devices.map(dev => (
                  <MenuItem key={dev.id} value={dev.id}>
                    {dev.display_name || dev.client_id}
                    {dev.display_name && dev.display_name !== dev.client_id && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        ({dev.client_id})
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                Select a device to prefill known topics
              </Typography>
            </FormControl>
          )}

          <Autocomplete
            freeSolo
            options={deviceTopics}
            value={formData.topic}
            onChange={(_, newValue) => {
              // Fires when user selects an option from the dropdown list
              if (newValue !== null) {
                setFormData(prev => ({ ...prev, topic: (newValue || '').trim() }));
                setError('');
              }
            }}
            onInputChange={(_, newValue, reason) => {
              // Fires on free-text typing; skip 'reset' (triggered internally on mount/option-select)
              if (reason !== 'input') return;
              setFormData(prev => ({ ...prev, topic: (newValue || '').trim() }));
              setError('');
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="MQTT Topic"
                required
                placeholder="sensors/temperature or sensors/+/temp or sensors/#"
                helperText={
                  deviceTopics.length > 0
                    ? `${deviceTopics.length} known topic${deviceTopics.length > 1 ? 's' : ''} from selected device — or type any topic`
                    : 'Use + for single-level wildcard, # for multi-level wildcard at end'
                }
              />
            )}
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
              <MenuItem value="raw">Raw (plain text / binary)</MenuItem>
              <MenuItem value="sparkplug">Sparkplug B</MenuItem>
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
