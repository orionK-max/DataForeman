import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Grid,
  Alert
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import adminService from '../../services/adminService';

/**
 * System settings tab - configure system metrics
 */
export default function SystemTab() {
  const [pollMs, setPollMs] = useState(5000);
  const [retentionDays, setRetentionDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await adminService.getConfig();
      
      const p = Number(cfg['system_metrics.poll_ms']);
      const r = Number(cfg['system_metrics.retention_days']);
      
      setPollMs(Number.isFinite(p) && p >= 500 ? p : 5000);
      setRetentionDays(Number.isFinite(r) && r > 0 ? r : 30);
    } catch (err) {
      console.error('Failed to load config:', err);
      setPollMs(5000);
      setRetentionDays(30);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    
    try {
      const body = {
        'system_metrics.poll_ms': Math.max(500, Math.floor(Number(pollMs) || 5000)),
        'system_metrics.retention_days': Math.max(1, Math.floor(Number(retentionDays) || 30)),
      };
      
      const res = await adminService.updateConfig(body);
      
      if (res?.error) {
        setMessage(String(res.error));
        setMessageType('error');
      } else {
        setMessage('Configuration saved successfully');
        setMessageType('success');
      }
    } catch (err) {
      setMessage(err.message || 'Failed to save configuration');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading configuration...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Metrics Configuration
          </Typography>

          <Grid container spacing={3} sx={{ maxWidth: 600 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Metrics Poll Interval (ms)"
                inputProps={{ min: 500, step: 100 }}
                value={pollMs}
                onChange={(e) => setPollMs(Number(e.target.value))}
                helperText="Minimum 500 ms. Controls server system metrics sampling."
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Metrics Retention (days)"
                inputProps={{ min: 1, step: 1 }}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                helperText="Older samples pruned beyond this window."
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </Grid>

            {message && (
              <Grid item xs={12}>
                <Alert severity={messageType}>{message}</Alert>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
