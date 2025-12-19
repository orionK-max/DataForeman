/**
 * Generic Folder Service
 * 
 * Provides CRUD operations for both dashboard_folders and chart_folders
 * Uses a generic approach to handle both types with the same logic
 */

export const FOLDER_TYPES = {
  DASHBOARD: 'dashboard',
  CHART: 'chart',
  FLOW: 'flow',
};

const FOLDER_TABLES = {
  [FOLDER_TYPES.DASHBOARD]: 'dashboard_folders',
  [FOLDER_TYPES.CHART]: 'chart_folders',
  [FOLDER_TYPES.FLOW]: 'flow_folders',
};

const ITEM_TABLES = {
  [FOLDER_TYPES.DASHBOARD]: 'dashboard_configs',
  [FOLDER_TYPES.CHART]: 'chart_configs',
  [FOLDER_TYPES.FLOW]: 'flows',
};

const ITEM_USER_COLUMNS = {
  [FOLDER_TYPES.DASHBOARD]: 'user_id',
  [FOLDER_TYPES.CHART]: 'user_id',
  [FOLDER_TYPES.FLOW]: 'owner_user_id',
};

const ITEM_FOLDER_STORAGE = {
  [FOLDER_TYPES.DASHBOARD]: 'options', // stored in options JSONB
  [FOLDER_TYPES.CHART]: 'options',     // stored in options JSONB
  [FOLDER_TYPES.FLOW]: 'column',       // direct column
};

/**
 * Get table name for folder type
 */
function getFolderTable(folderType) {
  const table = FOLDER_TABLES[folderType];
  if (!table) {
    throw new Error(`Invalid folder type: ${folderType}`);
  }
  return table;
}

/**
 * Get item table name for folder type
 */
function getItemTable(folderType) {
  const table = ITEM_TABLES[folderType];
  if (!table) {
    throw new Error(`Invalid folder type: ${folderType}`);
  }
  return table;
}

/**
 * List all folders for a user
 */
export async function listFolders(userId, folderType, db) {
  const table = getFolderTable(folderType);
  
  const result = await db.query(
    `SELECT id, name, description, parent_folder_id, sort_order, created_at, updated_at
     FROM ${table}
     WHERE user_id = $1
     ORDER BY sort_order, name`,
    [userId]
  );
  
  return result.rows;
}

/**
 * Get a single folder by ID
 */
export async function getFolder(folderId, userId, folderType, db) {
  const table = getFolderTable(folderType);
  
  const result = await db.query(
    `SELECT id, name, description, parent_folder_id, sort_order, created_at, updated_at
     FROM ${table}
     WHERE id = $1 AND user_id = $2`,
    [folderId, userId]
  );
  
  return result.rows[0] || null;
}

/**
 * Create a new folder
 */
export async function createFolder(userId, folderType, { name, description, parent_folder_id, sort_order = 0 }, db) {
  const table = getFolderTable(folderType);
  
  // Validate parent folder if provided
  if (parent_folder_id) {
    const parentFolder = await getFolder(parent_folder_id, userId, folderType, db);
    if (!parentFolder) {
      throw new Error('Parent folder not found');
    }
  }
  
  const result = await db.query(
    `INSERT INTO ${table} (user_id, name, description, parent_folder_id, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, description, parent_folder_id, sort_order, created_at, updated_at`,
    [userId, name, description || null, parent_folder_id || null, sort_order]
  );
  
  return result.rows[0];
}

/**
 * Update a folder
 */
export async function updateFolder(folderId, userId, folderType, updates, db) {
  const table = getFolderTable(folderType);
  
  // Validate folder exists and belongs to user
  const folder = await getFolder(folderId, userId, folderType, db);
  if (!folder) {
    throw new Error('Folder not found');
  }
  
  // Prevent circular references in parent_folder_id
  if (updates.parent_folder_id) {
    if (updates.parent_folder_id === folderId) {
      throw new Error('Folder cannot be its own parent');
    }
    
    // Check if new parent exists and belongs to user
    const parentFolder = await getFolder(updates.parent_folder_id, userId, folderType, db);
    if (!parentFolder) {
      throw new Error('Parent folder not found');
    }
    
    // Check for circular reference (is new parent a descendant?)
    const descendants = await getFolderDescendants(folderId, userId, folderType, db);
    if (descendants.some(d => d.id === updates.parent_folder_id)) {
      throw new Error('Cannot move folder to its own descendant');
    }
  }
  
  const setClauses = [];
  const values = [];
  let paramCount = 1;
  
  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramCount++}`);
    values.push(updates.name);
  }
  
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramCount++}`);
    values.push(updates.description || null);
  }
  
  if (updates.parent_folder_id !== undefined) {
    setClauses.push(`parent_folder_id = $${paramCount++}`);
    values.push(updates.parent_folder_id || null);
  }
  
  if (updates.sort_order !== undefined) {
    setClauses.push(`sort_order = $${paramCount++}`);
    values.push(updates.sort_order);
  }
  
  if (setClauses.length === 0) {
    return folder; // No updates
  }
  
  values.push(folderId, userId);
  
  const result = await db.query(
    `UPDATE ${table}
     SET ${setClauses.join(', ')}
     WHERE id = $${paramCount++} AND user_id = $${paramCount++}
     RETURNING id, name, description, parent_folder_id, sort_order, created_at, updated_at`,
    values
  );
  
  return result.rows[0];
}

/**
 * Delete a folder
 */
