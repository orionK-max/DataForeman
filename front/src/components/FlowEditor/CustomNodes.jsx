import React, { memo } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import { Box, Typography, Chip, Tooltip, IconButton, CircularProgress, useTheme } from '@mui/material';
import InputIcon from '@mui/icons-material/Input';
import OutputIcon from '@mui/icons-material/Output';
import CalculateIcon from '@mui/icons-material/Calculate';
import CodeIcon from '@mui/icons-material/Code';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom'; // Icon for Gate node
import LooksIcon from '@mui/icons-material/Looks'; // Icon for Constant node
import CommentIcon from '@mui/icons-material/Comment'; // Icon for Comment node
import PushPinIcon from '@mui/icons-material/PushPin';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { getNodeMetadata } from '../../constants/nodeTypes';

// Type-based handle colors
const handleTypeColors = {
  boolean: '#2196F3',   // Blue
  number: '#4CAF50',    // Green
  string: '#FF9800',    // Orange
  json: '#9C27B0',      // Purple
  main: '#757575',      // Gray (default/any type)
};

// Get handle color based on type
const getHandleColor = (type) => {
  return handleTypeColors[type] || handleTypeColors.main;
};

// Template resolver - replaces {{field}} with data[field] or calls function
const resolveTemplate = (template, data) => {
  if (!template) return null;
  
  // If template is a function, call it with data
  if (typeof template === 'function') {
    return template(data);
  }
  
  // Otherwise treat as string template
  return template.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    return data[field] !== undefined ? data[field] : match;
  });
};

// Icon resolver - gets icon from iconMap based on data field
const resolveIcon = (visual, data, defaultIcon) => {
  if (!visual || !visual.iconMap) return defaultIcon;
  
  // If iconMap is a function, call it
  if (typeof visual.iconMap === 'function') {
    return visual.iconMap(data) || defaultIcon;
  }
  
  // If iconMap is an object, look up by iconField (default: 'operation')
  const field = visual.iconField || 'operation';
  const value = data[field];
  return visual.iconMap[value] || defaultIcon;
};

// Resolve badges from visual.badges configuration
const resolveBadges = (badges, data) => {
  if (!badges || !Array.isArray(badges)) return [];
  
  return badges.map((badge, index) => {
    let text = '';
    
    if (badge.field) {
      text = data[badge.field] || '';
    } else if (badge.template) {
      text = resolveTemplate(badge.template, data);
    }
    
    if (!text) return null;
    
    return {
      key: `badge-${index}`,
      text,
      color: badge.color || '#757575'
    };
  }).filter(Boolean);
};

