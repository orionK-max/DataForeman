import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InputIcon from '@mui/icons-material/Input';
import OutputIcon from '@mui/icons-material/Output';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PushPinIcon from '@mui/icons-material/PushPin';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

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

// Node type configurations
const nodeConfig = {
  'trigger-manual': { color: '#4caf50', icon: PlayArrowIcon, label: 'Manual Trigger', hasInput: false },
  'tag-input': { color: '#2196f3', icon: InputIcon, label: 'Tag Input' },
  'tag-output': { color: '#ff9800', icon: OutputIcon, label: 'Tag Output' },
  'math-add': { color: '#9c27b0', icon: AddIcon, label: 'Add' },
  'math-subtract': { color: '#9c27b0', icon: RemoveIcon, label: 'Subtract' },
  'math-multiply': { color: '#9c27b0', icon: CloseIcon, label: 'Multiply' },
  'math-divide': { color: '#9c27b0', icon: () => <span style={{ fontSize: '20px', fontWeight: 'bold' }}>/</span>, label: 'Divide' },
  'compare-gt': { color: '#e91e63', icon: () => <span style={{ fontSize: '20px', fontWeight: 'bold' }}>&gt;</span>, label: 'Greater Than' },
  'compare-lt': { color: '#e91e63', icon: () => <span style={{ fontSize: '20px', fontWeight: 'bold' }}>&lt;</span>, label: 'Less Than' },
  'compare-eq': { color: '#e91e63', icon: () => <span style={{ fontSize: '20px', fontWeight: 'bold' }}>=</span>, label: 'Equal' },
  'compare-neq': { color: '#e91e63', icon: () => <span style={{ fontSize: '20px', fontWeight: 'bold' }}>≠</span>, label: 'Not Equal' },
  'script-js': { color: '#f44336', icon: CodeIcon, label: 'JavaScript' },
};

// Generic custom node component
const CustomNode = ({ data, type, selected }) => {
  const config = nodeConfig[type] || { color: '#757575', icon: CodeIcon, label: type };
  const Icon = config.icon;
  const hasInput = config.hasInput !== false;

  return (
    <>
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 12,
            height: 12,
            background: config.color,
            border: '2px solid white',
          }}
        />
      )}
      <Box
        sx={{
          ...baseNodeStyle,
          borderColor: selected ? config.color : '#ddd',
          borderWidth: selected ? 3 : 2,
          position: 'relative',
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
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '6px',
              background: config.color,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon sx={{ fontSize: 18 }} />
          </Box>
          <Typography variant="body2" fontWeight="600" sx={{ flex: 1 }}>
            {config.label}
          </Typography>
        </Box>
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
              bgcolor: `${config.color}15`,
              color: config.color,
            }}
          />
        )}
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 12,
          height: 12,
          background: config.color,
          border: '2px solid white',
        }}
      />
    </>
  );
};

// Export individual node components
export const TriggerManualNode = memo((props) => <CustomNode {...props} type="trigger-manual" />);
export const TagInputNode = memo((props) => <CustomNode {...props} type="tag-input" />);
export const TagOutputNode = memo((props) => <CustomNode {...props} type="tag-output" />);
export const MathAddNode = memo((props) => <CustomNode {...props} type="math-add" />);
export const MathSubtractNode = memo((props) => <CustomNode {...props} type="math-subtract" />);
export const MathMultiplyNode = memo((props) => <CustomNode {...props} type="math-multiply" />);
export const MathDivideNode = memo((props) => <CustomNode {...props} type="math-divide" />);
export const CompareGtNode = memo((props) => <CustomNode {...props} type="compare-gt" />);
export const CompareLtNode = memo((props) => <CustomNode {...props} type="compare-lt" />);
export const CompareEqNode = memo((props) => <CustomNode {...props} type="compare-eq" />);
export const CompareNeqNode = memo((props) => <CustomNode {...props} type="compare-neq" />);
export const ScriptJsNode = memo((props) => <CustomNode {...props} type="script-js" />);

// Export node types object for ReactFlow
export const nodeTypes = {
  'trigger-manual': TriggerManualNode,
  'tag-input': TagInputNode,
  'tag-output': TagOutputNode,
  'math-add': MathAddNode,
  'math-subtract': MathSubtractNode,
  'math-multiply': MathMultiplyNode,
  'math-divide': MathDivideNode,
  'compare-gt': CompareGtNode,
  'compare-lt': CompareLtNode,
  'compare-eq': CompareEqNode,
  'compare-neq': CompareNeqNode,
  'script-js': ScriptJsNode,
};
