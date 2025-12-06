/**
 * Chart Configuration Validator
 * 
 * Provides comprehensive validation for chart configurations using ChartConfigSchema.
 * Similar to flow node validation, ensures data integrity and schema compliance.
 */

import { 
  ChartConfigSchema, 
  ChartOptionsSchema, 
  CHART_SCHEMA_VERSION,
  CHART_LIMITS,
  TIME_MODES,
  LEGEND_POSITIONS,
  AXIS_ORIENTATIONS,
  INTERPOLATION_TYPES,
  STROKE_TYPES
} from '../schemas/ChartConfigSchema.js';

/**
 * Validate a complete chart configuration
 * 
 * @param {Object} config - Chart configuration to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.partial - Allow partial updates (for PATCH operations)
 * @param {boolean} options.strict - Enable strict validation (warnings become errors)
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[], value: Object }
 */
export function validateChartConfig(config, { partial = false, strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const value = {};
  
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['config must be an object'], warnings: [], value: null };
  }
  
  // Validate root-level properties
  const rootProps = ChartConfigSchema.properties;
  
  // Name validation
  if ('name' in config || !partial) {
    const nameError = rootProps.name.validate(config.name);
    if (nameError) {
      errors.push(nameError);
    } else {
      value.name = String(config.name).trim();
    }
  }
  
  // Time range validation
  for (const key of ['time_from', 'time_to']) {
    if (key in config) {
      const v = config[key];
      if (v === null || v === '' || v === undefined) {
        value[key] = null;
      } else {
        const error = rootProps[key].validate(v);
        if (error) {
          errors.push(error);
        } else {
          value[key] = new Date(v).toISOString();
        }
      }
    } else if (!partial) {
      value[key] = null;
    }
  }
  
  // Boolean fields
  const boolFields = ['is_shared', 'is_system_chart', 'live_enabled', 'show_time_badge'];
  for (const field of boolFields) {
    if (field in config) {
      value[field] = !!config[field];
    } else if (!partial) {
      value[field] = rootProps[field].default;
    }
  }
  
  // Time mode validation
  if ('time_mode' in config) {
    const error = rootProps.time_mode.validate(config.time_mode);
    if (error) {
      errors.push(error);
    } else {
      value.time_mode = config.time_mode;
    }
  } else if (!partial) {
    value.time_mode = rootProps.time_mode.default;
  }
  
  // Time duration validation
  if ('time_duration' in config) {
    const error = rootProps.time_duration.validate(config.time_duration);
    if (error) {
      errors.push(error);
    } else {
      value.time_duration = config.time_duration === null ? null : Number(config.time_duration);
    }
  } else if (!partial) {
    value.time_duration = null;
  }
  
  // Time offset validation
  if ('time_offset' in config) {
    const error = rootProps.time_offset.validate(config.time_offset);
    if (error) {
      errors.push(error);
    } else {
      value.time_offset = Number(config.time_offset ?? 0);
    }
  } else if (!partial) {
    value.time_offset = 0;
  }
  
  // Folder ID validation (optional)
  if ('folder_id' in config) {
    if (config.folder_id !== null && config.folder_id !== undefined) {
      const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (!uuidRe.test(config.folder_id)) {
        errors.push('folder_id must be a valid UUID');
      } else {
        value.folder_id = config.folder_id;
      }
    } else {
      value.folder_id = null;
    }
  }
  
  // Options validation (most important part)
  if ('options' in config || !partial) {
    const optsResult = validateChartOptions(config.options ?? {}, { partial, strict });
    errors.push(...optsResult.errors);
    warnings.push(...optsResult.warnings);
    if (optsResult.valid || !strict) {
      value.options = optsResult.value;
    }
  }
  
  return {
    valid: errors.length === 0 && (!strict || warnings.length === 0),
    errors,
    warnings,
    value
  };
}

