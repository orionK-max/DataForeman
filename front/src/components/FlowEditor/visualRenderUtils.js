/**
 * Visual Rendering Utilities
 * 
 * Helper functions for rendering nodes from visual definitions.
 */

import { generateInputs, generateOutputs } from '../../utils/ioRulesUtils';

// Type-based handle colors
const handleTypeColors = {
  boolean: '#2196F3',   // Blue
  number: '#4CAF50',    // Green
  string: '#FF9800',    // Orange
  json: '#9C27B0',      // Purple
  main: '#757575',      // Gray (default/any type)
  trigger: '#F44336',   // Red
  any: '#757575'        // Gray
};

/**
 * Get handle color based on type or explicit color
 */
export const getHandleColor = (handleDef, ioType) => {
  // Explicit color
  if (handleDef.color && handleDef.color !== 'auto') {
    return handleDef.color;
  }

  // Auto color from type
  return handleTypeColors[ioType] || handleTypeColors.main;
};

/**
 * Minimum vertical spacing between handles in pixels
 * This ensures handles don't overlap and are easily clickable
 */
export const MIN_HANDLE_SPACING_PX = 30;

/**
 * Calculate required node height based on number of handles
 * 
 * @param {number} inputCount - Number of input handles
 * @param {number} outputCount - Number of output handles
 * @param {number} minHeight - Minimum height from canvas config
 * @returns {number} Required height in pixels
 */
export const calculateRequiredNodeHeight = (inputCount, outputCount, minHeight = 80) => {
  // Use the side with more handles to determine required height
  const maxHandles = Math.max(inputCount, outputCount);
  
  if (maxHandles <= 1) {
    return minHeight;
  }
  
  // Calculate height needed: handles + spacing between them + padding at top/bottom
  // Formula: (maxHandles - 1) * MIN_HANDLE_SPACING + 2 * padding
  const topBottomPadding = 40; // 20px padding top + 20px padding bottom
  const requiredHeight = (maxHandles - 1) * MIN_HANDLE_SPACING_PX + topBottomPadding;
  
  // Return the larger of minHeight and requiredHeight
  return Math.max(minHeight, requiredHeight);
};

/**
 * Calculate handle position percentage
 * 
 * @param {Object} handleDef - Handle definition from visual config
 * @param {number} index - Handle index
 * @param {number} totalCount - Total number of handles
 * @returns {string} Position percentage (e.g., '50%', '33.33%')
 */
export const calculateHandlePosition = (handleDef, index, totalCount) => {
  // Explicit position
  if (handleDef.position && handleDef.position !== 'auto') {
    return handleDef.position;
  }

  // Auto-distribution: evenly spaced
  // Formula: (100 / (count + 1)) * (index + 1)
  if (totalCount === 1) {
    return '50%';
  }

  const spacing = 100 / (totalCount + 1);
  return `${spacing * (index + 1)}%`;
};

/**
 * Generate handles from visual definition
 * 
 * Uses ioRules system to determine input/output configurations based on node parameters.
 * Falls back to inputConfiguration for backward compatibility.
 * 
 * @param {Object} visualHandles - visual.handles from node definition
 * @param {Array} inputs - inputs array from node metadata (fallback)
 * @param {Array} outputs - outputs array from node metadata (fallback)
 * @param {Object} data - node data (for dynamic handle generation)
 * @param {Object} metadata - full node metadata (for ioRules/inputConfiguration)
 * @returns {Object} { inputs: [], outputs: [] } with resolved handles
 */
