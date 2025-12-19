import React from 'react';
import {
  Box,
  Toolbar,
  Typography,
  IconButton,
  Button,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  DriveFileMove as MoveIcon,
  Delete as DeleteIcon,
  SelectAll as SelectAllIcon,
  Deselect as DeselectIcon,
} from '@mui/icons-material';

/**
 * BulkActionToolbar - Toolbar for bulk operations on selected items
 * 
 * Displays when items are selected in bulk mode, showing:
 * - Selected count
 * - Select all/clear buttons
 * - Bulk action buttons (move, delete)
 * 
 * @param {number} selectedCount - Number of selected items
 * @param {Function} onSelectAll - Handler for select all
 * @param {Function} onClearSelection - Handler for clear selection
 * @param {Function} onBulkMove - Handler for bulk move to folder
 * @param {Function} onBulkDelete - Handler for bulk delete
 */
const BulkActionToolbar = ({
  selectedCount = 0,
  onSelectAll,
  onClearSelection,
  onBulkMove,
  onBulkDelete,
}) => {
  const hasSelection = selectedCount > 0;
  
  return (
    <Toolbar
      sx={{
        pl: { sm: 1.5 },
        pr: { xs: 1, sm: 1 },
        bgcolor: hasSelection ? 'primary.main' : 'action.disabledBackground',
        color: hasSelection ? 'primary.contrastText' : 'text.disabled',
        borderRadius: 1,
        mb: 2,
        minHeight: '40px !important',
        height: '40px',
        opacity: hasSelection ? 1 : 0.6,
      }}
    >
      <Typography
        sx={{ flex: '1 1 100%' }}
        color="inherit"
        variant="body2"
        component="div"
      >
        {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
      </Typography>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <Tooltip title="Select all">
          <IconButton size="small" color="inherit" onClick={onSelectAll}>
            <SelectAllIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Clear selection">
          <span>
            <IconButton size="small" color="inherit" onClick={onClearSelection} disabled={selectedCount === 0}>
              <DeselectIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, bgcolor: 'rgba(255,255,255,0.3)' }} />

        <Tooltip title="Move selected to folder">
          <span>
            <IconButton 
              size="small"
              color="inherit" 
              onClick={onBulkMove}
              disabled={selectedCount === 0}
            >
              <MoveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Delete selected">
          <span>
            <IconButton 
              size="small"
              color="inherit" 
              onClick={onBulkDelete}
              disabled={selectedCount === 0}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Toolbar>
  );
};

export default BulkActionToolbar;
