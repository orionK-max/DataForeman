import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  MenuItem,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import connectivityService from '../../services/connectivityService';
import SavedTagsList from './SavedTagsList';

const S7TagEntry = ({ connectionId: initialConnectionId, connections = [], onTagsSaved }) => {
  const [selectedConnection, setSelectedConnection] = useState(initialConnectionId || '');
  const [tags, setTags] = useState([{ path: '', name: '', dataType: 'REAL' }]);
  const [pollGroups, setPollGroups] = useState([]);
  const [selectedPollGroup, setSelectedPollGroup] = useState(''); // Will be set after poll groups load
  const [saving, setSaving] = useState(false);
  // Write on change settings
  const [changeDetectionEnabled, setChangeDetectionEnabled] = useState(true); // Default enabled
  const [deadband, setDeadband] = useState(0);
  const [deadbandType, setDeadbandType] = useState('absolute');
  const [forcePublishInterval, setForcePublishInterval] = useState(60); // seconds
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Update selected connection if initialConnectionId changes
    if (initialConnectionId && initialConnectionId !== selectedConnection) {
      setSelectedConnection(initialConnectionId);
    }
  }, [initialConnectionId, selectedConnection]);

  useEffect(() => {
    loadPollGroups();
  }, [selectedConnection]);

  const loadPollGroups = async () => {
    try {
      const result = await connectivityService.getPollGroups();
      const groups = result.poll_groups || [];
      setPollGroups(groups);
      // Set default to group_id 5 if it exists, otherwise first group
      if (groups.length > 0) {
        const defaultGroup = groups.find(g => g.group_id === 5) || groups[0];
        setSelectedPollGroup(defaultGroup.group_id);
      }
    } catch (err) {
      console.error('Failed to load poll groups:', err);
    }
  };

  const handleAddTag = () => {
    setTags([...tags, { path: '', name: '', dataType: 'REAL' }]);
  };

  const handleRemoveTag = (index) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleTagChange = (index, field, value) => {
    const newTags = [...tags];
    newTags[index][field] = value;
    setTags(newTags);
    setError(null);
    setSuccess(false);
  };

  const validateTags = () => {
    const filledTags = tags.filter(t => t.path.trim());
    
    if (filledTags.length === 0) {
      return 'At least one tag path is required';
    }

    for (const tag of filledTags) {
      if (!tag.path.trim()) continue;
      
      // Basic S7 address validation
      const validPatterns = [
        /^DB\d+\.DBX\d+\.\d+$/,  // Bool: DB1.DBX0.0
        /^DB\d+\.DBB\d+$/,        // Byte: DB1.DBB0
        /^DB\d+\.DBW\d+$/,        // Word: DB1.DBW0
        /^DB\d+\.DBD\d+$/,        // DWord/Real: DB1.DBD0
        /^[MIQ]B\d+$/,            // Marker/Input/Output Byte
        /^[MIQ]W\d+$/,            // Marker/Input/Output Word
        /^[MIQ]D\d+$/,            // Marker/Input/Output DWord
        /^[MIQ]X\d+\.\d+$/,       // Marker/Input/Output Bit
      ];

      const isValid = validPatterns.some(pattern => pattern.test(tag.path));
      if (!isValid) {
        return `Invalid S7 address format: ${tag.path}`;
      }

      // Auto-fill name if empty
      if (!tag.name.trim()) {
        tag.name = tag.path;
      }
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateTags();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const filledTags = tags.filter(t => t.path.trim());
      
      const payload = {
        id: selectedConnection,
        items: filledTags.map(tag => ({
          nodeId: tag.path.trim(),
          name: tag.name.trim() || tag.path.trim(),
          type: tag.dataType,
        })),
        poll_group_id: selectedPollGroup,
        subscribe: true, // Always enable subscription for newly saved tags
        // Write on change settings
        on_change_enabled: changeDetectionEnabled,
        on_change_deadband: deadband,
        on_change_deadband_type: deadbandType,
        on_change_heartbeat_ms: forcePublishInterval * 1000, // Convert seconds to ms
      };

      await connectivityService.saveTags(payload);
      
      // Reset form
      setTags([{ path: '', name: '', dataType: 'REAL' }]);
      setSuccess(true);
      
      if (onTagsSaved) {
        onTagsSaved();
      }
    } catch (err) {
      setError(err.message || 'Failed to save tags');
    } finally {
      setSaving(false);
    }
  };

  const dataTypes = [
    'BOOL',
    'BYTE',
    'INT',
    'WORD',
    'DINT',
    'DWORD',
    'REAL',
    'STRING',
  ];

  if (!selectedConnection) {
    return (
      <Alert severity="info">
        Select a device to add S7 tags
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* Tag Entry Form - Left Side */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Card sx={{ height: 'calc(70vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Typography variant="h6" gutterBottom>
                S7 Tag Entry
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Manually enter S7 tag addresses to monitor
              </Typography>

              {/* Device Selection Section */}
              {connections && connections.length > 0 ? (
                <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    select
                    size="small"
                    label="Select S7 Device"
                    value={selectedConnection}
                    onChange={(e) => setSelectedConnection(e.target.value)}
                    sx={{ flex: 1 }}
                  >
                    {connections.map((conn) => (
                      <MenuItem key={conn.id} value={conn.id}>
                        {conn.name || conn.id} - {conn.host}:{conn.port || 102} (Rack: {conn.rack}, Slot: {conn.slot})
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddTag}
                    sx={{ minWidth: 120, flexShrink: 0 }}
                  >
                    Add Row
                  </Button>
                </Box>
              ) : (
                <Alert severity="warning" sx={{ mb: 3 }}>
                  No S7 connections available. Create a connection in the Devices tab to add tags.
                </Alert>
              )}

              {!selectedConnection ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Select a device above to add S7 tags.
                </Alert>
              ) : (
                <>



        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
            Tags saved successfully!
          </Alert>
        )}

        {/* Tag Entry Table */}
        <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto', mb: 2, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell width="40%">Tag Path *</TableCell>
                <TableCell width="30%">Tag Name</TableCell>
                <TableCell width="20%">Data Type</TableCell>
                <TableCell width="10%">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tags.map((tag, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="e.g., DB1.DBD0"
                      value={tag.path}
                      onChange={(e) => handleTagChange(index, 'path', e.target.value)}
                      disabled={saving}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Optional display name"
                      value={tag.name}
                      onChange={(e) => handleTagChange(index, 'name', e.target.value)}
                      disabled={saving}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={tag.dataType}
                      onChange={(e) => handleTagChange(index, 'dataType', e.target.value)}
                      disabled={saving}
                    >
                      {dataTypes.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveTag(index)}
                      disabled={saving || tags.length === 1}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Address Format Examples */}
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="caption" component="div">
            <strong>S7 Address Format Examples:</strong>
            <br />
            • DB1.DBX0.0 - Bool at DB1, byte 0, bit 0
            <br />
            • DB1.DBB0 - Byte at DB1, byte 0
            <br />
            • DB1.DBW0 - Word (INT) at DB1, byte 0
            <br />
            • DB1.DBD0 - Double Word (DINT/REAL) at DB1, byte 0
            <br />
            • MB0, MW0, MD0 - Marker area (byte/word/dword)
            <br />
            • IB0, IW0, ID0 - Input area
            <br />
            • QB0, QW0, QD0 - Output area
          </Typography>
        </Alert>

                  {/* Save Section with Poll Group and Write on Change */}
                  {tags.some(t => t.path.trim()) && (
                    <Paper sx={{ p: 2, mb: 2, backgroundColor: 'background.default' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Tag Configuration
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                        <TextField
                          select
                          size="small"
                          label="Poll Group"
                          value={selectedPollGroup}
                          onChange={(e) => setSelectedPollGroup(Number(e.target.value))}
                          sx={{ minWidth: 180 }}
                        >
                          {pollGroups.map((group) => (
                            <MenuItem key={group.group_id} value={group.group_id}>
                              {group.name} ({group.poll_rate_ms}ms)
                            </MenuItem>
                          ))}
                        </TextField>
                        
                        <Tooltip title="Only save tag values to database when they change, reducing writes for stable values">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Checkbox
                              checked={changeDetectionEnabled}
                              onChange={(e) => setChangeDetectionEnabled(e.target.checked)}
                              size="small"
                            />
                            <Typography variant="body2">
                              Write on Change
                            </Typography>
                          </Box>
                        </Tooltip>
                        
                        {changeDetectionEnabled && (
                          <>
                            <Tooltip title="Minimum change required to trigger a write. For absolute: fixed value difference. For percent: percentage of previous value.">
                              <TextField
                                size="small"
                                type="number"
                                label="Deadband"
                                value={deadband}
                                onChange={(e) => setDeadband(Number(e.target.value))}
                                inputProps={{ min: 0, step: 0.1 }}
                                sx={{ width: 120 }}
                              />
                            </Tooltip>
                            <Tooltip title="Absolute: fixed value difference (e.g., 0.5). Percent: percentage of previous value (e.g., 1 = 1%).">
                              <TextField
                                select
                                size="small"
                                label="Deadband Type"
                                value={deadbandType}
                                onChange={(e) => setDeadbandType(e.target.value)}
                                sx={{ width: 140 }}
                              >
                                <MenuItem value="absolute">Absolute</MenuItem>
                                <MenuItem value="percent">Percent</MenuItem>
                              </TextField>
                            </Tooltip>
                            <Tooltip title="Force a write after this interval even if value hasn't changed, ensuring connection is alive (heartbeat)">
                              <TextField
                                size="small"
                                type="number"
                                label="Heartbeat (s)"
                                value={forcePublishInterval}
                                onChange={(e) => setForcePublishInterval(Number(e.target.value))}
                                inputProps={{ min: 0, step: 1 }}
                                sx={{ width: 140 }}
                              />
                            </Tooltip>
                          </>
                        )}
                        
                        <Button
                          variant="contained"
                          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                          onClick={handleSave}
                          disabled={saving || !tags.some(t => t.path.trim())}
                          sx={{ ml: 'auto' }}
                        >
                          Save Tags
                        </Button>
                      </Box>
                    </Paper>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Saved Tags List - Right Side */}
        {selectedConnection && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SavedTagsList
              connectionId={selectedConnection}
              onTagsChanged={() => {
                if (onTagsSaved) onTagsSaved();
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default S7TagEntry;
