/**
 * Chart Import/Export Service
 * 
 * Handles exporting charts with dependency information and importing them
 * with validation to ensure tags and connections exist in target environment.
 */

const EXPORT_VERSION = 1;

/**
 * Export a chart with all dependency information
 * @param {Object} chart - Chart configuration from database
 * @param {Object} db - Database connection
 * @returns {Promise<Object>} Export data structure
 */
export async function exportChart(chart, db) {
  if (!chart) {
    throw new Error('Chart not found');
  }

  const options = chart.options || {};
  const tags = options.tags || [];

  // Enrich each tag with connection and tag metadata
  const enrichedTags = [];
  for (const tag of tags) {
    if (!tag.tag_id || !tag.connection_id) {
      // Skip tags without proper IDs (shouldn't happen with new validation)
      continue;
    }

    // Query tag and connection info
    const query = `
      SELECT 
        tm.tag_id,
        tm.tag_path,
        tm.tag_name,
        tm.data_type,
        c.id as connection_id,
        c.name as connection_name,
        c.type as connection_type
      FROM tag_metadata tm
      JOIN connections c ON tm.connection_id = c.id
      WHERE tm.tag_id = $1 AND c.id = $2
    `;
    
    const { rows } = await db.query(query, [tag.tag_id, tag.connection_id]);
    
    if (rows.length === 0) {
      // Tag or connection deleted/missing - skip
      continue;
    }

    const metadata = rows[0];
    
    enrichedTags.push({
      // Identity fields (for validation on import)
      tag_id: metadata.tag_id,
      connection_id: metadata.connection_id,
      connection_name: metadata.connection_name,
      connection_type: metadata.connection_type,
      tag_path: metadata.tag_path,
      tag_name: metadata.tag_name,
      data_type: metadata.data_type,
      
      // Display configuration (from chart config)
      name: tag.name || metadata.tag_name,
      alias: tag.alias || null,
      color: tag.color,
      thickness: tag.thickness || 2,
      strokeType: tag.strokeType || 'solid',
      yAxisId: tag.yAxisId || 'default',
      interpolation: tag.interpolation || 'linear',
      hidden: tag.hidden || false
    });
  }

  // Build export structure
  const exportData = {
    version: EXPORT_VERSION,
    type: 'chart',
    exported_at: new Date().toISOString(),
    exported_by: chart.user_id,
    
    metadata: {
      original_id: chart.id,
      original_name: chart.name,
      is_system_chart: chart.is_system_chart || false
    },
    
    config: {
      // Chart properties
      name: chart.name,
      description: chart.description || null,
      time_mode: chart.time_mode || 'fixed',
      time_duration: chart.time_duration || null,
      time_offset: chart.time_offset || 0,
      time_from: chart.time_from || null,
      time_to: chart.time_to || null,
      live_enabled: chart.live_enabled || false,
      show_time_badge: chart.show_time_badge !== false,
      
      // Options with enriched tags
      options: {
        ...options,
        tags: enrichedTags,
        version: options.version || 1
      }
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
  const validTags = [];
  const invalidTags = [];

  // Version check
  if (importData.version !== EXPORT_VERSION) {
    errors.push(`Unsupported export version: ${importData.version} (expected ${EXPORT_VERSION})`);
    return { valid: false, errors, warnings, validTags, invalidTags };
  }

  // Type check
  if (importData.type !== 'chart') {
    errors.push(`Invalid export type: ${importData.type} (expected 'chart')`);
    return { valid: false, errors, warnings, validTags, invalidTags };
  }

  // Config check
  if (!importData.config || !importData.config.options) {
    errors.push('Invalid export format: missing config or options');
    return { valid: false, errors, warnings, validTags, invalidTags };
  }

  const tags = importData.config.options.tags || [];

  // Validate each tag
  for (const tag of tags) {
    const tagInfo = {
      tag_id: tag.tag_id,
      connection_name: tag.connection_name,
      tag_path: tag.tag_path,
      tag_name: tag.tag_name
    };

    // Check if tag exists with matching connection
    const query = `
      SELECT 
        tm.tag_id,
        tm.connection_id,
        tm.tag_path,
        tm.tag_name,
        c.name as connection_name,
        c.type as connection_type
      FROM tag_metadata tm
      JOIN connections c ON tm.connection_id = c.id
      WHERE tm.tag_id = $1 
        AND c.id = $2
        AND tm.is_deleted = false
        AND c.deleted_at IS NULL
    `;

    const { rows } = await db.query(query, [tag.tag_id, tag.connection_id]);

    if (rows.length === 0) {
      // Tag doesn't exist - check if it's missing or wrong environment
      const checkConn = await db.query(
        'SELECT name FROM connections WHERE id = $1 AND deleted_at IS NULL',
        [tag.connection_id]
      );

      if (checkConn.rows.length === 0) {
        invalidTags.push({
          ...tagInfo,
          reason: 'connection_not_found',
          message: `Connection '${tag.connection_name}' (${tag.connection_id}) not found`
        });
      } else {
        invalidTags.push({
          ...tagInfo,
          reason: 'tag_not_found',
          message: `Tag '${tag.tag_path}' not found on connection '${tag.connection_name}'`
        });
      }
      continue;
    }

    const found = rows[0];

    // Validate connection name matches
    if (found.connection_name !== tag.connection_name) {
      invalidTags.push({
        ...tagInfo,
        reason: 'connection_name_mismatch',
        message: `Connection name mismatch: expected '${tag.connection_name}', found '${found.connection_name}'`,
        found_connection_name: found.connection_name
      });
      continue;
    }

    // Validate tag path matches
    if (found.tag_path !== tag.tag_path) {
      invalidTags.push({
        ...tagInfo,
        reason: 'tag_path_mismatch',
        message: `Tag path mismatch: expected '${tag.tag_path}', found '${found.tag_path}'`,
        found_tag_path: found.tag_path
      });
      continue;
    }

    // Tag is valid
    validTags.push({
      ...tagInfo,
      validated: true
    });
  }

  // Generate summary
  if (invalidTags.length > 0) {
    warnings.push(`${invalidTags.length} tag(s) will be skipped due to validation failures`);
  }

  if (validTags.length === 0 && tags.length > 0) {
    errors.push('No valid tags found - chart would be empty');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validTags,
    invalidTags,
    summary: {
      total_tags: tags.length,
      valid_tags: validTags.length,
      invalid_tags: invalidTags.length
    }
  };
}

/**
 * Import a chart after validation
 * @param {Object} importData - Validated import data
 * @param {string} userId - User ID creating the chart
 * @param {Object} validation - Validation result from validateImport
 * @param {Object} db - Database connection
 * @param {string|null} newName - Optional new name for the imported chart
 * @returns {Promise<Object>} Import result with created chart
 */
export async function importChart(importData, userId, validation, db, newName = null) {
  if (!validation.valid) {
    throw new Error('Cannot import chart with validation errors');
  }

  const config = importData.config;
  
  // Filter to only valid tags
  const validTagIds = new Set(validation.validTags.map(t => t.tag_id));
  const filteredTags = config.options.tags.filter(tag => validTagIds.has(tag.tag_id));

  // Prepare chart data
  const chartData = {
    user_id: userId,
    name: newName || config.name,
    description: config.description,
    time_mode: config.time_mode || 'fixed',
    time_duration: config.time_duration,
    time_offset: config.time_offset || 0,
    time_from: config.time_from,
    time_to: config.time_to,
    live_enabled: config.live_enabled || false,
    show_time_badge: config.show_time_badge !== false,
    is_shared: false, // Always create as private for importer
    is_system_chart: false, // Never import as system chart
    options: {
      ...config.options,
      tags: filteredTags
    }
  };

  // Insert chart
  const query = `
    INSERT INTO chart_configs (
      user_id, name, description, time_mode, time_duration, time_offset,
      time_from, time_to, live_enabled, show_time_badge, is_shared, 
      is_system_chart, options
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, name, created_at
  `;

  const values = [
    chartData.user_id,
    chartData.name,
    chartData.description,
    chartData.time_mode,
    chartData.time_duration,
    chartData.time_offset,
    chartData.time_from,
    chartData.time_to,
    chartData.live_enabled,
    chartData.show_time_badge,
    chartData.is_shared,
    chartData.is_system_chart,
    JSON.stringify(chartData.options)
  ];

  const { rows } = await db.query(query, values);
  const created = rows[0];

  return {
    success: true,
    chart: created,
    imported_tags: filteredTags.length,
    skipped_tags: validation.invalidTags.length,
    warnings: validation.warnings,
    skipped_details: validation.invalidTags
  };
}
