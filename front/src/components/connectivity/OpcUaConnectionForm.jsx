import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Box,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import connectivityService from '../../services/connectivityService';

/**
 * OpcUaConnectionForm - Form to create/edit OPC UA connections
 * @param {Object} props
 * @param {Function} props.onSave - Callback when connection is saved
 * @param {Function} props.onTest - Callback when connection is tested
 * @param {Object} props.initialConnection - Initial connection data for editing (optional)
 */
const OpcUaConnectionForm = ({ onSave, onTest, initialConnection }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    endpoint: '',
    security: 'auto',
    poll_ms: '',
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (initialConnection) {
      setFormData({
        id: initialConnection.id || '',
        name: initialConnection.name || '',
        endpoint: initialConnection.endpoint || '',
        security: initialConnection.driver_opts?.security_strategy || 'auto',
        poll_ms: initialConnection.poll_ms ? String(initialConnection.poll_ms) : '',
      });
    }
  }, [initialConnection]);
  const handleChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.value,
    });
  };

  const handleTestConnection = async () => {
    if (!formData.endpoint.trim()) {
      setTestMessage('Endpoint URL is required');
      return;
    }

    setTesting(true);
    setTestMessage('');
    setTestResult(null);

    try {
      const result = await connectivityService.testOpcUa(formData.endpoint.trim(), 15000);
      setTestResult(result);
      
      if (result.state === 'connected') {
        setTestMessage('✓ Connection successful');
      } else if (result.state === 'timeout') {
        setTestMessage('Connection timed out');
      } else {
        setTestMessage(result.reason || 'Connection failed');
      }

      if (onTest) {
        onTest(result);
      }
    } catch (err) {
      setTestMessage(`Test failed: ${err.message}`);
      setTestResult({ state: 'error', reason: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!formData.name.trim()) {
      setSaveMessage('Connection name is required');
      return;
    }
    if (!formData.endpoint.trim()) {
      setSaveMessage('Endpoint URL is required');
      return;
    }

    setSaving(true);
    setSaveMessage('');

    try {
      // Build driver_opts
      const driver_opts = {};
      if (formData.security && formData.security !== 'auto') {
        driver_opts.security_strategy = formData.security;
      }

      const connection = {
        id: formData.id?.trim() || undefined,
        name: formData.name.trim(),
        type: 'opcua-client',
        enabled: false, // Default to disabled when creating new
        endpoint: formData.endpoint.trim(),
        ...(formData.poll_ms ? { poll_ms: Number(formData.poll_ms) } : {}),
        ...(Object.keys(driver_opts).length ? { driver_opts } : {}),
      };

      // Let the parent handle saving to avoid double-save
      if (onSave) {
        onSave(connection);
      } else {
        // Fallback: save directly if no parent handler
        await connectivityService.saveConnection(connection);
      }
      
      setSaveMessage(`✓ Saved ${connection.name}`);

      // Reset form
      setTimeout(() => {
        setFormData({
          id: '',
          name: '',
          endpoint: '',
          security: 'auto',
          poll_ms: '',
        });
        setSaveMessage('');
        setTestResult(null);
        setTestMessage('');
      }, 2000);
    } catch (err) {
      setSaveMessage(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = formData.name.trim() && formData.endpoint.trim();
  const isEditMode = Boolean(initialConnection);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {isEditMode ? 'Edit OPC UA Connection' : 'New OPC UA Connection'}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
          {/* Endpoint URL */}
          <TextField
            label="OPC UA Endpoint URL"
            placeholder="opc.tcp://host:port[/path]"
            value={formData.endpoint}
            onChange={handleChange('endpoint')}
            fullWidth
            required
            helperText="Example: opc.tcp://localhost:50000 or opc.tcp://10.0.0.5:4840"
            variant="outlined"
          />

          {/* Security Strategy */}
          <FormControl fullWidth>
            <InputLabel>Security Strategy</InputLabel>
            <Select
              value={formData.security}
              onChange={handleChange('security')}
              label="Security Strategy"
            >
              <MenuItem value="auto">Auto (secure-first fallback)</MenuItem>
              <MenuItem value="secure_first">Secure First (current)</MenuItem>
              <MenuItem value="none_first">None First (fast if server insecure)</MenuItem>
            </Select>
          </FormControl>

          {/* Connection Name */}
          <TextField
            label="Connection Name"
            placeholder="e.g., OPC UA Server 1"
            value={formData.name}
            onChange={handleChange('name')}
            fullWidth
            required
            helperText="Friendly name for this connection (editable)"
            variant="outlined"
          />

          <Divider />

          {/* Advanced Options */}
          <Typography variant="subtitle2" color="text.secondary">
            Advanced Options (Optional)
          </Typography>

          {/* Poll Interval */}
          <TextField
            label="Poll Interval (ms)"
            type="number"
            placeholder="1000"
            value={formData.poll_ms}
            onChange={handleChange('poll_ms')}
            fullWidth
            helperText="Polling interval in milliseconds"
            variant="outlined"
          />

          {/* Test Result Display */}
          {testResult && (
            <Alert
              severity={testResult.state === 'connected' ? 'success' : 'error'}
              icon={testResult.state === 'connected' ? <CheckCircleIcon /> : <ErrorIcon />}
            >
              <Typography variant="body2" fontWeight="medium">
                {testResult.state === 'connected' ? 'Connected' : testResult.state}
              </Typography>
              {testResult.reason && (
                <Typography variant="caption" display="block">
                  {testResult.reason}
                </Typography>
              )}
            </Alert>
          )}

          {/* Messages */}
          {testMessage && !testResult && (
            <Alert severity="info">
              {testMessage}
            </Alert>
          )}

          {saveMessage && (
            <Alert severity={saveMessage.includes('✓') ? 'success' : 'error'}>
              {saveMessage}
            </Alert>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              color="primary"
              onClick={handleTestConnection}
              disabled={!formData.endpoint.trim() || testing}
              startIcon={testing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>

            <Button
              variant="contained"
              color="primary"
              onClick={handleSaveConnection}
              disabled={!isFormValid || saving}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            >
              {saving ? 'Saving...' : 'Save Connection'}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default OpcUaConnectionForm;