export const generateHandles = (visualHandles, inputs = [], outputs = [], data = {}, metadata = null) => {
  // Check if node has ioRules (parameter-driven I/O)
  const hasIoRules = metadata?.ioRules && metadata.ioRules.length > 0;
  
  // Generate inputs/outputs using ioRules system (handles all modes: homogeneous, heterogeneous, hybrid)
  const generatedInputs = hasIoRules ? generateInputs(metadata, data) : null;
  const generatedOutputs = hasIoRules ? generateOutputs(metadata, data) : null;
  
  // Use generated definitions if ioRules exist (even if empty array), otherwise fall back to static inputs/outputs
  const effectiveInputs = generatedInputs !== null ? generatedInputs : inputs;
  const effectiveOutputs = generatedOutputs !== null ? generatedOutputs : outputs;
  
  if (!visualHandles) {
    // No visual definition - auto-generate from effective inputs/outputs
    return {
      inputs: effectiveInputs.map((input, index) => ({
        index,
        position: 'auto',
        color: 'auto',
        type: input.type,
        displayName: input.displayName,
        visible: true
      })),
      outputs: effectiveOutputs.map((output, index) => ({
        index,
        position: 'auto',
        color: 'auto',
        type: output.type,
        displayName: output.displayName,
        visible: true
      }))
    };
  }

  // Visual definition exists - merge with generated definitions
  const inputHandles = visualHandles.inputs || [];
  const outputHandles = visualHandles.outputs || [];
  
  // If visual handles are empty but we have generated definitions, auto-create handle configs
  const effectiveInputHandles = inputHandles.length === 0 && effectiveInputs.length > 0
    ? effectiveInputs.map((_, i) => ({ index: i, position: 'auto', color: 'auto', visible: true }))
    : inputHandles;
  
  const effectiveOutputHandles = outputHandles.length === 0 && effectiveOutputs.length > 0
    ? effectiveOutputs.map((_, i) => ({ index: i, position: 'auto', color: 'auto', visible: true }))
    : outputHandles;

  // Resolve input handle properties from generated definitions
  const resolvedInputs = effectiveInputHandles.map(handleDef => {
    const inputDef = effectiveInputs[handleDef.index] || {};
    return {
      ...handleDef,
      type: inputDef.type || 'main',
      displayName: handleDef.label || inputDef.displayName || `Input ${handleDef.index + 1}`,
      color: getHandleColor(handleDef, inputDef.type || 'main'),
      position: calculateHandlePosition(handleDef, handleDef.index, effectiveInputHandles.length),
      visible: handleDef.visible !== undefined ? handleDef.visible : true
    };
  });

  // Resolve output handle properties from generated definitions
  const resolvedOutputs = effectiveOutputHandles.map(handleDef => {
    const outputDef = effectiveOutputs[handleDef.index] || {};
    return {
      ...handleDef,
      type: outputDef.type || 'main',
      displayName: handleDef.label || outputDef.displayName || `Output ${handleDef.index + 1}`,
      color: getHandleColor(handleDef, outputDef.type || 'main'),
      position: calculateHandlePosition(handleDef, handleDef.index, effectiveOutputHandles.length),
      visible: handleDef.visible !== undefined ? handleDef.visible : true
    };
  });

  return {
    inputs: resolvedInputs,
    outputs: resolvedOutputs
  };
};

/**
 * Get canvas configuration with defaults
 * Automatically calculates height based on number of handles if needed
 * 
 * @param {Object} visual - Visual definition
 * @param {number} inputCount - Number of input handles (optional)
 * @param {number} outputCount - Number of output handles (optional)
 */
export const getCanvasConfig = (visual, inputCount = 0, outputCount = 0) => {
  const canvas = visual?.canvas || {};
  const baseMinHeight = canvas.minHeight || 80;
  
  // Calculate required height based on handle count
  const requiredHeight = calculateRequiredNodeHeight(inputCount, outputCount, baseMinHeight);
  
  return {
    minWidth: canvas.minWidth || 160,
    minHeight: requiredHeight,
    shape: canvas.shape || 'rounded-rect',
    borderRadius: canvas.borderRadius !== undefined ? canvas.borderRadius : 8,
    resizable: canvas.resizable || false
  };
};

/**
 * Get status indicator configuration with defaults
 */
export const getStatusConfig = (visual) => {
  const status = visual?.status || {};
  
  return {
    execution: {
      enabled: status.execution?.enabled !== false,
      position: status.execution?.position || 'top-left',
      offset: status.execution?.offset || { x: -10, y: -10 }
    },
    pinned: {
      enabled: status.pinned?.enabled !== false,
      position: status.pinned?.position || 'top-right',
      offset: status.pinned?.offset || { x: -8, y: -8 }
    },
    executionOrder: {
      enabled: status.executionOrder?.enabled !== false,
      position: status.executionOrder?.position || 'header'
    }
  };
};

/**
 * Get runtime configuration
 */
export const getRuntimeConfig = (visual) => {
  const runtime = visual?.runtime || {};
  
  if (!runtime.enabled) {
    return null;
  }

  return {
    enabled: true,
    updateInterval: runtime.updateInterval || 1000,
    endpoint: runtime.endpoint || '/api/flows/nodes/{{nodeId}}/runtime',
    fields: runtime.fields || []
  };
};
