/**
 * Flow Import/Export Service
 * Handles exporting flows to JSON and importing from other DataForeman instances
 */

const EXPORT_VERSION = 1;

/**
 * Export a flow to a portable JSON format
 * @param {string} flowId - Flow UUID
 * @param {Object} db - Database connection
 * @returns {Promise<Object>} Export data structure
 */
export async function exportFlow(flowId, db) {
  // Fetch flow data
  const flowResult = await db.query(`
    SELECT 
      id,
      name,
      description,
      execution_mode,
      scan_rate_ms,
      logs_enabled,
      logs_retention_days,
      save_usage_data,
      definition,
      static_data
    FROM flows
    WHERE id = $1
  `, [flowId]);

  if (flowResult.rows.length === 0) {
    throw new Error('Flow not found');
  }

  const flow = flowResult.rows[0];
  const definition = flow.definition || {};
  const nodes = definition.nodes || [];

  // Enrich nodes with connection and tag metadata
  const enrichedNodes = [];
  const connectionIds = new Set();
  const tagIds = new Set();

  // Collect connection and tag IDs from all nodes
  nodes.forEach(node => {
    if (node.data?.connectionId) {
      connectionIds.add(node.data.connectionId);
    }
    if (node.data?.tagId) {
      tagIds.add(node.data.tagId);
    }
    if (node.data?.tags && Array.isArray(node.data.tags)) {
      node.data.tags.forEach(tag => {
        if (tag.id) tagIds.add(tag.id);
      });
    }
  });

  // Fetch connection metadata
  let connectionsMap = {};
  if (connectionIds.size > 0) {
    const connectionsResult = await db.query(`
      SELECT id, name, type as driver_type
      FROM connections
      WHERE id = ANY($1)
    `, [Array.from(connectionIds)]);

    connectionsResult.rows.forEach(conn => {
      connectionsMap[conn.id] = {
        connection_id: conn.id,
        connection_name: conn.name,
        driver_type: conn.driver_type
      };
    });
  }

  // Fetch tag metadata
  let tagsMap = {};
  if (tagIds.size > 0) {
    const tagsResult = await db.query(`
      SELECT 
        tm.tag_id,
        tm.connection_id,
        c.name as connection_name,
        tm.tag_path,
        tm.tag_name,
        tm.data_type
      FROM tag_metadata tm
      LEFT JOIN connections c ON tm.connection_id = c.id
      WHERE tm.tag_id = ANY($1)
    `, [Array.from(tagIds)]);

    tagsResult.rows.forEach(tag => {
      tagsMap[tag.tag_id] = {
        tag_id: tag.tag_id,
        connection_id: tag.connection_id,
        connection_name: tag.connection_name,
        tag_path: tag.tag_path,
        tag_name: tag.tag_name,
        data_type: tag.data_type
      };
    });
  }

  // Enrich nodes with metadata
  nodes.forEach(node => {
    const enrichedNode = { ...node };

    // Enrich connection data
    if (node.data?.connectionId && connectionsMap[node.data.connectionId]) {
      enrichedNode.data = {
        ...enrichedNode.data,
        ...connectionsMap[node.data.connectionId]
      };
    }

    // Enrich single tag data
    if (node.data?.tagId && tagsMap[node.data.tagId]) {
      enrichedNode.data = {
        ...enrichedNode.data,
        ...tagsMap[node.data.tagId]
      };
    }

    // Enrich tags array
    if (node.data?.tags && Array.isArray(node.data.tags)) {
      enrichedNode.data = {
        ...enrichedNode.data,
        tags: node.data.tags.map(tag => {
          if (tag.id && tagsMap[tag.id]) {
            return {
              ...tag,
              ...tagsMap[tag.id]
            };
          }
          return tag;
        })
      };
    }

    enrichedNodes.push(enrichedNode);
  });

  // Create export structure
  const exportData = {
    version: EXPORT_VERSION,
    type: 'flow',
    exported_at: new Date().toISOString(),
    flow: {
      name: flow.name,
      description: flow.description,
      execution_mode: flow.execution_mode,
      scan_rate_ms: flow.scan_rate_ms,
      logs_enabled: flow.logs_enabled,
      logs_retention_days: flow.logs_retention_days,
      save_usage_data: flow.save_usage_data,
      definition: {
        ...definition,
        nodes: enrichedNodes
      },
      static_data: flow.static_data
    }
  };

  return exportData;
}

/**
 * Validate import data and check dependencies
 * @param {Object} importData - Import data structure
 * @param {Object} db - Database connection
 * @returns {Promise<Object>} Validation result
 */
