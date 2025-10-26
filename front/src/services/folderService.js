/**
 * Folder Service
 * API client for folder operations (dashboards and charts)
 */

import { apiClient } from './api';

/**
 * Folder types
 */
export const FOLDER_TYPES = {
  DASHBOARD: 'dashboard',
  CHART: 'chart',
};

const folderService = {
  /**
   * List all folders for a specific type
   * @param {string} folderType - 'dashboard' | 'chart'
   * @returns {Promise<Array>}
   */
  listFolders: (folderType) =>
    apiClient.get(`/${folderType}/folders`),

  /**
   * Get folder tree structure
   * @param {string} folderType - 'dashboard' | 'chart'
   * @returns {Promise<Array>} Hierarchical tree structure
   */
  getFolderTree: (folderType) =>
    apiClient.get(`/${folderType}/folders/tree`),

  /**
   * Get a specific folder
   * @param {string} folderType - 'dashboard' | 'chart'
   * @param {string} folderId - Folder UUID
   * @returns {Promise<Object>}
   */
  getFolder: (folderType, folderId) =>
    apiClient.get(`/${folderType}/folders/${folderId}`),

  /**
   * Create a new folder
   * @param {string} folderType - 'dashboard' | 'chart'
   * @param {Object} folderData
   * @param {string} folderData.name - Folder name (required)
   * @param {string} folderData.description - Folder description (optional)
   * @param {string} folderData.parent_folder_id - Parent folder UUID (optional, null for root)
   * @param {number} folderData.sort_order - Sort order (optional, default: 0)
   * @returns {Promise<Object>}
   */
  createFolder: (folderType, folderData) =>
    apiClient.post(`/${folderType}/folders`, folderData),

  /**
   * Update a folder
   * @param {string} folderType - 'dashboard' | 'chart'
   * @param {string} folderId - Folder UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>}
   */
  updateFolder: (folderType, folderId, updates) =>
    apiClient.put(`/${folderType}/folders/${folderId}`, updates),

  /**
   * Delete a folder
   * @param {string} folderType - 'dashboard' | 'chart'
   * @param {string} folderId - Folder UUID
   * @returns {Promise<{success: boolean}>}
   */
  deleteFolder: (folderType, folderId) =>
    apiClient.delete(`/${folderType}/folders/${folderId}`),

  /**
   * Get items in a folder
   * @param {string} folderType - 'dashboard' | 'chart'
   * @param {string} folderId - Folder UUID or 'root'/'null' for root items
   * @returns {Promise<Array>}
   */
  getFolderItems: (folderType, folderId = 'root') =>
    apiClient.get(`/${folderType}/folders/${folderId}/items`),

  /**
   * Move an item to a folder
   * @param {string} folderType - 'dashboard' | 'chart'
   * @param {string} itemId - Item UUID
   * @param {string|null} folderId - Target folder UUID (null for root)
   * @param {number} sortOrder - Sort order (optional, default: 0)
   * @returns {Promise<{success: boolean}>}
   */
  moveItemToFolder: (folderType, itemId, folderId, sortOrder = 0) =>
    apiClient.put(`/${folderType}/items/${itemId}/move`, {
      folder_id: folderId,
      sort_order: sortOrder,
    }),

  /**
   * Convenience methods for dashboard folders
   */
  dashboard: {
    list: () => folderService.listFolders(FOLDER_TYPES.DASHBOARD),
    getTree: () => folderService.getFolderTree(FOLDER_TYPES.DASHBOARD),
    get: (folderId) => folderService.getFolder(FOLDER_TYPES.DASHBOARD, folderId),
    create: (data) => folderService.createFolder(FOLDER_TYPES.DASHBOARD, data),
    update: (folderId, updates) => folderService.updateFolder(FOLDER_TYPES.DASHBOARD, folderId, updates),
    delete: (folderId) => folderService.deleteFolder(FOLDER_TYPES.DASHBOARD, folderId),
    getItems: (folderId) => folderService.getFolderItems(FOLDER_TYPES.DASHBOARD, folderId),
    moveItem: (itemId, folderId, sortOrder) => folderService.moveItemToFolder(FOLDER_TYPES.DASHBOARD, itemId, folderId, sortOrder),
  },

  /**
   * Convenience methods for chart folders
   */
  chart: {
    list: () => folderService.listFolders(FOLDER_TYPES.CHART),
    getTree: () => folderService.getFolderTree(FOLDER_TYPES.CHART),
    get: (folderId) => folderService.getFolder(FOLDER_TYPES.CHART, folderId),
    create: (data) => folderService.createFolder(FOLDER_TYPES.CHART, data),
    update: (folderId, updates) => folderService.updateFolder(FOLDER_TYPES.CHART, folderId, updates),
    delete: (folderId) => folderService.deleteFolder(FOLDER_TYPES.CHART, folderId),
    getItems: (folderId) => folderService.getFolderItems(FOLDER_TYPES.CHART, folderId),
    moveItem: (itemId, folderId, sortOrder) => folderService.moveItemToFolder(FOLDER_TYPES.CHART, itemId, folderId, sortOrder),
  },
};

export default folderService;
