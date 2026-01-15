/**
 * Flow Node Schema
 * 
 * Defines the standardized schema for Flow Studio node descriptions.
 * All flow nodes must conform to this schema specification.
 * 
 * Schema Version: 1
 * See: docs/flow-node-schema.md for full specification
 */

export const FLOW_NODE_SCHEMA_VERSION = 1;

/**
 * Valid categories for flow nodes
 */
export const FLOW_NODE_CATEGORIES = [
  'TAG_OPERATIONS',
  'LOGIC_MATH',
  'FILE_OPERATIONS',
  'TRIGGERS',
  'DATA_TRANSFORM',
  'COMMUNICATION',
  'CONTROL',
  'UTILITY',
  'OTHER'
];

/**
 * Valid sections for flow nodes
 */
export const FLOW_NODE_SECTIONS = [
  'BASIC',
  'ADVANCED',
  'DEPRECATED'
];

/**
 * Valid input/output types
 * Includes both flow connection types (main, trigger) and data types
 */
export const FLOW_NODE_IO_TYPES = [
  'main',
  'trigger',
  'number',
  'string',
  'boolean',
  'object',
  'array'
];

/**
 * Valid property types
 */
export const FLOW_NODE_PROPERTY_TYPES = [
  'string',
  'number',
  'boolean',
  'options',
  'tag',
  'code',
  'collection',
  'select',
  'multiSelect',
  'fileUpload',
  'json',
  'formula'
];

/**
 * Flow Node Schema Definition
 * 
 * This schema defines the structure of a flow node description object.
 */
