import React, { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import adminService from '../../services/adminService';

// Feature definitions (mirrored from backend constants)
const FEATURES = {
  // Core Features
  DASHBOARDS: 'dashboards',
  CHART_COMPOSER: 'chart_composer',
  
  // Connectivity Features
  CONNECTIVITY_DEVICES: 'connectivity.devices',
  CONNECTIVITY_TAGS: 'connectivity.tags',
  CONNECTIVITY_POLL_GROUPS: 'connectivity.poll_groups',
  CONNECTIVITY_UNITS: 'connectivity.units',
  
  // Diagnostic Features
  DIAGNOSTICS: 'diagnostics',
  DIAGNOSTIC_SYSTEM: 'diagnostic.system',
  DIAGNOSTIC_CAPACITY: 'diagnostic.capacity',
  DIAGNOSTIC_LOGS: 'diagnostic.logs',
  DIAGNOSTIC_NETWORK: 'diagnostic.network',
  
  // Admin Features
  USERS: 'users',
  PERMISSIONS: 'permissions',
  JOBS: 'jobs',
  LOGS: 'logs',
  CONFIGURATION: 'configuration',
};

const FEATURE_METADATA = {
  // Core
  [FEATURES.DASHBOARDS]: { label: 'Dashboards', category: 'Core', description: 'Dashboard and chart management' },
  [FEATURES.CHART_COMPOSER]: { label: 'Chart Composer', category: 'Core', description: 'Time-series data visualization' },
  
  // Connectivity
  [FEATURES.CONNECTIVITY_DEVICES]: { label: 'Devices', category: 'Connectivity', description: 'Device connections (OPC UA, EIP, etc.)' },
  [FEATURES.CONNECTIVITY_TAGS]: { label: 'Tags', category: 'Connectivity', description: 'Tag configuration and management' },
  [FEATURES.CONNECTIVITY_POLL_GROUPS]: { label: 'Poll Groups', category: 'Connectivity', description: 'Data polling configuration' },
  [FEATURES.CONNECTIVITY_UNITS]: { label: 'Units of Measure', category: 'Connectivity', description: 'Engineering units and conversions' },
  
  // Diagnostics
  [FEATURES.DIAGNOSTICS]: { label: 'General Diagnostics', category: 'Diagnostics', description: 'System health and monitoring' },
  [FEATURES.DIAGNOSTIC_SYSTEM]: { label: 'System Diagnostics', category: 'Diagnostics', description: 'CPU, memory, disk usage. restarting services.' },
  [FEATURES.DIAGNOSTIC_CAPACITY]: { label: 'Capacity Monitoring', category: 'Diagnostics', description: 'Resource capacity trends' },
  [FEATURES.DIAGNOSTIC_LOGS]: { label: 'Log Diagnostics', category: 'Diagnostics', description: 'Application log analysis' },
  [FEATURES.DIAGNOSTIC_NETWORK]: { label: 'Network Diagnostics', category: 'Diagnostics', description: 'Network performance monitoring' },
  
  // Admin
  [FEATURES.USERS]: { label: 'User Management', category: 'Admin', description: 'Create and manage user accounts' },
  [FEATURES.PERMISSIONS]: { label: 'Permissions', category: 'Admin', description: 'Manage user permissions' },
  [FEATURES.JOBS]: { label: 'Background Jobs', category: 'Admin', description: 'View and manage background tasks' },
  [FEATURES.LOGS]: { label: 'System Logs', category: 'Admin', description: 'Access application logs' },
  [FEATURES.CONFIGURATION]: { label: 'Configuration', category: 'Admin', description: 'System configuration settings' },
};

// Group features by category
const groupFeaturesByCategory = () => {
  const grouped = {};
  Object.entries(FEATURE_METADATA).forEach(([feature, meta]) => {
    if (!grouped[meta.category]) {
      grouped[meta.category] = [];
    }
    grouped[meta.category].push({ feature, ...meta });
  });
  return grouped;
};

/**
 * UserPermissions Component
 * Manage user permissions with CRUD operations
 */
export default function UserPermissions({ user }) {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({
    Core: false,
    Connectivity: false,
    Diagnostics: false,
    Admin: false,
  });

  const groupedFeatures = groupFeaturesByCategory();

  // Check if user is an admin (permissions should not be editable)
  const isAdminUser = user?.email && (
    user.email.toLowerCase().includes('admin') ||
    user.email === 'admin@dataforeman.local' ||
    user.email === 'admin@example.com'
  );

  // Load permissions when user changes
  useEffect(() => {
    if (user?.id) {
      loadPermissions();
    }
  }, [user?.id]);

  const loadPermissions = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await adminService.getUserPermissions(user.id);
      const perms = response.permissions || [];

      // Transform to object for easier manipulation
      const permMap = {};
      perms.forEach(perm => {
        permMap[perm.feature] = {
          create: perm.can_create,
          read: perm.can_read,
          update: perm.can_update,
          delete: perm.can_delete,
        };
      });

      setPermissions(permMap);
    } catch (err) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (feature, operation) => {
    // Prevent toggling if user is admin
    if (isAdminUser) return;
    
    setPermissions(prev => ({
      ...prev,
      [feature]: {
        ...prev[feature],
        [operation]: !prev[feature]?.[operation],
      },
    }));
    setSuccess(false);
  };

  const handleSave = async () => {
    // Prevent saving if user is admin
    if (isAdminUser) return;
    
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Transform permissions back to array format
      const permissionsArray = Object.entries(permissions).map(([feature, ops]) => ({
        feature,
        can_create: ops.create || false,
        can_read: ops.read || false,
        can_update: ops.update || false,
        can_delete: ops.delete || false,
      }));

      await adminService.updateUserPermissions(user.id, permissionsArray);
      setSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset) => {
    // Prevent applying presets if user is admin
    if (isAdminUser) return;
    
    const newPerms = {};

    Object.keys(FEATURES).forEach(key => {
      const feature = FEATURES[key];
      
      switch (preset) {
        case 'none':
          newPerms[feature] = { create: false, read: false, update: false, delete: false };
          break;
        case 'read_only':
          newPerms[feature] = { create: false, read: true, update: false, delete: false };
          break;
        case 'power_user':
          newPerms[feature] = { create: true, read: true, update: true, delete: false };
          break;
        case 'full':
          newPerms[feature] = { create: true, read: true, update: true, delete: true };
          break;
        default:
          break;
      }
    });

    setPermissions(newPerms);
    setSuccess(false);
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const toggleAllCategories = () => {
    const allExpanded = Object.values(expandedCategories).every(v => v);
    const newState = {};
    Object.keys(expandedCategories).forEach(key => {
      newState[key] = !allExpanded;
    });
    setExpandedCategories(newState);
  };

  const hasAnyPermission = (feature) => {
    const perms = permissions[feature];
    return perms && (perms.create || perms.read || perms.update || perms.delete);
  };

  if (!user) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Select a user to manage permissions
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Permissions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage feature access for {user.email}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Reload permissions">
            <span>
              <IconButton onClick={loadPermissions} disabled={loading || saving || isAdminUser} size="small">
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={loading || saving || isAdminUser}
          >
            Save
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Permissions saved successfully
        </Alert>
      )}

      {isAdminUser && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Admin user permissions cannot be modified to prevent accidental lockout.
        </Alert>
      )}

      {/* Presets */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 1 }}>
            Quick Presets:
          </Typography>
          <ButtonGroup size="small" variant="outlined">
            <Button onClick={() => applyPreset('none')} disabled={isAdminUser}>No Access</Button>
            <Button onClick={() => applyPreset('read_only')} disabled={isAdminUser}>Read Only</Button>
            <Button onClick={() => applyPreset('power_user')} disabled={isAdminUser}>Power User</Button>
            <Button onClick={() => applyPreset('full')} disabled={isAdminUser}>Full Access</Button>
          </ButtonGroup>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={toggleAllCategories}
          startIcon={Object.values(expandedCategories).every(v => v) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        >
          {Object.values(expandedCategories).every(v => v) ? 'Collapse All' : 'Expand All'}
        </Button>
      </Box>

      {/* Legend */}
      <Box sx={{ mb: 2, p: 1, backgroundColor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Legend:</strong> C = Create | R = Read | U = Update | D = Delete
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {Object.entries(groupedFeatures).map(([category, features]) => (
            <Box key={category} sx={{ mb: 1.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  py: 0.75,
                  px: 1,
                  borderRadius: 1,
                  backgroundColor: expandedCategories[category] ? 'action.selected' : 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  '&:hover': { 
                    backgroundColor: expandedCategories[category] ? 'action.selected' : 'action.hover',
                  },
                }}
                onClick={() => toggleCategory(category)}
              >
                <IconButton size="small" sx={{ mr: 0.5 }}>
                  {expandedCategories[category] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', fontSize: '0.9375rem', flexGrow: 1 }}>
                  {category}
                </Typography>
                <Chip
                  label={`${features.filter(f => hasAnyPermission(f.feature)).length}/${features.length}`}
                  size="small"
                  color={features.filter(f => hasAnyPermission(f.feature)).length > 0 ? 'primary' : 'default'}
                  variant="outlined"
                  sx={{ fontSize: '0.75rem', height: 20 }}
                />
              </Box>

              <Collapse in={expandedCategories[category]}>
                <TableContainer>
                  <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'medium', fontSize: '0.8125rem' }}>Feature</TableCell>
                        <TableCell align="center" sx={{ width: 60, fontWeight: 'medium', fontSize: '0.8125rem' }}>C</TableCell>
                        <TableCell align="center" sx={{ width: 60, fontWeight: 'medium', fontSize: '0.8125rem' }}>R</TableCell>
                        <TableCell align="center" sx={{ width: 60, fontWeight: 'medium', fontSize: '0.8125rem' }}>U</TableCell>
                        <TableCell align="center" sx={{ width: 60, fontWeight: 'medium', fontSize: '0.8125rem' }}>D</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {features.map(({ feature, label, description }) => (
                        <TableRow key={feature} hover sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                          <TableCell>
                            <Tooltip title={description || ''} arrow placement="left">
                              <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                                {label}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Create" arrow>
                              <Checkbox
                                checked={permissions[feature]?.create || false}
                                onChange={() => handleToggle(feature, 'create')}
                                size="small"
                                disabled={saving || isAdminUser}
                                sx={{ p: 0.5, ...(isAdminUser && { color: 'action.disabled' }) }}
                              />
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Read" arrow>
                              <Checkbox
                                checked={permissions[feature]?.read || false}
                                onChange={() => handleToggle(feature, 'read')}
                                size="small"
                                disabled={saving || isAdminUser}
                                sx={{ p: 0.5, ...(isAdminUser && { color: 'action.disabled' }) }}
                              />
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Update" arrow>
                              <Checkbox
                                checked={permissions[feature]?.update || false}
                                onChange={() => handleToggle(feature, 'update')}
                                size="small"
                                disabled={saving || isAdminUser}
                                sx={{ p: 0.5, ...(isAdminUser && { color: 'action.disabled' }) }}
                              />
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Delete" arrow>
                              <Checkbox
                                checked={permissions[feature]?.delete || false}
                                onChange={() => handleToggle(feature, 'delete')}
                                size="small"
                                disabled={saving || isAdminUser}
                                sx={{ p: 0.5, ...(isAdminUser && { color: 'action.disabled' }) }}
                              />
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Box>
          ))}
        </>
      )}
    </Paper>
  );
}
