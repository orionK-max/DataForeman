/**
 * Node Type Definitions for Flow Studio
 * 
 * Defines UI-only metadata for node types:
 * - Category/section organization for palette
 * - Visual properties (icons, colors) for display
 * - Descriptions for tooltips
 * 
 * Execution metadata (inputs, outputs, properties, schemas) is fetched from backend
 * via GET /api/flows/node-types to maintain single source of truth.
 */

import { flowsApi } from '../services/api.js';

// Storage for backend-provided node metadata
let backendNodeMetadata = null;

// Category definitions with hierarchical structure
export const NODE_CATEGORIES = {
  TAG_OPERATIONS: {
    key: 'tag-operations',
    displayName: 'Tag Operations',
    icon: '📊',
    description: 'Read and write tag values',
    sections: {
      BASIC: {
        key: 'basic',
        displayName: 'Basic',
        nodes: ['trigger-manual', 'tag-input', 'tag-output']
      },
      ADVANCED: {
        key: 'advanced',
        displayName: 'Advanced',
        nodes: [] // Reserved for future: tag-transform, tag-history, tag-aggregation
      }
    }
  },
  LOGIC_MATH: {
    key: 'logic-math',
    displayName: 'Logic & Math',
    icon: '🔢',
    description: 'Perform calculations and comparisons',
    sections: {
      MATH: {
        key: 'math',
        displayName: 'Math Operations',
        nodes: ['math']
      },
      COMPARISON: {
        key: 'comparison',
        displayName: 'Comparison',
        nodes: ['comparison']
      },
      ADVANCED: {
        key: 'advanced',
        displayName: 'Scripts',
        nodes: ['script-js']
      }
    }
  },
  COMMUNICATION: {
    key: 'communication',
    displayName: 'Communication',
    icon: '📡',
    description: 'External integrations',
    sections: {
      BASIC: {
        key: 'basic',
        displayName: 'Basic',
        nodes: [] // Reserved for future: email, http-request, database-write
      }
    }
  }
};

// UI-only metadata for each node type
export const NODE_METADATA = {
  'trigger-manual': {
    displayName: 'Manual Trigger',
    description: 'Start the flow manually from UI',
    icon: '▶️',
    color: '#4CAF50',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
  },
  'tag-input': {
    displayName: 'Tag Input',
    description: 'Read value from a tag',
    icon: '📥',
    color: '#2196F3',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
  },
  'tag-output': {
    displayName: 'Tag Output',
    description: 'Write value to a tag',
    icon: '📤',
    color: '#FF9800',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
  },
  'math': {
    displayName: 'Math',
    description: 'Perform mathematical operations (add, subtract, multiply, divide, average, min, max, custom formula)',
    icon: '🔢',
    color: '#9C27B0',
    category: 'LOGIC_MATH',
    section: 'MATH',
  },
  'comparison': {
    displayName: 'Comparison',
    description: 'Compare two values using various operators (>, <, >=, <=, ==, !=)',
    icon: '⚖',
    color: '#E91E63',
    category: 'LOGIC_MATH',
    section: 'COMPARISON',
  },
  'script-js': {
    displayName: 'JavaScript',
    description: 'Execute custom JavaScript code',
    icon: '📜',
    color: '#F44336',
    category: 'LOGIC_MATH',
    section: 'ADVANCED',
  }
};

/**
 * Fetch node type metadata from backend
 * @returns {Promise<Object>} Map of node type to backend metadata
 */
export async function fetchBackendNodeMetadata() {
  try {
    const response = await flowsApi.getNodeTypes();
    const metadata = {};
    
    // Convert array to map for easier lookup
    response.nodeTypes.forEach(node => {
      metadata[node.type] = node;
    });
    
    backendNodeMetadata = metadata;
    return metadata;
  } catch (error) {
    console.error('Failed to fetch node types from backend:', error);
    return null;
  }
}

/**
 * Get backend metadata for a node type
 * @param {string} nodeType - Node type identifier
 * @returns {Object|null} Backend metadata or null
 */
export function getBackendMetadata(nodeType) {
  return backendNodeMetadata?.[nodeType] || null;
}

/**
 * Get complete node metadata (UI + backend)
 * @param {string} nodeType - Node type identifier
 * @returns {Object} Combined metadata
 */
