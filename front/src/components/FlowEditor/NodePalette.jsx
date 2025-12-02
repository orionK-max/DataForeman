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
  Input as InputIcon,
  Output as OutputIcon,
  Functions as MathIcon,
  CompareArrows as CompareIcon,
  Code as ScriptIcon,
} from '@mui/icons-material';

const nodeTypes = [
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
    type: 'math',
    label: 'Math',
    icon: <MathIcon />,
    description: 'Perform mathematical operations'
  },
  {
    type: 'comparison',
    label: 'Comparison',
    icon: <CompareIcon />,
    description: 'Compare two values'
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