/**
 * Validate chart options (the JSONB field content)
 * 
 * @param {Object} options - Chart options to validate
 * @param {Object} config - Validation configuration
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[], value: Object }
 */
export function validateChartOptions(options, { partial = false, strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const value = {};
  
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return { 
      valid: false, 
      errors: ['options must be an object'], 
      warnings: [], 
      value: null 
    };
  }
  
  // Check size constraint
  const raw = JSON.stringify(options);
  if (raw.length > CHART_LIMITS.MAX_OPTIONS_SIZE) {
    errors.push(`options too large (max ${CHART_LIMITS.MAX_OPTIONS_SIZE} bytes)`);
  }
  
  // Version validation (required)
  const versionError = ChartOptionsSchema.properties.version.validate(options.version);
  if (versionError) {
    errors.push(versionError);
  } else {
    value.version = 1;
  }
  
  // Tags validation
  if ('tags' in options || !partial) {
    const tagsResult = validateTags(options.tags ?? []);
    errors.push(...tagsResult.errors);
    warnings.push(...tagsResult.warnings);
    value.tags = tagsResult.value;
  }
  
  // Axes validation
  if ('axes' in options || !partial) {
    const axesResult = validateAxes(options.axes ?? []);
    errors.push(...axesResult.errors);
    warnings.push(...axesResult.warnings);
    value.axes = axesResult.value;
  }
  
  // Reference lines validation
  if ('referenceLines' in options) {
    const refResult = validateReferenceLines(options.referenceLines);
    errors.push(...refResult.errors);
    warnings.push(...refResult.warnings);
    value.referenceLines = refResult.value;
  } else if (!partial) {
    value.referenceLines = [];
  }
  
  // Critical ranges validation
  if ('criticalRanges' in options) {
    const rangeResult = validateCriticalRanges(options.criticalRanges);
    errors.push(...rangeResult.errors);
    warnings.push(...rangeResult.warnings);
    value.criticalRanges = rangeResult.value;
  } else if (!partial) {
    value.criticalRanges = [];
  }
  
  // Derived series validation
  if ('derived' in options) {
    const derivedResult = validateDerivedSeries(options.derived);
    errors.push(...derivedResult.errors);
    warnings.push(...derivedResult.warnings);
    value.derived = derivedResult.value;
  } else if (!partial) {
    value.derived = [];
  }
  
  // Grid validation
  if ('grid' in options || !partial) {
    const gridResult = validateGrid(options.grid);
    errors.push(...gridResult.errors);
    value.grid = gridResult.value;
  }
  
  // Background validation
  if ('background' in options || !partial) {
    const bgResult = validateBackground(options.background);
    errors.push(...bgResult.errors);
    value.background = bgResult.value;
  }
  
  // Display validation
  if ('display' in options || !partial) {
    const displayResult = validateDisplay(options.display);
    errors.push(...displayResult.errors);
    value.display = displayResult.value;
  }
  
  // Interpolation validation
  if ('interpolation' in options) {
    if (!INTERPOLATION_TYPES.includes(options.interpolation)) {
      warnings.push(`Invalid interpolation type: ${options.interpolation}`);
    } else {
      value.interpolation = options.interpolation;
    }
  } else if (!partial) {
    value.interpolation = 'linear';
  }
  
  // X-axis tick count validation
  if ('xAxisTickCount' in options) {
    const count = Number(options.xAxisTickCount);
    if (!Number.isInteger(count) || count < 2 || count > 20) {
      warnings.push('xAxisTickCount must be between 2 and 20');
    } else {
      value.xAxisTickCount = count;
    }
  } else if (!partial) {
    value.xAxisTickCount = 5;
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value
  };
}

/**
 * Validate tags array
 */
