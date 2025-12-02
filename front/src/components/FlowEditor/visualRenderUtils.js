/**
 * Visual Rendering Utilities
 * 
 * Helper functions for rendering nodes from visual definitions.
 */

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
 * @param {Object} visualHandles - visual.handles from node definition
 * @param {Array} inputs - inputs array from node metadata
 * @param {Array} outputs - outputs array from node metadata
 * @param {Object} data - node data (for dynamic handle generation)
 * @param {Object} metadata - full node metadata (for inputConfiguration)
 * @returns {Object} { inputs: [], outputs: [] } with resolved handles
 */
export const generateHandles = (visualHandles, inputs = [], outputs = [], data = {}, metadata = null) => {
  if (!visualHandles) {
    // No visual definition - auto-generate from metadata
    return {
      inputs: inputs.map((input, index) => ({
        index,
        position: 'auto',
        color: 'auto',
        type: input.type,
        displayName: input.displayName,
        visible: true
      })),
      outputs: outputs.map((output, index) => ({
        index,
        position: 'auto',
        color: 'auto',
        type: output.type,
        displayName: output.displayName,
        visible: true
      }))
    };
  }

  // Generate input handles
  let inputHandles = visualHandles.inputs || [];
  
  // Handle dynamic input count (Math node and others with inputConfiguration)
  // If visual.handles.inputs is empty but inputConfiguration exists, generate dynamic handles
  const hasInputConfig = metadata?.inputConfiguration;
  const configuredCount = data?.inputCount ? parseInt(data.inputCount, 10) : null;
  const defaultCount = hasInputConfig?.defaultInputs || null;
  const finalInputCount = configuredCount || defaultCount;
  
  if (inputHandles.length === 0 && finalInputCount && finalInputCount > 0 && inputs.length > 0) {
    inputHandles = Array.from({ length: finalInputCount }, (_, i) => ({
      index: i,
      position: 'auto',
      color: 'auto',
      type: inputs[0]?.type || 'main',
      displayName: inputs[0]?.displayName ? `${inputs[0].displayName} ${i + 1}` : `Input ${i + 1}`,
      visible: true
    }));
  }

  // Resolve handle properties
  const resolvedInputs = inputHandles.map(handleDef => ({
    ...handleDef,
    type: inputs[handleDef.index]?.type || 'main',
    displayName: handleDef.label || inputs[handleDef.index]?.displayName || `Input ${handleDef.index + 1}`,
    color: getHandleColor(handleDef, inputs[handleDef.index]?.type || 'main'),
    position: calculateHandlePosition(handleDef, handleDef.index, inputHandles.length)
  }));

  const outputHandles = visualHandles.outputs || [];
  const resolvedOutputs = outputHandles.map(handleDef => ({
    ...handleDef,
    type: outputs[handleDef.index]?.type || 'main',
    displayName: handleDef.label || outputs[handleDef.index]?.displayName || `Output ${handleDef.index + 1}`,
    color: getHandleColor(handleDef, outputs[handleDef.index]?.type || 'main'),
    position: calculateHandlePosition(handleDef, handleDef.index, outputHandles.length)
  }));

  return {
    inputs: resolvedInputs,
    outputs: resolvedOutputs
  };
};

/**
 * Get canvas configuration with defaults
 */
export const getCanvasConfig = (visual) => {
  const canvas = visual?.canvas || {};
  
  return {
    minWidth: canvas.minWidth || 160,
    minHeight: canvas.minHeight || 80,
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
