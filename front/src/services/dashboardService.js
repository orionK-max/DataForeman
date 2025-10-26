/**
 * Dashboard Service
 * API client for dashboard CRUD operations
 */

import { apiClient } from './api';

const dashboardService = {
  /**
   * List dashboards
   * @param {string} scope - 'mine' | 'shared' | 'all'
   * @param {number} limit - Max dashboards to return (default: 50, max: 200)
   * @param {number} offset - Pagination offset
   * @returns {Promise<{items: Array, limit, offset, count}>}
   */
  listDashboards: (scope = 'all', limit = 50, offset = 0) => {
    const params = new URLSearchParams({ scope, limit: String(limit), offset: String(offset) });
    return apiClient.get(`/dashboards?${params.toString()}`);
  },

  /**
   * Get a specific dashboard
   * @param {string} dashboardId - Dashboard ID (UUID)
   * @returns {Promise<{id, name, description, layout, is_shared, is_owner, created_at, updated_at}>}
   */
  getDashboard: (dashboardId) => 
    apiClient.get(`/dashboards/${dashboardId}`),

  /**
   * Create a new dashboard
   * @param {Object} dashboard - Dashboard data
   * @param {string} dashboard.name - Dashboard name (required, max 120 chars)
   * @param {string} dashboard.description - Description (optional, max 5000 chars)
   * @param {boolean} dashboard.is_shared - Whether dashboard is shared (default: false)
   * @param {Object} dashboard.layout - Dashboard layout configuration
   * @returns {Promise<{id, name, description, layout, is_shared, is_owner, created_at, updated_at}>}
   */
  createDashboard: (dashboard) => 
    apiClient.post('/dashboards', dashboard),

  /**
   * Update an existing dashboard
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} updates - Fields to update
   * @param {string} updates.name - Dashboard name (optional)
   * @param {string} updates.description - Description (optional)
   * @param {boolean} updates.is_shared - Whether dashboard is shared (optional)
   * @param {Object} updates.layout - Dashboard layout configuration (optional)
   * @returns {Promise<{id, name, description, layout, is_shared, is_owner, created_at, updated_at}>}
   */
  updateDashboard: (dashboardId, updates) => 
    apiClient.put(`/dashboards/${dashboardId}`, updates),

  /**
   * Delete a dashboard (soft delete)
   * @param {string} dashboardId - Dashboard ID
   * @returns {Promise<void>}
   */
  deleteDashboard: (dashboardId) => 
    apiClient.delete(`/dashboards/${dashboardId}`),

  /**
   * Duplicate/clone a dashboard
   * @param {string} dashboardId - Source dashboard ID
   * @param {string} newName - Name for the new dashboard
   * @returns {Promise<{id, name, description, layout, is_shared, is_owner, created_at, updated_at}>}
   */
  duplicateDashboard: (dashboardId, newName) => 
    apiClient.post(`/dashboards/${dashboardId}/duplicate`, { name: newName }),

  /**
   * Create a default empty dashboard layout
   * @returns {Object} - Default layout structure
   */
  createDefaultLayout: () => ({
    version: 1,
    grid_cols: 12,
    row_height: 80,
    auto_refresh: null,
    tv_mode: {
      enabled: false,
      rotation_interval: 10,
      dashboard_ids: []
    },
    items: []
  }),

  /**
   * Validate layout structure
   * @param {Object} layout - Layout to validate
   * @returns {{valid: boolean, errors: Array<string>}}
   */
  validateLayout: (layout) => {
    const errors = [];
    
    if (!layout || typeof layout !== 'object') {
      return { valid: false, errors: ['Layout must be an object'] };
    }
    
    if (!Array.isArray(layout.items)) {
      errors.push('layout.items must be an array');
    } else {
      layout.items.forEach((item, idx) => {
        if (!item.i) errors.push(`Item ${idx}: missing 'i' (widget ID)`);
        if (!item.chart_id) errors.push(`Item ${idx}: missing 'chart_id'`);
        if (typeof item.x !== 'number') errors.push(`Item ${idx}: x must be a number`);
        if (typeof item.y !== 'number') errors.push(`Item ${idx}: y must be a number`);
        if (typeof item.w !== 'number' || item.w < 1) errors.push(`Item ${idx}: w must be >= 1`);
        if (typeof item.h !== 'number' || item.h < 1) errors.push(`Item ${idx}: h must be >= 1`);
      });
    }
    
    return { valid: errors.length === 0, errors };
  }
};

export default dashboardService;
