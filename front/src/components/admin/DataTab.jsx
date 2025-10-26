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
 * Data settings tab - configure historian policies
 */
export default function DataTab() {
  const [retentionDays, setRetentionDays] = useState(30);
  const [compressionDays, setCompressionDays] = useState(7);
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
      
      const r = Number(cfg['historian.retention_days'] ?? 30);
      const c = Number(cfg['historian.compression_days'] ?? 7);
      
      const rOk = Number.isFinite(r) && r > 0 ? Math.floor(r) : 30;
      const cOk = Number.isFinite(c) && c > 0 ? Math.floor(c) : Math.max(1, Math.floor(rOk / 2));
      
      setRetentionDays(rOk);
      setCompressionDays(Math.min(cOk, Math.max(1, rOk - 1)));
    } catch (err) {
      console.error('Failed to load config:', err);
      setRetentionDays(30);
      setCompressionDays(7);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    
    try {
      let r = Math.max(1, Math.floor(Number(retentionDays) || 30));
      let c = Math.max(1, Math.floor(Number(compressionDays) || 7));
      
      // Auto-correct: compression must be less than retention
      if (c >= r) {
        c = Math.max(1, Math.floor(r / 2));
        setCompressionDays(c);
      }
      
      const body = {
        'historian.retention_days': r,
        'historian.compression_days': c,
      };
      
      const res = await adminService.updateConfig(body);
      
      if (res?.error) {
        setMessage(String(res.error));
        setMessageType('error');
      } else {
        setMessage('Configuration saved. Policies will apply shortly.');
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
            Historian Policies
          </Typography>

          <Grid container spacing={3} sx={{ maxWidth: 600 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Retention (days)"
                inputProps={{ min: 1, step: 1 }}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                helperText="How long to keep telemetry in Timescale."
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Compression Threshold (days)"
                inputProps={{ min: 1, step: 1 }}
                value={compressionDays}
                onChange={(e) => setCompressionDays(Number(e.target.value))}
                helperText="Older-than days to compress. Must be less than retention."
                error={compressionDays >= retentionDays}
              />
              {compressionDays >= retentionDays && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                  Compression days will be auto-adjusted to {Math.max(1, Math.floor(retentionDays / 2))} on save
                </Typography>
              )}
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