export async function deleteFolder(folderId, userId, folderType, db) {
  const table = getFolderTable(folderType);
  
  // Validate folder exists and belongs to user
  const folder = await getFolder(folderId, userId, folderType, db);
  if (!folder) {
    throw new Error('Folder not found');
  }
  
  // Check if folder has children (both folders and items)
  const childFolders = await db.query(
    `SELECT id FROM ${table} WHERE parent_folder_id = $1 LIMIT 1`,
    [folderId]
  );
  
  const itemTable = getItemTable(folderType);
  const folderStorage = ITEM_FOLDER_STORAGE[folderType];
  
  let childItems;
  if (folderStorage === 'options') {
    // For charts and dashboards, folder_id is stored in options JSONB
    // Only check non-deleted items
    childItems = await db.query(
      `SELECT id FROM ${itemTable} WHERE options->>'folder_id' = $1 AND is_deleted = false LIMIT 1`,
      [folderId]
    );
  } else {
    // For flows, folder_id is a direct column
    // Only check non-deleted items
    childItems = await db.query(
      `SELECT id FROM ${itemTable} WHERE folder_id = $1 AND is_deleted = false LIMIT 1`,
      [folderId]
    );
  }
  
  if (childFolders.rows.length > 0 || childItems.rows.length > 0) {
    throw new Error('Cannot delete folder with children. Move or delete children first.');
  }
  
  await db.query(
    `DELETE FROM ${table} WHERE id = $1 AND user_id = $2`,
    [folderId, userId]
  );
  
  return true;
}

/**
 * Get all descendant folders (recursive)
 */
export async function getFolderDescendants(folderId, userId, folderType, db) {
  const table = getFolderTable(folderType);
  
  const result = await db.query(
    `WITH RECURSIVE folder_tree AS (
      SELECT id, name, parent_folder_id, sort_order, 1 as depth
      FROM ${table}
      WHERE parent_folder_id = $1 AND user_id = $2
      
      UNION ALL
      
      SELECT f.id, f.name, f.parent_folder_id, f.sort_order, ft.depth + 1
      FROM ${table} f
      INNER JOIN folder_tree ft ON f.parent_folder_id = ft.id
      WHERE f.user_id = $2
    )
    SELECT * FROM folder_tree
    ORDER BY depth, sort_order, name`,
    [folderId, userId]
  );
  
  return result.rows;
}

/**
 * Get folder tree structure (all folders organized hierarchically)
 */
export async function getFolderTree(userId, folderType, db) {
  const folders = await listFolders(userId, folderType, db);
  
  // Build a map for quick lookup
  const folderMap = new Map();
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });
  
  // Build the tree
  const rootFolders = [];
  folders.forEach(folder => {
    const folderNode = folderMap.get(folder.id);
    if (folder.parent_folder_id) {
      const parent = folderMap.get(folder.parent_folder_id);
      if (parent) {
        parent.children.push(folderNode);
      } else {
        // Parent not found (orphaned), treat as root
        rootFolders.push(folderNode);
      }
    } else {
      rootFolders.push(folderNode);
    }
  });
  
  return rootFolders;
}

/**
 * Move item to folder
 */
export async function moveItemToFolder(db, folderType, itemId, folderId, sortOrder, userId) {
  try {
    const table = ITEM_TABLES[folderType];
    const userColumn = ITEM_USER_COLUMNS[folderType];
    const storage = ITEM_FOLDER_STORAGE[folderType];
    
    if (!table) throw new Error(`Invalid folder type: ${folderType}`);

    // If folderId is provided, verify it exists and user has access
    if (folderId) {
      const folder = await getFolder(folderId, userId, folderType, db);
      if (!folder) {
        throw new Error('Folder not found or access denied');
      }
    }

    let result;
    
    if (storage === 'column') {
      // For flows: folder_id is a direct column
      result = await db.query(
        `UPDATE ${table}
         SET folder_id = $1
         WHERE id = $2 AND ${userColumn} = $3
         RETURNING *`,
        [folderId, itemId, userId]
      );
    } else {
      // For dashboards/charts: folder_id is stored in options JSONB
      const folderData = JSON.stringify({
        folder_id: folderId,
        sort_order: sortOrder
      });

      result = await db.query(
        `UPDATE ${table}
         SET options = COALESCE(options, '{}'::jsonb) || $1::jsonb
         WHERE id = $2 AND ${userColumn} = $3
         RETURNING *`,
        [folderData, itemId, userId]
      );
    }

    if (result.rows.length === 0) {
      throw new Error('Item not found or access denied');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error moving item to folder:', error);
    throw error;
  }
}

/**
 * Get items in a folder
 */
export async function getFolderItems(folderId, userId, folderType, db) {
  const itemTable = getItemTable(folderType);
  
  // Query based on folder_id in options JSONB column
  let query;
  let params;
  
  if (folderId) {
    query = `SELECT * FROM ${itemTable}
             WHERE user_id = $1 
             AND (options->>'folder_id')::text = $2
             ORDER BY (options->>'sort_order')::integer NULLS LAST, name`;
    params = [userId, folderId];
  } else {
    query = `SELECT * FROM ${itemTable}
             WHERE user_id = $1 
             AND (options->>'folder_id' IS NULL OR options->>'folder_id' = 'null')
             ORDER BY (options->>'sort_order')::integer NULLS LAST, name`;
    params = [userId];
  }
  
  const result = await db.query(query, params);
  
  return result.rows;
}

export default {
  FOLDER_TYPES,
  listFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  getFolderDescendants,
  getFolderTree,
  moveItemToFolder,
  getFolderItems,
};
