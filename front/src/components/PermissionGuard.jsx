import React from 'react';
import PropTypes from 'prop-types';
import { usePermissions } from '../contexts/PermissionsContext';
import { Box, Typography, Paper } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

/**
 * PermissionGuard - Conditionally renders children based on user permissions
 * 
 * @param {Object} props
 * @param {string} props.feature - Feature name (e.g., 'dashboards', 'connectivity.devices')
 * @param {string|string[]} props.operation - Operation(s) required (e.g., 'read', ['create', 'update'])
 * @param {boolean} props.requireAll - If true and operation is array, require all operations (default: false)
 * @param {React.ReactNode} props.children - Content to show if permission is granted
 * @param {React.ReactNode} props.fallback - Optional fallback content (default: null for no render)
 * @param {boolean} props.showFallback - Show default lock message if no access (default: false)
 */
const PermissionGuard = ({ 
  feature, 
  operation, 
  requireAll = false,
  children, 
  fallback = null,
  showFallback = false 
}) => {
  const { can, canAll } = usePermissions();

  // Check permissions
  let hasPermission = false;
  
  if (Array.isArray(operation)) {
    // Multiple operations
    if (requireAll) {
      hasPermission = canAll(feature, operation);
    } else {
      hasPermission = operation.some(op => can(feature, op));
    }
  } else {
    // Single operation
    hasPermission = can(feature, operation);
  }

  // No permission - show fallback or nothing
  if (!hasPermission) {
    if (fallback !== null) {
      return <>{fallback}</>;
    }
    
    if (showFallback) {
      return (
        <Paper 
          sx={{ 
            p: 4, 
            textAlign: 'center',
            backgroundColor: 'action.disabledBackground'
          }}
        >
          <LockIcon sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            Access Restricted
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You don't have permission to access this feature
          </Typography>
        </Paper>
      );
    }
    
    return null;
  }

  // Has permission - show children
  return <>{children}</>;
};

PermissionGuard.propTypes = {
  feature: PropTypes.string.isRequired,
  operation: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.arrayOf(PropTypes.string)
  ]).isRequired,
  requireAll: PropTypes.bool,
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
  showFallback: PropTypes.bool,
};

export default PermissionGuard;
