import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  IconButton,
  Chip,
  Typography,
  Box,
} from '@mui/material';
import {
  DriveFileMove as MoveIcon,
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  PlayArrow as ExecuteIcon,
  Monitor as ResourceMonitorIcon,
  ArrowUpward as SortAscIcon,
  ArrowDownward as SortDescIcon,
} from '@mui/icons-material';

/**
 * BrowserTable - Universal table view for flows, charts, and dashboards
 * 
 * Displays items in a table format with:
 * - Type-specific columns
 * - Multi-select checkboxes (when bulk mode enabled)
 * - Row actions
 * - Folder path display (when flattened)
 * 
 * @param {Array} items - Items to display (flows/charts/dashboards)
 * @param {string} type - Item type: 'flow', 'chart', 'dashboard'
 * @param {Set} selectedItems - Set of selected item IDs
 * @param {boolean} bulkActionMode - Whether bulk selection is enabled
 * @param {boolean} flattenHierarchy - Show folder paths in table
 * @param {Function} onToggleItem - Handler for checkbox toggle
 * @param {Function} onNavigate - Handler for row click
 * @param {Function} onMove - Handler for move action
 * @param {Function} onDuplicate - Handler for duplicate action
 * @param {Function} onDelete - Handler for delete action
 * @param {Function} onExecute - Handler for execute action (flows only)
 * @param {Function} onResourceMonitor - Handler for resource monitor (flows only)
 * @param {boolean} isOwner - Whether current user owns items
 * @param {string} viewMode - Current view mode ('all', 'mine', 'shared')
 * @param {Object} permissions - Permission object for dashboards
 * @param {string} sortColumn - Current sort column ID
 * @param {string} sortDirection - Current sort direction ('asc' or 'desc')
 * @param {Function} onSort - Handler for column sort
 */
