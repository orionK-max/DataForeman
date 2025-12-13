/**
 * Dashboard Validator
 * 
 * Validates dashboard configurations against the DashboardSchema.
 * Provides comprehensive validation with detailed error messages.
 */

import {
  DashboardConfigSchema,
  DASHBOARD_LIMITS,
  DASHBOARD_SCHEMA_VERSION
} from '../schemas/DashboardSchema.js';

/**
 * Validates a dashboard configuration payload
 * @param {Object} payload - The dashboard configuration to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.isUpdate - Whether this is an update operation (allows partial data)
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[], value: Object }
 */
export function validatePayload(payload, options = {}) {
  const errors = [];
  const warnings = [];
  const value = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['payload must be an object'], warnings: [], value: null };
  }

  const { isUpdate = false } = options;

  // Validate name
  if (!isUpdate || payload.name !== undefined) {
    const nameError = DashboardConfigSchema.properties.name.validate(payload.name);
    if (nameError) {
      errors.push(nameError);
    } else {
      value.name = String(payload.name).trim();
    }
  }

  // Validate description
  if (payload.description !== undefined) {
    const descError = DashboardConfigSchema.properties.description.validate(payload.description);
    if (descError) {
      errors.push(descError);
    } else {
      value.description = payload.description === null || payload.description === '' 
        ? null 
        : String(payload.description).trim();
    }
  }

  // Validate is_shared
  if (!isUpdate || payload.is_shared !== undefined) {
    if (payload.is_shared !== undefined) {
      if (typeof payload.is_shared === 'boolean') {
        value.is_shared = payload.is_shared;
      } else {
        // Coerce to boolean
        value.is_shared = Boolean(payload.is_shared);
        warnings.push(`is_shared coerced to boolean: ${value.is_shared}`);
      }
    } else if (!isUpdate) {
      // Set default for new dashboards
      value.is_shared = false;
    }
  }

  // Validate layout
  if (!isUpdate || payload.layout !== undefined) {
    const layoutResult = validateLayout(payload.layout);
    if (layoutResult.errors.length > 0) {
      errors.push(...layoutResult.errors);
    } else {
      value.layout = layoutResult.value;
      warnings.push(...layoutResult.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value: errors.length === 0 ? value : null
  };
}

/**
 * Validates dashboard layout configuration
 * @param {Object} layout - The layout configuration
 * @returns {Object} - { errors: string[], warnings: string[], value: Object }
 */
function validateLayout(layout) {
  const errors = [];
  const warnings = [];
  const value = {};

  if (!layout || typeof layout !== 'object') {
    return { 
      errors: ['layout must be an object'], 
      warnings: [], 
      value: null 
    };
  }

  // Validate items array
  if (!Array.isArray(layout.items)) {
    errors.push('layout.items must be an array');
  } else {
    if (layout.items.length > DASHBOARD_LIMITS.MAX_WIDGETS) {
      errors.push(`layout.items must contain <= ${DASHBOARD_LIMITS.MAX_WIDGETS} widgets`);
    }

    const itemsResult = validateItems(layout.items);
    if (itemsResult.errors.length > 0) {
      errors.push(...itemsResult.errors);
    } else {
      value.items = itemsResult.value;
      warnings.push(...itemsResult.warnings);
    }
  }

  // Validate grid_cols
  if (layout.grid_cols !== undefined) {
    const cols = Number(layout.grid_cols);
    if (!Number.isInteger(cols)) {
      errors.push('layout.grid_cols must be an integer');
    } else if (cols < DASHBOARD_LIMITS.MIN_GRID_COLS || cols > DASHBOARD_LIMITS.MAX_GRID_COLS) {
      errors.push(`layout.grid_cols must be between ${DASHBOARD_LIMITS.MIN_GRID_COLS} and ${DASHBOARD_LIMITS.MAX_GRID_COLS}`);
    } else {
      value.grid_cols = cols;
    }
  }

  // Validate row_height
  if (layout.row_height !== undefined) {
    const height = Number(layout.row_height);
    if (!Number.isInteger(height)) {
      errors.push('layout.row_height must be an integer');
    } else if (height < DASHBOARD_LIMITS.MIN_ROW_HEIGHT || height > DASHBOARD_LIMITS.MAX_ROW_HEIGHT) {
      errors.push(`layout.row_height must be between ${DASHBOARD_LIMITS.MIN_ROW_HEIGHT} and ${DASHBOARD_LIMITS.MAX_ROW_HEIGHT}`);
    } else {
      value.row_height = height;
    }
  }

  // Pass through optional properties
  if (layout.breakpoints !== undefined) {
    if (typeof layout.breakpoints === 'object' && layout.breakpoints !== null) {
      value.breakpoints = layout.breakpoints;
    } else {
      warnings.push('layout.breakpoints should be an object, ignoring');
    }
  }

  if (layout.cols !== undefined) {
    if (typeof layout.cols === 'object' && layout.cols !== null) {
      value.cols = layout.cols;
    } else {
      warnings.push('layout.cols should be an object, ignoring');
    }
  }

  return { errors, warnings, value };
}

/**
 * Validates dashboard widget items
 * @param {Array} items - Array of widget configurations
 * @returns {Object} - { errors: string[], warnings: string[], value: Array }
 */
function validateItems(items) {
  const errors = [];
  const warnings = [];
  const value = [];

  const seenIds = new Set();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemErrors = [];
    const validatedItem = {};

    // Validate required fields
    if (!item.i || typeof item.i !== 'string') {
      itemErrors.push(`items[${idx}].i must be a string`);
    } else {
      if (seenIds.has(item.i)) {
        itemErrors.push(`items[${idx}].i "${item.i}" is duplicate`);
      } else {
        seenIds.add(item.i);
        validatedItem.i = item.i;
      }
    }

    // Validate widget type (defaults to 'chart' for backward compatibility)
    const widgetType = item.type || 'chart';
    if (!['chart', 'flow'].includes(widgetType)) {
      itemErrors.push(`items[${idx}].type must be 'chart' or 'flow'`);
    } else {
      validatedItem.type = widgetType;
    }

    // Validate chart_id or flow_id based on type
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (widgetType === 'chart') {
      if (!item.chart_id || typeof item.chart_id !== 'string') {
        itemErrors.push(`items[${idx}].chart_id must be a string for chart widgets`);
      } else if (!uuidRegex.test(item.chart_id)) {
        itemErrors.push(`items[${idx}].chart_id must be a valid UUID`);
      } else {
        validatedItem.chart_id = item.chart_id;
      }
    } else if (widgetType === 'flow') {
      if (!item.flow_id || typeof item.flow_id !== 'string') {
        itemErrors.push(`items[${idx}].flow_id must be a string for flow widgets`);
      } else if (!uuidRegex.test(item.flow_id)) {
        itemErrors.push(`items[${idx}].flow_id must be a valid UUID`);
      } else {
        validatedItem.flow_id = item.flow_id;
      }
    }

    // Validate position and size
    const xNum = Number(item.x);
    if (!Number.isInteger(xNum) || xNum < 0) {
      itemErrors.push(`items[${idx}].x must be a non-negative integer`);
    } else {
      validatedItem.x = xNum;
    }

    const yNum = Number(item.y);
    if (!Number.isInteger(yNum) || yNum < 0) {
      itemErrors.push(`items[${idx}].y must be a non-negative integer`);
    } else {
      validatedItem.y = yNum;
    }

    const wNum = Number(item.w);
    if (!Number.isInteger(wNum)) {
      itemErrors.push(`items[${idx}].w must be an integer`);
    } else if (wNum < DASHBOARD_LIMITS.MIN_WIDGET_WIDTH || wNum > DASHBOARD_LIMITS.MAX_WIDGET_WIDTH) {
      itemErrors.push(`items[${idx}].w must be between ${DASHBOARD_LIMITS.MIN_WIDGET_WIDTH} and ${DASHBOARD_LIMITS.MAX_WIDGET_WIDTH}`);
    } else {
      validatedItem.w = wNum;
    }

    const hNum = Number(item.h);
    if (!Number.isInteger(hNum)) {
      itemErrors.push(`items[${idx}].h must be an integer`);
    } else if (hNum < DASHBOARD_LIMITS.MIN_WIDGET_HEIGHT || hNum > DASHBOARD_LIMITS.MAX_WIDGET_HEIGHT) {
      itemErrors.push(`items[${idx}].h must be between ${DASHBOARD_LIMITS.MIN_WIDGET_HEIGHT} and ${DASHBOARD_LIMITS.MAX_WIDGET_HEIGHT}`);
    } else {
      validatedItem.h = hNum;
    }

    // Validate optional constraint fields
    if (item.minW !== undefined) {
      const minW = Number(item.minW);
      if (Number.isInteger(minW) && minW > 0) {
        validatedItem.minW = minW;
      } else {
        warnings.push(`items[${idx}].minW should be a positive integer, ignoring`);
      }
    }

    if (item.minH !== undefined) {
      const minH = Number(item.minH);
      if (Number.isInteger(minH) && minH > 0) {
        validatedItem.minH = minH;
      } else {
        warnings.push(`items[${idx}].minH should be a positive integer, ignoring`);
      }
    }

    if (item.maxW !== undefined) {
      const maxW = Number(item.maxW);
      if (Number.isInteger(maxW) && maxW > 0) {
        validatedItem.maxW = maxW;
      } else {
        warnings.push(`items[${idx}].maxW should be a positive integer, ignoring`);
      }
    }

    if (item.maxH !== undefined) {
      const maxH = Number(item.maxH);
      if (Number.isInteger(maxH) && maxH > 0) {
        validatedItem.maxH = maxH;
      } else {
        warnings.push(`items[${idx}].maxH should be a positive integer, ignoring`);
      }
    }

    if (item.static !== undefined) {
      validatedItem.static = Boolean(item.static);
    }

    if (item.time_sync_group !== undefined && typeof item.time_sync_group === 'string') {
      validatedItem.time_sync_group = item.time_sync_group;
    }

    // Optional widget configuration object (for flow widgets)
    if (item.config !== undefined) {
      if (typeof item.config === 'object' && item.config !== null) {
        validatedItem.config = item.config;
      } else {
        warnings.push(`items[${idx}].config should be an object, ignoring`);
      }
    }

    // Optional title override
    if (item.title_override !== undefined) {
      if (typeof item.title_override === 'string') {
        validatedItem.title_override = item.title_override.trim();
      } else {
        warnings.push(`items[${idx}].title_override should be a string, ignoring`);
      }
    }

    // Optional hide_title flag
    if (item.hide_title !== undefined) {
      validatedItem.hide_title = Boolean(item.hide_title);
    }

    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
    } else {
      value.push(validatedItem);
    }
  }

  return { errors, warnings, value };
}

/**
 * Get the dashboard schema version
 * @returns {number} Schema version
 */
export function getSchemaVersion() {
  return DASHBOARD_SCHEMA_VERSION;
}