function validateTags(tags) {
  const errors = [];
  const warnings = [];
  const value = [];
  
  if (!Array.isArray(tags)) {
    return { errors: ['tags must be an array'], warnings: [], value: [] };
  }
  
  if (tags.length > CHART_LIMITS.MAX_TAGS) {
    errors.push(`too many tags (max ${CHART_LIMITS.MAX_TAGS})`);
  }
  
  const tagSpec = ChartOptionsSchema.properties.tags.items.properties;
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  
  tags.forEach((tag, idx) => {
    if (!tag || typeof tag !== 'object') {
      errors.push(`tag[${idx}] must be an object`);
      return;
    }
    
    const validTag = {};
    
    // connection_id (UUID string)
    if (!(('connection_id' in tag) && typeof tag.connection_id === 'string' && tag.connection_id.trim())) {
      errors.push(`tag[${idx}].connection_id is required and must be a non-empty string (UUID)`);
    } else {
      validTag.connection_id = tag.connection_id;
    }
    
    // tag_id (integer)
    if (!('tag_id' in tag) || !Number.isInteger(Number(tag.tag_id))) {
      errors.push(`tag[${idx}].tag_id is required and must be an integer`);
    } else {
      validTag.tag_id = Number(tag.tag_id);
    }
    
    // Required string fields
    for (const field of ['tag_path', 'tag_name', 'data_type', 'yAxisId']) {
      if (!(field in tag) || typeof tag[field] !== 'string' || !tag[field].trim()) {
        errors.push(`tag[${idx}].${field} is required and must be a non-empty string`);
      } else {
        validTag[field] = tag[field];
      }
    }
    
    // Color validation
    if (!tag.color || !hexPattern.test(tag.color)) {
      errors.push(`tag[${idx}].color must be a valid hex color (e.g., #FF0000)`);
    } else {
      validTag.color = tag.color;
    }
    
    // Optional fields
    if ('alias' in tag) {
      if (typeof tag.alias === 'string' && tag.alias.length <= CHART_LIMITS.MAX_ALIAS_LENGTH) {
        validTag.alias = tag.alias;
      } else {
        warnings.push(`tag[${idx}].alias too long (max ${CHART_LIMITS.MAX_ALIAS_LENGTH})`);
      }
    }
    
    if ('thickness' in tag) {
      const t = Number(tag.thickness);
      if (t >= 0.5 && t <= 10) {
        validTag.thickness = t;
      } else {
        validTag.thickness = 2;
        warnings.push(`tag[${idx}].thickness out of range, using default`);
      }
    } else {
      validTag.thickness = 2;
    }
    
    if ('strokeType' in tag) {
      if (STROKE_TYPES.includes(tag.strokeType)) {
        validTag.strokeType = tag.strokeType;
      } else {
        validTag.strokeType = 'solid';
        warnings.push(`tag[${idx}].strokeType invalid, using solid`);
      }
    } else {
      validTag.strokeType = 'solid';
    }
    
    if ('interpolation' in tag) {
      if (INTERPOLATION_TYPES.includes(tag.interpolation)) {
        validTag.interpolation = tag.interpolation;
      } else {
        validTag.interpolation = 'linear';
        warnings.push(`tag[${idx}].interpolation invalid, using linear`);
      }
    } else {
      validTag.interpolation = 'linear';
    }
    
    if ('hidden' in tag) {
      validTag.hidden = !!tag.hidden;
    } else {
      validTag.hidden = false;
    }
    
    value.push(validTag);
  });
  
  return { errors, warnings, value };
}

/**
 * Validate axes array
 */
