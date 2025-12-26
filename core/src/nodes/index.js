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
import { ClampNode } from './math/ClampNode.js';
import { RoundNode } from './math/RoundNode.js';

// Logic nodes
import { GateNode } from './logic/GateNode.js';
import { BooleanLogicNode } from './logic/BooleanLogicNode.js';
import { SwitchNode } from './logic/SwitchNode.js';
import { RangeCheckNode } from './logic/RangeCheckNode.js';
import { MergeNode } from './logic/MergeNode.js';

// Comparison nodes
import { ComparisonNode } from './comparison/ComparisonNode.js';

// Data transformation nodes
import { TypeConvertNode } from './data/TypeConvertNode.js';
import { StringOpsNode } from './data/StringOpsNode.js';
import { ArrayOpsNode } from './data/ArrayOpsNode.js';
import { JSONOpsNode } from './data/JSONOpsNode.js';

// Script nodes
import { JavaScriptNode } from './scripts/JavaScriptNode.js';

// Utility nodes
import { ConstantNode } from './utility/ConstantNode.js';
import { CommentNode } from './utility/CommentNode.js';
import { DelayNode } from './utility/DelayNode.js';
import { DebugLogNode } from './utility/DebugLogNode.js';
import { JumpOutNode } from './utility/JumpOutNode.js';
import { JumpInNode } from './utility/JumpInNode.js';

/**
 * Register all node types
 * Called during application startup
 * 
 * @param {Object} options - Registration options
 * @param {boolean} options.loadLibraries - Whether to load external libraries (default: true)
 * @param {Object} options.db - Database connection (required for library loading)
 * @param {Object} options.app - Fastify app instance (required for extension loading)
 * @returns {Promise<void>}
 */
export async function registerAllNodes(options = {}) {
  const { loadLibraries = true, db, app } = options;
  
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
  NodeRegistry.register('clamp', ClampNode);
  NodeRegistry.register('round', RoundNode);
  
  // Logic operations
  NodeRegistry.register('gate', GateNode);
  NodeRegistry.register('boolean-logic', BooleanLogicNode);
  NodeRegistry.register('switch', SwitchNode);
  NodeRegistry.register('range-check', RangeCheckNode);
  NodeRegistry.register('merge', MergeNode);
  
  // Comparison operations
  NodeRegistry.register('comparison', ComparisonNode);
  
  // Data transformation operations
  NodeRegistry.register('type-convert', TypeConvertNode);
  NodeRegistry.register('string-ops', StringOpsNode);
  NodeRegistry.register('array-ops', ArrayOpsNode);
  NodeRegistry.register('json-ops', JSONOpsNode);
  
  // Script operations (legacy - skip validation until Phase 4 refactor)
  NodeRegistry.register('script-js', JavaScriptNode, { skipValidation: true });
  
  // Utility nodes
  NodeRegistry.register('constant', ConstantNode);
  NodeRegistry.register('comment', CommentNode);
  NodeRegistry.register('delay', DelayNode);
  NodeRegistry.register('debug-log', DebugLogNode);
  NodeRegistry.register('jump-out', JumpOutNode);
  NodeRegistry.register('jump-in', JumpInNode);
  
  console.log(`[NodeRegistry] Registered ${NodeRegistry.count()} built-in node types`);
  
  // Load external node libraries
  if (loadLibraries) {
    try {
      await LibraryManager.loadAllLibraries(NodeRegistry, { db, app });
      
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

