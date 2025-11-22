import React from 'react';
import {
  ListItem,
  ListItemButton,
  Box,
  Typography,
  Tooltip,
} from '@mui/material';
import { getNodeMetadata } from '../../constants/nodeTypes';

/**
 * NodeItem - Individual node card in the browser
 * 
 * Features:
 * - Click to add node to center of canvas
 * - Drag to add node at specific position
 * - Shows icon, name, and description
 * - Color-coded by node type
 */
const NodeItem = ({ nodeType, onAddNode, onDragStart }) => {
  const metadata = getNodeMetadata(nodeType);

  if (!metadata) {
    console.warn('Unknown node type:', nodeType);
    return null;
  }

  const handleClick = () => {
    onAddNode(nodeType, null); // null position means center of canvas
  };

  const handleDragStartInternal = (event) => {
    onDragStart(event, nodeType);
  };

  return (
    <Tooltip 
      title={metadata.description} 
      placement="left"
      enterDelay={500}
    >
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <ListItemButton
          onClick={handleClick}
          draggable
          onDragStart={handleDragStartInternal}
          sx={{
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            '&:hover': {
              borderColor: metadata.color,
              bgcolor: 'action.hover',
            },
            cursor: 'grab',
            '&:active': {
              cursor: 'grabbing',
            },
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: metadata.color,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              mr: 1.5,
              flexShrink: 0,
            }}
          >
            {metadata.icon}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {metadata.displayName}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {metadata.description}
            </Typography>
          </Box>
        </ListItemButton>
      </ListItem>
    </Tooltip>
  );
};

export default NodeItem;
