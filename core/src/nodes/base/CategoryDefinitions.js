/**
 * Node Category Definitions
 * 
 * Defines the hierarchical structure of CORE node categories and sections
 * for the Flow Studio node palette. This provides the organizational
 * structure for how nodes are displayed in the UI.
 * 
 * Categories group related functionality (e.g., Tag Operations, Logic & Math)
 * Sections subdivide categories into logical groupings (e.g., Basic, Advanced)
 * 
 * IMPORTANT - Dynamic Category System:
 * - This file defines ONLY core categories/sections (stored with is_core=true)
 * - Library-installed nodes can dynamically add their own categories/sections (is_core=false)
 * - CategoryService manages dynamic registration and cleanup of library categories
 * - Library categories/sections appear only when the library is installed
 * - When a library is uninstalled, its empty categories/sections are automatically removed
 * - The /api/flows/categories endpoint serves merged core + library categories from database
 * 
 * See: CategoryService.js for dynamic category management
 * See: docs/library-system.md for library development guidelines
 */

export const CATEGORIES = {
  TAG_OPERATIONS: {
    key: 'TAG_OPERATIONS',
    displayName: 'Tag Operations',
    icon: '📊',
    description: 'Read and write tag values',
    order: 1,
    sections: {
      BASIC: {
        key: 'BASIC',
        displayName: 'Basic',
        description: 'Basic tag operations',
        order: 1
      },
      ADVANCED: {
        key: 'ADVANCED',
        displayName: 'Advanced',
        description: 'Advanced tag transformations and history',
        order: 2
      }
    }
  },
  
  LOGIC_MATH: {
    key: 'LOGIC_MATH',
    displayName: 'Logic & Math',
    icon: '🔢',
    description: 'Perform calculations and comparisons',
    order: 2,
    sections: {
      MATH: {
        key: 'MATH',
        displayName: 'Math Operations',
        description: 'Arithmetic operations',
        order: 1
      },
      LOGIC: {
        key: 'LOGIC',
        displayName: 'Boolean Logic',
        description: 'Boolean operations and logic gates',
        order: 2
      },
      COMPARISON: {
        key: 'COMPARISON',
        displayName: 'Comparison',
        description: 'Compare values and conditions',
        order: 3
      },
      CONTROL: {
        key: 'CONTROL',
        displayName: 'Control Flow',
        description: 'Conditional execution and flow control',
        order: 4
      },
      ADVANCED: {
        key: 'ADVANCED',
        displayName: 'Scripts',
        description: 'Custom JavaScript logic',
        order: 5
      }
    }
  },

  FILE_OPERATIONS: {
    key: 'FILE_OPERATIONS',
    displayName: 'File Operations',
    icon: '📁',
    description: 'Load from and save to files',
    order: 3,
    sections: {
      BASIC: {
        key: 'BASIC',
        displayName: 'Basic',
        description: 'Read and write files',
        order: 1
      }
    }
  },
  
  COMMUNICATION: {
    key: 'COMMUNICATION',
    displayName: 'Communication',
    icon: '📡',
    description: 'External integrations',
    order: 4,
    sections: {
      BASIC: {
        key: 'BASIC',
        displayName: 'Basic',
        description: 'HTTP, email, and messaging',
        order: 1
      },
      DATABASE: {
        key: 'DATABASE',
        displayName: 'Database',
        description: 'Database operations',
        order: 2
      }
    }
  },
  
  DATA_TRANSFORM: {
    key: 'DATA_TRANSFORM',
    displayName: 'Data Transform',
    icon: '🔄',
    description: 'Transform and manipulate data',
    order: 5,
    sections: {
      CONVERSION: {
        key: 'CONVERSION',
        displayName: 'Type Conversion',
        description: 'Convert between data types',
        order: 1
      },
      TEXT: {
        key: 'TEXT',
        displayName: 'Text Operations',
        description: 'String manipulation and formatting',
        order: 2
      },
      BASIC: {
        key: 'BASIC',
        displayName: 'Other',
        description: 'Other transformations',
        order: 99
      }
    }
  },
  
  UTILITY: {
    key: 'UTILITY',
    displayName: 'Utility',
    icon: '🛠️',
    description: 'Helper and utility nodes',
    order: 6,
    sections: {
      BASIC: {
        key: 'BASIC',
        displayName: 'Basic',
        description: 'General utilities',
        order: 1
      }
    }
  },
  
  OTHER: {
    key: 'OTHER',
    displayName: 'Other',
    icon: '📦',
    description: 'Miscellaneous nodes',
    order: 99,
    sections: {
      BASIC: {
        key: 'BASIC',
        displayName: 'Basic',
        description: 'Uncategorized nodes',
        order: 1
      }
    }
  }
};

/**
 * Get all categories with their sections
 * @returns {Object} Map of category key to category definition
 */
export function getAllCategories() {
  return CATEGORIES;
}

/**
 * Get a specific category by key
 * @param {string} categoryKey - Category key (e.g., 'TAG_OPERATIONS')
 * @returns {Object|null} Category definition or null if not found
 */
export function getCategory(categoryKey) {
  return CATEGORIES[categoryKey] || null;
}

/**
 * Get a specific section within a category
 * @param {string} categoryKey - Category key
 * @param {string} sectionKey - Section key
 * @returns {Object|null} Section definition or null if not found
 */
export function getSection(categoryKey, sectionKey) {
  const category = CATEGORIES[categoryKey];
  if (!category || !category.sections) return null;
  return category.sections[sectionKey] || null;
}

/**
 * Validate that a category and section combination exists
 * @param {string} categoryKey - Category key
 * @param {string} sectionKey - Section key
 * @returns {boolean} True if valid combination
 */
export function isValidCategorySection(categoryKey, sectionKey) {
  return getSection(categoryKey, sectionKey) !== null;
}

/**
 * Get list of all valid category keys
 * @returns {string[]} Array of category keys
 */
export function getValidCategoryKeys() {
  return Object.keys(CATEGORIES);
}
