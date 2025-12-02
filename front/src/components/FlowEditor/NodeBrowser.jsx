import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  Divider,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import {
  getRecentNodes,
  addToRecentNodes,
  searchNodes,
  getOrganizedNodes,
  getCategories,
} from '../../constants/nodeTypes';
import NodeItem from './NodeItem';

/**
 * Node Browser - Organized, searchable node selector panel
 * 
 * Features:
 * - Search with debouncing (300ms)
 * - Keyboard shortcuts (/ to open, Esc to close)
 * - Recent nodes section
 * - Expandable category sections
 * - Click or drag to add nodes
 */
const NodeBrowser = ({ open, onClose, onAddNode }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(['tag-operations']);
  const [recentNodes, setRecentNodes] = useState([]);

  // Debounce search term (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load recent nodes on mount and when browser opens
  useEffect(() => {
    if (open) {
      setRecentNodes(getRecentNodes(5));
    }
  }, [open]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // "/" to open and focus search (only if not already typing in an input)
      if (event.key === '/' && !open) {
        const target = event.target;
        const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName);
        
        if (!isTyping) {
          event.preventDefault();
          // This should actually open the browser - we need to update parent state
          // For now, this is handled by the parent component
        }
      }
      // Esc to close
      if (event.key === 'Escape' && open) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Get filtered nodes
  const filteredNodeTypes = useMemo(() => {
    if (debouncedSearchTerm) {
      return searchNodes(debouncedSearchTerm);
    }
    return null; // null means show all organized
  }, [debouncedSearchTerm]);

  // Get organized nodes
  const organizedNodes = useMemo(() => getOrganizedNodes(), []);

  // Handle category expansion
  const handleCategoryToggle = (categoryKey) => {
    setExpandedCategories(prev =>
      prev.includes(categoryKey)
        ? prev.filter(k => k !== categoryKey)
        : [...prev, categoryKey]
    );
  };

  // Handle node addition
  const handleAddNode = useCallback((nodeType, position = null) => {
    addToRecentNodes(nodeType);
    setRecentNodes(getRecentNodes(5)); // Update recent nodes display
    onAddNode(nodeType, position);
  }, [onAddNode]);

  // Handle node drag start
  const handleDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      hideBackdrop={true}
      ModalProps={{
        sx: {
          pointerEvents: 'none', // Allow pointer events to pass through to canvas
        }
      }}
      PaperProps={{
        sx: {
          width: 360,
          bgcolor: 'background.default',
          pointerEvents: 'auto', // But keep pointer events for the drawer itself
        }
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Add Node</Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider />

        {/* Search */}
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search nodes... (Press /)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 2 }}>
          {/* Recent Nodes Section */}
          {!debouncedSearchTerm && recentNodes.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                📍 RECENT
              </Typography>
              <List disablePadding>
                {recentNodes.map(nodeType => (
                  <NodeItem
                    key={nodeType}
                    nodeType={nodeType}
                    onAddNode={handleAddNode}
                    onDragStart={handleDragStart}
                  />
                ))}
              </List>
              <Divider sx={{ mt: 2, mb: 2 }} />
            </Box>
          )}

          {/* Filtered Search Results */}
          {debouncedSearchTerm && filteredNodeTypes && (
            <Box>
              {filteredNodeTypes.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No nodes found
                  </Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {filteredNodeTypes.map(nodeType => (
                    <NodeItem
                      key={nodeType}
                      nodeType={nodeType}
                      onAddNode={handleAddNode}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </List>
              )}
            </Box>
          )}

          {/* Category Sections */}
          {!debouncedSearchTerm && Object.entries(organizedNodes).map(([categoryKey, category]) => {
            const isExpanded = expandedCategories.includes(category.key);
            const hasNodes = Object.values(category.sections).some(section => section.nodes.length > 0);

            if (!hasNodes) return null; // Skip empty categories

            return (
              <Accordion
                key={categoryKey}
                expanded={isExpanded}
                onChange={() => handleCategoryToggle(category.key)}
                disableGutters
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 1,
                    minHeight: 48,
                    '&.Mui-expanded': { minHeight: 48 },
                  }}
                >
                  <Typography variant="subtitle2">
                    {category.icon} {category.displayName}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 1, pt: 0 }}>
                  {Object.entries(category.sections).map(([sectionKey, section]) => {
                    if (section.nodes.length === 0) return null;

                    return (
                      <Box key={sectionKey} sx={{ mb: 2 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mb: 1, ml: 1 }}
                        >
                          {section.displayName}
                        </Typography>
                        <List disablePadding>
                          {section.nodes.map(node => (
                            <NodeItem
                              key={node.type}
                              nodeType={node.type}
                              onAddNode={handleAddNode}
                              onDragStart={handleDragStart}
                            />
                          ))}
                        </List>
                      </Box>
                    );
                  })}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      </Box>
    </Drawer>
  );
};

export default NodeBrowser;
