/**
 * Chart Configuration Schema
 * 
 * Defines the versioned schema for chart configurations, similar to Flow Node Schema.
 * This provides a single source of truth for chart configuration structure.
 * 
 * Version: 1.0
 * Schema Version: 1
 */

/**
 * Current schema version
 */
export const CHART_SCHEMA_VERSION = 1;

/**
 * Maximum limits for performance and security
 */
export const CHART_LIMITS = {
  MAX_TAGS: 50,
  MAX_AXES: 10,
  MAX_REFERENCE_LINES: 10,
  MAX_CRITICAL_RANGES: 10,
  MAX_DERIVED_SERIES: 10,
  MAX_NAME_LENGTH: 120,
  MAX_OPTIONS_SIZE: 65536, // bytes
  MAX_ALIAS_LENGTH: 100,
  MAX_LABEL_LENGTH: 100
};

/**
 * Valid time modes
 */
export const TIME_MODES = ['fixed', 'rolling', 'shifted'];

/**
 * Valid legend positions
 */
export const LEGEND_POSITIONS = ['top', 'bottom', 'left', 'right', 'none'];

/**
 * Valid axis orientations
 */
export const AXIS_ORIENTATIONS = ['left', 'right'];

/**
 * Valid interpolation types
 */
export const INTERPOLATION_TYPES = ['linear', 'monotone', 'step', 'stepBefore', 'stepAfter'];

/**
 * Valid stroke types
 */
export const STROKE_TYPES = ['solid', 'dashed', 'dotted'];

/**
 * Chart Configuration Schema Definition
 * 
 * This schema defines the complete structure for chart configurations.
 * All charts must conform to this schema.
 */
export const ChartConfigSchema = {
  // Schema metadata
  schemaVersion: CHART_SCHEMA_VERSION,
  version: '1.0.0',
  description: 'Chart configuration schema for DataForeman',
  
  // Root-level properties (database columns)
  properties: {
    id: {
      type: 'uuid',
      description: 'Unique chart identifier',
      generated: true
    },
    user_id: {
      type: 'uuid',
      description: 'Owner user ID',
      required: true
    },
    name: {
      type: 'string',
      description: 'Chart name',
      required: true,
      minLength: 1,
      maxLength: CHART_LIMITS.MAX_NAME_LENGTH,
      validate: (value) => {
        if (typeof value !== 'string') return 'name must be a string';
        const trimmed = value.trim();
        if (!trimmed) return 'name cannot be empty';
        if (trimmed.length > CHART_LIMITS.MAX_NAME_LENGTH) return `name too long (max ${CHART_LIMITS.MAX_NAME_LENGTH})`;
        return null;
      }
    },
    time_from: {
      type: 'timestamp',
      description: 'Start time for fixed time mode',
      nullable: true,
      validate: (value) => {
        if (value === null || value === undefined) return null;
        const d = new Date(value);
        if (isNaN(d.getTime())) return 'time_from must be valid ISO timestamp';
        return null;
      }
    },
    time_to: {
      type: 'timestamp',
      description: 'End time for fixed time mode',
      nullable: true,
      validate: (value) => {
        if (value === null || value === undefined) return null;
        const d = new Date(value);
        if (isNaN(d.getTime())) return 'time_to must be valid ISO timestamp';
        return null;
      }
    },
    is_shared: {
      type: 'boolean',
      description: 'Whether chart is shared with other users',
      default: false
    },
    is_system_chart: {
      type: 'boolean',
      description: 'Whether this is a system chart (for diagnostics)',
      default: false
    },
    time_mode: {
      type: 'enum',
      description: 'Time range mode',
      values: TIME_MODES,
      default: 'fixed',
      validate: (value) => {
        if (!TIME_MODES.includes(value)) {
          return `time_mode must be one of: ${TIME_MODES.join(', ')}`;
        }
        return null;
      }
    },
    time_duration: {
      type: 'integer',
      description: 'Duration in milliseconds for rolling/shifted mode',
      nullable: true,
      min: 0,
      validate: (value) => {
        if (value === null || value === undefined) return null;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) return 'time_duration must be non-negative integer';
        return null;
      }
    },
    time_offset: {
      type: 'integer',
      description: 'Offset in milliseconds for shifted mode',
      nullable: false,
      min: 0,
      default: 0,
      validate: (value) => {
        const n = Number(value ?? 0);
        if (!Number.isInteger(n) || n < 0) return 'time_offset must be non-negative integer';
        return null;
      }
    },
    live_enabled: {
      type: 'boolean',
      description: 'Enable live data updates',
      default: false
    },
    show_time_badge: {
      type: 'boolean',
      description: 'Show time range badge on chart',
      default: true
    },
    folder_id: {
      type: 'uuid',
      description: 'Folder containing this chart',
      nullable: true
    },
    options: {
      type: 'object',
      description: 'Chart visualization options (tags, axes, styling, etc.)',
      required: true,
      schema: 'ChartOptionsSchema' // See below
    }
  },
  
  // Audit fields (managed automatically)
  audit: {
    created_at: { type: 'timestamp', generated: true },
    updated_at: { type: 'timestamp', generated: true },
    is_deleted: { type: 'boolean', default: false }
  }
};