export const FlowNodeSchema = {
  // ============================================
  // METADATA (Required)
  // ============================================
  
  schemaVersion: {
    type: 'number',
    required: true,
    default: FLOW_NODE_SCHEMA_VERSION,
    description: 'Schema version for future migrations'
  },

  displayName: {
    type: 'string',
    required: true,
    description: 'Human-readable name shown in UI'
  },

  name: {
    type: 'string',
    required: true,
    pattern: /^[a-z0-9-]+$/,
    description: 'Unique identifier in kebab-case'
  },

  version: {
    type: 'number',
    required: true,
    min: 1,
    description: 'Node version (incremented on breaking changes)'
  },

  description: {
    type: 'string',
    required: false,
    description: 'Brief description of node functionality'
  },

  // ============================================
  // CATEGORIZATION
  // ============================================

  category: {
    type: 'string',
    required: false,
    enum: FLOW_NODE_CATEGORIES,
    default: 'OTHER',
    description: 'Functional category for grouping'
  },

  section: {
    type: 'string',
    required: false,
    enum: FLOW_NODE_SECTIONS,
    default: 'BASIC',
    description: 'Visibility section'
  },

  icon: {
    type: 'string',
    required: false,
    default: '📦',
    description: 'Emoji or icon identifier'
  },

  color: {
    type: 'string',
    required: false,
    pattern: /^#[0-9A-Fa-f]{6}$/,
    default: '#666666',
    description: 'Hex color code for visual representation'
  },

  // ============================================
  // INPUTS/OUTPUTS
  // ============================================

  inputs: {
    type: 'array',
    required: true,
    items: {
      type: {
        type: 'string',
        required: true,
        enum: FLOW_NODE_IO_TYPES,
        description: 'Connection type'
      },
      displayName: {
        type: 'string',
        required: false,
        description: 'Label for this input'
      },
      required: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Whether this input is required'
      },
      maxConnections: {
        type: 'number',
        required: false,
        default: 1,
        description: 'Maximum number of connections (1 or Infinity)'
      }
    },
    description: 'Array of input connection points'
  },

  outputs: {
    type: 'array',
    required: true,
    items: {
      type: {
        type: 'string',
        required: true,
        enum: FLOW_NODE_IO_TYPES,
        description: 'Connection type'
      },
      displayName: {
        type: 'string',
        required: false,
        description: 'Label for this output'
      }
    },
    description: 'Array of output connection points'
  },

  // ============================================
  // PROPERTIES (Configuration)
  // ============================================

  properties: {
    type: 'array',
    required: false,
    default: [],
    items: {
      displayName: {
        type: 'string',
        required: true,
        description: 'Label shown in properties panel'
      },
      name: {
        type: 'string',
        required: true,
        pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        description: 'Property key in configuration object'
      },
      type: {
        type: 'string',
        required: true,
        enum: FLOW_NODE_PROPERTY_TYPES,
        description: 'Property type'
      },
      required: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Whether property must have a value'
      },
      default: {
        type: 'any',
        required: false,
        description: 'Default value if not specified'
      },
      description: {
        type: 'string',
        required: false,
        description: 'Help text for this property'
      },
      placeholder: {
        type: 'string',
        required: false,
        description: 'Placeholder text for input fields'
      },
      options: {
        type: 'array',
        required: false,
        description: 'Options for select/multiSelect types'
      },
      displayOptions: {
        type: 'object',
        required: false,
        description: 'Conditional visibility rules'
      }
    },
    description: 'Configuration properties'
  },

  // ============================================
  // VISUAL DEFINITION
  // ============================================

  visual: {
    type: 'object',
    required: false,
    description: 'Visual presentation configuration (validated separately)',
    properties: {
      canvas: {
        type: 'object',
        description: 'Canvas rendering settings'
      },
      layout: {
        type: 'array',
        description: 'Layout components for node appearance'
      },
      handles: {
        type: 'object',
        description: 'Input/output handle positioning'
      },
      status: {
        type: 'object',
        description: 'Status indicator configuration'
      },
      runtime: {
        type: 'object',
        description: 'Runtime display settings'
      }
    }
  },

  // ============================================
  // EXTENSIONS
  // ============================================

  extensions: {
    type: 'object',
    required: false,
    default: {},
    description: 'Custom extensions for future features'
  },

  // ============================================
  // INTERNAL (Optional)
  // ============================================

  inputConfiguration: {
    type: 'object',
    required: false,
    description: 'Internal input processing configuration (legacy, prefer ioRules)'
  },

  ioRules: {
    type: 'array',
    required: false,
    description: 'Parameter-driven dynamic I/O configuration rules',
    items: {
      type: 'object',
      properties: {
        when: {
          type: 'object',
          description: 'Condition for rule to apply (parameter name -> value or array of values)'
        },
        inputs: {
          type: 'object',
          description: 'Input configuration for this rule',
          properties: {
            count: { type: 'number', description: 'Fixed input count (implies min=max=count)' },
            min: { type: 'number', description: 'Minimum inputs' },
            max: { type: 'number', description: 'Maximum inputs' },
            default: { type: 'number', description: 'Default/initial input count' },
            canAdd: { type: 'boolean', description: 'Can user add inputs?' },
            canRemove: { type: 'boolean', description: 'Can user remove inputs?' },
            type: { type: 'string', description: 'Type for all inputs (homogeneous mode)' },
            typeFixed: { type: 'boolean', description: 'Is input type fixed?' },
            required: { type: 'boolean', description: 'Are inputs required?' },
            definitions: {
              type: 'array',
              description: 'Explicit list of inputs with different types (heterogeneous mode)',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', required: true },
                  displayName: { type: 'string' },
                  typeFixed: { type: 'boolean' },
                  required: { type: 'boolean' },
                  description: { type: 'string' }
                }
              }
            },
            dynamic: {
              type: 'object',
              description: 'Dynamic inputs configuration (for hybrid mode with definitions)',
              properties: {
                min: { type: 'number' },
                max: { type: 'number' },
                default: { type: 'number' },
                type: { type: 'string' },
                typeFixed: { type: 'boolean' },
                canAdd: { type: 'boolean' },
                canRemove: { type: 'boolean' },
                template: {
                  type: 'object',
                  properties: {
                    displayName: { type: 'string', description: 'Template with {n} placeholder' }
                  }
                }
              }
            }
          }
        },
        outputs: {
          type: 'object',
          description: 'Output configuration for this rule',
          properties: {
            count: { type: 'number', description: 'Fixed output count' },
            min: { type: 'number', description: 'Minimum outputs' },
            max: { type: 'number', description: 'Maximum outputs' },
            default: { type: 'number', description: 'Default/initial output count' },
            canAdd: { type: 'boolean', description: 'Can user add outputs?' },
            canRemove: { type: 'boolean', description: 'Can user remove outputs?' },
            type: { type: 'string', description: 'Type for all outputs' },
            types: {
              type: 'array',
              description: 'Different type per output',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }
};

/**
 * Get the complete flow node schema definition
 * @returns {Object} Schema definition with version info
 */
export function getFlowNodeSchema() {
  return {
    schemaVersion: FLOW_NODE_SCHEMA_VERSION,
    categories: FLOW_NODE_CATEGORIES,
    sections: FLOW_NODE_SECTIONS,
    ioTypes: FLOW_NODE_IO_TYPES,
    propertyTypes: FLOW_NODE_PROPERTY_TYPES,
    schema: FlowNodeSchema
  };
}