function validateAxes(axes) {
  const errors = [];
  const warnings = [];
  const value = [];
  
  if (!Array.isArray(axes)) {
    return { errors: ['axes must be an array'], warnings: [], value: [] };
  }
  
  if (axes.length === 0) {
    // Provide default axis if none specified
    return { 
      errors: [], 
      warnings: [], 
      value: [{ id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }] 
    };
  }
  
  if (axes.length > CHART_LIMITS.MAX_AXES) {
    errors.push(`too many axes (max ${CHART_LIMITS.MAX_AXES})`);
  }
  
  const axisIds = new Set();
  
  axes.forEach((axis, idx) => {
    if (!axis || typeof axis !== 'object') {
      errors.push(`axis[${idx}] must be an object`);
      return;
    }
    
    const validAxis = {};
    
    // ID validation (required, unique)
    if (!axis.id || typeof axis.id !== 'string') {
      errors.push(`axis[${idx}].id is required`);
    } else if (axisIds.has(axis.id)) {
      errors.push(`duplicate axis id: ${axis.id}`);
    } else {
      validAxis.id = axis.id;
      axisIds.add(axis.id);
    }
    
    // Label validation
    if (!axis.label || typeof axis.label !== 'string') {
      errors.push(`axis[${idx}].label is required`);
    } else if (axis.label.length > CHART_LIMITS.MAX_LABEL_LENGTH) {
      warnings.push(`axis[${idx}].label too long, truncating`);
      validAxis.label = axis.label.substring(0, CHART_LIMITS.MAX_LABEL_LENGTH);
    } else {
      validAxis.label = axis.label;
    }
    
    // Orientation validation
    if (!AXIS_ORIENTATIONS.includes(axis.orientation)) {
      errors.push(`axis[${idx}].orientation must be 'left' or 'right'`);
    } else {
      validAxis.orientation = axis.orientation;
    }
    
    // Domain validation
    if (!Array.isArray(axis.domain) || axis.domain.length !== 2) {
      errors.push(`axis[${idx}].domain must be an array of 2 elements`);
    } else {
      validAxis.domain = axis.domain.map(v => 
        (v === 'auto' || typeof v === 'string') ? v : Number(v)
      );
    }
    
    // Optional numeric fields
    if ('offset' in axis) {
      validAxis.offset = Number(axis.offset) || 0;
    }
    if ('nameOffset' in axis) {
      validAxis.nameOffset = Number(axis.nameOffset) || 0;
    }
    if ('namePosition' in axis && ['start', 'middle', 'end'].includes(axis.namePosition)) {
      validAxis.namePosition = axis.namePosition;
    }
    
    value.push(validAxis);
  });
  
  return { errors, warnings, value };
}

/**
 * Validate reference lines array
 */
function validateReferenceLines(lines) {
  const errors = [];
  const warnings = [];
  const value = [];
  
  if (!Array.isArray(lines)) {
    return { errors: ['referenceLines must be an array'], warnings: [], value: [] };
  }
  
  if (lines.length > CHART_LIMITS.MAX_REFERENCE_LINES) {
    errors.push(`too many reference lines (max ${CHART_LIMITS.MAX_REFERENCE_LINES})`);
  }
  
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  
  lines.forEach((line, idx) => {
    if (!line || typeof line !== 'object') {
      errors.push(`referenceLine[${idx}] must be an object`);
      return;
    }
    
    const validLine = {};
    
    if (!line.id || typeof line.id !== 'string') {
      errors.push(`referenceLine[${idx}].id is required`);
    } else {
      validLine.id = line.id;
    }
    
    if (typeof line.value !== 'number') {
      errors.push(`referenceLine[${idx}].value must be a number`);
    } else {
      validLine.value = line.value;
    }
    
    if (!line.color || !hexPattern.test(line.color)) {
      errors.push(`referenceLine[${idx}].color must be a valid hex color`);
    } else {
      validLine.color = line.color;
    }
    
    if (!line.yAxisId) {
      errors.push(`referenceLine[${idx}].yAxisId is required`);
    } else {
      validLine.yAxisId = line.yAxisId;
    }
    
    if ('label' in line && typeof line.label === 'string') {
      validLine.label = line.label.substring(0, CHART_LIMITS.MAX_LABEL_LENGTH);
    }
    
    validLine.lineWidth = (typeof line.lineWidth === 'number' && line.lineWidth >= 0.5 && line.lineWidth <= 10) 
      ? line.lineWidth : 2;
    validLine.lineStyle = (typeof line.lineStyle === 'string') ? line.lineStyle : '0';
    
    value.push(validLine);
  });
  
  return { errors, warnings, value };
}

