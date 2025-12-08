/**
 * Node Registration
 * 
 * Imports and registers all node types with the NodeRegistry.
 * This file is the central place to add new node types.
 */

import { NodeRegistry } from './base/NodeRegistry.js';
import { LibraryManager } from './base/LibraryManager.js';

// Tag nodes
import { TagInputNode } from './tags/TagInputNode.js';
import { TagOutputNode } from './tags/TagOutputNode.js';

// Math nodes
import { MathNode } from './math/MathNode.js';

// Logic nodes
import { GateNode } from './logic/GateNode.js';

// Comparison nodes
import { ComparisonNode } from './comparison/ComparisonNode.js';

// Script nodes
import { JavaScriptNode } from './scripts/JavaScriptNode.js';

// Utility nodes
import { ConstantNode } from './utility/ConstantNode.js';
import { CommentNode } from './utility/CommentNode.js';

/**
 * Register all node types
 * Called during application startup
 * 
 * @param {Object} options - Registration options
 * @param {boolean} options.loadLibraries - Whether to load external libraries (default: true)
 * @param {Object} options.db - Database connection (required for library loading)
 * @returns {Promise<void>}
 */
export async function registerAllNodes(options = {}) {
  const { loadLibraries = true, db } = options;
  
  // Initialize category service with core categories
  if (db) {
    try {
      const { CategoryService } = await import('../services/CategoryService.js');
      await CategoryService.initializeCoreCategories(db);
    } catch (error) {
      console.error('[registerAllNodes] Failed to initialize categories:', error);
    }
  }
  
  // Register built-in nodes
  // Tag operations
  NodeRegistry.register('tag-input', TagInputNode);
  NodeRegistry.register('tag-output', TagOutputNode);
  
  // Math operations
  NodeRegistry.register('math', MathNode);
  
  // Logic operations
  NodeRegistry.register('gate', GateNode);
  
  // Comparison operations
  NodeRegistry.register('comparison', ComparisonNode);
  
  // Script operations (legacy - skip validation until Phase 4 refactor)
  NodeRegistry.register('script-js', JavaScriptNode, { skipValidation: true });
  
  // Utility nodes
  NodeRegistry.register('constant', ConstantNode);
  NodeRegistry.register('comment', CommentNode);
  
  console.log(`[NodeRegistry] Registered ${NodeRegistry.count()} built-in node types`);
  
  // Load external node libraries
  if (loadLibraries) {
    try {
      await LibraryManager.loadAllLibraries(NodeRegistry, { db });
      
      const libraryCount = LibraryManager.getAllLibraries().length;
      const totalNodes = NodeRegistry.count();
      
      if (libraryCount > 0) {
        console.log(`[NodeRegistry] Loaded ${libraryCount} libraries, total ${totalNodes} node types`);
      }
    } catch (error) {
      console.error('[NodeRegistry] Error loading libraries:', error);
      // Don't throw - libraries are optional, continue with built-in nodes
    }
  }
}

// Export registry and library manager for use in other modules
export { NodeRegistry, LibraryManager };

