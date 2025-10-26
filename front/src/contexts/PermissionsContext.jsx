import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import adminService from '../services/adminService';

const PermissionsContext = createContext(null);

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within PermissionsProvider');
  }
  return context;
};

/**
 * PermissionsProvider
 * Manages user permissions loaded from the backend
 * Provides permission checking functionality to the entire app
 */
export const PermissionsProvider = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [permissions, setPermissions] = useState(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem('df_permissions');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Load permissions from backend
   */
  const loadPermissions = useCallback(async (userId) => {
    if (!userId || !token) {
      setPermissions(null);
      localStorage.removeItem('df_permissions');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await adminService.getUserPermissions(userId);
      const perms = response.permissions || [];
      
      // Transform to Map structure for efficient lookups
      const permMap = {};
      for (const perm of perms) {
        permMap[perm.feature] = {
          create: perm.can_create || false,
          read: perm.can_read || false,
          update: perm.can_update || false,
          delete: perm.can_delete || false,
        };
      }

      setPermissions(permMap);
      localStorage.setItem('df_permissions', JSON.stringify(permMap));
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setError(err.message || 'Failed to load permissions');
      setPermissions({});
      localStorage.removeItem('df_permissions');
    } finally {
      setLoading(false);
    }
  }, [token]);

  /**
   * Check if user has permission for a specific feature and operation
   * @param {string} feature - Feature name (e.g., 'dashboards', 'connectivity.devices')
   * @param {string} operation - Operation name ('create', 'read', 'update', 'delete')
   * @returns {boolean} True if user has permission
   */
  const can = useCallback((feature, operation) => {
    if (!permissions || !feature || !operation) {
      return false;
    }

    const featurePerms = permissions[feature];
    if (!featurePerms) {
      return false;
    }

    return featurePerms[operation] === true;
  }, [permissions]);

  /**
   * Check if user has ALL specified permissions
   * @param {Array<{feature: string, operation: string}>} checks - Array of permission checks
   * @returns {boolean} True if user has all permissions
   */
  const canAll = useCallback((checks) => {
    if (!Array.isArray(checks) || checks.length === 0) {
      return false;
    }

    return checks.every(({ feature, operation }) => can(feature, operation));
  }, [can]);

  /**
   * Check if user has ANY of the specified permissions
   * @param {Array<{feature: string, operation: string}>} checks - Array of permission checks
   * @returns {boolean} True if user has any permission
   */
  const canAny = useCallback((checks) => {
    if (!Array.isArray(checks) || checks.length === 0) {
      return false;
    }

    return checks.some(({ feature, operation }) => can(feature, operation));
  }, [can]);

  /**
   * Get all features user has access to (with any operation)
   * @returns {string[]} Array of feature names
   */
  const getFeatures = useCallback(() => {
    if (!permissions) {
      return [];
    }

    return Object.keys(permissions);
  }, [permissions]);

  /**
   * Get all operations user can perform on a feature
   * @param {string} feature - Feature name
   * @returns {string[]} Array of operation names
   */
  const getOperations = useCallback((feature) => {
    if (!permissions || !feature) {
      return [];
    }

    const featurePerms = permissions[feature];
    if (!featurePerms) {
      return [];
    }

    const ops = [];
    if (featurePerms.create) ops.push('create');
    if (featurePerms.read) ops.push('read');
    if (featurePerms.update) ops.push('update');
    if (featurePerms.delete) ops.push('delete');

    return ops;
  }, [permissions]);

  /**
   * Invalidate and reload permissions
   */
  const refresh = useCallback(async (userId) => {
    await loadPermissions(userId);
  }, [loadPermissions]);

  /**
   * Clear permissions from memory and storage
   */
  const clear = useCallback(() => {
    setPermissions(null);
    localStorage.removeItem('df_permissions');
    setError(null);
  }, []);

  // Clear permissions on logout
  useEffect(() => {
    if (!isAuthenticated) {
      clear();
    }
  }, [isAuthenticated, clear]);

  const value = useMemo(() => ({
    permissions,
    loading,
    error,
    can,
    canAll,
    canAny,
    getFeatures,
    getOperations,
    loadPermissions,
    refresh,
    clear,
  }), [permissions, loading, error, can, canAll, canAny, getFeatures, getOperations, loadPermissions, refresh, clear]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};
