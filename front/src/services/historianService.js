import { apiClient } from './api';

/**
 * Historian Service
 * Handles fetching time-series tag data
 */
const historianService = {
  /**
   * Query tag data for specified time range
   * @param {Array<number>} tagIds - Array of tag IDs to query
   * @param {Date} startTime - Start of time range
   * @param {Date} endTime - End of time range
   * @param {number} maxPoints - Maximum number of points to return
   * @returns {Promise<Array>} Array of data points
   */
  async queryTagData(tagIds, startTime, endTime, maxPoints = 1000) {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    try {
      const response = await apiClient.post('/historian/query', {
        tag_ids: tagIds,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        max_points: maxPoints,
      });

      return response.data || [];
    } catch (error) {
      console.error('Error querying tag data:', error);
      throw new Error(error.response?.data?.message || 'Failed to query tag data');
    }
  },

  /**
   * Get latest values for tags
   * @param {Array<number>} tagIds - Array of tag IDs
   * @returns {Promise<Array>} Array of latest values
   */
  async getLatestValues(tagIds) {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    try {
      const response = await apiClient.post('/historian/latest', {
        tag_ids: tagIds,
      });

      return response.data || [];
    } catch (error) {
      console.error('Error getting latest values:', error);
      throw new Error(error.response?.data?.message || 'Failed to get latest values');
    }
  },
};

export default historianService;
