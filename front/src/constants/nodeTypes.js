/**
 * Node Type Definitions for Flow Studio
 * 
 * This module fetches node metadata from the backend API:
 * - Category/section organization via GET /api/flows/categories
 * - Node type metadata via GET /api/flows/node-types
 * 
 * Backend is the single source of truth for all node metadata.
 */

import { flowsApi } from '../services/api.js';

// Storage for backend-provided category definitions
let backendCategories = null;

// Storage for backend-provided node metadata
let backendNodeMetadata = null;

/**
 * Fetch category definitions from backend
 * @returns {Promise<Object>} Map of category key to category definition
 */
export async function fetchCategories() {
  try {
    const response = await flowsApi.getCategories();
    
    if (!response || !response.categories) {
      console.error('[fetchCategories] Invalid response format:', response);
      return null;
    }
    
    backendCategories = response.categories;
    return backendCategories;
  } catch (error) {
    console.error('Failed to fetch categories from backend:', error);
    return null;
  }
}

/**
 * Get backend category definitions
 * @returns {Object|null} Category definitions or null
 */
export function getCategories() {
  return backendCategories;
}

/**
 * Fetch node type metadata from backend
 * @returns {Promise<Object>} Map of node type to backend metadata
 */
export async function fetchBackendNodeMetadata() {
  try {
    const response = await flowsApi.getNodeTypes();
    
    // Check if response is valid
    if (!response || !response.nodeTypes) {
      console.error('[fetchBackendNodeMetadata] Invalid response format:', response);
      return null;
    }
    
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
 * Get all node types from backend metadata
 * @returns {Array<Object>} Array of all backend metadata objects
 */
export function getAllNodeTypes() {
  if (!backendNodeMetadata) {
    return [];
  }
  return Object.values(backendNodeMetadata);
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
 * Get complete node metadata from backend
 * @param {string} nodeType - Node type identifier
 * @returns {Object} Node metadata with display properties and schema
 */
export function getNodeMetadata(nodeType) {
  const backendMeta = getBackendMetadata(nodeType);
  
  if (!backendMeta) {
    console.warn(`No backend metadata for node type: ${nodeType}`);
    return {
      displayName: nodeType,
      description: '',
      icon: '📦',
      color: '#666666',
      category: 'OTHER',
      section: 'BASIC',
      inputs: [],
      outputs: [],
      properties: [],
      schemaVersion: 1,
      hasInput: false,
      hasOutput: false,
    };
  }
  
  // All metadata comes from backend
  return {
    displayName: backendMeta.displayName || nodeType,
    name: backendMeta.name || nodeType,
    description: backendMeta.description || '',
    icon: backendMeta.icon || '📦',
    color: backendMeta.color || '#666666',
    category: backendMeta.category || 'OTHER',
    section: backendMeta.section || 'BASIC',
    inputs: backendMeta.inputs || [],
    outputs: backendMeta.outputs || [],
    inputConfiguration: backendMeta.inputConfiguration || null,
    ioRules: backendMeta.ioRules || null,  // Parameter-driven I/O rules
    properties: backendMeta.properties || [],
    schemaVersion: backendMeta.schemaVersion || 1,
    visual: backendMeta.visual || null,
    configUI: backendMeta.configUI || null,  // UI configuration for node config panel
    help: backendMeta.help || null,  // Help documentation
    // Convenience flags
    hasInput: backendMeta.inputs?.length > 0,
    hasOutput: backendMeta.outputs?.length > 0,
  };
}

// Utility functions

/**
 * Get category information for a given node type
 * @param {string} nodeType - The node type identifier
 * @returns {object|null} Category and section info, or null if not found
 */
export function getCategoryForNodeType(nodeType) {
  const metadata = getBackendMetadata(nodeType);
  if (!metadata || !backendCategories) return null;

  const categoryKey = metadata.category;
  const sectionKey = metadata.section;
  const category = backendCategories[categoryKey];
  
  if (!category) return null;

  const section = category.sections?.[sectionKey];

  return {
    category: {
      key: category.key,
      displayName: category.displayName,
      icon: category.icon,
      description: category.description
    },
    section: section ? {
      key: section.key,
      displayName: section.displayName,
      description: section.description
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
    const metadata = getBackendMetadata(nodeType);
    if (!metadata) {
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
  if (!backendNodeMetadata) {
    return [];
  }

  const nodeTypes = Object.keys(backendNodeMetadata);
  
  if (!searchTerm || searchTerm.trim() === '') {
    return nodeTypes;
  }

  const term = searchTerm.toLowerCase().trim();
  
  return nodeTypes.filter(nodeType => {
    const metadata = backendNodeMetadata[nodeType];
    if (!metadata) return false;
    
    return (
      metadata.displayName?.toLowerCase().includes(term) ||
      metadata.description?.toLowerCase().includes(term) ||
      nodeType.toLowerCase().includes(term)
    );
  });
}

/**
 * Get nodes organized by category and section
 * @returns {object} Organized node structure
 */
export function getOrganizedNodes() {
  if (!backendCategories || !backendNodeMetadata) {
    console.warn('Categories or node metadata not loaded from backend');
    return {};
  }

  const organized = {};

  // Group nodes by category and section
  Object.entries(backendCategories).forEach(([categoryKey, category]) => {
    organized[categoryKey] = {
      key: category.key,
      displayName: category.displayName,
      icon: category.icon,
      description: category.description,
      order: category.order,
      sections: {}
    };

    // Initialize sections
    Object.entries(category.sections || {}).forEach(([sectionKey, section]) => {
      organized[categoryKey].sections[sectionKey] = {
        key: section.key,
        displayName: section.displayName,
        description: section.description,
        order: section.order,
        nodes: []
      };
    });
  });

  // Assign nodes to their categories and sections
  Object.entries(backendNodeMetadata).forEach(([nodeType, metadata]) => {
    const categoryKey = metadata.category || 'OTHER';
    const sectionKey = metadata.section || 'BASIC';
    
    if (organized[categoryKey]?.sections[sectionKey]) {
      organized[categoryKey].sections[sectionKey].nodes.push({
        type: nodeType,
        ...metadata
      });
    }
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
