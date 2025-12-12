import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Divider,
  Alert,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
} from '@mui/material';

/**
 * Flow Settings Dialog
 * Edit flow name, description, sharing settings, and log configuration
 */
export default function FlowSettingsDialog({ open, onClose, flow, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);
  const [logsEnabled, setLogsEnabled] = useState(false);
  const [logsRetentionDays, setLogsRetentionDays] = useState(30);
  const [scanRateMs, setScanRateMs] = useState(1000);
  const [executionMode, setExecutionMode] = useState('continuous');
  const [liveValuesUseScanRate, setLiveValuesUseScanRate] = useState(false);

  useEffect(() => {
    if (flow) {
      setName(flow.name || '');
      setDescription(flow.description || '');
      setShared(flow.shared || false);
      setLogsEnabled(flow.logs_enabled || false);
      setLogsRetentionDays(flow.logs_retention_days || 30);
      setScanRateMs(flow.scan_rate_ms || 1000);
      setExecutionMode(flow.execution_mode || 'continuous');
      setLiveValuesUseScanRate(flow.live_values_use_scan_rate || false);
    }
  }, [flow]);

  const handleSave = () => {
    onSave({ 
      name, 
      description, 
      shared,
      logs_enabled: logsEnabled,
      logs_retention_days: logsRetentionDays,
      scan_rate_ms: scanRateMs,
      execution_mode: executionMode,
      live_values_use_scan_rate: liveValuesUseScanRate
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Flow Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Flow Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Describe what this flow does..."
          />
          <FormControlLabel
            control={
              <Switch
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
            }
            label="Share with other users"
          />
          
          <Divider sx={{ my: 1 }} />
          
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Execution Mode
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={executionMode === 'manual'}
                  onChange={(e) => setExecutionMode(e.target.checked ? 'manual' : 'continuous')}
                />
              }
              label={executionMode === 'manual' ? 'Manual (on-demand)' : 'Continuous (scheduled)'}
            />
            {executionMode === 'continuous' ? (
              <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
                Continuous mode runs on a schedule. Requires deployment to start execution.
              </Alert>
            ) : (
              <Alert severity="success" sx={{ fontSize: '0.875rem' }}>
                Manual mode runs on-demand only. No deployment needed - just click Execute.
              </Alert>
            )}
          </Box>
          
          {executionMode === 'continuous' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Scan Rate
              </Typography>
              
              <TextField
                label="Scan Rate (milliseconds)"
                type="number"
                value={scanRateMs}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1000;
                  setScanRateMs(Math.max(100, Math.min(60000, val)));
                }}
                inputProps={{ min: 100, max: 60000, step: 100 }}
                helperText="Time between scan cycles (100-60000ms). Default: 1000ms (1 second)"
                fullWidth
              />
              
              <Divider sx={{ my: 1 }} />
            </>
          )}
          
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Live Values Display
          </Typography>
          
          <FormControlLabel
            control={
              <Switch
                checked={liveValuesUseScanRate}
                onChange={(e) => setLiveValuesUseScanRate(e.target.checked)}
                disabled={executionMode === 'manual'}
              />
            }
            label="Update at scan rate"
          />
          
          <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
            {liveValuesUseScanRate && executionMode === 'continuous'
              ? `Live values will update every ${scanRateMs}ms (matching flow scan rate)`
              : 'Live values will update every 1000ms (1 second) by default'}
          </Alert>
          
          <Divider sx={{ my: 1 }} />
          
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Execution Logs
          </Typography>
          
          <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
            Enable persistent log storage for deployed flows. Logs are stored in the database and can be viewed in the log panel.
          </Alert>
          
          <FormControlLabel
            control={
              <Switch
                checked={logsEnabled}
                onChange={(e) => setLogsEnabled(e.target.checked)}
              />
            }
            label="Enable log storage (deployed flows only)"
          />
          
          {logsEnabled && (
            <>
              <TextField
                label="Log Retention Period"
                type="number"
                value={logsRetentionDays}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 30;
                  setLogsRetentionDays(Math.max(1, Math.min(365, val)));
                }}
                inputProps={{ min: 1, max: 365 }}
                helperText="Number of days to keep logs (1-365). Older logs are automatically deleted."
                fullWidth
              />
              
              <Alert severity="warning" sx={{ fontSize: '0.875rem' }}>
                Enabling logs may impact performance for high-frequency flows. Logs consume database storage.
              </Alert>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