// Base node style
const baseNodeStyle = {
  padding: '12px 16px',
  borderRadius: '8px',
  border: '2px solid',
  minWidth: '160px',
  background: '#fff',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  '&:hover': {
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
};

// Node type configurations (UI only - fallback icons, colors come from backend)
const nodeIconMap = {
  'tag-input': InputIcon,
  'tag-output': OutputIcon,
  'math': CalculateIcon,
  'comparison': CompareArrowsIcon,
  'gate': MeetingRoomIcon,
  'script-js': CodeIcon,
  'constant': LooksIcon,
  'comment': CommentIcon,
};

// Generic custom node component
const CustomNode = ({ data, type, selected, id }) => {
  const theme = useTheme();
  
  // Get metadata from backend (includes color, icon, inputs, outputs)
  const metadata = getNodeMetadata(type);
  const Icon = nodeIconMap[type] || CodeIcon;
  const color = metadata.color || '#757575';
  const visual = metadata.visual || {};
  
  // Resolve visual properties
  let subtitle = resolveTemplate(visual.subtitle, data);
  
  // Special case for Constant node - show actual value
  if (type === 'constant' && !subtitle) {
    const valueType = data.valueType || 'number';
    switch (valueType) {
      case 'number':
        subtitle = data.numberValue !== undefined ? data.numberValue.toString() : '0';
        break;
      case 'string':
        subtitle = data.stringValue ? `"${data.stringValue}"` : '""';
        break;
      case 'boolean':
        subtitle = data.booleanValue ? 'true' : 'false';
        break;
      case 'json':
        subtitle = 'JSON';
        break;
    }
  }
  
  const dynamicIcon = resolveIcon(visual, data, null);
  const badges = resolveBadges(visual.badges, data);
  
  // Theme-aware colors
  const isDark = theme.palette.mode === 'dark';
  const nodeBgColor = isDark ? '#2a2a2a' : '#ffffff';
  const borderColor = isDark ? '#444' : '#ddd';
  const textColor = theme.palette.text.primary;
  const subtitleColor = theme.palette.text.secondary;
  
  // Use inputCount from node data if available (for new nodes or nodes with custom input counts)
  // Otherwise fall back to metadata inputs length (for nodes loaded from backend)
  // Handle both array format ([...]) and object format ({input0: {...}, input1: {...}})
  let inputCount;
  if (data.inputCount !== undefined) {
    inputCount = data.inputCount;
  } else if (Array.isArray(metadata.inputs)) {
    inputCount = metadata.inputs.length;
  } else if (metadata.inputs && typeof metadata.inputs === 'object') {
    inputCount = Object.keys(metadata.inputs).length;
  } else {
    inputCount = 0;
  }
  const hasInput = inputCount > 0;

  return (
    <>
      {/* Render multiple input handles based on inputCount */}
      {inputCount > 0 && Array.from({ length: inputCount }, (_, index) => {
        const spacing = inputCount > 1 ? (100 / (inputCount + 1)) : 50;
        const topPosition = `${spacing * (index + 1)}%`;
        
        // Get input type from metadata for handle coloring - support both array and object formats
        let inputDef;
        if (Array.isArray(metadata.inputs)) {
          inputDef = metadata.inputs[index];
        } else if (metadata.inputs && typeof metadata.inputs === 'object') {
          // For object format, get the Nth value from the object
          const inputKeys = Object.keys(metadata.inputs);
          const key = inputKeys[index];
          inputDef = key ? metadata.inputs[key] : undefined;
        }
        
        const inputType = inputDef?.type || 'main';
        const handleColor = getHandleColor(inputType);
        const inputName = inputDef?.displayName || `Input ${index}`;
        
        return (
          <Tooltip key={`input-${index}`} title={`${inputName} [${inputType}]`} placement="left" arrow>
            <Handle
              type="target"
              position={Position.Left}
              id={`input-${index}`}
              style={{
                width: 12,
                height: 12,
                background: handleColor,
                border: '2px solid white',
                top: topPosition,
                zIndex: 1,
              }}
            />
          </Tooltip>
        );
      })}
      <Box
        sx={{
          ...baseNodeStyle,
          background: nodeBgColor,
          borderColor: selected ? color : borderColor,
          borderWidth: selected ? 3 : 2,
          position: 'relative',
          color: textColor,
        }}
      >
        {/* Execution status badge */}
        {data?.executionStatus && (
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
                top: -10,
                left: -10,
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
                animation: data.executionStatus === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                '@keyframes pulse': {
                  '0%, 100%': {
                    opacity: 1,
                    transform: 'scale(1)',
                  },
                  '50%': {
                    opacity: 0.7,
                    transform: 'scale(1.1)',
                  },
                },
              }}
            >
              {data.executionStatus === 'success' && <CheckCircleIcon sx={{ fontSize: 16 }} />}
              {data.executionStatus === 'error' && <ErrorIcon sx={{ fontSize: 16 }} />}
              {data.executionStatus === 'running' && <HourglassEmptyIcon sx={{ fontSize: 16 }} />}
            </Box>
          </Tooltip>
        )}

        {/* Pin indicator badge */}
        {data?.hasPinnedData && (
          <Tooltip title="Has pinned data" placement="top">
            <Box
              sx={{
                position: 'absolute',
                top: -8,
                right: -8,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#ff9800',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                zIndex: 10,
              }}
            >
              <PushPinIcon sx={{ fontSize: 12 }} />
            </Box>
          </Tooltip>
        )}
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          {/* Execution order badge */}
          {data.executionOrder && (
            <Box
              sx={{
                minWidth: 24,
                height: 24,
                borderRadius: '50%',
                background: '#1976d2',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                boxShadow: '0 2px 4px rgba(25, 118, 210, 0.4)',
              }}
            >
              {data.executionOrder}
            </Box>
          )}
          {/* Icon box */}
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '6px',
              background: color,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'default',
              transition: 'all 0.2s ease',
            }}
          >
            {dynamicIcon ? (
              <Typography sx={{ fontSize: 18, lineHeight: 1 }}>{dynamicIcon}</Typography>
            ) : (
              <Icon sx={{ fontSize: 18 }} />
            )}
          </Box>
          <Typography variant="body2" fontWeight="600" sx={{ flex: 1 }}>
            {metadata.displayName || data.label || type}
          </Typography>
        </Box>
        
        {/* Subtitle from visual.subtitle */}
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
            {subtitle}
          </Typography>
        )}
        
        {/* Badges from visual.badges */}
        {badges.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {badges.map(badge => (
              <Chip
                key={badge.key}
                label={badge.text}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  bgcolor: `${badge.color}15`,
                  color: badge.color,
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        )}
        
        {data?.label && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {data.label}
          </Typography>
        )}
        {data?.tagName && (
          <Chip
            label={data.tagName}
            size="small"
            sx={{
              mt: 0.5,
              height: 20,
              fontSize: '0.7rem',
              bgcolor: `${color}15`,
              color: color,
            }}
          />
        )}
      </Box>
      {/* Render output handle with type-based color */}
      {(() => {
        // Handle both array and object formats for outputs
        let outputs;
        if (Array.isArray(metadata.outputs)) {
          outputs = metadata.outputs;
        } else if (metadata.outputs && typeof metadata.outputs === 'object') {
          // Convert object format {value: {...}, quality: {...}} to array format
          outputs = Object.entries(metadata.outputs).map(([key, output]) => ({
            ...output,
            key,
          }));
        } else {
          outputs = null;
        }
        
        if (!outputs || outputs.length === 0) {
          // Fallback for nodes without metadata
          return (
            <Handle
              type="source"
              position={Position.Right}
              style={{
                width: 12,
                height: 12,
                background: color,
                border: '2px solid white',
              }}
            />
          );
        }
        
        return outputs.map((output, index) => {
          const outputType = output.type || 'main';
          const handleColor = getHandleColor(outputType);
          const outputName = output.displayName || 'Output';
          
          return (
            <Tooltip key={`output-${index}`} title={`${outputName} [${outputType}]`} placement="right" arrow>
              <Handle
                type="source"
                position={Position.Right}
                id={index > 0 ? `output-${index}` : undefined}
                style={{
                  width: 12,
                  height: 12,
                  background: handleColor,
                  border: '2px solid white',
                  top: outputs.length > 1 ? `${(100 / (outputs.length + 1)) * (index + 1)}%` : '50%',
                }}
              />
            </Tooltip>
          );
        });
      })()}
    </>
  );
};

