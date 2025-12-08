import React, { memo } from 'react';
import CustomNode from './CustomNode';

/**
 * Node Type Exports for ReactFlow
 * 
 * All node types use CustomNode, which renders nodes from backend visual definitions.
 * This includes both core nodes and library-provided nodes.
 * 
 * Rendering pipeline:
 * 1. Backend provides visual definition (layout blocks, handles config, status badges)
 * 2. CustomNode receives definition via getNodeMetadata()
 * 3. NodeLayoutEngine renders layout blocks using block components
 * 4. Custom handle positioning and colors applied via visual.handles config
 * 
 * Dynamic Node Registration:
 * - Core nodes are pre-registered below
 * - Library nodes are dynamically registered via buildNodeTypes()
 * - All nodes use the same CustomNode component
 * 
 * See docs/flow-node-schema.md for visual definition specification.
 */

// Generic node component factory
const createNodeComponent = (nodeType) => {
  return memo((props) => <CustomNode {...props} type={nodeType} />);
};

// Core node components
export const TagInputNode = createNodeComponent('tag-input');
export const TagOutputNode = createNodeComponent('tag-output');
export const MathNode = createNodeComponent('math');
export const ComparisonNode = createNodeComponent('comparison');
export const GateNode = createNodeComponent('gate');
export const ScriptJsNode = createNodeComponent('script-js');
export const ConstantNode = createNodeComponent('constant');
export const CommentNode = createNodeComponent('comment');

// Base node types object with core nodes
const coreNodeTypes = {
  'tag-input': TagInputNode,
  'tag-output': TagOutputNode,
  'math': MathNode,
  'comparison': ComparisonNode,
  'gate': GateNode,
  'script-js': ScriptJsNode,
  'constant': ConstantNode,
  'comment': CommentNode,
};

/**
 * Build complete nodeTypes object including library nodes
 * @param {Array} backendNodeTypes - Array of node type metadata from backend
 * @returns {Object} Complete nodeTypes object for ReactFlow
 */
export function buildNodeTypes(backendNodeTypes = []) {
  const dynamicNodeTypes = { ...coreNodeTypes };
  
  // Add any node types from backend that aren't already registered
  backendNodeTypes.forEach(nodeType => {
    if (!dynamicNodeTypes[nodeType.type]) {
      dynamicNodeTypes[nodeType.type] = createNodeComponent(nodeType.type);
    }
  });
  
  return dynamicNodeTypes;
}

// Export static core node types for backward compatibility
export const nodeTypes = coreNodeTypes;