const BrowserTable = ({
  items = [],
  type,
  selectedItems = new Set(),
  bulkActionMode = false,
  flattenHierarchy = false,
  onToggleItem,
  onNavigate,
  onMove,
  onDuplicate,
  onDelete,
  onExecute,
  onResourceMonitor,
  isOwner = true,
  viewMode = 'all',
  permissions = {},
  sortColumn = 'updated_at',
  sortDirection = 'desc',
  onSort,
}) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFolderPath = (item) => {
    // Extract folder path from item's folder metadata
    if (!item.folder_name) return 'Home';
    return item.folder_name;
  };

  const getSortValue = (item, columnId) => {
    switch (columnId) {
      case 'name':
        return item.name?.toLowerCase() || '';
      case 'description':
        return item.description?.toLowerCase() || '';
      case 'folder':
        return getFolderPath(item).toLowerCase();
      case 'execution_mode':
        return item.execution_mode || '';
      case 'is_deployed':
        return item.deployed ? 1 : 0;
      case 'widget_count':
        return item.layout?.items?.length || 0;
      case 'updated_at':
        return new Date(item.updated_at || 0).getTime();
      default:
        return '';
    }
  };

  const sortedItems = [...items].sort((a, b) => {
    const aValue = getSortValue(a, sortColumn);
    const bValue = getSortValue(b, sortColumn);
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getColumns = () => {
    const baseColumns = [
      { id: 'name', label: 'Name', width: '25%' },
      { id: 'description', label: 'Description', width: '25%' },
    ];

    if (flattenHierarchy) {
      baseColumns.splice(1, 0, { id: 'folder', label: 'Folder', width: '12%' });
    }

    switch (type) {
      case 'flow':
        return [
          ...baseColumns,
          { id: 'execution_mode', label: 'Mode', width: '8%' },
          { id: 'is_deployed', label: 'Status', width: '8%' },
          { id: 'updated_at', label: 'Updated', width: '12%' },
          { id: 'action_move', label: 'Move', width: '5%', align: 'center' },
          { id: 'action_duplicate', label: 'Copy', width: '5%', align: 'center' },
          { id: 'action_delete', label: 'Delete', width: '5%', align: 'center' },
          { id: 'action_execute', label: 'Run', width: '5%', align: 'center' },
          { id: 'action_monitor', label: 'Monitor', width: '5%', align: 'center' },
        ];
      case 'chart':
        return [
          ...baseColumns,
          { id: 'updated_at', label: 'Updated', width: '15%' },
          { id: 'action_move', label: 'Move', width: '8%', align: 'center' },
          { id: 'action_duplicate', label: 'Copy', width: '8%', align: 'center' },
          { id: 'action_delete', label: 'Delete', width: '8%', align: 'center' },
        ];
      case 'dashboard':
        return [
          ...baseColumns,
          { id: 'widget_count', label: 'Widgets', width: '8%' },
          { id: 'updated_at', label: 'Updated', width: '12%' },
          { id: 'action_move', label: 'Move', width: '8%', align: 'center' },
          { id: 'action_duplicate', label: 'Copy', width: '8%', align: 'center' },
          { id: 'action_delete', label: 'Delete', width: '8%', align: 'center' },
        ];
      default:
        return baseColumns;
    }
  };

  const renderCellContent = (item, columnId) => {
    switch (columnId) {
      case 'name':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {item.name}
            </Typography>
            {item.is_shared && (
              <Chip label="Shared" size="small" color="primary" sx={{ height: 20 }} />
            )}
            {viewMode === 'shared' && !item.is_owner && (
              <Chip label="Read Only" size="small" variant="outlined" sx={{ height: 20 }} />
            )}
          </Box>
        );
      
      case 'folder':
        return (
          <Typography variant="body2" color="text.secondary">
            {getFolderPath(item)}
          </Typography>
        );
      
      case 'description':
        return (
          <Typography 
            variant="body2" 
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={item.description || ''}
          >
            {item.description || 'No description'}
          </Typography>
        );
      
      case 'execution_mode':
        return item.execution_mode ? (
          <Chip 
            label={item.execution_mode === 'auto' ? 'Auto' : 'Manual'} 
            size="small"
            color={item.execution_mode === 'auto' ? 'success' : 'default'}
            sx={{ height: 20 }}
          />
        ) : null;
      
      case 'is_deployed':
        return item.is_deployed !== undefined ? (
          <Chip 
            label={item.is_deployed ? 'Deployed' : 'Draft'} 
            size="small"
            color={item.is_deployed ? 'success' : 'default'}
            sx={{ height: 20 }}
          />
        ) : null;
      
      case 'widget_count':
        return (
          <Typography variant="body2">
            {item.layout?.items?.length || 0}
          </Typography>
        );
      
      case 'updated_at':
        return (
          <Typography variant="body2" color="text.secondary">
            {formatDate(item.updated_at)}
          </Typography>
        );
      
      // Separate action columns
      case 'action_move':
        return isOwner && viewMode !== 'shared' && onMove ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onMove(e, item);
            }}
            title="Move to folder"
          >
            <MoveIcon fontSize="small" />
          </IconButton>
        ) : null;
      
      case 'action_duplicate':
        return ((type === 'dashboard' && permissions.canCreate) || (type !== 'dashboard' && isOwner)) && onDuplicate ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(item);
            }}
            title="Duplicate"
          >
            <DuplicateIcon fontSize="small" />
          </IconButton>
        ) : null;
      
      case 'action_delete':
        return ((type === 'dashboard' && item.is_owner && permissions.canDelete) || (type !== 'dashboard' && isOwner)) && onDelete ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            title="Delete"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        ) : null;
      
      case 'action_execute':
        return type === 'flow' && item.execution_mode === 'manual' && onExecute ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onExecute(item);
            }}
            title="Execute"
          >
            <ExecuteIcon fontSize="small" />
          </IconButton>
        ) : null;
      
      case 'action_monitor':
        return type === 'flow' && item.deployed && onResourceMonitor ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onResourceMonitor(item);
            }}
            title="Resource Monitor"
          >
            <ResourceMonitorIcon fontSize="small" />
          </IconButton>
        ) : null;
      
      default:
        return item[columnId];
    }
  };

  const columns = getColumns();

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {bulkActionMode && (
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedItems.size > 0 && selectedItems.size < items.length}
                  checked={items.length > 0 && selectedItems.size === items.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      items.forEach(item => onToggleItem?.(item.id));
                    } else {
                      selectedItems.forEach(id => onToggleItem?.(id));
                    }
                  }}
                />
              </TableCell>
            )}
            {columns.map((column) => {
              const isSortable = !column.id.startsWith('action_');
              const isSorted = sortColumn === column.id;
              
              return (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  sx={{ 
                    width: column.width,
                    fontWeight: 600,
                    cursor: isSortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    '&:hover': isSortable ? {
                      backgroundColor: 'action.hover',
                    } : {},
                  }}
                  onClick={() => isSortable && onSort?.(column.id)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: column.align === 'center' ? 'center' : 'flex-start' }}>
                    {column.label}
                    {isSortable && isSorted && (
                      sortDirection === 'asc' ? 
                        <SortAscIcon fontSize="small" /> : 
                        <SortDescIcon fontSize="small" />
                    )}
                  </Box>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedItems.map((item) => (
            <TableRow
              key={item.id}
              hover
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
                ...(selectedItems.has(item.id) && {
                  backgroundColor: 'action.selected',
                }),
              }}
              onClick={() => onNavigate?.(item)}
            >
              {bulkActionMode && (
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onChange={() => onToggleItem?.(item.id)}
                  />
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                >
                  {renderCellContent(item, column.id)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {sortedItems.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length + (bulkActionMode ? 1 : 0)}
                align="center"
                sx={{ py: 4 }}
              >
                <Typography color="text.secondary">
                  No items to display
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default BrowserTable;
