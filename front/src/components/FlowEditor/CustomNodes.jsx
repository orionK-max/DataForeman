import React, { memo } from 'react';
import CustomNode from './CustomNode';

/**
 * Node Type Exports for ReactFlow
 * 
 * All node types now use CustomNode, which renders nodes from backend visual definitions.
 * Visual definitions are defined in core/src/nodes/{category}/{NodeName}.js
 * 
 * Rendering pipeline:
 * 1. Backend provides visual definition (layout blocks, handles config, status badges)
 * 2. CustomNode receives definition via getNodeMetadata()
 * 3. NodeLayoutEngine renders layout blocks using block components
 * 4. Custom handle positioning and colors applied via visual.handles config
 * 
 * See docs/flow-node-schema.md for visual definition specification.
 */

// Export node components using V2 renderer
export const TagInputNode = memo((props) => <CustomNode {...props} type="tag-input" />);
export const TagOutputNode = memo((props) => <CustomNode {...props} type="tag-output" />);
export const MathNode = memo((props) => <CustomNode {...props} type="math" />);
export const ComparisonNode = memo((props) => <CustomNode {...props} type="comparison" />);
export const GateNode = memo((props) => <CustomNode {...props} type="gate" />);
export const ScriptJsNode = memo((props) => <CustomNode {...props} type="script-js" />);
export const ConstantNode = memo((props) => <CustomNode {...props} type="constant" />);
export const CommentNode = memo((props) => <CustomNode {...props} type="comment" />);

// Export node types object for ReactFlow
export const nodeTypes = {
  'tag-input': TagInputNode,
  'tag-output': TagOutputNode,
  'math': MathNode,
  'comparison': ComparisonNode,
  'gate': GateNode,
  'script-js': ScriptJsNode,
  'constant': ConstantNode,
  'comment': CommentNode,
};