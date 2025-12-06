import { apiClient } from './api';

/**
 * Chart Composer Service - API calls for historical data queries and management
 */

export const chartComposerService = {
  // ===== Connections =====
  
  /**
   * Get all saved connections (from connectivity)
   * @returns {Promise<{items: Array}>}
   */
  getConnections: () => apiClient.get('/connectivity/connections'),
  
  // ===== Tags =====
  
  /**
   * Get saved tags for a connection
   * @param {string} connectionId - Connection ID
   * @returns {Promise<{items: Array<{tag_id, tag_name, tag_path, data_type, poll_rate_ms, connection_id, driver_type}>}>}
   */
  getTags: (connectionId) => 
    apiClient.get(`/connectivity/tags/${connectionId}`),
  
  /**
   * Get tag metadata by tag IDs
   * @param {Array<number>} tagIds - Array of tag IDs
   * @returns {Promise<{items: Array}>}
   */
  getTagMetadata: (tagIds) => 
    apiClient.get(`/historian/tag-metadata?tag_ids=${tagIds.join(',')}`),
  
  // ===== Historical Data Queries =====
  
  /**
   * Query historical data points
   * @param {Object} params - Query parameters
   * @param {string} params.conn_id - Connection ID
   * @param {Array<number>} params.tag_ids - Array of tag IDs to query (comma-separated)
   * @param {string} params.from - ISO timestamp (e.g., "2025-10-01T10:00:00Z")
   * @param {string} params.to - ISO timestamp (e.g., "2025-10-01T11:00:00Z")
   * @param {number} params.limit - Maximum number of points to return (default: 1000, max: 5000)
   * @param {boolean} params.no_aggregation - Disable smart compression (default: false)
   * @returns {Promise<{items: Array<{ts, conn_id, tag_id, v_num, v_text, v_json, q}>, count: number}>}
   */
  queryData: (params) => {
    const queryParams = new URLSearchParams();
    
    if (params.conn_id) {
      queryParams.set('conn_id', params.conn_id);
    }
    
    if (params.tag_ids && params.tag_ids.length > 0) {
      queryParams.set('tag_ids', params.tag_ids.join(','));
    }
    
    if (params.from) {
      queryParams.set('from', params.from);
    }
    
    if (params.to) {
      queryParams.set('to', params.to);
    }
    
    if (params.limit) {
      queryParams.set('limit', params.limit);
    }
    
    // Always send no_aggregation parameter (true or false)
    queryParams.set('no_aggregation', params.no_aggregation ? 'true' : 'false');
    
    const url = `/historian/points?${queryParams.toString()}`;
    
    return apiClient.get(url);
  },
  
  // ===== Chart Management =====
  
  /**
   * List saved chart configurations
   * @param {string} scope - 'mine' | 'shared' | 'all'
   * @param {number} limit - Max charts to return (default: 50, max: 200)
   * @param {number} offset - Pagination offset
   * @returns {Promise<{items: Array<{id, name, created_at, updated_at, is_shared, is_owner, tag_count}>, limit, offset, count}>}
   */
  listCharts: (scope = 'all', limit = 50, offset = 0) => 
    apiClient.get(`/charts?scope=${scope}&limit=${limit}&offset=${offset}`),
  
  /**
   * Get a specific chart configuration
   * @param {string} chartId - Chart ID (UUID)
   * @returns {Promise<{id, name, time_from, time_to, is_shared, is_owner, options, created_at, updated_at, tag_count}>}
   */
  getChart: (chartId) => 
    apiClient.get(`/charts/${chartId}`),
  
  /**
   * Save a new chart configuration
   * @param {Object} chart - Chart data
   * @param {string} chart.name - Chart name (max 120 chars)
   * @param {string} chart.time_from - ISO timestamp or null
   * @param {string} chart.time_to - ISO timestamp or null
   * @param {boolean} chart.is_shared - Share with other users (default: false)
   * @param {Object} chart.options - Full chart configuration (version: 1)
   * @returns {Promise<{id, name, is_shared, is_owner, tag_count, created_at, updated_at}>}
   */
  saveChart: (chart) => 
    apiClient.post('/charts', chart),
  
  /**
   * Update an existing chart configuration (full replace)
   * @param {string} chartId - Chart ID (UUID)
   * @param {Object} updates - Complete chart data (same as saveChart)
   * @returns {Promise}
   */
  updateChart: (chartId, updates) => 
    apiClient.put(`/charts/${chartId}`, updates),
  
  /**
   * Partially update a chart configuration
   * @param {string} chartId - Chart ID (UUID)
   * @param {Object} updates - Partial chart updates (name, time_from, time_to, is_shared, options)
   * @returns {Promise}
   */
  patchChart: (chartId, updates) => 
    apiClient.patch(`/charts/${chartId}`, updates),
  
  /**
   * Delete a chart configuration (soft delete)
   * @param {string} chartId - Chart ID (UUID)
   * @returns {Promise}
   */
  deleteChart: (chartId) => 
    apiClient.delete(`/charts/${chartId}`),
  
  /**
   * Duplicate a chart (load and save as new)
   * @param {string} chartId - Chart ID to duplicate
   * @param {string} newName - Name for the duplicated chart
   * @returns {Promise<{id, name}>}
   */
  duplicateChart: async (chartId, newName) => {
    const original = await apiClient.get(`/charts/${chartId}`);
    const duplicate = {
      name: newName || `${original.name} (Copy)`,
      time_from: original.time_from,
      time_to: original.time_to,
      is_shared: false, // Never share duplicates automatically
      options: original.options,
    };
    return apiClient.post('/charts', duplicate);
  },

  /**
   * Get or initialize system capacity charts for Diagnostics page
   * Creates charts if they don't exist for the user
   * @returns {Promise<{charts: Array<{id, name, options, is_system_chart, is_owner, tag_count}>}>}
   */
  getCapacityCharts: () =>
    apiClient.get('/charts/capacity-charts'),

  // ===== Import/Export =====

  /**
   * Export a chart with dependencies
   * @param {string} chartId - Chart ID to export
   * @returns {Promise<Object>} Export data structure
   */
  exportChart: (chartId) =>
    apiClient.post(`/charts/${chartId}/export`),

  /**
   * Validate import data
   * @param {Object} importData - Import data structure
   * @returns {Promise<Object>} Validation result
   */
  validateImport: (importData) =>
    apiClient.post('/charts/import/validate', importData),

  /**
   * Execute import after validation
   * @param {Object} importData - Import data structure
   * @param {Object} validation - Validation result
   * @param {string|null} newName - Optional new name for the chart
   * @returns {Promise<Object>} Import result
   */
  executeImport: (importData, validation, newName = null) =>
    apiClient.post('/charts/import/execute', { importData, validation, newName }),
};

export default chartComposerService;
