import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Typography,
  Grid,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import TestIcon from '@mui/icons-material/PlayArrow';

const EIPConnectionForm = ({ onSave, onTest, initialConnection }) => {
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    slot: '0',
    timeout: '5000',
    maxTagsPerGroup: '500',
    maxConcurrentConnections: '8',
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Populate form when editing
  useEffect(() => {
    if (initialConnection) {
      setFormData({
        id: initialConnection.id || '',
        name: initialConnection.name || '',
        host: initialConnection.host || '',
        slot: String(initialConnection.slot ?? initialConnection.driver_opts?.slot ?? '0'),
        timeout: String(initialConnection.timeoutMs ?? initialConnection.driver_opts?.timeout_ms ?? '5000'),
        maxTagsPerGroup: String(initialConnection.max_tags_per_group ?? initialConnection.config_data?.max_tags_per_group ?? '500'),
        maxConcurrentConnections: String(initialConnection.max_concurrent_connections ?? initialConnection.config_data?.max_concurrent_connections ?? '8'),
      });
    }
  }, [initialConnection]);

  const isEditMode = Boolean(initialConnection);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormData({ ...formData, [field]: value });
    setError(null);
    setTestResult(null);
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Connection name is required';
    if (!formData.host.trim()) return 'Host is required';
    if (!/^\d+$/.test(formData.slot)) return 'Slot must be a number';
    if (!/^\d+$/.test(formData.timeout)) return 'Timeout must be a number';
    if (!/^\d+$/.test(formData.maxTagsPerGroup)) return 'Max tags per group must be a number';
    if (!/^\d+$/.test(formData.maxConcurrentConnections)) return 'Max concurrent connections must be a number';
    const maxTags = parseInt(formData.maxTagsPerGroup, 10);
    if (maxTags < 1 || maxTags > 2000) return 'Max tags per group must be between 1 and 2000';
    const maxConns = parseInt(formData.maxConcurrentConnections, 10);
    if (maxConns < 1 || maxConns > 32) return 'Max concurrent connections must be between 1 and 32';
    if (formData.eipDriver === 'libplctag') {
      if (!/^\d+$/.test(formData.debugLevel)) return 'Debug level must be a number (0-5)';
    }
    return null;
  };

  const handleTest = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const connection = {
        type: 'eip',
        host: formData.host.trim(),
        slot: parseInt(formData.slot, 10),
        port: 44818, // EIP standard port
        timeoutMs: parseInt(formData.timeout, 10),
        enabled: false, // Test mode doesn't enable
        max_tags_per_group: parseInt(formData.maxTagsPerGroup, 10),
        max_concurrent_connections: parseInt(formData.maxConcurrentConnections, 10),
        driver_opts: {
          host: formData.host,
          slot: parseInt(formData.slot, 10),
          port: 44818, // EIP standard port
          timeout_ms: parseInt(formData.timeout, 10),
        },
      };

      const result = await onTest(connection);
      setTestResult(result);
      
      if (result.state === 'connected') {
        setError(null);
      } else {
        setError(result.reason || `Connection failed: ${result.state}`);
      }
    } catch (err) {
      setError(err.message || 'Test failed');
      setTestResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const connection = {
        id: formData.id?.trim() || undefined, // Optional, will be auto-generated if not provided
        name: formData.name.trim(),
        type: 'eip',
        host: formData.host.trim(),
        slot: parseInt(formData.slot, 10),
        port: 44818, // EIP standard port
        timeoutMs: parseInt(formData.timeout, 10),
        enabled: true,
        max_tags_per_group: parseInt(formData.maxTagsPerGroup, 10),
        max_concurrent_connections: parseInt(formData.maxConcurrentConnections, 10),
        driver_opts: {
          host: formData.host,
          slot: parseInt(formData.slot, 10),
          port: 44818, // EIP standard port
          timeout_ms: parseInt(formData.timeout, 10),
        },
      };

      await onSave(connection);
      
      // Reset form on successful save
      setFormData({
        id: '',
        name: '',
        host: '',
        slot: '0',
        timeout: '5000',
        maxTagsPerGroup: '500',
        maxConcurrentConnections: '8',
      });
      setTestResult(null);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="h6">
            {isEditMode ? 'Edit EtherNet/IP Connection' : 'New EtherNet/IP Connection'}
          </Typography>
          {formData.eipDriver === 'libplctag' && (
            <Chip 
              icon={<SpeedIcon />} 
              label="Native C++" 
              color="primary" 
              size="small"
            />
          )}
          {formData.eipDriver === 'pycomm3' && (
            <Chip 
              icon={<SpeedIcon />} 
              label="Python" 
              color="secondary" 
              size="small"
            />
          )}
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure connection to an Allen-Bradley or Rockwell Automation PLC via EtherNet/IP (CIP) using PyComm3
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Connection Name"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="e.g., Main Production Line"
              helperText="Friendly name for this connection (editable)"
              disabled={loading}
              required
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Host"
              value={formData.host}
              onChange={handleChange('host')}
              placeholder="e.g., 192.168.1.100"
              helperText="IP address or hostname of the PLC"
              disabled={loading}
              required
            />
          </Grid>

          {/* Native Driver Options */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Slot"
              value={formData.slot}
              onChange={handleChange('slot')}
              placeholder="0"
              helperText="CPU slot number (typically 0)"
              disabled={loading}
              required
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Timeout (ms)"
              value={formData.timeout}
              onChange={handleChange('timeout')}
              placeholder="5000"
              helperText="Operation timeout (default: 5000ms)"
              disabled={loading}
              required
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Max Tags Per Read"
              value={formData.maxTagsPerGroup}
              onChange={handleChange('maxTagsPerGroup')}
              placeholder="500"
              helperText="Maximum tags per single read operation (1-2000). Large poll groups are auto-split into chunks."
              disabled={loading}
              required
              type="number"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Max Concurrent Connections"
              value={formData.maxConcurrentConnections}
              onChange={handleChange('maxConcurrentConnections')}
              placeholder="8"
              helperText="Recommended limit for simultaneous connections (1-32). Exceeding may cause PLC to reject connections. Micro800=4-8, CompactLogix=16-32."
              disabled={loading}
              required
              type="number"
            />
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {testResult && testResult.state === 'connected' && (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight="bold">
              Connection test successful!
            </Typography>
            <Typography variant="caption">
              You can now save this connection.
            </Typography>
          </Alert>
        )}

        <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={loading}
          >
            Save Connection
          </Button>
        </Box>

        <Card variant="outlined" sx={{ mt: 3, bgcolor: 'background.default' }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              <strong>Compatible PLCs:</strong>
              <br />
              • Allen-Bradley ControlLogix (L7x, L8x)
              <br />
              • CompactLogix (L1x, L2x, L3x)
              <br />
              • Micro800 Series
              <br />
              • MicroLogix with EtherNet/IP module
              <br />
              <br />
              <strong>Note:</strong> After saving, you can browse the PLC's tag list to add tags for monitoring.
            </Typography>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

export default EIPConnectionForm;
