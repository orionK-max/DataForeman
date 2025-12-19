/**
 * FolderTree Component
 * 
 * Reusable collapsible tree view for folders (dashboards or charts)
 */

import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Home as HomeIcon,
  People as PeopleIcon,
} from '@mui/icons-material';

/**
 * Single folder tree node
 */
function FolderNode({
  folder,
  level = 0,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreateSubfolder,
  enableFolderActions = true,
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedId === folder.id;

  const handleToggle = (e) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleSelect = () => {
    onSelect(folder.id);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(folder);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(folder);
  };

  const handleCreateSubfolder = (e) => {
    e.stopPropagation();
    onCreateSubfolder?.(folder);
  };

  return (
    <>
      <ListItem
        disablePadding
        sx={{ 
          pl: level * 2,
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover .folder-actions': {
            opacity: 1,
          },
        }}
        secondaryAction={
          enableFolderActions ? (
            <Box 
              className="folder-actions"
              sx={{ 
                display: 'flex', 
                gap: 0.5,
                opacity: 0,
                transition: 'opacity 0.2s',
              }}
            >
              <Tooltip title="New subfolder">
                <IconButton size="small" onClick={handleCreateSubfolder}>
                  <CreateNewFolderIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit folder">
                <IconButton size="small" onClick={handleEdit}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete folder">
                <IconButton size="small" onClick={handleDelete}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ) : null
        }
      >
        <ListItemButton onClick={handleSelect} sx={{ py: 0.5 }}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            {hasChildren && (
              <IconButton size="small" onClick={handleToggle} sx={{ p: 0, mr: 0.5 }}>
                {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
            )}
            {!hasChildren && <Box sx={{ width: 20 }} />}
            {expanded ? 
              <FolderOpenIcon fontSize="small" color={isSelected ? 'primary' : 'action'} /> : 
              <FolderIcon fontSize="small" color={isSelected ? 'primary' : 'action'} />
            }
          </ListItemIcon>
          <ListItemText 
            primary={folder.name}
            primaryTypographyProps={{
              variant: 'body2',
              fontWeight: isSelected ? 600 : 400,
            }}
          />
        </ListItemButton>
      </ListItem>

      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {folder.children.map(child => (
              <FolderNode
                key={child.id}
                folder={child}
                level={level + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onCreateSubfolder={onCreateSubfolder}
                enableFolderActions={enableFolderActions}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
}

/**
 * FolderTree Component
 */
export default function FolderTree({
  folders = [],
  selectedFolderId = null,
  onSelectFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  showRootOption = true,
  rootLabel = 'Home',
  showSharedOption = false,
  onSelectShared,
  isSharedView = false,
  emptyMessage = 'No folders yet',
  enableFolderActions = true,
}) {
  const handleSelectRoot = () => {
    onSelectFolder(null);
  };

  const handleCreateRootFolder = () => {
    onCreateFolder?.(null); // null parent = root folder
  };

  const handleSelectShared = () => {
    if (onSelectShared) {
      onSelectShared();
    }
  };

  return (
    <Box sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {/* Root/Home Option with New Folder Button */}
      {showRootOption && (
        <ListItem
          disablePadding
          sx={{
            bgcolor: selectedFolderId === null && !isSharedView ? 'action.selected' : 'transparent',
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
          }}
        >
          <ListItemButton onClick={handleSelectRoot} sx={{ py: 1, flex: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <HomeIcon color={selectedFolderId === null && !isSharedView ? 'primary' : 'action'} />
            </ListItemIcon>
            <ListItemText 
              primary={rootLabel}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: selectedFolderId === null && !isSharedView ? 600 : 400,
              }}
            />
          </ListItemButton>
          {enableFolderActions && (
            <Tooltip title="New Folder">
              <IconButton 
                size="small" 
                onClick={handleCreateRootFolder}
                sx={{ mr: 1 }}
              >
                <CreateNewFolderIcon fontSize="small" color="primary" />
              </IconButton>
            </Tooltip>
          )}
        </ListItem>
      )}

      {/* Shared Dashboards Option */}
      {showSharedOption && (
        <ListItem
          disablePadding
          sx={{
            bgcolor: isSharedView ? 'action.selected' : 'transparent',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <ListItemButton onClick={handleSelectShared} sx={{ py: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <PeopleIcon color={isSharedView ? 'primary' : 'action'} />
            </ListItemIcon>
            <ListItemText 
              primary="Shared with Me"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: isSharedView ? 600 : 400,
              }}
            />
          </ListItemButton>
        </ListItem>
      )}

      {/* Folder Tree */}
      {folders.length > 0 ? (
        <List component="nav" disablePadding>
          {folders.map(folder => (
            <FolderNode
              key={folder.id}
              folder={folder}
              selectedId={selectedFolderId}
              onSelect={onSelectFolder}
              onEdit={onEditFolder}
              onDelete={onDeleteFolder}
              onCreateSubfolder={(parent) => onCreateFolder(parent.id)}
              enableFolderActions={enableFolderActions}
            />
          ))}
        </List>
      ) : (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {emptyMessage}
          </Typography>
        </Box>
      )}

    </Box>
  );
}
