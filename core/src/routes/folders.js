/**
 * Folder Routes
 * 
 * API endpoints for managing dashboard and chart folders
 */

import * as folderService from '../services/folders.js';

/**
 * Helper to validate folder type
 */
function validateFolderType(folderType) {
  return Object.values(folderService.FOLDER_TYPES).includes(folderType);
}

/**
 * Folder routes plugin for Fastify
 */
export async function folderRoutes(app, options) {
  // All endpoints require authenticated user
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user?.sub) return reply.code(401).send({ error: 'unauthorized' });
  });

  // Permission check helper - folders require appropriate permissions
  async function checkPermission(userId, operation, reply, folderType) {
    // Map folder type to permission resource
    const permissionMap = {
      [folderService.FOLDER_TYPES.DASHBOARD]: 'dashboards',
      [folderService.FOLDER_TYPES.CHART]: 'dashboards', // Charts use dashboard permission
      [folderService.FOLDER_TYPES.FLOW]: 'flows',
    };
    
    const resource = permissionMap[folderType] || 'dashboards';
    
    if (!userId || !(await app.permissions.can(userId, resource, operation))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  }

  /**
   * GET /:folderType/folders
   * List all folders for current user
   */
  app.get('/:folderType/folders', async (req, reply) => {
    try {
      const { folderType } = req.params;
      await checkPermission(req.user.sub, 'read', reply, folderType);
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      const folders = await folderService.listFolders(req.user.sub, folderType, app.db);
      return folders;
    } catch (error) {
      req.log.error(error, 'Error listing folders');
      return reply.code(500).send({ error: 'Failed to list folders' });
    }
  });

  /**
   * GET /:folderType/folders/tree
   * Get folder tree structure
   */
  app.get('/:folderType/folders/tree', async (req, reply) => {
    try {
      const { folderType } = req.params;
      await checkPermission(req.user.sub, 'read', reply, folderType);
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      const tree = await folderService.getFolderTree(req.user.sub, folderType, app.db);
      return tree;
    } catch (error) {
      req.log.error(error, 'Error getting folder tree');
      return reply.code(500).send({ error: 'Failed to get folder tree' });
    }
  });

  /**
   * GET /:folderType/folders/:folderId
   * Get a single folder
   */
  app.get('/:folderType/folders/:folderId', async (req, reply) => {
    try {
      const { folderType, folderId } = req.params;
      await checkPermission(req.user.sub, 'read', reply, folderType);
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      const folder = await folderService.getFolder(folderId, req.user.sub, folderType, app.db);
      
      if (!folder) {
        return reply.code(404).send({ error: 'Folder not found' });
      }
      
      return folder;
    } catch (error) {
      req.log.error(error, 'Error getting folder');
      return reply.code(500).send({ error: 'Failed to get folder' });
    }
  });

  /**
   * POST /:folderType/folders
   * Create a new folder
   */
  app.post('/:folderType/folders', async (req, reply) => {
    try {
      const { folderType } = req.params;
      await checkPermission(req.user.sub, 'create', reply, folderType);
      const { name, description, parent_folder_id, sort_order } = req.body;
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      if (!name || !name.trim()) {
        return reply.code(400).send({ error: 'Folder name is required' });
      }
      
      const folder = await folderService.createFolder(
        req.user.sub,
        folderType,
        { name: name.trim(), description, parent_folder_id, sort_order },
        app.db
      );
      
      return reply.code(201).send(folder);
    } catch (error) {
      req.log.error(error, 'Error creating folder');
      if (error.message === 'Parent folder not found') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to create folder' });
    }
  });

  /**
   * PUT /:folderType/folders/:folderId
   * Update a folder
   */
  app.put('/:folderType/folders/:folderId', async (req, reply) => {
    try {
      const { folderType, folderId } = req.params;
      await checkPermission(req.user.sub, 'update', reply, folderType);
      const { name, description, parent_folder_id, sort_order } = req.body;
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (parent_folder_id !== undefined) updates.parent_folder_id = parent_folder_id;
      if (sort_order !== undefined) updates.sort_order = sort_order;
      
      if (updates.name === '') {
        return reply.code(400).send({ error: 'Folder name cannot be empty' });
      }
      
      const folder = await folderService.updateFolder(
        folderId,
        req.user.sub,
        folderType,
        updates,
        app.db
      );
      
      return folder;
    } catch (error) {
      req.log.error(error, 'Error updating folder');
      if (error.message.includes('not found') || error.message.includes('circular')) {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to update folder' });
    }
  });

  /**
   * DELETE /:folderType/folders/:folderId
   * Delete a folder
   */
  app.delete('/:folderType/folders/:folderId', async (req, reply) => {
    try {
      const { folderType, folderId } = req.params;
      await checkPermission(req.user.sub, 'delete', reply, folderType);
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      await folderService.deleteFolder(folderId, req.user.sub, folderType, app.db);
      
      return { success: true };
    } catch (error) {
      req.log.error(error, 'Error deleting folder');
      if (error.message.includes('children')) {
        return reply.code(400).send({ error: error.message });
      }
      if (error.message === 'Folder not found') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to delete folder' });
    }
  });

  /**
   * GET /:folderType/folders/:folderId/items
   * Get items in a folder (or root if folderId is 'root' or 'null')
   */
  app.get('/:folderType/folders/:folderId/items', async (req, reply) => {
    try {
      const { folderType, folderId } = req.params;
      await checkPermission(req.user.sub, 'read', reply, folderType);
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      // Support 'root' or 'null' as folder ID to get items without folder
      const actualFolderId = (folderId === 'root' || folderId === 'null') ? null : folderId;
      
      const items = await folderService.getFolderItems(
        actualFolderId,
        req.user.sub,
        folderType,
        app.db
      );
      
      return items;
    } catch (error) {
      req.log.error(error, 'Error getting folder items');
      return reply.code(500).send({ error: 'Failed to get folder items' });
    }
  });

  /**
   * PUT /:folderType/items/:itemId/move
   * Move item to a folder
   */
  app.put('/:folderType/items/:itemId/move', async (req, reply) => {
    try {
      const { folderType, itemId } = req.params;
      await checkPermission(req.user.sub, 'update', reply, folderType);
      const { folder_id, sort_order } = req.body;
      
      if (!validateFolderType(folderType)) {
        return reply.code(400).send({
          error: `Invalid folder type. Must be one of: ${Object.values(folderService.FOLDER_TYPES).join(', ')}`
        });
      }
      
      await folderService.moveItemToFolder(
        app.db,
        folderType,
        itemId,
        folder_id,
        sort_order || 0,
        req.user.sub
      );
      
      return { success: true };
    } catch (error) {
      req.log.error(error, 'Error moving item');
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to move item' });
    }
  });
}
