import { apiClient } from './api';

/**
 * Admin service for user and system management
 */
const adminService = {
  // User Management
  async getUsers() {
    return await apiClient.get('/auth/admin/users');
  },

  async createUser(email) {
    return await apiClient.post('/auth/admin/users', { email });
  },

  async getUserRoles(userId) {
    return await apiClient.get(`/auth/admin/users/${userId}/roles`);
  },

  async updateUserRoles(userId, roles) {
    return await apiClient.post(`/auth/admin/users/${userId}/roles`, { roles });
  },

  async updateUserPassword(userId, password) {
    return await apiClient.post(`/auth/admin/users/${userId}/password`, { password });
  },

  async getUserSessions(userId) {
    return await apiClient.get(`/auth/admin/users/${userId}/sessions`);
  },

  async revokeSession(userId, sessionId) {
    return await apiClient.post(`/auth/admin/users/${userId}/sessions/${sessionId}/revoke`);
  },

  async revokeAllSessions(userId) {
    return await apiClient.post(`/auth/admin/users/${userId}/sessions/revoke-all`);
  },

  // Permission Management
  async getUserPermissions(userId) {
    return await apiClient.get(`/auth/users/${userId}/permissions`);
  },

  async updateUserPermissions(userId, permissions) {
    return await apiClient.put(`/auth/users/${userId}/permissions`, { permissions });
  },

  async deleteUserPermission(userId, feature) {
    return await apiClient.delete(`/auth/users/${userId}/permissions/${feature}`);
  },

  // Configuration Management
  async getConfig() {
    return await apiClient.get('/config');
  },

  async updateConfig(configObj) {
    return await apiClient.post('/config', configObj);
  },
};

export default adminService;
