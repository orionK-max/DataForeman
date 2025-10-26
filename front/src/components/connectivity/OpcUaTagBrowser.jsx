import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Breadcrumbs,
  Link,
  TextField,
  MenuItem,
  InputAdornment,
  Grid,
  Paper,
  Tooltip,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DataObjectIcon from '@mui/icons-material/DataObject';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import connectivityService from '../../services/connectivityService';
import SavedTagsList from './SavedTagsList';

const OpcUaTagBrowser = ({ connectionId: initialConnectionId, connections = [], onTagsSaved }) => {
  const [selectedConnection, setSelectedConnection] = useState(''); // Start with no selection
  const [currentNode, setCurrentNode] = useState(null);
  const [nodePath, setNodePath] = useState([{ nodeId: null, displayName: 'Root' }]);
  const [children, setChildren] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pollGroups, setPollGroups] = useState([]);
  const [selectedPollGroup, setSelectedPollGroup] = useState(''); // Will be set after poll groups load
  const [savedTagsRefreshKey, setSavedTagsRefreshKey] = useState(0);
  // Write on change settings
  const [changeDetectionEnabled, setChangeDetectionEnabled] = useState(true); // Default enabled
  const [deadband, setDeadband] = useState(0);
  const [deadbandType, setDeadbandType] = useState('absolute');
  const [forcePublishInterval, setForcePublishInterval] = useState(60); // seconds // Default 1 minute
  const [searchFilter, setSearchFilter] = useState('');
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(''); // Optional unit of measure

  // Removed auto-selection effect - user must explicitly select a device

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

  const loadUnits = async () => {
    try {
      const result = await connectivityService.getUnits();
      setUnits(result.units || []);
    } catch (err) {
      console.error('Failed to load units:', err);
    }
  };

  useEffect(() => {
    loadPollGroups();
    loadUnits();
  }, []);

  const browseNode = useCallback(async (nodeId) => {
    if (!selectedConnection) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await connectivityService.browseNodes(selectedConnection, nodeId);
      
      // Check if the result indicates an error
      if (result?.error) {
        const errorMessages = {
          'not_found': 'Connection not found. Please ensure the connection is properly configured.',
          'nats_unavailable': 'System messaging service is unavailable. Please contact your administrator.',
          'timeout': 'Browse request timed out. The OPC UA server may be slow to respond or unreachable.',
        };
        
        // Use the message from the server if available, otherwise use the mapped message
        const errorMsg = result.message || errorMessages[result.error] || `Browse failed: ${result.error}`;
        throw new Error(errorMsg);
      }
      
      // Process items to add isFolder property based on nodeClass
      const items = (result.items || []).map(item => ({
        ...item,
        isFolder: item.nodeClass !== 'Variable' // Variables are leaf nodes, everything else can have children
      }));
      
      setChildren(items);
      setCurrentNode(nodeId);
    } catch (err) {
      const errorMsg = err.message || 'Failed to browse node';
      setError(errorMsg);
      setChildren([]);
      console.error('Browse error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedConnection]);

  // Load poll groups and browse root node when connection changes
  useEffect(() => {
    loadPollGroups();
    if (selectedConnection) {
      browseNode(null);
    }
  }, [selectedConnection, browseNode]);

  const handleNodeClick = async (node) => {
    if (node.isFolder) {
      // Navigate into folder
      setNodePath([...nodePath, { nodeId: node.nodeId, displayName: node.displayName || node.browseName }]);
      await browseNode(node.nodeId);
    }
  };

  const handleBreadcrumbClick = async (index) => {
    const newPath = nodePath.slice(0, index + 1);
    setNodePath(newPath);
    const targetNode = newPath[newPath.length - 1];
    await browseNode(targetNode.nodeId);
  };

  const handleToggleTag = (node) => {
    if (node.isFolder) return; // Can't select folders
    
    const exists = selectedTags.find(t => t.nodeId === node.nodeId);
    if (exists) {
      setSelectedTags(selectedTags.filter(t => t.nodeId !== node.nodeId));
    } else {
      setSelectedTags([...selectedTags, node]);
    }
  };

  const isTagSelected = (nodeId) => {
    return selectedTags.some(t => t.nodeId === nodeId);
  };

  const handleSaveTags = async () => {
    if (!selectedConnection) {
      setError('No connection selected');
      return;
    }
    
    if (selectedTags.length === 0) {
      setError('No tags selected');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Fetch attributes for selected tags to ensure we have dataType
      const tagsWithAttributes = await Promise.all(
        selectedTags.map(async (tag) => {
          // If tag already has dataType, use it
          if (tag.dataType) {
            return tag;
          }
          
          // Otherwise, fetch attributes from the backend
          try {
            const attrs = await connectivityService.getNodeAttributes(selectedConnection, tag.nodeId);
            return {
              ...tag,
              dataType: attrs.item?.dataType || 'UNKNOWN'
            };
          } catch (err) {
            console.warn(`Failed to fetch attributes for ${tag.nodeId}:`, err);
            return tag; // Return tag without dataType if fetch fails
          }
        })
      );

      const payload = {
        id: selectedConnection,
        items: tagsWithAttributes.map(tag => ({
          nodeId: tag.nodeId,
          displayName: tag.displayName,
          browseName: tag.browseName,
          dataType: tag.dataType || 'UNKNOWN',
        })),
        poll_group_id: selectedPollGroup,
        subscribe: true, // Always enable subscription for newly saved tags
        unit_id: selectedUnit || null, // Include selected unit of measure
        // Write on change settings
        on_change_enabled: changeDetectionEnabled,
        on_change_deadband: deadband,
        on_change_deadband_type: deadbandType,
        on_change_heartbeat_ms: forcePublishInterval * 1000, // Convert seconds to ms
      };

      await connectivityService.saveTags(payload);
      setSelectedTags([]);
      setSavedTagsRefreshKey(prev => prev + 1); // Trigger saved tags refresh
      
      if (onTagsSaved) {
        onTagsSaved();
      }
    } catch (err) {
      setError(err.message || 'Failed to save tags');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    browseNode(currentNode);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* Tag Browser - Left Side */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Card sx={{ height: 'calc(70vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Typography variant="h6" gutterBottom>
                OPC UA Tag Browser
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Browse the OPC UA server node tree and select tags to monitor
              </Typography>

              {/* Device Selection Section */}
              {connections && connections.length > 0 ? (
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
                    <TextField
                      select
                      size="small"
                      label="Select OPC UA Device"
                      value={selectedConnection}
                      onChange={(e) => {
                        setSelectedConnection(e.target.value);
                        setSelectedTags([]);
                        setNodePath([{ nodeId: null, displayName: 'Root' }]);
                      }}
                      sx={{ flex: 1 }}
                    >
                      <MenuItem value="" disabled>
                        {connections.length ? 'Select a device' : 'No OPC UA devices available'}
                      </MenuItem>
                      {connections.map((conn) => (
                        <MenuItem key={conn.id} value={conn.id}>
                          {conn.name || conn.id} - {conn.endpoint || conn.host}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{ minWidth: 120, flexShrink: 0 }}
                    >
                      Refresh
                    </Button>
                  </Box>
                  {selectedConnection && (
                    <Alert severity="info" sx={{ fontSize: '0.875rem', py: 0.5 }}>
                      <strong>Note:</strong> If browsing fails, go to the Devices tab and ensure the connection is started (enabled).
                    </Alert>
                  )}
                </Box>
              ) : (
                <Alert severity="warning" sx={{ mb: 3 }}>
                  No OPC UA connections available. Create a connection in the Devices tab to browse tags.
                </Alert>
              )}

              {!selectedConnection ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Select a device above to browse OPC UA tags.
                </Alert>
              ) : (
                <>

        {/* Breadcrumb Navigation */}
        <Box sx={{ mb: 2, p: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Breadcrumbs>
            {nodePath.map((item, index) => (
              <Link
                key={index}
                component="button"
                variant="body2"
                onClick={() => handleBreadcrumbClick(index)}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  textDecoration: index === nodePath.length - 1 ? 'none' : 'underline',
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main' }
                }}
              >
                {index === 0 ? <HomeIcon sx={{ mr: 0.5 }} fontSize="small" /> : null}
                {item.displayName}
              </Link>
            ))}
          </Breadcrumbs>
        </Box>

        {/* Search Bar */}
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search nodes..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Node List */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ 
            flex: 1, 
            overflow: 'auto', 
            border: 1, 
            borderColor: 'divider', 
            borderRadius: 1,
            minHeight: 0
          }}>
            <List dense>
              {children.length === 0 ? (
                <ListItem>
                  <ListItemText 
                    primary="No nodes found" 
                    secondary="This node has no children"
                  />
                </ListItem>
              ) : (
                children
                  .filter(node => {
                    if (!searchFilter) return true;
                    const searchLower = searchFilter.toLowerCase();
                    return (node.displayName || '').toLowerCase().includes(searchLower);
                  })
                  .map((node) => (
                  <ListItem
                    key={node.nodeId}
                    disablePadding
                  >
                    <ListItemButton onClick={() => handleNodeClick(node)}>
                      <ListItemIcon>
                        {!node.isFolder ? (
                          <Checkbox
                            edge="start"
                            checked={isTagSelected(node.nodeId)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleTag(node);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : node.isFolder ? (
                          <FolderIcon color="primary" />
                        ) : (
                          <DataObjectIcon color="action" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={node.displayName || node.browseName}
                        secondary={
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{node.nodeId}</span>
                            {node.dataType && (
                              <Chip label={node.dataType} size="small" variant="outlined" />
                            )}
                          </span>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))
              )}
            </List>
          </Box>
        )}

                  {/* Save Section with Poll Group, Unit, and Write on Change */}
                  {selectedTags.length > 0 && (
                    <Paper sx={{ p: 2, mb: 2, backgroundColor: 'background.default' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Tag Configuration
                      </Typography>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Poll Group"
                            value={selectedPollGroup}
                            onChange={(e) => setSelectedPollGroup(Number(e.target.value))}
                          >
                            {pollGroups.map((group) => (
                              <MenuItem key={group.group_id} value={group.group_id}>
                                {group.name} ({group.poll_rate_ms}ms)
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
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
                        </Grid>
                        {changeDetectionEnabled && (
                          <>
                            <Grid item xs={12} sm={6} md={2}>
                              <Tooltip title="Minimum change required to trigger a write. For absolute: fixed value difference. For percent: percentage of previous value.">
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  label="Deadband"
                                  value={deadband}
                                  onChange={(e) => setDeadband(Number(e.target.value))}
                                  inputProps={{ min: 0, step: 0.1 }}
                                />
                              </Tooltip>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <Tooltip title="Absolute: fixed value difference (e.g., 0.5). Percent: percentage of previous value (e.g., 1 = 1%).">
                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  label="Deadband Type"
                                  value={deadbandType}
                                  onChange={(e) => setDeadbandType(e.target.value)}
                                >
                                  <MenuItem value="absolute">Absolute</MenuItem>
                                  <MenuItem value="percent">Percent</MenuItem>
                                </TextField>
                              </Tooltip>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <Tooltip title="Force a write after this interval even if value hasn't changed, ensuring connection is alive (heartbeat)">
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  label="Heartbeat (s)"
                                  value={forcePublishInterval}
                                  onChange={(e) => setForcePublishInterval(Number(e.target.value))}
                                  inputProps={{ min: 0, step: 1 }}
                                />
                              </Tooltip>
                            </Grid>
                          </>
                        )}
                      </Grid>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                          variant="contained"
                          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                          onClick={handleSaveTags}
                          disabled={saving || selectedTags.length === 0}
                        >
                          Save {selectedTags.length} Tag{selectedTags.length !== 1 ? 's' : ''}
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
              refreshTrigger={savedTagsRefreshKey}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default OpcUaTagBrowser;
