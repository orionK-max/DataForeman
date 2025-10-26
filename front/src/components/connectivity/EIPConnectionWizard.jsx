import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Typography,
  TextField,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  FormControlLabel,
  Switch,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import LabelIcon from '@mui/icons-material/Label';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RouterIcon from '@mui/icons-material/Router';
import connectivityService from '../../services/connectivityService';

const steps = ['Discover Device', 'Configure Connection', 'Add Tags (Optional)', 'Complete'];

/**
 * EIP Connection Wizard
 * 
 * Step-by-step guided flow for setting up EtherNet/IP connections:
 * 1. Discover Device - Network scan or manual IP entry
 * 2. Configure Connection - Set name, IP, slot, port, timeout
 * 3. Add Tags (Optional) - Browse and select initial tags
 * 4. Complete - Summary and finalize
 * 
 * Props:
 * - open: boolean - Dialog open state
 * - onClose: function - Called when wizard is closed/cancelled
 * - onComplete: function(connection) - Called when wizard completes successfully
 */
const EIPConnectionWizard = ({ open, onClose, onComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Step 1: Discovery
  const [broadcastAddress, setBroadcastAddress] = useState('255.255.255.255');
  const [manualIp, setManualIp] = useState('');
  const [useManualIp, setUseManualIp] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  
  // Step 2: Configuration
  const [connectionConfig, setConnectionConfig] = useState({
    name: '',
    host: '',
    slot: 0,
    port: 44818,
    timeout: 5000,
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  
  // Step 3: Tags (future enhancement)
  const [skipTags, setSkipTags] = useState(true);
  
  // Step 4: Complete
  const [savedConnection, setSavedConnection] = useState(null);

  // Reset wizard state when dialog opens
  useEffect(() => {
    if (open) {
      resetWizard();
    }
  }, [open]);

  const resetWizard = () => {
    setActiveStep(0);
    setScanning(false);
    setSaving(false);
    setError(null);
    setDiscoveredDevices([]);
    setSelectedDevice(null);
    setUseManualIp(false);
    setManualIp('');
    setBroadcastAddress('255.255.255.255');
    setConnectionConfig({
      name: '',
      host: '',
      slot: 0,
      port: 44818,
      timeout: 5000,
    });
    setTestResult(null);
    setTesting(false);
    setSkipTags(true);
    setSavedConnection(null);
  };

  // Step 1: Discover devices on network
  const handleScanNetwork = async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await connectivityService.discoverDevices(broadcastAddress, true);
      setDiscoveredDevices(result.devices || []);
      if (result.devices && result.devices.length === 0) {
        setError('No devices found. Check network connectivity and firewall settings.');
      }
    } catch (err) {
      console.error('Discovery failed:', err);
      setError(err.message || 'Failed to discover devices');
      setDiscoveredDevices([]);
    } finally {
      setScanning(false);
    }
  };

  // Step 1: Select discovered device
  const handleSelectDevice = (device) => {
    setSelectedDevice(device);
    const ip = device.ip || device.ip_address;
    const lastOctet = ip.split('.').pop();
    setConnectionConfig({
      ...connectionConfig,
      name: `${device.product_name}_${lastOctet}`.substring(0, 50),
      host: ip,
      slot: device.slot || 0,
    });
  };

  // Step 1: Use manual IP
  const handleUseManualIp = () => {
    if (!manualIp) {
      setError('Please enter an IP address');
      return;
    }
    
    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(manualIp)) {
      setError('Invalid IP address format');
      return;
    }
    
    setSelectedDevice({ ip: manualIp, product_name: 'Manual Entry' });
    const lastOctet = manualIp.split('.').pop();
    setConnectionConfig({
      ...connectionConfig,
      name: `PLC_${lastOctet}`,
      host: manualIp,
      slot: 0,
    });
    setError(null);
  };

  // Step 2: Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    
    try {
      // Create temporary connection config for testing
      const tempConfig = {
        type: 'eip',
        ...connectionConfig,
      };
      
      const result = await connectivityService.testConnection(tempConfig);
      
      if (result.state === 'connected' || result.success) {
        setTestResult({ success: true, message: 'Connection successful!' });
      } else {
        setTestResult({ 
          success: false, 
          message: result.reason || result.error || 'Connection failed' 
        });
      }
    } catch (err) {
      console.error('Test failed:', err);
      setTestResult({ 
        success: false, 
        message: err.message || 'Connection test failed' 
      });
    } finally {
      setTesting(false);
    }
  };

  // Step 2: Save connection
  const handleSaveConnection = async () => {
    setSaving(true);
    setError(null);
    
    try {
      // Validate required fields
      if (!connectionConfig.name || !connectionConfig.host) {
        setError('Name and Host are required');
        setSaving(false);
        return;
      }
      
      const connection = await connectivityService.saveConnection({
        type: 'eip',
        ...connectionConfig,
      });
      
      setSavedConnection(connection);
      
      // Skip to final step if not browsing tags
      if (skipTags) {
        setActiveStep(3); // Go to Complete step
      } else {
        setActiveStep(2); // Go to Tags step
      }
    } catch (err) {
      console.error('Save failed:', err);
      setError(err.message || 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  // Navigation
  const handleNext = () => {
    setError(null);
    
    if (activeStep === 0) {
      // Validate device selection
      if (!selectedDevice) {
        setError('Please select a device or enter an IP address');
        return;
      }
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Save and move to next step
      handleSaveConnection();
    } else if (activeStep === 2) {
      // Tags step - move to complete
      setActiveStep(3);
    }
  };

  const handleBack = () => {
    setError(null);
    setActiveStep((prev) => prev - 1);
  };

  const handleComplete = () => {
    if (onComplete && savedConnection) {
      onComplete(savedConnection);
    }
    onClose();
  };

  const handleCancel = () => {
    resetWizard();
    onClose();
  };

  // Determine if Next button should be enabled
  const isNextEnabled = () => {
    if (activeStep === 0) {
      return selectedDevice !== null;
    }
    if (activeStep === 1) {
      return connectionConfig.name && connectionConfig.host && !saving;
    }
    return true;
  };

  // Render step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Discover Device
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Scan your network to find EtherNet/IP devices or enter an IP address manually.
            </Typography>

            {/* Toggle between scan and manual */}
            <FormControlLabel
              control={
                <Switch
                  checked={useManualIp}
                  onChange={(e) => setUseManualIp(e.target.checked)}
                />
              }
              label="Enter IP address manually"
              sx={{ mb: 2 }}
            />

            {!useManualIp ? (
              // Network Scan Mode
              <Box>
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label="Broadcast Address"
                    value={broadcastAddress}
                    onChange={(e) => setBroadcastAddress(e.target.value)}
                    size="small"
                    sx={{ flexGrow: 1 }}
                    disabled={scanning}
                  />
                  <Button
                    variant="contained"
                    startIcon={scanning ? <CircularProgress size={16} /> : <SearchIcon />}
                    onClick={handleScanNetwork}
                    disabled={scanning}
                  >
                    {scanning ? 'Scanning...' : 'Scan Network'}
                  </Button>
                </Box>

                {discoveredDevices.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" fontWeight="medium" gutterBottom>
                      Found {discoveredDevices.length} device(s)
                    </Typography>
                    <Grid container spacing={2}>
                      {discoveredDevices.map((device, index) => {
                        const ip = device.ip || device.ip_address;
                        const isSelected = selectedDevice?.ip === ip;
                        return (
                          <Grid item xs={12} key={index}>
                            <Card
                              variant={isSelected ? 'elevation' : 'outlined'}
                              sx={{
                                cursor: 'pointer',
                                border: isSelected ? 2 : 1,
                                borderColor: isSelected ? 'primary.main' : 'divider',
                                '&:hover': { borderColor: 'primary.main' },
                              }}
                              onClick={() => handleSelectDevice(device)}
                            >
                              <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Box>
                                    <Typography variant="body1" fontWeight="bold">
                                      {ip}
                                    </Typography>
                                    <Typography variant="body2">
                                      {device.product_name || 'Unknown Device'}
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                      {device.vendor && (
                                        <Chip label={device.vendor} size="small" variant="outlined" />
                                      )}
                                      {device.serial && (
                                        <Typography variant="caption" color="text.secondary">
                                          S/N: {device.serial}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                  {isSelected && <CheckCircleIcon color="primary" />}
                                </Box>
                              </CardContent>
                            </Card>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Box>
                )}
              </Box>
            ) : (
              // Manual IP Mode
              <Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="IP Address"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    placeholder="192.168.1.100"
                    size="small"
                    sx={{ flexGrow: 1 }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleUseManualIp();
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleUseManualIp}
                  >
                    Use This IP
                  </Button>
                </Box>
                
                {selectedDevice && selectedDevice.ip === manualIp && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    IP address {manualIp} selected. Click Next to configure connection.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Configure Connection
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Set up connection parameters for {selectedDevice?.product_name || selectedDevice?.ip}.
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Connection Name"
                  value={connectionConfig.name}
                  onChange={(e) => setConnectionConfig({ ...connectionConfig, name: e.target.value })}
                  fullWidth
                  required
                  helperText="Friendly name for this connection"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Host"
                  value={connectionConfig.host}
                  onChange={(e) => setConnectionConfig({ ...connectionConfig, host: e.target.value })}
                  fullWidth
                  required
                  helperText="IP address"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Slot"
                  type="number"
                  value={connectionConfig.slot}
                  onChange={(e) => setConnectionConfig({ ...connectionConfig, slot: parseInt(e.target.value, 10) })}
                  fullWidth
                  helperText="CPU slot (typically 0)"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Port"
                  type="number"
                  value={connectionConfig.port}
                  onChange={(e) => setConnectionConfig({ ...connectionConfig, port: parseInt(e.target.value, 10) })}
                  fullWidth
                  helperText="Default: 44818"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Timeout (ms)"
                  type="number"
                  value={connectionConfig.timeout}
                  onChange={(e) => setConnectionConfig({ ...connectionConfig, timeout: parseInt(e.target.value, 10) })}
                  fullWidth
                  helperText="Operation timeout"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testing || !connectionConfig.host}
                startIcon={testing ? <CircularProgress size={16} /> : null}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              
              {testResult && (
                <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
                  {testResult.message}
                </Alert>
              )}
            </Box>

            <Box sx={{ mt: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!skipTags}
                    onChange={(e) => setSkipTags(!e.target.checked)}
                  />
                }
                label="Browse tags after saving connection"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                You can always add tags later from the connection details page.
              </Typography>
            </Box>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Add Tags (Optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Tag browser will be available here in a future update.
              For now, you can add tags after completing the wizard.
            </Typography>
            
            <Alert severity="info">
              After completing this wizard, navigate to the Tags tab to browse and add tags for monitoring.
            </Alert>
          </Box>
        );

      case 3:
        return (
          <Box>
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Connection Created Successfully!
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                Your EtherNet/IP connection has been saved and is ready to use.
              </Typography>
            </Box>

            {savedConnection && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Connection Details
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Name</Typography>
                      <Typography variant="body2">{savedConnection.name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Host</Typography>
                      <Typography variant="body2">{savedConnection.host}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Slot</Typography>
                      <Typography variant="body2">{savedConnection.slot}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Port</Typography>
                      <Typography variant="body2">{savedConnection.port}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="medium" gutterBottom>
                Next Steps:
              </Typography>
              <Typography variant="body2" component="ul" sx={{ pl: 2, mb: 0 }}>
                <li>Start the connection from the Devices tab</li>
                <li>Browse and add tags from the Tags tab</li>
                <li>Monitor connection status in real-time</li>
              </Typography>
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '600px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RouterIcon />
          <Typography variant="h6">New EtherNet/IP Connection</Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {renderStepContent()}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Box sx={{ flex: '1 1 auto' }} />
        {activeStep > 0 && activeStep < 3 && (
          <Button onClick={handleBack} disabled={saving}>
            Back
          </Button>
        )}
        {activeStep < 3 && (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!isNextEnabled() || saving}
          >
            {saving ? 'Saving...' : activeStep === steps.length - 2 ? 'Finish' : 'Next'}
          </Button>
        )}
        {activeStep === 3 && (
          <Button variant="contained" onClick={handleComplete} color="success">
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default EIPConnectionWizard;
