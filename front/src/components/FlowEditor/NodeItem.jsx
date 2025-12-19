import React from 'react';
import {
  ListItem,
  ListItemButton,
  Box,
  Typography,
  Tooltip,
} from '@mui/material';
import { getBackendMetadata, getNodeMetadata } from '../../constants/nodeTypes';

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
  // Only render node types that exist in the backend-provided registry.
  // This avoids showing stale localStorage RECENT entries on a new installation.
  const backendMeta = getBackendMetadata(nodeType);
  if (!backendMeta) return null;

  const metadata = getNodeMetadata(nodeType);

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