export async function validateImport(importData, db) {
  const errors = [];
  const warnings = [];
  const validConnections = [];
  const invalidConnections = [];
  const validTags = [];
  const invalidTags = [];

  // Version check
  if (importData.version !== EXPORT_VERSION) {
    errors.push(`Unsupported export version: ${importData.version} (expected ${EXPORT_VERSION})`);
    return { valid: false, errors, warnings, validConnections, invalidConnections, validTags, invalidTags };
  }

  // Type check
  if (importData.type !== 'flow') {
    errors.push(`Invalid export type: ${importData.type} (expected 'flow')`);
    return { valid: false, errors, warnings, validConnections, invalidConnections, validTags, invalidTags };
  }

  // Config check
  if (!importData.flow || !importData.flow.definition) {
    errors.push('Invalid export format: missing flow or definition');
    return { valid: false, errors, warnings, validConnections, invalidConnections, validTags, invalidTags };
  }

  const nodes = importData.flow.definition.nodes || [];

  // Collect unique connections and tags
  const connectionIds = new Set();
  const tagIds = new Set();

  nodes.forEach(node => {
    if (node.data?.connection_id) {
      connectionIds.add(node.data.connection_id);
    }
    if (node.data?.tag_id) {
      tagIds.add(node.data.tag_id);
    }
    if (node.data?.tags && Array.isArray(node.data.tags)) {
      node.data.tags.forEach(tag => {
        if (tag.tag_id) tagIds.add(tag.tag_id);
      });
    }
  });

  // Validate connections
  for (const connectionId of connectionIds) {
    // Find node with this connection
    const nodeWithConnection = nodes.find(n => n.data?.connection_id === connectionId);
    if (!nodeWithConnection) continue;

    const connInfo = {
      connection_id: connectionId,
      connection_name: nodeWithConnection.data.connection_name,
      driver_type: nodeWithConnection.data.driver_type
    };

    // Check if connection exists with matching composite key
    const connResult = await db.query(`
      SELECT id, name, type as driver_type
      FROM connections
      WHERE id = $1
    `, [connectionId]);

    if (connResult.rows.length === 0) {
      invalidConnections.push({
        ...connInfo,
        reason: 'not_found',
        message: `Connection not found: ${connInfo.connection_name} (ID: ${connectionId})`
      });
      continue;
    }

    const found = connResult.rows[0];

    // Validate connection name matches
    if (found.name !== nodeWithConnection.data.connection_name) {
      invalidConnections.push({
        ...connInfo,
        reason: 'name_mismatch',
        message: `Connection name mismatch: expected '${nodeWithConnection.data.connection_name}', found '${found.name}'`,
        found_connection_name: found.name
      });
      continue;
    }

    // Validate driver type matches
    if (found.driver_type !== nodeWithConnection.data.driver_type) {
      invalidConnections.push({
        ...connInfo,
        reason: 'driver_type_mismatch',
        message: `Driver type mismatch: expected '${nodeWithConnection.data.driver_type}', found '${found.driver_type}'`,
        found_driver_type: found.driver_type
      });
      continue;
    }

    validConnections.push({
      ...connInfo,
      validated: true
    });
  }

  // Validate tags
  for (const tagId of tagIds) {
    // Find node/tag with this tag_id
    let tagInfo = null;
    for (const node of nodes) {
      if (node.data?.tag_id === tagId) {
        tagInfo = {
          tag_id: tagId,
          connection_id: node.data.connection_id,
          connection_name: node.data.connection_name,
          tag_path: node.data.tag_path,
          tag_name: node.data.tag_name || node.data.tagName
        };
        break;
      }
      if (node.data?.tags && Array.isArray(node.data.tags)) {
        const tag = node.data.tags.find(t => t.tag_id === tagId);
        if (tag) {
          tagInfo = {
            tag_id: tagId,
            connection_id: tag.connection_id,
            connection_name: tag.connection_name,
            tag_path: tag.tag_path,
            tag_name: tag.tag_name
          };
          break;
        }
      }
    }

    if (!tagInfo) continue;

    // Check if tag exists using composite key (connection_id + tag_path)
    // This is the correct validation approach - we validate by what identifies
    // a tag in the system, not by the potentially stale tag_id from export
    const tagResult = await db.query(`
      SELECT 
        tm.tag_id,
        tm.connection_id,
        c.name as connection_name,
        tm.tag_path,
        tm.tag_name
      FROM tag_metadata tm
      LEFT JOIN connections c ON tm.connection_id = c.id
      WHERE tm.connection_id = $1 AND tm.tag_path = $2
    `, [tagInfo.connection_id, tagInfo.tag_path]);

    if (tagResult.rows.length === 0) {
      invalidTags.push({
        ...tagInfo,
        reason: 'not_found',
        message: `Tag not found: ${tagInfo.tag_name || tagInfo.tag_path} (${tagInfo.connection_name})`
      });
      continue;
    }

    const found = tagResult.rows[0];

    // Validate connection name matches (in case connection was renamed)
    if (found.connection_name !== tagInfo.connection_name) {
      invalidTags.push({
        ...tagInfo,
        reason: 'connection_name_mismatch',
        message: `Connection name mismatch: expected '${tagInfo.connection_name}', found '${found.connection_name}'`,
        found_connection_name: found.connection_name
      });
      continue;
    }

    validTags.push({
      ...tagInfo,
      // Update with the actual tag_id from the database
      tag_id: found.tag_id,
      validated: true
    });
  }

  // Generate warnings
  if (invalidConnections.length > 0) {
    warnings.push(`${invalidConnections.length} connection(s) will be removed due to validation failures`);
  }

  if (invalidTags.length > 0) {
    warnings.push(`${invalidTags.length} tag(s) will be removed due to validation failures`);
  }

  // Check if flow would be empty or broken
  const nodesWithConnections = nodes.filter(n => n.data?.connection_id);
  const nodesWithTags = nodes.filter(n => n.data?.tag_id || (n.data?.tags && n.data.tags.length > 0));
  
  if (nodesWithConnections.length > 0 && validConnections.length === 0) {
    errors.push('No valid connections found - flow requires connections but none are available');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validConnections,
    invalidConnections,
    validTags,
    invalidTags,
    summary: {
      total_connections: connectionIds.size,
      valid_connections: validConnections.length,
      invalid_connections: invalidConnections.length,
      total_tags: tagIds.size,
      valid_tags: validTags.length,
      invalid_tags: invalidTags.length
    }
  };
}

