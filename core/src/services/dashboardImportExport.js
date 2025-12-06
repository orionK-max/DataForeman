/**
 * Dashboard Import/Export Service
 * Handles exporting dashboards with enriched chart metadata and importing with validation
 */

const EXPORT_VERSION = 1;

/**
 * Export dashboard with enriched chart metadata
 * @param {Object} db - Database client
 * @param {string} dashboardId - Dashboard ID to export
 * @param {string} userId - User ID requesting export
 * @returns {Object} - Export data with version, dashboard config, and chart metadata
 */
export async function exportDashboard(db, dashboardId, userId) {
  // Fetch dashboard
  const dashboardResult = await db.query(`
    SELECT id, name, description, is_shared, layout, options
    FROM dashboard_configs
    WHERE id = $1 AND user_id = $2 AND is_deleted = false
  `, [dashboardId, userId]);

  if (dashboardResult.rows.length === 0) {
    throw new Error('Dashboard not found or access denied');
  }

  const dashboard = dashboardResult.rows[0];

  // Extract chart IDs from layout items
  const chartIds = new Set();
  if (dashboard.layout?.items && Array.isArray(dashboard.layout.items)) {
    dashboard.layout.items.forEach(item => {
      if (item.chart_id) {
        chartIds.add(item.chart_id);
      }
    });
  }

  // Fetch chart metadata for validation
  let chartsMap = {};
  if (chartIds.size > 0) {
    const chartsResult = await db.query(`
      SELECT 
        c.id as chart_id,
        c.name as chart_name,
        c.description as chart_description
      FROM chart_configs c
      WHERE c.id = ANY($1) AND c.is_deleted = false
    `, [Array.from(chartIds)]);

    chartsResult.rows.forEach(chart => {
      chartsMap[chart.chart_id] = {
        chart_id: chart.chart_id,
        chart_name: chart.chart_name,
        chart_description: chart.chart_description
      };
    });
  }

  // Enrich layout items with chart metadata
  const enrichedLayout = {
    ...dashboard.layout,
    items: dashboard.layout.items.map(item => ({
      ...item,
      // Add chart metadata for validation
      chart_name: chartsMap[item.chart_id]?.chart_name,
      chart_description: chartsMap[item.chart_id]?.chart_description
    }))
  };

  return {
    version: EXPORT_VERSION,
    type: 'dashboard',
    exported_at: new Date().toISOString(),
    dashboard: {
      name: dashboard.name,
      description: dashboard.description,
      is_shared: dashboard.is_shared,
      layout: enrichedLayout,
      options: dashboard.options
    }
  };
}

/**
 * Validate dashboard import data
 * @param {Object} db - Database client
 * @param {Object} importData - Import data to validate
 * @param {string} userId - User ID performing import
 * @returns {Object} - Validation results with valid/invalid charts
 */
export async function validateImport(db, importData, userId) {
  const errors = [];
  const warnings = [];
  const validCharts = [];
  const invalidCharts = [];

  // Validate format
  if (!importData || typeof importData !== 'object') {
    return { 
      valid: false, 
      errors: ['Invalid import data format'],
      warnings: [],
      validCharts: [],
      invalidCharts: []
    };
  }

  if (importData.version !== EXPORT_VERSION) {
    warnings.push(`Import version ${importData.version} may not be fully compatible with current version ${EXPORT_VERSION}`);
  }

  if (importData.type !== 'dashboard') {
    errors.push('Import data is not a dashboard export');
  }

  const dashboard = importData.dashboard;
  if (!dashboard || typeof dashboard !== 'object') {
    errors.push('Missing dashboard data');
    return { valid: false, errors, warnings, validCharts: [], invalidCharts: [] };
  }

  if (!dashboard.name || typeof dashboard.name !== 'string') {
    errors.push('Dashboard name is required');
  }

  if (!dashboard.layout || typeof dashboard.layout !== 'object') {
    errors.push('Dashboard layout is required');
  }

  if (!Array.isArray(dashboard.layout?.items)) {
    errors.push('Dashboard layout.items must be an array');
    return { valid: false, errors, warnings, validCharts: [], invalidCharts: [] };
  }

  // Extract chart IDs
  const chartIds = new Set();
  dashboard.layout.items.forEach(item => {
    if (item.chart_id) {
      chartIds.add(item.chart_id);
    }
  });

  // Validate charts exist in the system
  if (chartIds.size > 0) {
    const chartsResult = await db.query(`
      SELECT 
        c.id as chart_id,
        c.name as chart_name,
        c.description as chart_description
      FROM chart_configs c
      WHERE c.id = ANY($1) AND c.is_deleted = false
        AND (c.user_id = $2 OR c.is_shared = true)
    `, [Array.from(chartIds), userId]);

    const foundChartIds = new Set(chartsResult.rows.map(row => row.chart_id));

    // Check each chart reference
    for (const item of dashboard.layout.items) {
      const chartId = item.chart_id;
      if (!chartId) continue;

      const chartInfo = {
        chart_id: chartId,
        chart_name: item.chart_name || 'Unknown',
        chart_description: item.chart_description
      };

      if (foundChartIds.has(chartId)) {
        const foundChart = chartsResult.rows.find(row => row.chart_id === chartId);
        
        // Check if chart name matches
        if (item.chart_name && foundChart.chart_name !== item.chart_name) {
          warnings.push(`Chart "${item.chart_name}" was renamed to "${foundChart.chart_name}"`);
        }

        validCharts.push({
          ...chartInfo,
          found_name: foundChart.chart_name,
          validated: true
        });
      } else {
        invalidCharts.push({
          ...chartInfo,
          reason: 'not_found',
          message: `Chart not found: ${item.chart_name || chartId}`
        });
      }
    }
  }

  // Generate warnings
  if (invalidCharts.length > 0) {
    warnings.push(`${invalidCharts.length} widget(s) will be removed due to missing charts`);
  }

  if (errors.length === 0 && invalidCharts.length === dashboard.layout.items.length) {
    errors.push('All widgets reference missing charts. Cannot import empty dashboard.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validCharts,
    invalidCharts
  };
}

/**
 * Import dashboard with validated data
 * @param {Object} db - Database client
 * @param {Object} importData - Import data
 * @param {Object} validation - Validation results
 * @param {string} userId - User ID performing import
 * @param {string} [newName] - Optional new name for dashboard
 * @returns {Object} - Created dashboard
 */
export async function importDashboard(db, importData, validation, userId, newName = null) {
  if (!validation.valid) {
    throw new Error('Cannot import invalid dashboard');
  }

  const dashboard = importData.dashboard;
  
  // Get valid chart IDs
  const validChartIds = new Set(validation.validCharts.map(c => c.chart_id));

  // Filter layout items to only include valid charts
  const filteredItems = dashboard.layout.items
    .filter(item => validChartIds.has(item.chart_id))
    .map(item => {
      // Remove enrichment fields
      const { chart_name, chart_description, ...cleanItem } = item;
      return cleanItem;
    });

  // Create dashboard
  const insertResult = await db.query(`
    INSERT INTO dashboard_configs (
      user_id,
      name,
      description,
      is_shared,
      layout,
      options,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    RETURNING id, name, description, is_shared, layout, options, created_at, updated_at
  `, [
    userId,
    newName || dashboard.name,
    dashboard.description,
    false, // Always import as private
    JSON.stringify({
      ...dashboard.layout,
      items: filteredItems
    }),
    dashboard.options || {}
  ]);

  return insertResult.rows[0];
}
