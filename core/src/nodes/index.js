/**
 * Node Registration
 * 
 * Imports and registers all node types with the NodeRegistry.
 * This file is the central place to add new node types.
 */

import { NodeRegistry } from './base/NodeRegistry.js';

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
 */
export function registerAllNodes() {
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
  
  // More nodes will be registered here as we implement them
  
  console.log(`[NodeRegistry] Registered ${NodeRegistry.count()} node types`);
}

// Export registry for use in other modules
export { NodeRegistry };

