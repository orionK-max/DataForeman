import React, { memo } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import { Box, Tooltip, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PushPinIcon from '@mui/icons-material/PushPin';
import { getNodeMetadata } from '../../constants/nodeTypes';
import { NodeLayoutEngine } from './NodeLayoutEngine';
import { useNodeRuntimeData } from './useNodeRuntimeData';
import {
  generateHandles,
  getCanvasConfig,
  getStatusConfig,
  getRuntimeConfig
} from './visualRenderUtils';

/**
 * CustomNodeV2 - New block-based node renderer
 * 
 * Renders nodes from backend visual definitions using composable blocks.
 * Supports dynamic layouts, runtime data polling, and conditional visibility.
 */
const CustomNodeV2 = ({ data, type, selected, id }) => {
  const theme = useTheme();
  
  // Get metadata from backend
  const metadata = getNodeMetadata(type);
  const visual = metadata?.visual;
  
  // Get configurations
  const canvasConfig = getCanvasConfig(visual);
  const statusConfig = getStatusConfig(visual);
  const runtimeConfig = getRuntimeConfig(visual);
  
  // Poll for runtime data if enabled
  const isExecuting = data?.executionStatus === 'running';
  const polledRuntimeData = useNodeRuntimeData(id, runtimeConfig, isExecuting);
  
  // Use pinned data from node.data.runtime, fall back to polled runtime data
  const runtimeData = data?.runtime || polledRuntimeData;
  
  // Enhance data with computed fields for template resolution
  const enhancedData = { ...data };
  
  // Compute _constantValue for Constant nodes
  if (type === 'constant' && data.valueType) {
    switch (data.valueType) {
      case 'number':
        enhancedData._constantValue = data.numberValue !== undefined ? String(data.numberValue) : '';
        break;
      case 'string':
        enhancedData._constantValue = data.stringValue || '';
        break;
      case 'boolean':
        enhancedData._constantValue = data.booleanValue !== undefined ? String(data.booleanValue) : '';
        break;
      case 'json':
        enhancedData._constantValue = data.jsonValue || '{}';
        break;
      default:
        enhancedData._constantValue = '';
    }
  }
  
  // Compute connectionName fallback for tag nodes (handles legacy nodes without connectionName)
  if ((type === 'tag-input' || type === 'tag-output') && !data.connectionName && data.source) {
    if (data.source === 'internal') {
      enhancedData.connectionName = 'Internal';
    } else if (data.source === 'system') {
      enhancedData.connectionName = 'System';
    } else if (data.source === 'connectivity') {
      enhancedData.connectionName = 'Connectivity';
    }
  }
  
  // Compute _displayOperation for Comparison nodes
  if (type === 'comparison' && data.operation) {
    const operationMap = {
      'gt': 'In1 > In2',
      'lt': 'In1 < In2',
      'gte': 'In1 >= In2',
      'lte': 'In1 <= In2',
      'eq': 'In1 == In2',
      'neq': 'In1 != In2'
    };
    enhancedData._displayOperation = operationMap[data.operation] || data.operation;
  }
  
  // Generate handles from visual definition
  const handles = generateHandles(
    visual?.handles,
    metadata?.inputs,
    metadata?.outputs,
    enhancedData,
    metadata
  );
  
  // Theme-aware colors
  const isDark = theme.palette.mode === 'dark';
  const nodeBgColor = isDark ? '#2a2a2a' : '#ffffff';
  const borderColor = isDark ? '#444' : '#ddd';
  const nodeColor = metadata?.color || '#757575';
  
  // Base node style
  const nodeStyle = {
    padding: '12px 16px',
    borderRadius: canvasConfig.shape === 'rounded-rect' ? `${canvasConfig.borderRadius}px` : 0,
    border: '2px solid',
    minWidth: `${canvasConfig.minWidth}px`,
    minHeight: canvasConfig.minHeight ? `${canvasConfig.minHeight}px` : 'auto',
    background: nodeBgColor,
    borderColor: selected ? nodeColor : borderColor,
    borderWidth: selected ? 3 : 2,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    position: 'relative',
    color: theme.palette.text.primary,
    '&:hover': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    },
    '@keyframes pulse': {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.7 }
    }
  };
  
  return (
    <>
      {/* Resizer for resizable nodes (Comment) */}
      {canvasConfig.resizable && selected && (
        <NodeResizer
          minWidth={canvasConfig.minWidth}
          minHeight={canvasConfig.minHeight}
          color={nodeColor}
          isVisible={selected}
        />
      )}
      
      {/* Input Handles */}
      {handles.inputs.filter(h => h.visible).map((handle) => {
        return (
          <Tooltip
            key={`input-${handle.index}`}
            title={`${handle.displayName} [${handle.type}]`}
            placement="left"
            arrow
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`input-${handle.index}`}
              style={{
                width: visual?.handles?.size || 12,
                height: visual?.handles?.size || 12,
                background: handle.color,
                border: `${visual?.handles?.borderWidth || 2}px solid ${visual?.handles?.borderColor || 'white'}`,
                top: handle.position,
                zIndex: 1
              }}
            />
          </Tooltip>
        );
      })}
      
      {/* Output Handles */}
      {handles.outputs.filter(h => h.visible).map((handle) => {
        return (
          <Tooltip
            key={`output-${handle.index}`}
            title={`${handle.displayName} [${handle.type}]`}
            placement="right"
            arrow
          >
            <Handle
              type="source"
              position={Position.Right}
              id={`output-${handle.index}`}
              style={{
                width: visual?.handles?.size || 12,
                height: visual?.handles?.size || 12,
                background: handle.color,
                border: `${visual?.handles?.borderWidth || 2}px solid ${visual?.handles?.borderColor || 'white'}`,
                top: handle.position,
                zIndex: 1
              }}
            />
          </Tooltip>
        );
      })}
      
      {/* Main Node Box */}
      <Box sx={nodeStyle}>
        {/* Execution Status Badge */}
        {statusConfig.execution.enabled && data?.executionStatus && (
          <Tooltip
            title={
              data.executionStatus === 'success' ? 'Executed successfully' :
              data.executionStatus === 'error' ? 'Execution failed' :
              data.executionStatus === 'running' ? 'Currently executing' :
              'Unknown status'
            }
            placement="top"
          >
            <Box
              sx={{
                position: 'absolute',
                top: statusConfig.execution.offset.y,
                left: statusConfig.execution.offset.x,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background:
                  data.executionStatus === 'success' ? '#4caf50' :
                  data.executionStatus === 'error' ? '#f44336' :
                  data.executionStatus === 'running' ? '#2196f3' :
                  '#757575',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                zIndex: 10,
                animation: data.executionStatus === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none'
              }}
            >
              {data.executionStatus === 'success' && <CheckCircleIcon sx={{ fontSize: 16 }} />}
              {data.executionStatus === 'error' && <ErrorIcon sx={{ fontSize: 16 }} />}
              {data.executionStatus === 'running' && <HourglassEmptyIcon sx={{ fontSize: 16 }} />}
            </Box>
          </Tooltip>
        )}
        
        {/* Pinned Data Badge */}
        {statusConfig.pinned.enabled && data?.pinnedData && (
          <Tooltip title="Pinned test data" placement="top">
            <Box
              sx={{
                position: 'absolute',
                top: statusConfig.pinned.offset.y,
                right: Math.abs(statusConfig.pinned.offset.x),
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#ff9800',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                zIndex: 10
              }}
            >
              <PushPinIcon sx={{ fontSize: 12 }} />
            </Box>
          </Tooltip>
        )}
        
        {/* Node Content - Rendered by Layout Engine */}
        <NodeLayoutEngine
          visual={visual}
          data={enhancedData}
          executionOrder={data?.executionOrder}
          runtimeData={runtimeData}
        />
      </Box>
    </>
  );
};

export default memo(CustomNodeV2);
