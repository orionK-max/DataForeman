/**
 * Form for creating and editing MQTT publishers
 */
import { useState, useEffect } from 'react';
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
  Typography,
  IconButton,
  Paper,
  Alert,
  Autocomplete,
  Chip
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import api from '../../services/api';

export default function MqttPublisherForm({ open, onClose, onSave, connectionId, publisher }) {
  const [formData, setFormData] = useState({
    connection_id: connectionId,
    name: '',
    publish_mode: 'on_change',
    interval_ms: 1000,
    payload_format: 'json',
    payload_template: '',
    enabled: true,
    mappings: []
  });
  const [availableTags, setAvailableTags] = useState([]);
  const [newMapping, setNewMapping] = useState({
    tag_id: null,
    mqtt_topic: '',
    retain: false,
    qos: 0,
    value_transform: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      loadAvailableTags();
      if (publisher) {
        loadPublisherDetails();
      } else {
        resetForm();
      }
    }
  }, [open, publisher]);

  const loadAvailableTags = async () => {
    try {
      const response = await api.get('/api/tags/subscribed', {
        params: { connection_id: connectionId }
      });
      setAvailableTags(response.data.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
      setError('Failed to load available tags');
    }
  };

  const loadPublisherDetails = async () => {
    try {
      const response = await api.get(`/api/mqtt/publishers/${publisher.id}`);
      const data = response.data;
      setFormData({
        connection_id: data.publisher.connection_id,
        name: data.publisher.name,
        publish_mode: data.publisher.publish_mode,
        interval_ms: data.publisher.interval_ms || 1000,
        payload_format: data.publisher.payload_format || 'json',
        payload_template: data.publisher.payload_template || '',
        enabled: data.publisher.enabled,
        mappings: data.mappings || []
      });
    } catch (err) {
      console.error('Failed to load publisher:', err);
      setError('Failed to load publisher details');
    }
  };

  const resetForm = () => {
    setFormData({
      connection_id: connectionId,
      name: '',
      publish_mode: 'on_change',
      interval_ms: 1000,
      payload_format: 'json',
      payload_template: '',
      enabled: true,
      mappings: []
    });
    setNewMapping({
      tag_id: null,
      mqtt_topic: '',
      retain: false,
      qos: 0,
      value_transform: ''
    });
    setError(null);
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddMapping = () => {
    if (!newMapping.tag_id || !newMapping.mqtt_topic) {
      setError('Tag and MQTT topic are required for mapping');
      return;
    }

    const tag = availableTags.find(t => t.tag_id === newMapping.tag_id);
    if (!tag) {
      setError('Selected tag not found');
      return;
    }

    setFormData(prev => ({
      ...prev,
      mappings: [...prev.mappings, {
        ...newMapping,
        tag_path: tag.tag_path
      }]
    }));

    setNewMapping({
      tag_id: null,
      mqtt_topic: '',
      retain: false,
      qos: 0,
      value_transform: ''
    });
    setError(null);
  };

  const handleRemoveMapping = (index) => {
    setFormData(prev => ({
      ...prev,
      mappings: prev.mappings.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name || formData.mappings.length === 0) {
      setError('Publisher name and at least one mapping are required');
      return;
    }

    if ((formData.publish_mode === 'interval' || formData.publish_mode === 'both') && !formData.interval_ms) {
      setError('Interval is required for interval or both publish modes');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (publisher) {
        // Update existing publisher
        await api.put(`/api/mqtt/publishers/${publisher.id}`, {
          name: formData.name,
          publish_mode: formData.publish_mode,
          interval_ms: formData.interval_ms,
          payload_format: formData.payload_format,
          payload_template: formData.payload_template,
          enabled: formData.enabled
        });

        // Update mappings (delete all and recreate - simple approach)
        const existingMappings = publisher.mappings || [];
        for (const mapping of existingMappings) {
          await api.delete(`/api/mqtt/publishers/${publisher.id}/mappings/${mapping.id}`);
        }
        for (const mapping of formData.mappings) {
          await api.post(`/api/mqtt/publishers/${publisher.id}/mappings`, mapping);
        }
      } else {
        // Create new publisher
        await api.post('/api/mqtt/publishers', formData);
      }

      onSave();
      onClose();
    } catch (err) {
      console.error('Failed to save publisher:', err);
      setError(err.response?.data?.error || 'Failed to save publisher');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {publisher ? 'Edit Publisher' : 'New Publisher'}
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
            label="Publisher Name"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            fullWidth
            required
          />

          <FormControl fullWidth>
            <InputLabel>Publish Mode</InputLabel>
            <Select
              value={formData.publish_mode}
              onChange={(e) => handleFieldChange('publish_mode', e.target.value)}
              label="Publish Mode"
            >
              <MenuItem value="on_change">On Change</MenuItem>
              <MenuItem value="interval">Interval</MenuItem>
              <MenuItem value="both">Both</MenuItem>
            </Select>
          </FormControl>

          {(formData.publish_mode === 'interval' || formData.publish_mode === 'both') && (
            <TextField
              label="Interval (ms)"
              type="number"
              value={formData.interval_ms}
              onChange={(e) => handleFieldChange('interval_ms', parseInt(e.target.value))}
              fullWidth
            />
          )}

          <FormControl fullWidth>
            <InputLabel>Payload Format</InputLabel>
            <Select
              value={formData.payload_format}
              onChange={(e) => handleFieldChange('payload_format', e.target.value)}
              label="Payload Format"
            >
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="raw">Raw Value</MenuItem>
              <MenuItem value="sparkplug">Sparkplug B</MenuItem>
            </Select>
          </FormControl>

          {formData.payload_format === 'json' && (
            <TextField
              label="Payload Template (JSON)"
              value={formData.payload_template}
              onChange={(e) => handleFieldChange('payload_template', e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder='{"device": "sensor1", ...}'
              helperText="Optional JSON template to merge with tag value data"
            />
          )}

          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={(e) => handleFieldChange('enabled', e.target.checked)}
              />
            }
            label="Enabled"
          />

          {/* Tag Mappings */}
          <Typography variant="h6" sx={{ mt: 2 }}>
            Tag Mappings
          </Typography>

          {formData.mappings.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              {formData.mappings.map((mapping, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Chip label={mapping.tag_path} color="primary" />
                  <Typography variant="body2">→</Typography>
                  <Chip label={mapping.mqtt_topic} />
                  <Chip label={`QoS ${mapping.qos}`} size="small" />
                  {mapping.retain && <Chip label="Retain" size="small" color="secondary" />}
                  <IconButton size="small" onClick={() => handleRemoveMapping(index)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Paper>
          )}

          {/* Add New Mapping */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Add Tag Mapping
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Autocomplete
                options={availableTags}
                getOptionLabel={(option) => option.tag_path}
                value={availableTags.find(t => t.tag_id === newMapping.tag_id) || null}
                onChange={(e, value) => setNewMapping(prev => ({ ...prev, tag_id: value?.tag_id || null }))}
                renderInput={(params) => (
                  <TextField {...params} label="Select Tag" required />
                )}
              />

              <TextField
                label="MQTT Topic"
                value={newMapping.mqtt_topic}
                onChange={(e) => setNewMapping(prev => ({ ...prev, mqtt_topic: e.target.value }))}
                fullWidth
                required
                placeholder="sensors/temperature"
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel>QoS</InputLabel>
                  <Select
                    value={newMapping.qos}
                    onChange={(e) => setNewMapping(prev => ({ ...prev, qos: e.target.value }))}
                    label="QoS"
                  >
                    <MenuItem value={0}>0 - At most once</MenuItem>
                    <MenuItem value={1}>1 - At least once</MenuItem>
                    <MenuItem value={2}>2 - Exactly once</MenuItem>
                  </Select>
                </FormControl>

                <FormControlLabel
                  control={
                    <Switch
                      checked={newMapping.retain}
                      onChange={(e) => setNewMapping(prev => ({ ...prev, retain: e.target.checked }))}
                    />
                  }
                  label="Retain"
                />
              </Box>

              <TextField
                label="Value Transform (JavaScript)"
                value={newMapping.value_transform}
                onChange={(e) => setNewMapping(prev => ({ ...prev, value_transform: e.target.value }))}
                fullWidth
                placeholder="value * 2"
                helperText="Optional JavaScript expression to transform the value"
              />

              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={handleAddMapping}
                fullWidth
              >
                Add Mapping
              </Button>
            </Box>
          </Paper>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