export function getNodeMetadata(nodeType) {
  const uiMetadata = NODE_METADATA[nodeType] || {};
  const backendMeta = getBackendMetadata(nodeType);
  
  return {
    ...uiMetadata,
    // Add backend metadata
    inputs: backendMeta?.inputs || [],
    outputs: backendMeta?.outputs || [],
    properties: backendMeta?.properties || [],
    // Convenience flags derived from backend data
    hasInput: backendMeta?.inputs?.length > 0,
    hasOutput: backendMeta?.outputs?.length > 0,
  };
}

// Utility functions

/**
 * Get all node types as a flat array
 * @returns {string[]} Array of node type strings
 */
export function getAllNodeTypes() {
  return Object.keys(NODE_METADATA);
}

/**
 * Get category information for a given node type
 * @param {string} nodeType - The node type identifier
 * @returns {object|null} Category and section info, or null if not found
 */
export function getCategoryForNodeType(nodeType) {
  const metadata = NODE_METADATA[nodeType];
  if (!metadata) return null;

  const category = NODE_CATEGORIES[metadata.category];
  if (!category) return null;

  const sectionKey = metadata.section;
  const section = Object.values(category.sections).find(s => s.key === sectionKey.toLowerCase());

  return {
    category: {
      key: category.key,
      displayName: category.displayName,
      icon: category.icon
    },
    section: section ? {
      key: section.key,
      displayName: section.displayName
    } : null
  };
}

/**
 * Get recent nodes from localStorage
 * @param {number} limit - Maximum number of recent nodes to return
 * @returns {string[]} Array of recent node types
 */
export function getRecentNodes(limit = 5) {
  try {
    const recent = localStorage.getItem('flow-studio-recent-nodes');
    if (!recent) return [];
    
    const nodes = JSON.parse(recent);
    return Array.isArray(nodes) ? nodes.slice(0, limit) : [];
  } catch (error) {
    console.error('Error reading recent nodes:', error);
    return [];
  }
}

/**
 * Add a node type to recent nodes list
 * @param {string} nodeType - The node type to add
 */
export function addToRecentNodes(nodeType) {
  try {
    if (!NODE_METADATA[nodeType]) {
      console.warn('Unknown node type:', nodeType);
      return;
    }

    let recent = getRecentNodes(50);
    recent = recent.filter(t => t !== nodeType);
    recent.unshift(nodeType);
    recent = recent.slice(0, 10);
    
    localStorage.setItem('flow-studio-recent-nodes', JSON.stringify(recent));
  } catch (error) {
    console.error('Error saving recent nodes:', error);
  }
}

/**
 * Search nodes by name or description
 * @param {string} searchTerm - Search query
 * @returns {string[]} Array of matching node types
 */
export function searchNodes(searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return getAllNodeTypes();
  }

  const term = searchTerm.toLowerCase().trim();
  
  return getAllNodeTypes().filter(nodeType => {
    const metadata = NODE_METADATA[nodeType];
    return (
      metadata.displayName.toLowerCase().includes(term) ||
      metadata.description.toLowerCase().includes(term) ||
      nodeType.toLowerCase().includes(term)
    );
  });
}

/**
 * Get nodes organized by category and section
 * @returns {object} Organized node structure
 */
export function getOrganizedNodes() {
  const organized = {};

  Object.entries(NODE_CATEGORIES).forEach(([categoryKey, category]) => {
    organized[categoryKey] = {
      ...category,
      sections: {}
    };

    Object.entries(category.sections).forEach(([sectionKey, section]) => {
      organized[categoryKey].sections[sectionKey] = {
        ...section,
        nodes: section.nodes.map(nodeType => ({
          type: nodeType,
          ...getNodeMetadata(nodeType)
        }))
      };
    });
  });

  return organized;
}

/**
 * Get display preferences for a node type
 * @param {string} nodeType - The node type
 * @returns {object} Display preferences
 */
export function getNodeDisplayPreference(nodeType) {
  try {
    const prefs = localStorage.getItem(`flow-studio-node-pref-${nodeType}`);
    return prefs ? JSON.parse(prefs) : { displayMode: 'table' };
  } catch (error) {
    return { displayMode: 'table' };
  }
}

/**
 * Save display preferences for a node type
 * @param {string} nodeType - The node type
 * @param {object} preferences - Preferences to save
 */
export function saveNodeDisplayPreference(nodeType, preferences) {
  try {
    localStorage.setItem(`flow-studio-node-pref-${nodeType}`, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving node preferences:', error);
  }
}
