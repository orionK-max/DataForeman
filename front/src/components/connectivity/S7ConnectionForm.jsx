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

const S7ConnectionForm = ({ onSave, onTest, initialConnection }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    host: '',
    rack: '0',
    slot: '1',
    port: '102',
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
        rack: String(initialConnection.rack ?? '0'),
        slot: String(initialConnection.slot ?? '1'),
        port: String(initialConnection.port ?? '102'),
      });
    }
  }, [initialConnection]);

  const isEditMode = Boolean(initialConnection);

  const handleChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.value });
    setError(null);
    setTestResult(null);
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Connection name is required';
    if (!formData.host.trim()) return 'Host is required';
    if (!/^\d+$/.test(formData.rack)) return 'Rack must be a number';
    if (!/^\d+$/.test(formData.slot)) return 'Slot must be a number';
    if (!/^\d+$/.test(formData.port)) return 'Port must be a number';
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
        type: 's7',
        host: formData.host.trim(),
        rack: parseInt(formData.rack, 10),
        slot: parseInt(formData.slot, 10),
        port: parseInt(formData.port, 10),
        enabled: false,
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
        id: formData.id?.trim() || undefined,
        name: formData.name.trim(),
        type: 's7',
        host: formData.host.trim(),
        rack: parseInt(formData.rack, 10),
        slot: parseInt(formData.slot, 10),
        port: parseInt(formData.port, 10),
        enabled: true,
      };

      await onSave(connection);
      
      // Reset form on successful save
      setFormData({
        id: '',
        name: '',
        host: '',
        rack: '0',
        slot: '1',
        port: '102',
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
        <Typography variant="h6" gutterBottom>
          {isEditMode ? 'Edit Siemens S7 Connection' : 'New Siemens S7 Connection'}
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure connection to a Siemens S7 PLC
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Connection Name"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="e.g., S7 Main PLC"
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
              helperText="IP address or hostname of the S7 PLC"
              disabled={loading}
              required
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Rack"
              value={formData.rack}
              onChange={handleChange('rack')}
              placeholder="0"
              helperText="PLC rack number (typically 0)"
              disabled={loading}
              required
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Slot"
              value={formData.slot}
              onChange={handleChange('slot')}
              placeholder="1"
              helperText="PLC slot number (typically 1 or 2)"
              disabled={loading}
              required
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Port"
              value={formData.port}
              onChange={handleChange('port')}
              placeholder="102"
              helperText="TCP port (default: 102)"
              disabled={loading}
              required
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
            Connection test successful! You can now save this connection.
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

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          <strong>Address Format Examples:</strong>
          <br />
          • DB1.DBX0.0 (Bool at DB1, byte 0, bit 0)
          <br />
          • DB1.DBW0 (Word at DB1, byte 0)
          <br />
          • DB1.DBD0 (Double Word / Real at DB1, byte 0)
          <br />
          • MB0 / MW0 / MD0 (Marker area)
          <br />
          • IB0 / IW0 / ID0 (Input area)
          <br />
          • QB0 / QW0 / QD0 (Output area)
        </Typography>
      </CardContent>
    </Card>
  );
};

export default S7ConnectionForm;