// Special Comment Node - displays as a resizable text box
const CommentNodeComponent = memo(({ data, selected }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  const metadata = getNodeMetadata('comment');
  const Icon = CommentIcon;
  const backgroundColor = data.backgroundColor || 'yellow';
  const fontSize = data.fontSize || 'medium';
  const text = data.text || 'Add your comment here...';
  
  // Background color mapping (adjusted for dark mode)
  const bgColors = isDark ? {
    yellow: '#3a3520',
    blue: '#1e2a3a',
    green: '#1e2e22',
    orange: '#3a2a1e',
    pink: '#3a1e2a',
    gray: '#2a2a2a',
  } : {
    yellow: '#FFF9C4',
    blue: '#BBDEFB',
    green: '#C8E6C9',
    orange: '#FFE0B2',
    pink: '#F8BBD0',
    gray: '#E0E0E0',
  };
  
  // Font size mapping
  const fontSizes = {
    small: '12px',
    medium: '14px',
    large: '16px',
  };
  
  return (
    <>
      <NodeResizer 
        minWidth={200} 
        minHeight={80}
        isVisible={selected}
        lineStyle={{ borderColor: '#FFC107', borderWidth: 2 }}
        handleStyle={{ 
          backgroundColor: '#FFC107',
          width: 10,
          height: 10,
          borderRadius: '50%',
        }}
      />
      <Box
        sx={{
          ...baseNodeStyle,
          borderColor: selected ? '#1976d2' : '#FFC107',
          background: bgColors[backgroundColor] || bgColors.yellow,
          width: '100%',
          height: '100%',
          minWidth: '200px',
          minHeight: '80px',
          padding: '8px',
          paddingTop: '24px',
          position: 'relative',
          overflow: 'auto',
        }}
      >
        <Box sx={{ position: 'absolute', top: '4px', left: '4px' }}>
          <Icon sx={{ color: '#FFA000', fontSize: 16 }} />
        </Box>
        <Typography 
          variant="body2" 
          sx={{ 
            fontSize: fontSizes[fontSize] || fontSizes.medium,
            whiteSpace: 'pre-wrap',
            color: theme.palette.text.primary,
            lineHeight: 1.5,
          }}
        >
          {text}
        </Typography>
      </Box>
    </>
  );
});

// Export individual node components
export const TagInputNode = memo((props) => <CustomNode {...props} type="tag-input" id={props.id} />);
export const TagOutputNode = memo((props) => <CustomNode {...props} type="tag-output" id={props.id} />);
export const MathNode = memo((props) => <CustomNode {...props} type="math" id={props.id} />);
export const ComparisonNode = memo((props) => <CustomNode {...props} type="comparison" id={props.id} />);
export const GateNode = memo((props) => <CustomNode {...props} type="gate" id={props.id} />);
export const ScriptJsNode = memo((props) => <CustomNode {...props} type="script-js" id={props.id} />);
export const ConstantNode = memo((props) => <CustomNode {...props} type="constant" id={props.id} />);
export const CommentNode = memo((props) => <CommentNodeComponent {...props} />);

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
