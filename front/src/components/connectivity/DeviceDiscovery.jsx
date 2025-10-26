import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  Grid,
  Divider,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import RouterIcon from '@mui/icons-material/Router';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import MemoryIcon from '@mui/icons-material/Memory';
import CableIcon from '@mui/icons-material/Cable';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import HubIcon from '@mui/icons-material/Hub';
import CodeIcon from '@mui/icons-material/Code';
import connectivityService from '../../services/connectivityService';
import { usePermissions } from '../../contexts/PermissionsContext';

const DeviceDiscovery = ({ onAddDevice }) => {
  const { can } = usePermissions();
  const [broadcastAddress, setBroadcastAddress] = useState('255.255.255.255');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [expandedDevices, setExpandedDevices] = useState({});
  const [loadingRackConfig, setLoadingRackConfig] = useState({});
  const [rackConfigs, setRackConfigs] = useState({});
  const [error, setError] = useState(null);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [cached, setCached] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [sortBy, setSortBy] = useState('ip');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedDeviceJson, setSelectedDeviceJson] = useState(null);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [identifyingDevice, setIdentifyingDevice] = useState({});

  // Check if user has permission to discover devices
  const canDiscoverDevices = can('connectivity.devices', 'create');

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    
    try {
      const result = await connectivityService.discoverDevices(broadcastAddress);
      setDevices(result.devices || []);
      setLastScanTime(new Date());
      setCached(result.cached || false);
    } catch (err) {
      console.error('Discovery error:', err);
      setError(err.message || 'Failed to discover devices');
      setDevices([]);
    } finally {
      setScanning(false);
    }
  };

  const handleIdentifyDevice = async (device, index) => {
    const deviceKey = `${device.ip || device.ip_address}-${index}`;
    setIdentifyingDevice(prev => ({ ...prev, [deviceKey]: true }));
    
    try {
      const ip = device.ip || device.ip_address;
      const detailedInfo = await connectivityService.identifyDevice(ip, device.slot || 0);
      
      // Update the device in the list with detailed info
      setDevices(prevDevices => {
        const newDevices = [...prevDevices];
        newDevices[index] = { ...detailedInfo, _identified: true };
        return newDevices;
      });
      
      // Automatically show the JSON for the detailed info
      setSelectedDeviceJson({ ...detailedInfo, _identified: true });
      setJsonDialogOpen(true);
    } catch (err) {
      console.error('Identify error:', err);
      setError(`Failed to identify ${device.ip || device.ip_address}: ${err.message}`);
    } finally {
      setIdentifyingDevice(prev => ({ ...prev, [deviceKey]: false }));
    }
  };

  const handleAddDevice = (device) => {
    if (onAddDevice) {
      const ip = device.ip || device.ip_address;
      onAddDevice({
        host: ip,
        slot: device.slot || 0,
        name: `${device.product_name}_${ip.split('.').pop()}`,
        productName: device.product_name,
        vendor: device.vendor,
        serial: device.serial,
        revision: device.revision,
      });
    }
  };

  const handleExpandDevice = async (device, index) => {
    const deviceKey = `${device.ip || device.ip_address}-${index}`;
    
    // Toggle expansion
    if (expandedDevices[deviceKey]) {
      setExpandedDevices(prev => ({ ...prev, [deviceKey]: false }));
      return;
    }
    
    setExpandedDevices(prev => ({ ...prev, [deviceKey]: true }));
    
    // Load rack configuration if not already loaded
    if (!rackConfigs[deviceKey] && !loadingRackConfig[deviceKey]) {
      setLoadingRackConfig(prev => ({ ...prev, [deviceKey]: true }));
      try {
        const ip = device.ip || device.ip_address;
        const config = await connectivityService.getRackConfiguration(ip, device.slot || 0);
        setRackConfigs(prev => ({ ...prev, [deviceKey]: config }));
      } catch (err) {
        console.error('Failed to load rack configuration:', err);
        setError(`Failed to load rack config for ${device.ip || device.ip_address}: ${err.message}`);
      } finally {
        setLoadingRackConfig(prev => ({ ...prev, [deviceKey]: false }));
      }
    }
  };

  const handleShowJson = (device) => {
    setSelectedDeviceJson(device);
    setJsonDialogOpen(true);
  };

  const handleCloseJson = () => {
    setJsonDialogOpen(false);
    setSelectedDeviceJson(null);
  };

  const isControlLogix = (device) => {
    const productName = device.product_name || '';
    return productName.startsWith('1756-') || productName.includes('ControlLogix');
  };

  const getModuleIcon = (productName) => {
    if (!productName) return <DeveloperBoardIcon />;
    const name = productName.toUpperCase();
    
    if (name.includes('L7') || name.includes('L8')) return <MemoryIcon color="primary" />;
    if (name.includes('EN')) return <CableIcon color="success" />;
    if (name.includes('IB') || name.includes('OB') || name.includes('IF') || name.includes('OF')) {
      return <DeveloperBoardIcon color="secondary" />;
    }
    return <DeveloperBoardIcon />;
  };

  const renderModuleSlot = (module, index) => (
    <Tooltip 
      key={index}
      title={
        <Box>
          <Typography variant="body2"><strong>{module.product_name}</strong></Typography>
          <Typography variant="caption">Serial: {module.serial}</Typography>
          <Typography variant="caption" display="block">
            Rev: {module.revision.major}.{module.revision.minor}
          </Typography>
          <Typography variant="caption" display="block">Type: {module.product_type}</Typography>
        </Box>
      }
    >
      <Paper
        sx={{
          p: 1,
          minHeight: 70,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          border: '2px solid',
          borderColor: 'primary.main',
          cursor: 'pointer',
          transition: 'all 0.2s',
          '&:hover': {
            bgcolor: 'action.hover',
            transform: 'translateY(-2px)',
            boxShadow: 2,
          }
        }}
      >
        {getModuleIcon(module.product_name)}
        <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 'bold', fontSize: '0.7rem' }}>
          Slot {module.slot}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', textAlign: 'center' }}>
          {module.product_name?.slice(0, 10)}
        </Typography>
      </Paper>
    </Tooltip>
  );

  const renderEmptySlot = (slotNum) => (
    <Paper
      key={`empty-${slotNum}`}
      sx={{
        p: 1,
        minHeight: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.disabledBackground',
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
        Slot {slotNum}
      </Typography>
    </Paper>
  );

  const renderRackView = (rackConfig) => {
    if (!rackConfig || rackConfig.type !== 'rack') return null;
    
    const modules = rackConfig.modules || [];
    
    // Find the last occupied slot (don't show trailing empty slots)
    const lastOccupiedSlot = modules.length > 0 
      ? Math.max(...modules.map(m => m.slot))
      : 0;
    
    const allSlots = [];
    
    // Only create slots up to the last occupied slot
    for (let i = 0; i <= lastOccupiedSlot; i++) {
      const module = modules.find(m => m.slot === i);
      allSlots.push(module || { slot: i, empty: true });
    }
    
    return (
      <Box sx={{ mt: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeveloperBoardIcon fontSize="small" />
          Rack Configuration ({modules.length} modules found)
        </Typography>
        <Grid container spacing={1} sx={{ mt: 1 }}>
          {allSlots.map((slot) => (
            <Grid 
              item 
              xs={slot.empty ? 2 : 4} 
              sm={slot.empty ? 1.5 : 3} 
              md={slot.empty ? 1 : 2} 
              lg={slot.empty ? 0.75 : 1.5} 
              xl={slot.empty ? 0.5 : 1} 
              key={slot.slot}
            >
              {slot.empty ? renderEmptySlot(slot.slot) : renderModuleSlot(slot)}
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  const renderSingleDeviceView = (device) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Paper
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          bgcolor: 'background.default',
          border: '2px solid',
          borderColor: 'primary.main',
        }}
      >
        <MemoryIcon sx={{ fontSize: 48 }} color="primary" />
        <Typography variant="caption" sx={{ mt: 1 }}>
          {device.product_name}
        </Typography>
      </Paper>
      <Box>
        <Typography variant="body2" color="text.secondary">
          Integrated controller - no expansion rack
        </Typography>
      </Box>
    </Box>
  );

  // Sorting function
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getSortedDevices = () => {
    const sorted = [...devices].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'ip':
          // Sort IP addresses numerically
          const aIP = a.ip.split('.').map(n => parseInt(n));
          const bIP = b.ip.split('.').map(n => parseInt(n));
          for (let i = 0; i < 4; i++) {
            if (aIP[i] !== bIP[i]) return aIP[i] - bIP[i];
          }
          return 0;
        case 'product':
          aVal = a.product_name || '';
          bVal = b.product_name || '';
          return aVal.localeCompare(bVal);
        case 'serial':
          aVal = a.serial || '';
          bVal = b.serial || '';
          return aVal.localeCompare(bVal);
        case 'revision':
          aVal = typeof a.revision === 'object' ? 
            (a.revision.major * 1000 + a.revision.minor) : 0;
          bVal = typeof b.revision === 'object' ? 
            (b.revision.major * 1000 + b.revision.minor) : 0;
          return aVal - bVal;
        case 'type':
          aVal = isControlLogix(a) ? 1 : 0;
          bVal = isControlLogix(b) ? 1 : 0;
          return aVal - bVal;
        default:
          return 0;
      }
    });
    
    return sortOrder === 'desc' ? sorted.reverse() : sorted;
  };

  // Table view renderer
  const renderTableView = () => {
    const sortedDevices = getSortedDevices();
    
    return (
      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'type'}
                  direction={sortBy === 'type' ? sortOrder : 'asc'}
                  onClick={() => handleSort('type')}
                >
                  Type
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'ip'}
                  direction={sortBy === 'ip' ? sortOrder : 'asc'}
                  onClick={() => handleSort('ip')}
                >
                  IP Address
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'product'}
                  direction={sortBy === 'product' ? sortOrder : 'asc'}
                  onClick={() => handleSort('product')}
                >
                  Product Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'serial'}
                  direction={sortBy === 'serial' ? sortOrder : 'asc'}
                  onClick={() => handleSort('serial')}
                >
                  Serial
                </TableSortLabel>
              </TableCell>
              <TableCell>Max Connections</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'revision'}
                  direction={sortBy === 'revision' ? sortOrder : 'asc'}
                  onClick={() => handleSort('revision')}
                >
                  Revision
                </TableSortLabel>
              </TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedDevices.map((device, index) => {
              const { ip } = device;
              const deviceKey = `${ip}-${index}`;
              const isExpanded = expandedDevices[deviceKey];
              const rackConfig = rackConfigs[deviceKey];
              const isLoading = loadingRackConfig[deviceKey];
              const isRack = isControlLogix(device);
              
              return (
                <React.Fragment key={deviceKey}>
                  <TableRow hover>
                    <TableCell>
                      <Tooltip title={isRack ? "Rack System" : "Single Device"}>
                        {isRack ? (
                          <DeveloperBoardIcon color="primary" />
                        ) : (
                          <MemoryIcon color="action" />
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {ip}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">
                          {device.product_name || 'Unknown Device'}
                        </Typography>
                        {isRack && (
                          <Chip 
                            label="Rack"
                            size="small"
                            color="primary"
                            sx={{ height: 20 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {device.serial || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {device.revision ? 
                          (typeof device.revision === 'object' ? 
                            `${device.revision.major}.${device.revision.minor}` : 
                            device.revision) : 
                          'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {device.vendor || 'Unknown'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title={device._identified ? "Already identified - view JSON for full details" : "Connect to device and get extended info"}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleIdentifyDevice(device, index)}
                              color="secondary"
                              disabled={identifyingDevice[`${device.ip || device.ip_address}-${index}`]}
                            >
                              {identifyingDevice[`${device.ip || device.ip_address}-${index}`] ? (
                                <CircularProgress size={20} />
                              ) : (
                                <InfoIcon />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="View raw JSON data">
                          <IconButton
                            size="small"
                            onClick={() => handleShowJson(device)}
                            color="info"
                          >
                            <CodeIcon />
                          </IconButton>
                        </Tooltip>
                        {isRack && (
                          <Tooltip title={isExpanded ? "Hide rack details" : "Show rack modules"}>
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleExpandDevice(device, index)}
                                color="primary"
                                disabled={isLoading}
                              >
                                {isLoading ? (
                                  <CircularProgress size={20} />
                                ) : isExpanded ? (
                                  <ExpandLessIcon />
                                ) : (
                                  <ExpandMoreIcon />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        <Tooltip title={!canDiscoverDevices ? "You don't have permission to add devices" : ""}>
                          <span>
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<AddIcon />}
                              onClick={() => handleAddDevice(device)}
                              disabled={!canDiscoverDevices}
                            >
                              Add
                            </Button>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                  {isRack && isExpanded && rackConfig && (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ bgcolor: 'background.default', p: 2 }}>
                        {renderRackView(rackConfig)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Box>
      {/* Scan Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RouterIcon /> Network Device Discovery
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mt: 2 }}>
            <TextField
              label="Broadcast Address"
              value={broadcastAddress}
              onChange={(e) => setBroadcastAddress(e.target.value)}
              size="small"
              sx={{ flexGrow: 1, maxWidth: 300 }}
              disabled={scanning || !canDiscoverDevices}
              helperText="255.255.255.255 for all subnets"
            />
            
            <Tooltip title={!canDiscoverDevices ? "You don't have permission to discover devices" : ""}>
              <span>
                <Button
                  variant="contained"
                  startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                  onClick={handleScan}
                  disabled={scanning || !canDiscoverDevices}
                >
                  {scanning ? 'Scanning...' : 'Scan Network'}
                </Button>
              </span>
            </Tooltip>

            {devices.length > 0 && !scanning && canDiscoverDevices && (
              <Tooltip title="Refresh scan">
                <IconButton onClick={handleScan} color="primary">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {lastScanTime && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Last scan: {lastScanTime.toLocaleTimeString()}
              {cached && ' (from cache)'}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Permission Notice */}
      {!canDiscoverDevices && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            Permission Required
          </Typography>
          <Typography variant="body2">
            You don't have permission to discover devices on the network. 
            Please contact your administrator to request the <strong>connectivity.devices</strong> create permission.
          </Typography>
        </Alert>
      )}

      {/* Network Requirements Notice */}
      {canDiscoverDevices && !scanning && devices.length === 0 && !error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            Network Discovery Requirements
          </Typography>
          <Typography variant="body2" component="div">
            Discovery uses UDP broadcast packets. For reliable results:
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
              <li>Devices must be on the same network subnet</li>
              <li>Firewall must allow UDP port 44818 (EtherNet/IP)</li>
              <li><strong>Virtual Machines:</strong> Use Bridged network adapter (not NAT/Shared)</li>
            </ul>
          </Typography>
        </Alert>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Scanning Status */}
      {scanning && (
        <Paper sx={{ p: 3, mb: 2, textAlign: 'center', bgcolor: 'action.hover' }}>
          <CircularProgress size={40} sx={{ mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            📡 Discovering devices on network...
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This may take up to 15 seconds
          </Typography>
        </Paper>
      )}

      {/* Results Summary */}
      {!scanning && devices.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip 
            icon={<InfoIcon />}
            label={`${devices.length} device${devices.length !== 1 ? 's' : ''} found`}
            color="success"
            variant="outlined"
          />
          
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(e, newMode) => newMode && setViewMode(newMode)}
            size="small"
          >
            <ToggleButton value="cards" aria-label="card view">
              <Tooltip title="Card View">
                <ViewModuleIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="table" aria-label="table view">
              <Tooltip title="Table View">
                <ViewListIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Device List */}
      {!scanning && devices.length === 0 && lastScanTime && (
        <Alert severity="info">
          No devices found. Make sure devices are powered on and connected to the network.
        </Alert>
      )}

      {/* Conditional rendering based on view mode */}
      {!scanning && devices.length > 0 && (
        viewMode === 'table' ? renderTableView() : (
          <Stack spacing={2}>
            {devices.map((device, index) => {
          const ip = device.ip || device.ip_address;
          const deviceKey = `${ip}-${index}`;
          const isExpanded = expandedDevices[deviceKey];
          const rackConfig = rackConfigs[deviceKey];
          const isLoading = loadingRackConfig[deviceKey];
          const isRack = isControlLogix(device);
          
          return (
          <Card 
            key={deviceKey}
            variant="outlined"
            sx={{ 
              transition: 'all 0.2s',
              '&:hover': {
                boxShadow: 2,
                borderColor: 'primary.main',
              }
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                  {/* IP Address with Device Type Badge */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="h6" component="div">
                      {ip}
                      {device.slot !== undefined && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                          (Slot {device.slot})
                        </Typography>
                      )}
                    </Typography>
                    {isRack && (
                      <Chip 
                        label="Rack System"
                        size="small"
                        color="primary"
                        icon={<DeveloperBoardIcon />}
                      />
                    )}
                  </Box>

                  {/* Product Name */}
                  <Typography variant="body1" color="text.primary" sx={{ mb: 1, fontWeight: 500 }}>
                    {device.product_name || 'Unknown Device'}
                  </Typography>

                  {/* Device Details */}
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {device.vendor && (
                      <Chip 
                        label={device.vendor}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    
                    {device.serial && (
                      <Typography variant="body2" color="text.secondary">
                        Serial: {device.serial}
                      </Typography>
                    )}
                    
                    {device.revision && (
                      <Typography variant="body2" color="text.secondary">
                        Rev: {typeof device.revision === 'object' ? `${device.revision.major}.${device.revision.minor}` : device.revision}
                      </Typography>
                    )}
                    
                    {device.product_code && (
                      <Typography variant="body2" color="text.secondary">
                        Code: {device.product_code}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
                  <Tooltip title={device._identified ? "Already identified - view JSON for full details" : "Connect to device and get extended info"}>
                    <span>
                      <IconButton
                        onClick={() => handleIdentifyDevice(device, index)}
                        color="secondary"
                        disabled={identifyingDevice[`${device.ip || device.ip_address}-${index}`]}
                      >
                        {identifyingDevice[`${device.ip || device.ip_address}-${index}`] ? (
                          <CircularProgress size={24} />
                        ) : (
                          <InfoIcon />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="View raw JSON data">
                    <IconButton
                      onClick={() => handleShowJson(device)}
                      color="info"
                    >
                      <CodeIcon />
                    </IconButton>
                  </Tooltip>
                  {isRack && (
                    <Tooltip title={isExpanded ? "Hide rack details" : "Show rack modules"}>
                      <span>
                        <IconButton 
                          onClick={() => handleExpandDevice(device, index)}
                          color="primary"
                          disabled={isLoading}
                        >
                          {isLoading ? <CircularProgress size={24} /> : (isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title={!canDiscoverDevices ? "You don't have permission to add devices" : ""}>
                    <span>
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleAddDevice(device)}
                        disabled={!canDiscoverDevices}
                      >
                        Add
                      </Button>
                    </span>
                  </Tooltip>
                </Box>
              </Box>

              {/* Expandable Rack Configuration or Single Device View */}
              {isRack && isExpanded && (
                <Collapse in={isExpanded}>
                  {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress />
                    </Box>
                  )}
                  {!isLoading && rackConfig && (
                    rackConfig.type === 'rack' ? renderRackView(rackConfig) : renderSingleDeviceView(device)
                  )}
                </Collapse>
              )}
            </CardContent>
          </Card>
        );
        })}
          </Stack>
        )
      )}

      {/* Help Text */}
      {!scanning && devices.length === 0 && !lastScanTime && (
        <Paper sx={{ p: 3, mt: 2, bgcolor: 'background.default' }}>
          <Typography variant="h6" gutterBottom>
            Getting Started
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Click "Scan Network" to discover EtherNet/IP devices on your network. The scanner will:
          </Typography>
          <Box component="ul" sx={{ mt: 1, pl: 2 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              Send broadcast messages to find all Allen-Bradley and compatible PLCs
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Display device information including model, IP address, and serial number
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Allow you to quickly add discovered devices to your connections
            </Typography>
          </Box>
          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>Note:</strong> Discovery uses UDP broadcast packets. Ensure your firewall allows UDP traffic and devices are on the same network or reachable subnet.
          </Alert>
        </Paper>
      )}

      {/* JSON Data Dialog */}
      <Dialog
        open={jsonDialogOpen}
        onClose={handleCloseJson}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Raw Device Data
          {selectedDeviceJson && (
            <Typography variant="subtitle2" color="text.secondary">
              {selectedDeviceJson.product_name || 'Unknown'} - {selectedDeviceJson.ip || selectedDeviceJson.ip_address}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Paper
            sx={{
              p: 2,
              bgcolor: 'grey.900',
              color: 'grey.100',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              overflow: 'auto',
              maxHeight: '60vh',
            }}
          >
            <pre style={{ margin: 0 }}>
              {selectedDeviceJson && JSON.stringify(selectedDeviceJson, null, 2)}
            </pre>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseJson}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(selectedDeviceJson, null, 2));
            }}
          >
            Copy to Clipboard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviceDiscovery;
