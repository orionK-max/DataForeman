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
  Tooltip,
  IconButton,
  Grid,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { apiClient } from '../../services/api';

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
  const [scanRateMsError, setScanRateMsError] = useState('');
  const [executionMode, setExecutionMode] = useState('continuous');
  const [liveValuesUseScanRate, setLiveValuesUseScanRate] = useState(false);
  const [saveUsageData, setSaveUsageData] = useState(true);
  const [confirmDisableUsageData, setConfirmDisableUsageData] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    if (flow) {
      setName(flow.name || '');
      setDescription(flow.description || '');
      setShared(flow.shared || false);
      setLogsEnabled(flow.logs_enabled || false);
      setLogsRetentionDays(flow.logs_retention_days || 1);
      setScanRateMs(flow.scan_rate_ms || 1000);
      setScanRateMsError('');
      setExecutionMode(flow.execution_mode || 'continuous');
      setLiveValuesUseScanRate(flow.live_values_use_scan_rate || false);
      setSaveUsageData(flow.save_usage_data !== false);
    }
  }, [flow]);

  const handleSave = () => {
    // Validate scan rate for continuous mode
    if (executionMode === 'continuous') {
      const rate = parseInt(scanRateMs);
      if (isNaN(rate) || rate < 100 || rate > 60000) {
        setScanRateMsError('Scan rate must be between 100 and 60000 ms');
        return;
      }
    }
    
    onSave({ 
      name, 
      description, 
      shared,
      logs_enabled: logsEnabled,
      logs_retention_days: logsRetentionDays,
      scan_rate_ms: parseInt(scanRateMs) || 1000,
      execution_mode: executionMode,
      live_values_use_scan_rate: liveValuesUseScanRate,
      save_usage_data: saveUsageData
    });
    onClose();
  };

  // Toggling "Save usage data" off asks whether to keep or discard existing history first;
  // toggling it back on needs no confirmation.
  const handleSaveUsageDataToggle = (checked) => {
    if (!checked && saveUsageData) {
      setConfirmDisableUsageData(true);
      return;
    }
    setSaveUsageData(checked);
  };

  const handleKeepHistory = () => {
    setSaveUsageData(false);
    setConfirmDisableUsageData(false);
  };

  const handleDeleteHistory = async () => {
    setClearingHistory(true);
    try {
      if (flow?.id) {
        await apiClient.post(`/flows/${flow.id}/clear-usage-history`, {});
      }
    } catch (err) {
      console.error('Failed to clear flow usage history:', err);
    } finally {
      setClearingHistory(false);
      setSaveUsageData(false);
      setConfirmDisableUsageData(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Flow Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography 
                variant="caption" 
                sx={{ 
                  display: 'block', 
                  mb: 0.5, 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}
              >
                Flow Name *
              </Typography>
              <TextField
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
                autoFocus
                size="small"
                sx={{
                  '& .MuiInputBase-root': {
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(0, 0, 0, 0.3)'
                      : 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid',
                    borderColor: 'divider',
                  }
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography 
                variant="caption" 
                sx={{ 
                  display: 'block', 
                  mb: 0.5, 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}
              >
                Description
              </Typography>
              <TextField
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                rows={1}
                maxRows={3}
                placeholder="Describe what this flow does..."
                size="small"
                sx={{
                  '& .MuiInputBase-root': {
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(0, 0, 0, 0.3)'
                      : 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid',
                    borderColor: 'divider',
                  }
                }}
              />
            </Grid>
          </Grid>

          <FormControlLabel
            control={
              <Switch
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
            }
            label="Share with other users"
          />
          
          <Divider sx={{ my: 0.25 }} />

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ 
                p: 1,
                height: '100%',
                bgcolor: (theme) => theme.palette.mode === 'dark'
                  ? 'rgba(0, 0, 0, 0.2)'
                  : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Execution Mode
                  </Typography>
                  <Tooltip 
                    title={executionMode === 'continuous' 
                      ? 'Continuous mode runs on a schedule. Requires deployment to start execution.' 
                      : 'Manual mode runs on-demand only. No deployment needed - just click Execute.'}
                    placement="right"
                  >
                    <IconButton size="small" sx={{ p: 0, ml: -0.5 }}>
                      <InfoOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={executionMode === 'manual'}
                      onChange={(e) => setExecutionMode(e.target.checked ? 'manual' : 'continuous')}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {executionMode === 'manual' ? 'Manual (on-demand)' : 'Continuous (scheduled)'}
                    </Typography>
                  }
                />
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              {executionMode === 'continuous' ? (
                <Box sx={{ 
                  p: 1,
                  height: '100%',
                  bgcolor: (theme) => theme.palette.mode === 'dark'
                    ? 'rgba(0, 0, 0, 0.2)'
                    : 'rgba(0, 0, 0, 0.02)',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Scan Rate
                    </Typography>
                    <Tooltip title="Time between scan cycles (100-60000ms). Default: 1000ms (1 second). Lower values run more often but also increase how much data this flow writes to the historian and its own diagnostics tags (see Resource Monitor)." placement="right">
                      <IconButton size="small" sx={{ p: 0, ml: -0.5 }}>
                        <InfoOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  
                  <TextField
                    type="number"
                    value={scanRateMs}
                    onChange={(e) => {
                      setScanRateMs(e.target.value);
                      setScanRateMsError('');
                    }}
                    error={!!scanRateMsError}
                    helperText={scanRateMsError || 'Range: 100-60000 ms'}
                    inputProps={{ min: 100, max: 60000, step: 100 }}
                    placeholder="1000"
                    fullWidth
                    size="small"
                    sx={{
                      '& .MuiInputBase-root': {
                        bgcolor: (theme) => theme.palette.mode === 'dark' 
                          ? 'rgba(0, 0, 0, 0.3)'
                          : 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid',
                        borderColor: 'divider',
                      },
                      '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                        WebkitAppearance: 'none',
                        margin: 0
                      },
                      '& input[type=number]': {
                        MozAppearance: 'textfield'
                      }
                    }}
                  />
                </Box>
              ) : (
                <Box sx={{ 
                  p: 1,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  bgcolor: (theme) => theme.palette.mode === 'dark'
                    ? 'rgba(0, 0, 0, 0.1)'
                    : 'rgba(0, 0, 0, 0.01)',
                  borderRadius: 1,
                  border: '1px dashed',
                  borderColor: 'divider',
                }}>
                  <Typography variant="caption" color="text.secondary">
                    Scan Rate only applies to Continuous mode.
                  </Typography>
                </Box>
              )}
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box sx={{ 
                p: 1,
                height: '100%',
                bgcolor: (theme) => theme.palette.mode === 'dark'
                  ? 'rgba(0, 0, 0, 0.2)'
                  : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Live Values Display
                  </Typography>
                  <Tooltip 
                    title={liveValuesUseScanRate && executionMode === 'continuous'
                      ? `Live values will update every ${scanRateMs}ms (matching flow scan rate)`
                      : 'Live values will update every 1000ms (1 second) by default'}
                    placement="right"
                  >
                    <IconButton size="small" sx={{ p: 0, ml: -0.5 }}>
                      <InfoOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={liveValuesUseScanRate}
                      onChange={(e) => setLiveValuesUseScanRate(e.target.checked)}
                      disabled={executionMode === 'manual'}
                    />
                  }
                  label={<Typography variant="body2">Update at scan rate</Typography>}
                />
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box sx={{ 
                p: 1,
                height: '100%',
                bgcolor: (theme) => theme.palette.mode === 'dark'
                  ? 'rgba(0, 0, 0, 0.2)'
                  : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Usage Diagnostics History
                  </Typography>
                  <Tooltip title="Saves this flow's own resource-monitoring metrics (scan efficiency, memory, cycle time) to the database for historical charting. The Resource Monitor's live numbers work either way - this only controls whether history is kept for later review." placement="right">
                    <IconButton size="small" sx={{ p: 0, ml: -0.5 }}>
                      <InfoOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    </IconButton>
                  </Tooltip>
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      checked={saveUsageData}
                      onChange={(e) => handleSaveUsageDataToggle(e.target.checked)}
                    />
                  }
                  label={<Typography variant="body2">Save usage/diagnostic history</Typography>}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Takes effect on next redeploy/restart.
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ 
                p: 1,
                bgcolor: (theme) => theme.palette.mode === 'dark'
                  ? 'rgba(0, 0, 0, 0.2)'
                  : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Execution Logs
                  </Typography>
                  <Tooltip title="Enable persistent log storage for deployed flows. Logs are stored in the database and can be viewed in the log panel." placement="right">
                    <IconButton size="small" sx={{ p: 0, ml: -0.5 }}>
                      <InfoOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Enabling logs may impact performance for high-frequency flows. Logs consume database storage." placement="right">
                    <IconButton size="small" sx={{ p: 0, ml: -0.5 }}>
                      <InfoOutlinedIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={12} sm={logsEnabled ? 6 : 12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={logsEnabled}
                          onChange={(e) => setLogsEnabled(e.target.checked)}
                        />
                      }
                      label={<Typography variant="body2">Enable log storage (deployed flows only)</Typography>}
                    />
                  </Grid>
                  {logsEnabled && (
                    <Grid item xs={12} sm={6}>
                      <TextField
                        type="number"
                        label="Log Retention Period (days)"
                        value={logsRetentionDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 30;
                          setLogsRetentionDays(Math.max(1, Math.min(365, val)));
                        }}
                        inputProps={{ min: 1, max: 365 }}
                        placeholder="30"
                        fullWidth
                        size="small"
                        sx={{
                          '& .MuiInputBase-root': {
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? 'rgba(0, 0, 0, 0.3)'
                              : 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid',
                            borderColor: 'divider',
                          }
                        }}
                      />
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>

      {/* Keep or discard existing history when disabling usage diagnostics */}
      <Dialog open={confirmDisableUsageData} onClose={() => setConfirmDisableUsageData(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Turn Off Usage Diagnostics History?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This flow's existing diagnostic history (scan efficiency, memory, cycle time charts) can be kept for reference, or deleted now to free up disk space.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisableUsageData(false)} disabled={clearingHistory}>Cancel</Button>
          <Button onClick={handleKeepHistory} disabled={clearingHistory}>Keep History</Button>
          <Button onClick={handleDeleteHistory} color="error" variant="contained" disabled={clearingHistory}>
            {clearingHistory ? 'Deleting...' : 'Delete History'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
