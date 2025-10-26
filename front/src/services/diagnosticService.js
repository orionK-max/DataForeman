import { apiClient } from './api';

/**
 * Diagnostic Service - System diagnostics and service management
 */

export const diagnosticService = {
  /**
   * Get system summary (db, nats, services status)
   * @returns {Promise<Object>}
   */
  getSummary: () => apiClient.get('/diag/summary'),

  /**
   * Get detailed service status including container health
   * @returns {Promise<{services: Object}>}
   */
  getServicesStatus: () => apiClient.get('/diag/services/status'),

  /**
   * Restart a service (ingestor or connectivity)
   * @param {string} serviceName - Service to restart ('ingestor' or 'connectivity')
   * @returns {Promise<{success: boolean, service: string, message: string}>}
   */
  restartService: (serviceName) => apiClient.post(`/diag/services/${serviceName}/restart`),

  /**
   * Get system metrics (CPU, memory, etc.)
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  getSystemMetrics: (options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.window_ms) params.append('window_ms', options.window_ms);
    const query = params.toString();
    return apiClient.get(`/diag/system-metrics${query ? `?${query}` : ''}`);
  },
};

export default diagnosticService;