/**
 * Validate critical ranges array
 */
function validateCriticalRanges(ranges) {
  const errors = [];
  const warnings = [];
  const value = [];
  
  if (!Array.isArray(ranges)) {
    return { errors: ['criticalRanges must be an array'], warnings: [], value: [] };
  }
  
  if (ranges.length > CHART_LIMITS.MAX_CRITICAL_RANGES) {
    errors.push(`too many critical ranges (max ${CHART_LIMITS.MAX_CRITICAL_RANGES})`);
  }
  
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  
  ranges.forEach((range, idx) => {
    if (!range || typeof range !== 'object') {
      errors.push(`criticalRange[${idx}] must be an object`);
      return;
    }
    
    const validRange = {};
    
    if (!range.id) {
      errors.push(`criticalRange[${idx}].id is required`);
    } else {
      validRange.id = range.id;
    }
    
    if (typeof range.yMin !== 'number' || typeof range.yMax !== 'number') {
      errors.push(`criticalRange[${idx}] must have numeric yMin and yMax`);
    } else {
      validRange.yMin = range.yMin;
      validRange.yMax = range.yMax;
    }
    
    if (!range.color || !hexPattern.test(range.color)) {
      errors.push(`criticalRange[${idx}].color must be a valid hex color`);
    } else {
      validRange.color = range.color;
    }
    
    if (!range.yAxisId) {
      errors.push(`criticalRange[${idx}].yAxisId is required`);
    } else {
      validRange.yAxisId = range.yAxisId;
    }
    
    validRange.opacity = (typeof range.opacity === 'number' && range.opacity >= 0 && range.opacity <= 1)
      ? range.opacity : 0.2;
    
    if ('label' in range && typeof range.label === 'string') {
      validRange.label = range.label.substring(0, CHART_LIMITS.MAX_LABEL_LENGTH);
    }
    
    value.push(validRange);
  });
  
  return { errors, warnings, value };
}

/**
 * Validate derived series array
 */
function validateDerivedSeries(derived) {
  const errors = [];
  const warnings = [];
  const value = [];
  
  if (!Array.isArray(derived)) {
    return { errors: ['derived must be an array'], warnings: [], value: [] };
  }
  
  if (derived.length > CHART_LIMITS.MAX_DERIVED_SERIES) {
    errors.push(`too many derived series (max ${CHART_LIMITS.MAX_DERIVED_SERIES})`);
  }
  
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  
  derived.forEach((series, idx) => {
    if (!series || typeof series !== 'object') {
      errors.push(`derived[${idx}] must be an object`);
      return;
    }
    
    const validSeries = {};
    
    for (const field of ['id', 'name', 'expression', 'yAxisId']) {
      if (!series[field] || typeof series[field] !== 'string') {
        errors.push(`derived[${idx}].${field} is required`);
      } else {
        validSeries[field] = series[field];
      }
    }
    
    if (!series.color || !hexPattern.test(series.color)) {
      errors.push(`derived[${idx}].color must be a valid hex color`);
    } else {
      validSeries.color = series.color;
    }
    
    value.push(validSeries);
  });
  
  return { errors, warnings, value };
}

/**
 * Validate grid configuration
 */
