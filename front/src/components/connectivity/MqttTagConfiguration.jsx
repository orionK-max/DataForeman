import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  MenuItem,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Checkbox,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import mqttService from '../../services/mqttService';
import SavedTagsList from './SavedTagsList';
import RawFieldModal from './RawFieldModal';

const MqttTagConfiguration = ({ connectionId: initialConnectionId, connections = [], onTagsSaved }) => {
  const [selectedConnection, setSelectedConnection] = useState(initialConnectionId || '');
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [deviceCredentials, setDeviceCredentials] = useState([]);
  
  // Field analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedFields, setDetectedFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [detectedFieldNames, setDetectedFieldNames] = useState({});
  const [detectedFieldDataTypes, setDetectedFieldDataTypes] = useState({});
  const [detectedFieldsSearch, setDetectedFieldsSearch] = useState('');
  
  // Manual entry
  const [manualFields, setManualFields] = useState([]);

  // Raw field mappings (non-JSON subscriptions)
  const [rawFields, setRawFields] = useState([]);
  const [rawFieldModalOpen, setRawFieldModalOpen] = useState(false);
  
  // Existing mappings
  const [existingMappings, setExistingMappings] = useState([]);
  
  // CSV import
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [csvPreview, setCsvPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  
  // Tag creation
  const [creating, setCreating] = useState(false);
  
  // UI state
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [savedTagsRefreshKey, setSavedTagsRefreshKey] = useState(0);

  useEffect(() => {
    if (initialConnectionId && !selectedConnection) {
      setSelectedConnection(initialConnectionId);
    }
  }, [initialConnectionId]);

  useEffect(() => {
    if (selectedConnection) {
      setSelectedSubscription('');
      loadSubscriptions();
    }
  }, [selectedConnection]);

  // Load device credentials (used to label subscriptions linked to a device)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const creds = await mqttService.getDeviceCredentials();
        if (alive) setDeviceCredentials(creds || []);
      } catch (err) {
        // Non-fatal; dropdown will fall back to connection name
        console.error('Failed to load MQTT device credentials:', err);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const deviceNameById = useMemo(() => {
    const map = new Map();
    for (const cred of deviceCredentials || []) {
      if (cred?.id) map.set(cred.id, cred.device_name || cred.username || cred.id);
    }
    return map;
  }, [deviceCredentials]);

  useEffect(() => {
    if (selectedSubscription) {
      loadExistingMappings();
      // Clear detection state when changing subscriptions
      setDetectedFields([]);
      setSelectedFields(new Set());
      setDetectedFieldDataTypes({});
      setManualFields([]);
      setRawFields([]);
      setDetectedFieldsSearch('');
      // Automatically analyze fields when subscription is selected
      handleAnalyzeFields();
    }
  }, [selectedSubscription]);

  const filteredDetectedFields = useMemo(() => {
    const q = detectedFieldsSearch.trim().toLowerCase();
    if (!q) return detectedFields;

    return detectedFields.filter((combo) => {
      const key = `${combo.topic}|${combo.field_path}`;
      const tagName = detectedFieldNames[key] || '';
      const haystack = [
        combo.topic,
        combo.field_path,
        tagName,
        combo.data_type,
        combo.sample_value != null ? JSON.stringify(combo.sample_value) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [detectedFields, detectedFieldsSearch, detectedFieldNames]);

  const loadSubscriptions = async () => {
    try {
      const data = await mqttService.getSubscriptions();
      const filtered = data.filter(sub => sub.connection_id === selectedConnection);
      setSubscriptions(filtered);
      
      // Auto-select first subscription if only one
      if (filtered.length === 1 && !selectedSubscription) {
        setSelectedSubscription(filtered[0].id);
      }
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError('Failed to load subscriptions');
    }
  };

  const loadExistingMappings = async () => {
    try {
      const mappings = await mqttService.getFieldMappings(selectedSubscription);
      setExistingMappings(mappings);
    } catch (err) {
      console.error('Failed to load existing mappings:', err);
    }
  };

  const handleAnalyzeFields = async () => {
    if (!selectedSubscription) {
      setError('Please select a subscription first');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setDetectedFieldsSearch('');
    
    try {
      const result = await mqttService.analyzeFields(selectedSubscription);
      setDetectedFields(result.combinations || []);
      setSelectedFields(new Set());
      
      // Generate default tag names
      const defaultNames = {};
      (result.combinations || []).forEach(combo => {
        const key = `${combo.topic}|${combo.field_path}`;
        // Default: capitalize field path and remove dots
        defaultNames[key] = combo.field_path
          .split('.')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');
      });
      setDetectedFieldNames(defaultNames);

      const defaultTypes = {};
      (result.combinations || []).forEach(combo => {
        const key = `${combo.topic}|${combo.field_path}`;
        defaultTypes[key] = combo.data_type.toLowerCase();
      });
      setDetectedFieldDataTypes(defaultTypes);

      if (result.combinations.length === 0) {
        setError('No fields detected. Make sure messages are being received.');
      }
    } catch (err) {
      console.error('Failed to analyze fields:', err);
      setError(err.message || 'Failed to analyze fields');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleToggleField = (combo) => {
    const key = `${combo.topic}|${combo.field_path}`;
    const newSelected = new Set(selectedFields);
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    
    setSelectedFields(newSelected);
  };

  const handleAddManualField = () => {
    setManualFields([
      ...manualFields,
      { topic: '', field_path: '', tag_name: '', data_type: 'real' }
    ]);
  };

  const handleRemoveManualField = (index) => {
    setManualFields(manualFields.filter((_, i) => i !== index));
  };

  const handleManualFieldChange = (index, field, value) => {
    const newFields = [...manualFields];
    newFields[index][field] = value;
    setManualFields(newFields);
  };

  const handleCreateMappings = async () => {
    if (!selectedSubscription) {
      setError('Please select a subscription');
      return;
    }

    // Collect selected detected fields
    const selectedCombinations = detectedFields.filter(combo => 
      selectedFields.has(`${combo.topic}|${combo.field_path}`)
    );

    // Combine with manual fields
    const allMappings = [
      ...selectedCombinations.map(combo => {
        const key = `${combo.topic}|${combo.field_path}`;
        return {
          subscription_id: selectedSubscription,
          topic: combo.topic,
          field_path: combo.field_path,
          tag_name: detectedFieldNames[key] || combo.field_path.replace(/\./g, '_'),
          data_type: detectedFieldDataTypes[key] || combo.data_type.toLowerCase(),
          type_strictness: 'coerce',
          on_failure: 'skip',
          default_value: null,
          enabled: true,
        };
      }),
      ...manualFields.filter(f => f.topic && f.field_path && f.tag_name).map(f => ({
        subscription_id: selectedSubscription,
        topic: f.topic,
        field_path: f.field_path,
        tag_name: f.tag_name,
        data_type: f.data_type.toLowerCase(),
        type_strictness: f.type_strictness || 'coerce',
        on_failure: f.on_failure || 'skip',
        default_value: f.default_value || null,
        enabled: true,
      })),
      ...rawFields.filter(f => f.topic && f.value_expression && f.tag_name).map(f => ({
        subscription_id: selectedSubscription,
        topic: f.topic,
        tag_name: f.tag_name,
        data_type: f.data_type.toLowerCase(),
        value_expression: f.value_expression,
        type_strictness: 'coerce',
        on_failure: 'skip',
        default_value: null,
        enabled: true,
      })),
    ];

    if (allMappings.length === 0) {
      setError('Please select at least one field or add manual entries');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Create mappings
      const mappingIds = [];
      for (const mapping of allMappings) {
        const result = await mqttService.createFieldMapping(mapping);
        mappingIds.push(result.id);
      }

      // Create tags from mappings
      const tagResult = await mqttService.createTagsFromMappings(mappingIds);
      
      setSuccess('Tags saved successfully');
      setError(null);
      
      // Clear selections
      setSelectedFields(new Set());
      setManualFields([]);
      setRawFields([]);
      
      // Reload mappings and refresh saved tags
      await loadExistingMappings();
      setSavedTagsRefreshKey(prev => prev + 1);
      
      if (onTagsSaved) {
        onTagsSaved();
      }

      // Show results
      const created = tagResult.created || 0;
      const failed = tagResult.failed || 0;

      if (failed > 0 && created === 0) {
        // All failed — show as error
        const messages = tagResult.errors?.map(e => e.error).join('\n') || 'Unknown error';
        setSuccess(false);
        setError(`Failed to create tag${failed > 1 ? 's' : ''}:\n${messages}`);
      } else if (failed > 0) {
        // Partial — show success count + error details
        const messages = tagResult.errors?.map(e => e.error).join('\n');
        setSuccess(`Created ${created} tag${created !== 1 ? 's' : ''}`);
        setError(`${failed} tag${failed > 1 ? 's' : ''} could not be created:\n${messages}`);
      } else {
        setSuccess(`Created ${created} tag${created !== 1 ? 's' : ''}`);
        setTimeout(() => setSuccess(false), 3000);
      }

    } catch (err) {
      console.error('Failed to create mappings:', err);
      setError(err.message || 'Failed to create field mappings');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenCsvDialog = () => {
    setCsvData('');
    setCsvPreview(null);
    setCsvDialogOpen(true);
  };

  const handleParseCsv = async () => {
    if (!csvData.trim()) {
      setError('Please enter CSV data');
      return;
    }

    setImporting(true);
    try {
      const preview = await mqttService.importFieldMappingsCSV(selectedSubscription, csvData);
      setCsvPreview(preview);
    } catch (err) {
      console.error('Failed to parse CSV:', err);
      setError(err.message || 'Failed to parse CSV');
    } finally {
      setImporting(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvPreview || !csvPreview.mappings || csvPreview.mappings.length === 0) {
      setError('No valid mappings to import');
      return;
    }

    setImporting(true);
    try {
      // Create mappings
      const mappingIds = [];
      for (const mapping of csvPreview.mappings) {
        const result = await mqttService.createFieldMapping(mapping);
        mappingIds.push(result.id);
      }

      // Create tags
      await mqttService.createTagsFromMappings(mappingIds);
      
      setCsvDialogOpen(false);
      setSuccess('CSV imported successfully');
      
      await loadExistingMappings();
      setSavedTagsRefreshKey(prev => prev + 1);
      
      if (onTagsSaved) {
        onTagsSaved();
      }

    } catch (err) {
      console.error('Failed to import CSV:', err);
      setError(err.message || 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  const isFieldSelected = (combo) => {
    return selectedFields.has(`${combo.topic}|${combo.field_path}`);
  };

  const isFieldAlreadyMapped = (topic, fieldPath) => {
    return existingMappings.some(m => m.topic === topic && m.field_path === fieldPath);
  };

  // Derived: selected subscription object (for payload_format)
  const selectedSubObject = subscriptions.find(s => s.id === selectedSubscription);
  const isRawSubscription = selectedSubObject?.payload_format === 'raw';
  const subscriptionTopics = selectedSubObject ? [selectedSubObject.topic] : [];

  const getMappingForField = (topic, fieldPath) => {
    return existingMappings.find(m => m.topic === topic && m.field_path === fieldPath);
  };

  const handleUnmapField = async (mappingId) => {
    try {
      await mqttService.deleteFieldMapping(mappingId);
      await loadExistingMappings();
    } catch (err) {
      console.error('Failed to remove mapping:', err);
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 280px)', minHeight: 0 }}>
      {/* Left Panel - Configuration */}
      <Box sx={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, minWidth: 0 }}>
        <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
            <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, minWidth: 0, pr: 1 }}>
              <Typography variant="h6" gutterBottom>
                MQTT Field Mapping Configuration
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
                  {success}
                </Alert>
              )}



              {/* Connection & Subscription Selector */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                {connections.length > 1 && (
                  <FormControl fullWidth>
                    <InputLabel>MQTT Connection</InputLabel>
                    <Select
                      value={selectedConnection}
                      onChange={(e) => setSelectedConnection(e.target.value)}
                      label="MQTT Connection"
                    >
                      {connections.map(conn => (
                        <MenuItem key={conn.id} value={conn.id}>
                          {conn.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <FormControl fullWidth>
                  <InputLabel>Subscription</InputLabel>
                  <Select
                    value={selectedSubscription}
                    onChange={(e) => setSelectedSubscription(e.target.value)}
                    label="Subscription"
                    disabled={!selectedConnection}
                  >
                    {subscriptions.map(sub => (
                      <MenuItem key={sub.id} value={sub.id}>
                        {(sub.device_credential_id && deviceNameById.get(sub.device_credential_id))
                          || sub.connection_name
                          || connections.find(c => c.id === selectedConnection)?.name
                          || 'Unknown'}: {sub.topic}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {selectedSubscription && (
                <>
                  {/* Manual Entry Section */}
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1">
                        Manual Field Entry
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {isRawSubscription && (
                          <Button
                            startIcon={<AddIcon />}
                            onClick={() => setRawFieldModalOpen(true)}
                            size="small"
                            variant="outlined"
                          >
                            Add Raw Field
                          </Button>
                        )}
                        {!isRawSubscription && (
                          <Button
                            startIcon={<AddIcon />}
                            onClick={handleAddManualField}
                            size="small"
                          >
                            Add Field
                          </Button>
                        )}
                      </Box>
                    </Box>

                    {manualFields.length > 0 && (
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Topic</TableCell>
                              <TableCell>Field Path</TableCell>
                              <TableCell>Tag Name</TableCell>
                              <TableCell>Data Type</TableCell>
                              <TableCell width={50}></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {manualFields.map((field, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    value={field.topic}
                                    onChange={(e) => handleManualFieldChange(idx, 'topic', e.target.value)}
                                    placeholder="sensor/data"
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    value={field.field_path}
                                    onChange={(e) => handleManualFieldChange(idx, 'field_path', e.target.value)}
                                    placeholder="temperature"
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    value={field.tag_name}
                                    onChange={(e) => handleManualFieldChange(idx, 'tag_name', e.target.value)}
                                    placeholder="SensorTemp"
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                <Box>
                                  <TextField
                                    select
                                    size="small"
                                    value={field.data_type}
                                    onChange={(e) => handleManualFieldChange(idx, 'data_type', e.target.value)}
                                    fullWidth
                                  >
                                    <MenuItem value="real">real</MenuItem>
                                    <MenuItem value="int">int</MenuItem>
                                    <MenuItem value="text">text</MenuItem>
                                    <MenuItem value="bool">bool</MenuItem>
                                    <MenuItem value="json">json</MenuItem>
                                  </TextField>
                                  {field.data_type === 'text' && (
                                    <Tooltip title="Numeric-looking string values (e.g. &quot;23.5&quot;) will be stored as text, not as numbers. Charts cannot plot text values.">
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, color: 'warning.main' }}>
                                        <WarningAmberIcon sx={{ fontSize: 14 }} />
                                        <Typography variant="caption">Stored as text</Typography>
                                      </Box>
                                    </Tooltip>
                                  )}
                                </Box>
                                </TableCell>
                                <TableCell>
                                  <IconButton size="small" onClick={() => handleRemoveManualField(idx)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}

                    {/* Raw fields list (for raw-format subscriptions) */}
                    {rawFields.length > 0 && (
                      <TableContainer component={Paper} variant="outlined" sx={{ mt: manualFields.length > 0 ? 1 : 0 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Topic</TableCell>
                              <TableCell>Expression</TableCell>
                              <TableCell>Tag Name</TableCell>
                              <TableCell>Type</TableCell>
                              <TableCell width={50}></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rawFields.map((field, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{field.topic}</TableCell>
                                <TableCell>
                                  <code style={{ fontSize: '0.75rem' }}>{field.value_expression}</code>
                                </TableCell>
                                <TableCell>{field.tag_name}</TableCell>
                                <TableCell>{field.data_type}</TableCell>
                                <TableCell>
                                  <IconButton size="small" onClick={() => setRawFields(rawFields.filter((_, i) => i !== idx))}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>

                  {/* Analyze Fields Section */}
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1">
                        Detected Fields
                        {detectedFields.length > 0 && (
                          <> ({filteredDetectedFields.length}/{detectedFields.length})</>
                        )}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField
                          size="small"
                          placeholder="Search detected fields..."
                          value={detectedFieldsSearch}
                          onChange={(e) => setDetectedFieldsSearch(e.target.value)}
                          sx={{ minWidth: 260 }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                              </InputAdornment>
                            ),
                          }}
                        />
                        <Button
                          startIcon={analyzing ? <CircularProgress size={16} /> : <RefreshIcon />}
                          onClick={handleAnalyzeFields}
                          disabled={analyzing}
                          size="small"
                        >
                          {analyzing ? 'Refreshing...' : 'Refresh'}
                        </Button>
                        <Button
                          startIcon={<ImportExportIcon />}
                          onClick={handleOpenCsvDialog}
                          size="small"
                        >
                          Import CSV
                        </Button>
                      </Box>
                    </Box>

                    {detectedFields.length > 0 ? (
                      <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell padding="checkbox">Select</TableCell>
                              <TableCell>Topic</TableCell>
                              <TableCell>Field Path</TableCell>
                              <TableCell>Tag Name</TableCell>
                              <TableCell>
                                <Tooltip title="Select a row to change its storage type before saving. The ingestor will coerce values to the chosen type." placement="top">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'default' }}>
                                    Data Type <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                  </Box>
                                </Tooltip>
                              </TableCell>
                              <TableCell>Last Value</TableCell>
                              <TableCell>Status</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filteredDetectedFields.map((combo, idx) => {
                              const alreadyMapped = isFieldAlreadyMapped(combo.topic, combo.field_path);
                              const key = `${combo.topic}|${combo.field_path}`;
                              return (
                                <TableRow key={idx} hover>
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={isFieldSelected(combo)}
                                      onChange={() => handleToggleField(combo)}
                                      disabled={alreadyMapped}
                                    />
                                  </TableCell>
                                  <TableCell>{combo.topic}</TableCell>
                                  <TableCell><code>{combo.field_path}</code></TableCell>
                                  <TableCell>
                                    <TextField
                                      size="small"
                                      value={detectedFieldNames[key] || ''}
                                      onChange={(e) => setDetectedFieldNames({...detectedFieldNames, [key]: e.target.value})}
                                      disabled={alreadyMapped}
                                      placeholder="TagName"
                                      fullWidth
                                    />
                                  </TableCell>
                                  <TableCell sx={{ py: 0 }}>
                                    <Select
                                      size="small"
                                      value={detectedFieldDataTypes[key] || combo.data_type.toLowerCase()}
                                      onChange={(e) => setDetectedFieldDataTypes(prev => ({ ...prev, [key]: e.target.value }))}
                                      disabled={alreadyMapped || !isFieldSelected(combo)}
                                      sx={{ minWidth: 80 }}
                                    >
                                      <MenuItem value="real">real</MenuItem>
                                      <MenuItem value="int">int</MenuItem>
                                      <MenuItem value="text">text</MenuItem>
                                      <MenuItem value="bool">bool</MenuItem>
                                      <MenuItem value="json">json</MenuItem>
                                    </Select>
                                  </TableCell>
                                  <TableCell>{JSON.stringify(combo.sample_value)}</TableCell>
                                  <TableCell>
                                    {alreadyMapped ? (
                                      <Chip label="Mapped" size="small" color="default" />
                                    ) : (
                                      <Chip label="New" size="small" color="primary" />
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="info">
                        Click "Refresh" to detect fields from recent messages
                      </Alert>
                    )}
                  </Box>

                </>
              )}
            </Box>

            {/* Fixed Footer Actions */}
            {selectedSubscription && (
              <Box
                sx={{
                  pt: 2,
                  pb: 2,
                  px: 2,
                  mt: 1,
                  borderTop: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 2,
                  bgcolor: 'background.paper',
                  flexShrink: 0,
                }}
              >
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={creating ? <CircularProgress size={16} /> : <SaveIcon />}
                  onClick={handleCreateMappings}
                  disabled={creating || (selectedFields.size === 0 && manualFields.length === 0 && rawFields.length === 0)}
                >
                  {creating ? 'Creating...' : 'Create Tags from Mappings'}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Right Panel - Saved Tags */}
      <Box sx={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column' }}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Typography variant="h6" gutterBottom>
              Saved Tags
            </Typography>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <SavedTagsList
                connectionId={selectedConnection}
                hidePollGroup
                onTagsChanged={() => {
                  setSavedTagsRefreshKey(prev => prev + 1);
                  if (selectedSubscription) {
                    loadExistingMappings();
                  }
                }}
                refreshTrigger={savedTagsRefreshKey}
              />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onClose={() => setCsvDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Import Field Mappings from CSV</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            CSV Format: topic, field_path, tag_name, data_type (optional), type_strictness (optional)
            <br />
            Example: sensor/data, temperature, SensorTemp, REAL, convert
          </Alert>

          <TextField
            label="CSV Data"
            multiline
            rows={10}
            fullWidth
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            placeholder="topic,field_path,tag_name,data_type&#10;sensor/data,temperature,SensorTemp,REAL&#10;sensor/data,pressure,SensorPress,REAL"
            sx={{ mb: 2, fontFamily: 'monospace' }}
          />

          {csvPreview && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Preview: {csvPreview.valid_rows} valid rows, {csvPreview.errors?.length || 0} errors
              </Typography>

              {csvPreview.errors && csvPreview.errors.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {csvPreview.errors.map((err, idx) => (
                    <div key={idx}>Row {err.row}: {err.error}</div>
                  ))}
                </Alert>
              )}

              {csvPreview.mappings && csvPreview.mappings.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Topic</TableCell>
                        <TableCell>Field Path</TableCell>
                        <TableCell>Tag Name</TableCell>
                        <TableCell>Data Type</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {csvPreview.mappings.map((mapping, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{mapping.topic}</TableCell>
                          <TableCell><code>{mapping.field_path}</code></TableCell>
                          <TableCell>{mapping.tag_name}</TableCell>
                          <TableCell>{mapping.data_type}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCsvDialogOpen(false)}>Cancel</Button>
          {!csvPreview ? (
            <Button
              onClick={handleParseCsv}
              variant="contained"
              disabled={importing || !csvData.trim()}
            >
              {importing ? 'Parsing...' : 'Parse CSV'}
            </Button>
          ) : (
            <Button
              onClick={handleImportCsv}
              variant="contained"
              color="primary"
              disabled={importing || !csvPreview.mappings || csvPreview.mappings.length === 0}
            >
              {importing ? 'Importing...' : 'Import Mappings'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Raw Field Modal */}
      <RawFieldModal
        open={rawFieldModalOpen}
        onClose={() => setRawFieldModalOpen(false)}
        onAdd={(field) => setRawFields(prev => [...prev, field])}
        subscriptionId={selectedSubscription}
        topics={subscriptionTopics}
      />
    </Box>
  );
};

export default MqttTagConfiguration;
