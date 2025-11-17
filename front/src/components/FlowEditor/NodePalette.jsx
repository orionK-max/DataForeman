import React from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  PlayCircle as TriggerIcon,
  Input as InputIcon,
  Output as OutputIcon,
  Functions as MathIcon,
  CompareArrows as CompareIcon,
  Code as ScriptIcon,
} from '@mui/icons-material';

const nodeTypes = [
  {
    type: 'trigger-manual',
    label: 'Manual Trigger',
    icon: <TriggerIcon />,
    description: 'Start flow manually'
  },
  {
    type: 'tag-input',
    label: 'Tag Input',
    icon: <InputIcon />,
    description: 'Read tag value'
  },
  {
    type: 'tag-output',
    label: 'Tag Output',
    icon: <OutputIcon />,
    description: 'Write tag value'
  },
  {
    type: 'math-add',
    label: 'Math: Add',
    icon: <MathIcon />,
    description: 'Add values'
  },
  {
    type: 'math-subtract',
    label: 'Math: Subtract',
    icon: <MathIcon />,
    description: 'Subtract values'
  },
  {
    type: 'math-multiply',
    label: 'Math: Multiply',
    icon: <MathIcon />,
    description: 'Multiply values'
  },
  {
    type: 'math-divide',
    label: 'Math: Divide',
    icon: <MathIcon />,
    description: 'Divide values'
  },
  {
    type: 'compare-gt',
    label: 'Compare: >',
    icon: <CompareIcon />,
    description: 'Greater than'
  },
  {
    type: 'compare-lt',
    label: 'Compare: <',
    icon: <CompareIcon />,
    description: 'Less than'
  },
  {
    type: 'compare-eq',
    label: 'Compare: ==',
    icon: <CompareIcon />,
    description: 'Equal to'
  },
  {
    type: 'compare-neq',
    label: 'Compare: !=',
    icon: <CompareIcon />,
    description: 'Not equal to'
  },
  {
    type: 'script-js',
    label: 'JavaScript',
    icon: <ScriptIcon />,
    description: 'Custom script'
  },
];

const NodePalette = () => {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Paper
      elevation={2}
      sx={{
        width: 250,
        height: '100%',
        overflow: 'auto',
        borderRight: '1px solid rgba(0, 0, 0, 0.12)'
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Node Palette
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Drag nodes onto the canvas
        </Typography>
      </Box>
      
      <Divider />
      
      <List>
        {nodeTypes.map((node) => (
          <ListItem
            key={node.type}
            draggable
            onDragStart={(event) => onDragStart(event, node.type)}
            sx={{
              cursor: 'grab',
              '&:hover': {
                bgcolor: 'action.hover'
              },
              '&:active': {
                cursor: 'grabbing'
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              {node.icon}
            </ListItemIcon>
            <ListItemText
              primary={node.label}
              secondary={node.description}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};

export default NodePalette;
