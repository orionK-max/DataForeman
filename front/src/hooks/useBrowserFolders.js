import { useState, useEffect, useCallback } from 'react';
import folderService from '../services/folderService';

/**
 * Universal Browser Folders Hook
 * 
 * Consolidates all folder management logic for Flow, Chart, and Dashboard browsers.
 * Provides state management, handlers, and filtering logic for folder operations.
 * 
 * @param {string} folderType - FOLDER_TYPES constant ('flow', 'chart', 'dashboard')
 * @param {Array} items - Array of items to filter (flows, charts, or dashboards)
 * @param {Function} onReload - Callback to reload items after operations
 * @returns {Object} Folder state, handlers, and filtered items
 */
export function useBrowserFolders(folderType, items = [], onReload = null) {
  // State
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'mine' | 'shared'
  const [displayMode, setDisplayMode] = useState('table'); // 'card' | 'table' - default to table
  const [flattenHierarchy, setFlattenHierarchy] = useState(false);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState('updated_at');
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
  
  // Multi-select state
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(true); // Default true since table is default
  
  // Dialog state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState('create'); // 'create' | 'edit'
  const [editingFolder, setEditingFolder] = useState(null);
  const [parentFolderId, setParentFolderId] = useState(null);
  
  // Move state
  const [moveMenuAnchor, setMoveMenuAnchor] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  
  // Error handling
  const [error, setError] = useState(null);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, [folderType]);

  /**
   * Load folder tree from backend
   */
  const loadFolders = useCallback(async () => {
    try {
      const tree = await folderService.getFolderTree(folderType);
      setFolders(tree);
      setError(null);
    } catch (err) {
      console.error('Error loading folders:', err);
      setError(err.message);
    }
  }, [folderType]);

  /**
   * Select a folder
   */
  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    setViewMode('all');
  }, []);

  /**
   * Switch to "Shared with Me" view
   */
  const handleSelectShared = useCallback(() => {
    setSelectedFolderId(null);
    setViewMode('shared');
  }, []);

  /**
   * Switch to "My Items" view
   */
  const handleSelectMine = useCallback(() => {
    setSelectedFolderId(null);
    setViewMode('mine');
  }, []);

  /**
   * Open dialog to create a new folder
   */
  const handleCreateFolder = useCallback((parentId = null) => {
    setParentFolderId(parentId);
    setEditingFolder(null);
    setFolderDialogMode('create');
    setFolderDialogOpen(true);
  }, []);

  /**
   * Open dialog to edit an existing folder
   */
  const handleEditFolder = useCallback((folder) => {
    setEditingFolder(folder);
    setFolderDialogMode('edit');
    setFolderDialogOpen(true);
  }, []);

  /**
   * Open delete confirmation for a folder
   */
  const handleDeleteFolder = useCallback((folder) => {
    setFolderToDelete(folder);
    setDeleteConfirmOpen(true);
  }, []);

  /**
   * Confirm and execute folder deletion
   */
  const confirmDeleteFolder = useCallback(async () => {
    if (!folderToDelete) return;
    
    try {
      setDeletingFolder(true);
      await folderService.deleteFolder(folderType, folderToDelete.id);
      await loadFolders();
      
      // If currently viewing this folder, switch to all items
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(null);
      }
      
      setDeleteConfirmOpen(false);
      setFolderToDelete(null);
      setError(null);
      
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setDeletingFolder(false);
    }
  }, [folderToDelete, folderType, selectedFolderId, loadFolders]);

  /**
   * Cancel folder deletion
   */
  const cancelDeleteFolder = useCallback(() => {
    setDeleteConfirmOpen(false);
    setFolderToDelete(null);
  }, []);

  /**
   * Save folder (create or update)
   */
  const handleSaveFolder = useCallback(async (folderData) => {
    try {
      if (folderDialogMode === 'edit' && editingFolder) {
        await folderService.updateFolder(folderType, editingFolder.id, folderData);
      } else {
        await folderService.createFolder(folderType, folderData);
      }
      
      await loadFolders();
      setFolderDialogOpen(false);
      setError(null);
      
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [folderDialogMode, editingFolder, folderType, loadFolders]);

  /**
   * Open move menu for an item
   */
  const handleOpenMoveMenu = useCallback((event, item) => {
    setMoveMenuAnchor(event.currentTarget);
    setMovingItem(item);
  }, []);

  /**
   * Close move menu
   */
  const handleCloseMoveMenu = useCallback(() => {
    setMoveMenuAnchor(null);
    setMovingItem(null);
  }, []);

  /**
   * Move item to a folder
   */
  const handleMoveItem = useCallback(async (folderId) => {
    if (!movingItem) return;
    
    try {
      await folderService.moveItemToFolder(
        folderType,
        movingItem.id,
        folderId,
        0
      );
      
      if (onReload) {
        await onReload();
      }
      
      handleCloseMoveMenu();
      setError(null);
      
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [movingItem, folderType, onReload, handleCloseMoveMenu]);

  /**
   * Filter items by selected folder and view mode
   * Handles different data structures for flows, charts, and dashboards
   */
  const getFilteredItems = useCallback(() => {
    if (!items || items.length === 0) {
      return [];
    }

    // Determine the folder field name based on item structure
    // Charts use options.folder_id, others use folder_id
    const getFolderId = (item) => {
      if (item.options?.folder_id !== undefined) {
        return item.options.folder_id;
      }
      return item.folder_id;
    };

    // Apply view mode filter first
    if (viewMode === 'shared') {
      // Show items shared with me (not owned by me)
      return items.filter(item => {
        if (item.shared !== undefined) {
          return item.shared && !item.is_owner;
        }
        if (item.is_shared !== undefined) {
          return item.is_shared && !item.is_owner;
        }
        return false;
      });
    }

    if (viewMode === 'mine') {
      // Show all my items regardless of folder
      return items.filter(item => item.is_owner !== false);
    }

    // viewMode === 'all' - filter by selected folder
    if (selectedFolderId === null) {
      // Show only root-level items (no folder assigned)
      return items.filter(item => {
        const folderId = getFolderId(item);
        return folderId === null || folderId === undefined;
      });
    }

    // Show items in selected folder
    return items.filter(item => getFolderId(item) === selectedFolderId);
  }, [items, viewMode, selectedFolderId]);

  /**
   * Flatten folder tree for move menu/dialog
   */
  const flattenFolders = useCallback((folders, level = 0) => {
    let result = [];
    for (const folder of folders) {
      result.push({ ...folder, level });
      if (folder.children && folder.children.length > 0) {
        result = result.concat(flattenFolders(folder.children, level + 1));
      }
    }
    return result;
  }, []);

  // Calculate filtered items and flat folders early (needed by callbacks)
  const filteredItems = getFilteredItems();
  const flatFolders = flattenFolders(folders);

  /**
   * Multi-select handlers
   */
  const handleToggleItem = useCallback((itemId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedItems(new Set(filteredItems.map(item => item.id)));
  }, [filteredItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const handleToggleBulkMode = useCallback(() => {
    setBulkActionMode(prev => !prev);
    if (bulkActionMode) {
      setSelectedItems(new Set());
    }
  }, [bulkActionMode]);

  /**
   * Display mode handlers
   */
  const handleToggleDisplayMode = useCallback(() => {
    setDisplayMode(prev => {
      const newMode = prev === 'card' ? 'table' : 'card';
      // Auto-enable bulk mode in table view (always on for table view)
      setBulkActionMode(newMode === 'table');
      if (newMode === 'card') {
        // Clear selection when switching back to card view
        setSelectedItems(new Set());
      }
      return newMode;
    });
  }, []);

  const handleToggleFlatten = useCallback(() => {
    setFlattenHierarchy(prev => !prev);
  }, []);

  /**
   * Sorting handlers
   */
  const handleSort = useCallback((columnId) => {
    if (sortColumn === columnId) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  return {
    // State
    folders,
    selectedFolderId,
    viewMode,
    displayMode,
    flattenHierarchy,
    filteredItems,
    flatFolders,
    error,
    
    // Sorting state
    sortColumn,
    sortDirection,
    
    // Multi-select state
    selectedItems,
    bulkActionMode,
    
    // Dialog state
    folderDialogOpen,
    folderDialogMode,
    editingFolder,
    parentFolderId,
    
    // Move state
    moveMenuAnchor,
    movingItem,
    
    // Delete state
    deleteConfirmOpen,
    folderToDelete,
    deletingFolder,
    
    // Handlers
    handleSelectFolder,
    handleSelectShared,
    handleSelectMine,
    handleCreateFolder,
    handleEditFolder,
    handleDeleteFolder,
    confirmDeleteFolder,
    cancelDeleteFolder,
    handleSaveFolder,
    handleOpenMoveMenu,
    handleCloseMoveMenu,
    handleMoveItem,
    
    // Multi-select handlers
    handleToggleItem,
    handleSelectAll,
    handleClearSelection,
    handleToggleBulkMode,
    
    // Display mode handlers
    handleToggleDisplayMode,
    handleToggleFlatten,
    
    // Sorting handlers
    handleSort,
    
    // Utilities
    loadFolders,
    setError,
    setFolderDialogOpen,
  };
}