/**
 * Chart Options Schema
 * 
 * Defines the structure of the 'options' JSONB field.
 * This is where chart-specific configuration lives.
 */
export const ChartOptionsSchema = {
  schemaVersion: CHART_SCHEMA_VERSION,
  
  properties: {
    version: {
      type: 'integer',
      description: 'Options schema version',
      required: true,
      value: 1,
      validate: (value) => {
        if (!Number.isInteger(value) || value !== 1) {
          return 'options.version must be 1';
        }
        return null;
      }
    },
    
    // Tag configurations
    tags: {
      type: 'array',
      description: 'Tags to display on chart',
      maxItems: CHART_LIMITS.MAX_TAGS,
      default: [],
      items: {
        type: 'object',
        properties: {
          connection_id: {
            type: 'string',
            required: true,
            description: 'Connection ID (UUID) for this tag'
          },
          tag_id: {
            type: 'integer',
            required: true,
            description: 'Tag ID'
          },
          tag_path: {
            type: 'string',
            required: true,
            description: 'Tag path (e.g., PLC1.Temperature)'
          },
          tag_name: {
            type: 'string',
            required: true,
            description: 'Tag display name'
          },
          data_type: {
            type: 'string',
            required: true,
            description: 'Tag data type (REAL, INT, etc.)'
          },
          alias: {
            type: 'string',
            required: false,
            maxLength: CHART_LIMITS.MAX_ALIAS_LENGTH,
            description: 'Custom display name for this tag'
          },
          color: {
            type: 'string',
            required: true,
            pattern: /^#[0-9a-fA-F]{6}$/,
            description: 'Line color (hex format)'
          },
          thickness: {
            type: 'number',
            required: false,
            min: 0.5,
            max: 10,
            default: 2,
            description: 'Line thickness'
          },
          strokeType: {
            type: 'enum',
            required: false,
            values: STROKE_TYPES,
            default: 'solid',
            description: 'Line style'
          },
          yAxisId: {
            type: 'string',
            required: true,
            description: 'Y-axis this tag is assigned to'
          },
          interpolation: {
            type: 'enum',
            required: false,
            values: INTERPOLATION_TYPES,
            default: 'linear',
            description: 'Interpolation method'
          },
          hidden: {
            type: 'boolean',
            required: false,
            default: false,
            description: 'Hide this tag on chart'
          }
        }
      }
    },
    
    // Y-Axes configurations
    axes: {
      type: 'array',
      description: 'Y-axes for the chart',
      maxItems: CHART_LIMITS.MAX_AXES,
      minItems: 1,
      default: [{ id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }],
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            required: true,
            description: 'Unique axis identifier'
          },
          label: {
            type: 'string',
            required: true,
            maxLength: CHART_LIMITS.MAX_LABEL_LENGTH,
            description: 'Axis label'
          },
          orientation: {
            type: 'enum',
            required: true,
            values: AXIS_ORIENTATIONS,
            description: 'Axis position'
          },
          domain: {
            type: 'array',
            required: true,
            items: { type: ['string', 'number'] },
            minItems: 2,
            maxItems: 2,
            description: 'Axis range [min, max] or ["auto", "auto"]'
          },
          offset: {
            type: 'number',
            required: false,
            default: 0,
            description: 'Axis offset in pixels'
          },
          namePosition: {
            type: 'enum',
            required: false,
            values: ['start', 'middle', 'end'],
            default: 'middle',
            description: 'Position of axis name'
          },
          nameOffset: {
            type: 'number',
            required: false,
            default: 0,
            description: 'Offset of axis name'
          }
        }
      }
    },
    
    // Reference lines
    referenceLines: {
      type: 'array',
      description: 'Horizontal reference lines',
      maxItems: CHART_LIMITS.MAX_REFERENCE_LINES,
      default: [],
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            required: true,
            description: 'Unique reference line identifier'
          },
          value: {
            type: 'number',
            required: true,
            description: 'Y-axis value for the line'
          },
          label: {
            type: 'string',
            required: false,
            maxLength: CHART_LIMITS.MAX_LABEL_LENGTH,
            description: 'Reference line label'
          },
          color: {
            type: 'string',
            required: true,
            pattern: /^#[0-9a-fA-F]{6}$/,
            description: 'Line color'
          },
          lineWidth: {
            type: 'number',
            required: false,
            min: 0.5,
            max: 10,
            default: 2,
            description: 'Line width'
          },
          lineStyle: {
            type: 'string',
            required: false,
            default: '0',
            description: 'Dash pattern (e.g., "4 4" or "0" for solid)'
          },
          yAxisId: {
            type: 'string',
            required: true,
            description: 'Y-axis this line belongs to'
          }
        }
      }
    },
    
    // Critical ranges (shaded areas)
    criticalRanges: {
      type: 'array',
      description: 'Shaded critical ranges',
      maxItems: CHART_LIMITS.MAX_CRITICAL_RANGES,
      default: [],
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            required: true,
            description: 'Unique range identifier'
          },
          yMin: {
            type: 'number',
            required: true,
            description: 'Minimum Y value'
          },
          yMax: {
            type: 'number',
            required: true,
            description: 'Maximum Y value'
          },
          color: {
            type: 'string',
            required: true,
            pattern: /^#[0-9a-fA-F]{6}$/,
            description: 'Fill color'
          },
          opacity: {
            type: 'number',
            required: false,
            min: 0,
            max: 1,
            default: 0.2,
            description: 'Fill opacity'
          },
          label: {
            type: 'string',
            required: false,
            maxLength: CHART_LIMITS.MAX_LABEL_LENGTH,
            description: 'Range label'
          },
          yAxisId: {
            type: 'string',
            required: true,
            description: 'Y-axis this range belongs to'
          }
        }
      }
    },
    
    // Derived series (calculated from other tags)
    derived: {
      type: 'array',
      description: 'Derived/calculated series',
      maxItems: CHART_LIMITS.MAX_DERIVED_SERIES,
      default: [],
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            required: true,
            description: 'Unique series identifier'
          },
          name: {
            type: 'string',
            required: true,
            description: 'Series name'
          },
          expression: {
            type: 'string',
            required: true,
            description: 'Mathematical expression or function'
          },
          color: {
            type: 'string',
            required: true,
            pattern: /^#[0-9a-fA-F]{6}$/,
            description: 'Line color'
          },
          yAxisId: {
            type: 'string',
            required: true,
            description: 'Y-axis for this series'
          }
        }
      }
    },
    
    // Grid configuration
    grid: {
      type: 'object',
      description: 'Grid line styling',
      default: { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' },
      properties: {
        color: {
          type: 'string',
          required: true,
          pattern: /^#[0-9a-fA-F]{6}$/,
          description: 'Grid line color'
        },
        opacity: {
          type: 'number',
          required: true,
          min: 0,
          max: 1,
          description: 'Grid line opacity'
        },
        thickness: {
          type: 'number',
          required: true,
          min: 0.5,
          max: 5,
          description: 'Grid line thickness'
        },
        dash: {
          type: 'string',
          required: true,
          description: 'Dash pattern (e.g., "4 4" or "solid")'
        }
      }
    },
    
    // Background configuration
    background: {
      type: 'object',
      description: 'Chart background styling',
      default: { color: '#000000', opacity: 1 },
      properties: {
        color: {
          type: 'string',
          required: true,
          pattern: /^#[0-9a-fA-F]{6}$/,
          description: 'Background color'
        },
        opacity: {
          type: 'number',
          required: true,
          min: 0,
          max: 1,
          description: 'Background opacity'
        }
      }
    },
    
    // Display configuration
    display: {
      type: 'object',
      description: 'Chart display options',
      default: { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
      properties: {
        showLegend: {
          type: 'boolean',
          required: false,
          default: true,
          description: 'Show legend'
        },
        showTooltip: {
          type: 'boolean',
          required: false,
          default: true,
          description: 'Show tooltip on hover'
        },
        legendPosition: {
          type: 'enum',
          required: false,
          values: LEGEND_POSITIONS,
          default: 'bottom',
          description: 'Legend position'
        },
        crosshairEnabled: {
          type: 'boolean',
          required: false,
          default: true,
          description: 'Enable crosshair cursor'
        },
        crosshairOpacity: {
          type: 'number',
          required: false,
          min: 0,
          max: 1,
          default: 0.7,
          description: 'Crosshair opacity'
        },
        crosshairPattern: {
          type: 'string',
          required: false,
          default: '0',
          description: 'Crosshair dash pattern'
        }
      }
    },
    
    // Global interpolation (can be overridden per tag)
    interpolation: {
      type: 'enum',
      required: false,
      values: INTERPOLATION_TYPES,
      default: 'linear',
      description: 'Default interpolation for all tags'
    },
    
    // X-axis configuration
    xAxisTickCount: {
      type: 'integer',
      required: false,
      min: 2,
      max: 20,
      default: 5,
      description: 'Number of X-axis tick marks'
    }
  }
};

/**
 * Get the complete chart schema
 */
export function getChartSchema() {
  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    config: ChartConfigSchema,
    options: ChartOptionsSchema,
    limits: CHART_LIMITS
  };
}
