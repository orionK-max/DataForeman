/**
 * Node Registration
 * 
 * Imports and registers all node types with the NodeRegistry.
 * This file is the central place to add new node types.
 */

import { NodeRegistry } from './base/NodeRegistry.js';

// Trigger nodes
import { ManualTriggerNode } from './triggers/ManualTriggerNode.js';

// Tag nodes
import { TagInputNode } from './tags/TagInputNode.js';
import { TagOutputNode } from './tags/TagOutputNode.js';

// Math nodes
import { MathNode } from './math/MathNode.js';

// Comparison nodes
import { ComparisonNode } from './comparison/ComparisonNode.js';

// Script nodes
import { JavaScriptNode } from './scripts/JavaScriptNode.js';

/**
 * Register all node types
 * Called during application startup
 */
export function registerAllNodes() {
  // Triggers
  NodeRegistry.register('trigger-manual', ManualTriggerNode);
  
  // Tag operations
  NodeRegistry.register('tag-input', TagInputNode);
  NodeRegistry.register('tag-output', TagOutputNode);
  
  // Math operations
  NodeRegistry.register('math', MathNode);
  
  // Comparison operations
  NodeRegistry.register('comparison', ComparisonNode);
  
  // Script operations
  NodeRegistry.register('script-js', JavaScriptNode);
  
  // More nodes will be registered here as we implement them
  
  console.log(`[NodeRegistry] Registered ${NodeRegistry.count()} node types`);
}

// Export registry for use in other modules
export { NodeRegistry };