/**
 * Import a flow after validation
 * @param {Object} importData - Validated import data
 * @param {string} userId - User ID creating the flow
 * @param {Object} validation - Validation result from validateImport
 * @param {Object} db - Database connection
 * @param {string|null} newName - Optional new name for the imported flow
 * @returns {Promise<Object>} Import result with created flow
 */
export async function importFlow(importData, userId, validation, db, newName = null) {
  if (!validation.valid) {
    throw new Error('Cannot import flow with validation errors');
  }

  const flowData = importData.flow;
  const definition = flowData.definition;
  const nodes = definition.nodes || [];

  // Create sets of valid IDs for filtering
  const validConnectionIds = new Set(validation.validConnections.map(c => c.connection_id));
  const validTagIds = new Set(validation.validTags.map(t => t.tag_id));

  // Filter nodes - remove nodes that depend on invalid connections/tags
  const filteredNodes = nodes.map(node => {
    const newNode = { ...node };

    // Remove invalid connection data
    if (node.data?.connection_id && !validConnectionIds.has(node.data.connection_id)) {
      // Remove connection-related data but keep the node
      const { connection_id, connection_name, driver_type, ...restData } = node.data;
      newNode.data = restData;
      
      // If this was a connection-dependent node with no other data, mark it
      if (node.type === 'tagInput' || node.type === 'tagOutput') {
        newNode.data._import_warning = 'Connection removed - node may not function';
      }
    }

    // Remove invalid single tag
    if (node.data?.tag_id && !validTagIds.has(node.data.tag_id)) {
      const { tag_id, tag_path, ...restData } = node.data;
      newNode.data = restData;
      
      if (node.type === 'tagInput' || node.type === 'tagOutput') {
        newNode.data._import_warning = 'Tag removed - node may not function';
      }
    }

    // Filter tags array
    if (node.data?.tags && Array.isArray(node.data.tags)) {
      const filteredTags = node.data.tags.filter(tag => 
        !tag.tag_id || validTagIds.has(tag.tag_id)
      );
      
      newNode.data = {
        ...newNode.data,
        tags: filteredTags
      };

      if (filteredTags.length < node.data.tags.length) {
        newNode.data._import_warning = `${node.data.tags.length - filteredTags.length} tag(s) removed`;
      }
    }

    return newNode;
  });

  // Prepare flow data for insert
  const flowInsertData = {
    user_id: userId,
    name: newName || flowData.name,
    description: flowData.description,
    execution_mode: flowData.execution_mode || 'continuous',
    scan_rate_ms: flowData.scan_rate_ms || 1000,
    logs_enabled: flowData.logs_enabled || false,
    logs_retention_days: flowData.logs_retention_days || 30,
    save_usage_data: flowData.save_usage_data !== false,
    definition: {
      ...definition,
      nodes: filteredNodes
    },
    static_data: flowData.static_data || {}
  };

  // Insert flow
  const query = `
    INSERT INTO flows (
      owner_user_id, name, description, execution_mode, scan_rate_ms,
      logs_enabled, logs_retention_days, save_usage_data, definition, static_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, name, created_at
  `;

  const values = [
    flowInsertData.user_id,
    flowInsertData.name,
    flowInsertData.description,
    flowInsertData.execution_mode,
    flowInsertData.scan_rate_ms,
    flowInsertData.logs_enabled,
    flowInsertData.logs_retention_days,
    flowInsertData.save_usage_data,
    JSON.stringify(flowInsertData.definition),
    JSON.stringify(flowInsertData.static_data)
  ];

  const { rows } = await db.query(query, values);
  const created = rows[0];

  return {
    success: true,
    flow: created,
    imported_nodes: filteredNodes.length,
    imported_connections: validation.validConnections.length,
    imported_tags: validation.validTags.length,
    skipped_connections: validation.invalidConnections.length,
    skipped_tags: validation.invalidTags.length,
    warnings: validation.warnings,
    connection_details: validation.invalidConnections,
    tag_details: validation.invalidTags
  };
}
