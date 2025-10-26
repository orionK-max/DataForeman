import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { apiClient } from '../services/api';

/**
 * PermissionsLoader
 * Loads user permissions on mount if authenticated
 * This ensures permissions are available when user refreshes the page
 */
export const PermissionsLoader = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const { loadPermissions, permissions } = usePermissions();

  useEffect(() => {
    const loadUserPermissions = async () => {
      if (!isAuthenticated || !token) {
        return;
      }

      try {
        // Get current user ID
        const meData = await apiClient.get('/auth/me');
        if (meData.sub) {
          await loadPermissions(meData.sub);
        }
      } catch (err) {
        console.error('Failed to load permissions on mount:', err);
      }
    };

    loadUserPermissions();
  }, [isAuthenticated, token, loadPermissions]);

  return children;
};
