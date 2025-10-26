/**
 * FolderDialog Component
 * 
 * Dialog for creating and editing folders
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from '@mui/material';

/**
 * Flatten folder tree for parent selection dropdown
 */
function flattenFolders(folders, level = 0, excludeId = null) {
  let result = [];
  
  for (const folder of folders) {
    // Skip the folder being edited (can't be its own parent)
    if (folder.id === excludeId) {
      continue;
    }
    
    result.push({
      ...folder,
      level,
      indent: '  '.repeat(level),
    });
    
    if (folder.children && folder.children.length > 0) {
      result = result.concat(flattenFolders(folder.children, level + 1, excludeId));
    }
  }
  
  return result;
}

/**
 * FolderDialog Component
 */
export default function FolderDialog({
  open,
  onClose,
  onSave,
  folder = null,
  parentFolderId = null,
  allFolders = [],
  mode = 'create', // 'create' or 'edit'
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [errors, setErrors] = useState({});

  // Initialize form when dialog opens or folder changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && folder) {
        setName(folder.name || '');
        setDescription(folder.description || '');
        setSelectedParentId(folder.parent_folder_id || '');
      } else {
        setName('');
        setDescription('');
        setSelectedParentId(parentFolderId || '');
      }
      setErrors({});
    }
  }, [open, folder, parentFolderId, mode]);

  const validate = () => {
    const newErrors = {};
    
    if (!name.trim()) {
      newErrors.name = 'Folder name is required';
    } else if (name.trim().length > 255) {
      newErrors.name = 'Folder name must be 255 characters or less';
    }
    
    if (description && description.length > 5000) {
      newErrors.description = 'Description must be 5000 characters or less';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      return;
    }

    const folderData = {
      name: name.trim(),
      description: description.trim() || null,
      parent_folder_id: selectedParentId || null,
    };

    onSave(folderData);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  // Flatten folders for dropdown, excluding current folder when editing
  const flatFolders = flattenFolders(
    allFolders, 
    0, 
    mode === 'edit' && folder ? folder.id : null
  );

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {mode === 'edit' ? 'Edit Folder' : 'Create New Folder'}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* Folder Name */}
          <TextField
            label="Folder Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            error={!!errors.name}
            helperText={errors.name}
            fullWidth
            autoFocus
            required
            inputProps={{ maxLength: 255 }}
          />

          {/* Description */}
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={!!errors.description}
            helperText={errors.description}
            fullWidth
            multiline
            rows={3}
            inputProps={{ maxLength: 5000 }}
          />

          {/* Parent Folder */}
          <FormControl fullWidth>
            <InputLabel id="parent-folder-label">Parent Folder</InputLabel>
            <Select
              labelId="parent-folder-label"
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              label="Parent Folder"
            >
              <MenuItem value="">
                <em>None (Root Level)</em>
              </MenuItem>
              {flatFolders.map((folder) => (
                <MenuItem key={folder.id} value={folder.id}>
                  {folder.indent}{folder.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={!name.trim()}
        >
          {mode === 'edit' ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
