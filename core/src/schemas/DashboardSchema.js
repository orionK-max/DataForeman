/**
 * Dashboard Configuration Schema
 * 
 * Defines the structure and validation rules for dashboard configurations.
 * Dashboards contain multiple chart widgets arranged in a responsive grid layout.
 */

// Dashboard schema version
export const DASHBOARD_SCHEMA_VERSION = 1;

// Dashboard limits
export const DASHBOARD_LIMITS = {
  MAX_NAME_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_WIDGETS: 50,
  MIN_GRID_COLS: 1,
  MAX_GRID_COLS: 24,
  MIN_ROW_HEIGHT: 10,
  MAX_ROW_HEIGHT: 500,
  MIN_WIDGET_WIDTH: 1,
  MAX_WIDGET_WIDTH: 24,
  MIN_WIDGET_HEIGHT: 1,
  MAX_WIDGET_HEIGHT: 100,
};

/**
 * Dashboard Configuration Schema
 * 
 * Root properties:
 * - name: Dashboard display name
 * - description: Optional description
 * - is_shared: Whether dashboard is shared with other users
 * - layout: Grid layout configuration with widgets
 */
export const DashboardConfigSchema = {
  version: DASHBOARD_SCHEMA_VERSION,
  type: 'object',
  properties: {
    name: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: DASHBOARD_LIMITS.MAX_NAME_LENGTH,
      description: 'Dashboard display name',
      validate: (value) => {
        if (value === undefined || value === null || value === '') {
          return 'name is required';
        }
        const str = String(value).trim();
        if (!str) return 'name is required';
        if (str.length > DASHBOARD_LIMITS.MAX_NAME_LENGTH) {
          return `name must be <= ${DASHBOARD_LIMITS.MAX_NAME_LENGTH} characters`;
        }
        return null;
      }
    },
    description: {
      type: 'string',
      required: false,
      maxLength: DASHBOARD_LIMITS.MAX_DESCRIPTION_LENGTH,
      description: 'Optional dashboard description',
      default: null,
      validate: (value) => {
        if (value === null || value === undefined || value === '') return null;
        const str = String(value).trim();
        if (str.length > DASHBOARD_LIMITS.MAX_DESCRIPTION_LENGTH) {
          return `description must be <= ${DASHBOARD_LIMITS.MAX_DESCRIPTION_LENGTH} characters`;
        }
        return null;
      }
    },
    is_shared: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Whether dashboard is shared with other users',
      validate: (value) => null // Boolean coercion in validator
    },
    layout: {
      type: 'object',
      required: true,
      description: 'Grid layout configuration',
      properties: {
        items: {
          type: 'array',
          required: true,
          default: [],
          maxItems: DASHBOARD_LIMITS.MAX_WIDGETS,
          description: 'Array of widget configurations',
          items: {
            type: 'object',
            properties: {
              i: {
                type: 'string',
                required: true,
                description: 'Unique widget identifier'
              },
              chart_id: {
                type: 'string',
                required: true,
                description: 'Chart ID to display in this widget (UUID)'
              },
              x: {
                type: 'number',
                required: true,
                description: 'Grid column position (0-based)'
              },
              y: {
                type: 'number',
                required: true,
                description: 'Grid row position (0-based)'
              },
              w: {
                type: 'number',
                required: true,
                min: DASHBOARD_LIMITS.MIN_WIDGET_WIDTH,
                max: DASHBOARD_LIMITS.MAX_WIDGET_WIDTH,
                description: 'Widget width in grid columns'
              },
              h: {
                type: 'number',
                required: true,
                min: DASHBOARD_LIMITS.MIN_WIDGET_HEIGHT,
                max: DASHBOARD_LIMITS.MAX_WIDGET_HEIGHT,
                description: 'Widget height in grid rows'
              },
              minW: {
                type: 'number',
                required: false,
                description: 'Minimum width constraint'
              },
              minH: {
                type: 'number',
                required: false,
                description: 'Minimum height constraint'
              },
              maxW: {
                type: 'number',
                required: false,
                description: 'Maximum width constraint'
              },
              maxH: {
                type: 'number',
                required: false,
                description: 'Maximum height constraint'
              },
              static: {
                type: 'boolean',
                required: false,
                default: false,
                description: 'Whether widget is static (non-draggable/resizable)'
              },
              time_sync_group: {
                type: 'string',
                required: false,
                description: 'Time synchronization group ID'
              }
            }
          }
        },
        grid_cols: {
          type: 'integer',
          required: false,
          default: 12,
          min: DASHBOARD_LIMITS.MIN_GRID_COLS,
          max: DASHBOARD_LIMITS.MAX_GRID_COLS,
          description: 'Number of grid columns'
        },
        row_height: {
          type: 'integer',
          required: false,
          default: 100,
          min: DASHBOARD_LIMITS.MIN_ROW_HEIGHT,
          max: DASHBOARD_LIMITS.MAX_ROW_HEIGHT,
          description: 'Height of each grid row in pixels'
        },
        breakpoints: {
          type: 'object',
          required: false,
          description: 'Responsive breakpoints configuration'
        },
        cols: {
          type: 'object',
          required: false,
          description: 'Column counts for different breakpoints'
        }
      }
    }
  }
};

/**
 * Get the complete dashboard schema for API responses
 * @returns {Object} Complete schema structure
 */
export function getDashboardSchema() {
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    limits: DASHBOARD_LIMITS,
    schema: DashboardConfigSchema
  };
}