function validateGrid(grid) {
  const errors = [];
  const defaultGrid = { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' };
  
  if (!grid || typeof grid !== 'object') {
    return { errors: [], warnings: [], value: defaultGrid };
  }
  
  const value = { ...defaultGrid };
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  
  if ('color' in grid && hexPattern.test(grid.color)) {
    value.color = grid.color;
  }
  
  if ('opacity' in grid) {
    const o = Number(grid.opacity);
    if (o >= 0 && o <= 1) {
      value.opacity = o;
    }
  }
  
  if ('thickness' in grid) {
    const t = Number(grid.thickness);
    if (t >= 0.5 && t <= 5) {
      value.thickness = t;
    }
  }
  
  if ('dash' in grid && typeof grid.dash === 'string') {
    value.dash = grid.dash;
  }
  
  return { errors, warnings: [], value };
}

/**
 * Validate background configuration
 */
function validateBackground(bg) {
  const errors = [];
  const defaultBg = { color: '#000000', opacity: 1 };
  
  if (!bg || typeof bg !== 'object') {
    return { errors: [], warnings: [], value: defaultBg };
  }
  
  const value = { ...defaultBg };
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  
  if ('color' in bg && hexPattern.test(bg.color)) {
    value.color = bg.color;
  }
  
  if ('opacity' in bg) {
    const o = Number(bg.opacity);
    if (o >= 0 && o <= 1) {
      value.opacity = o;
    }
  }
  
  return { errors, warnings: [], value };
}

/**
 * Validate display configuration
 */
function validateDisplay(display) {
  const errors = [];
  const warnings = [];
  const defaultDisplay = { 
    showLegend: true, 
    showTooltip: true, 
    legendPosition: 'bottom',
    crosshairEnabled: true,
    crosshairOpacity: 0.7,
    crosshairPattern: '0'
  };
  
  if (!display || typeof display !== 'object') {
    return { errors: [], warnings: [], value: defaultDisplay };
  }
  
  const value = { ...defaultDisplay };
  
  if ('showLegend' in display) {
    value.showLegend = !!display.showLegend;
  }
  
  if ('showTooltip' in display) {
    value.showTooltip = !!display.showTooltip;
  }
  
  if ('legendPosition' in display) {
    if (LEGEND_POSITIONS.includes(display.legendPosition)) {
      value.legendPosition = display.legendPosition;
    } else {
      warnings.push(`Invalid legendPosition: ${display.legendPosition}`);
    }
  }
  
  if ('crosshairEnabled' in display) {
    value.crosshairEnabled = !!display.crosshairEnabled;
  }
  
  if ('crosshairOpacity' in display) {
    const o = Number(display.crosshairOpacity);
    if (o >= 0 && o <= 1) {
      value.crosshairOpacity = o;
    }
  }
  
  if ('crosshairPattern' in display && typeof display.crosshairPattern === 'string') {
    value.crosshairPattern = display.crosshairPattern;
  }
  
  return { errors, warnings, value };
}

/**
 * Get option counts for logging/auditing
 */
export function getOptionCounts(options) {
  try {
    const o = options || {};
    return {
      tag_count: Array.isArray(o.tags) ? o.tags.length : 0,
      axis_count: Array.isArray(o.axes) ? o.axes.length : 0,
      reference_line_count: Array.isArray(o.referenceLines) ? o.referenceLines.length : 0,
      critical_range_count: Array.isArray(o.criticalRanges) ? o.criticalRanges.length : 0,
      derived_series_count: Array.isArray(o.derived) ? o.derived.length : 0
    };
  } catch {
    return { 
      tag_count: 0, 
      axis_count: 0,
      reference_line_count: 0, 
      critical_range_count: 0, 
      derived_series_count: 0 
    };
  }
}

/**
 * Migrate chart options from old version to current version
 * (Future-proofing for schema version upgrades)
 */
export function migrateChartOptions(options, fromVersion = null) {
  if (!options || typeof options !== 'object') {
    return options;
  }
  
  const currentVersion = options.version || fromVersion || 1;
  
  // Currently only version 1 exists, so no migration needed
  // When version 2 is introduced, add migration logic here
  if (currentVersion === 1) {
    return options;
  }
  
  // Unknown version - return as-is and let validation handle it
  return options;
}
