import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  TextField,
  MenuItem,
  Grid,
  Paper,
  Checkbox,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import connectivityService from '../../services/connectivityService';
import SavedTagsList from './SavedTagsList';

/**
 * Format poll rate for display
 */
const formatPollRate = (ms) => {
  if (!ms || ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min`;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
};

const EIPTagBrowser = ({ connectionId: initialConnectionId, connections = [], onTagsSaved }) => {
  const [selectedConnection, setSelectedConnection] = useState(initialConnectionId || '');
  const [tags, setTags] = useState([]);
  const [filteredTags, setFilteredTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [pollGroups, setPollGroups] = useState([]);
  const [selectedPollGroup, setSelectedPollGroup] = useState(''); // Will be set after poll groups load
  const [loading, setLoading] = useState(false);
  // Write on change settings
  const [changeDetectionEnabled, setChangeDetectionEnabled] = useState(true); // Default enabled
  const [deadband, setDeadband] = useState(0);
  const [deadbandType, setDeadbandType] = useState('absolute');
  const [forcePublishInterval, setForcePublishInterval] = useState(60); // Default 60 seconds
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [savedTagsRefreshKey, setSavedTagsRefreshKey] = useState(0);
  const [templates, setTemplates] = useState({}); // Structure templates for expansion
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(''); // Optional unit of measure
  const [treeData, setTreeData] = useState([]); // Tree structure for tags
  const [expandedNodes, setExpandedNodes] = useState([]); // Track expanded nodes for TreeView
  const [nodePagination, setNodePagination] = useState({}); // Track pagination state per node
  const [programs, setPrograms] = useState([]); // Available programs from PLC
  const [selectedProgram, setSelectedProgram] = useState('Controller'); // Selected program filter ('Controller' or program name)
  
  // For multi-select support (Shift+Click, Ctrl+Click)
  const lastAnchorRef = useRef(null);
  const selectableNodesRef = useRef([]); // Flattened list of selectable nodes for range selection

  // Helper function to format EIP data types (handles arrays and structures)
  const formatDataType = (typeVal) => {
    if (!typeVal) return 'UNKNOWN';
    
    if (typeof typeVal === 'object') {
      const tn = typeVal.typeName || typeVal.name || '';
      const dims = Array.isArray(typeVal.dimensions) && typeVal.dimensions.length
        ? `[${typeVal.dimensions.join(',')}]`
        : (Array.isArray(typeVal.arrayDims) && typeVal.arrayDims.length 
          ? `[${typeVal.arrayDims.join(',')}]` 
          : '');
      const code = (typeVal.code != null) ? `#${typeVal.code}` : '';
      return (tn || code || 'struct') + dims;
    }
    
    return String(typeVal);
  };

  useEffect(() => {
    // Update selected connection if initialConnectionId is provided and we don't have a selection yet
    if (initialConnectionId && !selectedConnection) {
      setSelectedConnection(initialConnectionId);
    }
  }, [initialConnectionId, selectedConnection]);

  useEffect(() => {
    // Load poll groups once on mount
    loadPollGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Filter tags based on search term and rebuild tree
    const rebuildTree = (tagsToUse) => {
      // Deduplicate tags by name to avoid duplicate IDs
      const uniqueTags = [];
      const seen = new Set();
      for (const tag of tagsToUse) {
        if (!seen.has(tag.name)) {
          seen.add(tag.name);
          uniqueTags.push(tag);
        }
      }
      
      return uniqueTags.map(tag => {
        const node = buildTreeFromTag(tag);
        node.rawTag = tag;
        
        // Pre-load children for structures and arrays
        if (node.structure) {
          node.children = expandStructure(node);
        } else if (node.arrayDims && node.arrayDims.length > 0) {
          node.children = expandArray(node);
        }
        
        return node;
      });
    };

    if (!searchTerm.trim()) {
      setFilteredTags(tags);
      setTreeData(rebuildTree(tags));
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = tags.filter(tag => 
        tag.name?.toLowerCase().includes(term)
      );
      setFilteredTags(filtered);
      setTreeData(rebuildTree(filtered));
    }
  }, [searchTerm, tags]);

  // Update selectable nodes when tree data changes (for Select All with filtering)
  useEffect(() => {
    // Helper to recursively expand all selectable paths for a structure using templates
    const expandAllStructureMembers = (basePath, typeCode, acc) => {
      const tmpl = templates[String(typeCode)];
      if (!tmpl || !Array.isArray(tmpl._members)) return;
      
      for (const m of tmpl._members) {
        if (!m?.name || !m?.type) continue;
        
        const memberPath = `${basePath}.${m.name}`;
        const memberType = m.type?.string || m.type?.typeName || '';
        const memberArrayDims = m.type?.arrayDims > 0 && m.type?.dimensions 
          ? (Array.isArray(m.type.dimensions) ? m.type.dimensions : [m.type.dimensions])
          : [];
        
        // Skip STRING types
        if (memberType.toString().toUpperCase().startsWith('STRING')) continue;
        
        // If member is an array, generate all array element paths
        if (memberArrayDims.length > 0) {
          const dims = memberArrayDims;
          const total = dims.reduce((p, c) => (c > 0 ? p * c : p), 1);
          const dimCount = dims.length;
          
          for (let n = 0; n < total; n++) {
            let rem = n;
            const idx = new Array(dimCount);
            for (let d = dimCount - 1; d >= 0; d--) {
              const size = dims[d] || 1;
              idx[d] = rem % size;
              rem = Math.floor(rem / size);
            }
            const elementPath = `${memberPath}[${idx.join('][')}]`;
            acc.push(elementPath);
          }
        } else if (m.type?.structure && m.type?.code) {
          // Member is a structure, recursively expand it
          expandAllStructureMembers(memberPath, m.type.code, acc);
        } else {
          // Member is a primitive, it's selectable
          acc.push(memberPath);
        }
      }
    };
    
    const flattenSelectable = (nodes, acc = []) => {
      for (const node of nodes) {
        const canSelect = !node.skipSelect && (
          (node.kind === 'tag' && !node.structure && (!node.arrayDims || node.arrayDims.length === 0)) ||
          node.kind === 'member' ||
          node.kind === 'array-item'
        );
        
        if (canSelect) {
          acc.push(node.rawName);
        }
        
        // For arrays, generate ALL possible element paths even if not yet rendered
        if (node.arrayDims && node.arrayDims.length > 0 && !node.structure) {
          const dims = node.arrayDims;
          const total = dims.reduce((p, c) => (c > 0 ? p * c : p), 1);
          const dimCount = dims.length;
          
          // Generate all array element names
          for (let n = 0; n < total; n++) {
            let rem = n;
            const idx = new Array(dimCount);
            for (let d = dimCount - 1; d >= 0; d--) {
              const size = dims[d] || 1;
              idx[d] = rem % size;
              rem = Math.floor(rem / size);
            }
            const elementName = `${node.rawName}[${idx.join('][')}]`;
            acc.push(elementName);
          }
          // Don't process children for array nodes - we've already generated all elements above
          continue;
        }
        
        // For structures, use template to generate ALL member paths (including nested arrays/structures)
        if (node.structure && node.rawTag?.type?.code && templates[String(node.rawTag.type.code)]) {
          expandAllStructureMembers(node.rawName, node.rawTag.type.code, acc);
          // Don't process children for structure nodes - we've already generated all members above
          continue;
        }
        
        // Recursively process children (for already-expanded nodes without templates)
        if (node.children && node.children.length > 0) {
          flattenSelectable(node.children, acc);
        }
      }
      return acc;
    };
    selectableNodesRef.current = flattenSelectable(treeData);
  }, [treeData, templates]);

  // Build tree structure from flat tag list
  const buildTreeFromTag = (tag) => {
    const primitiveTypes = new Set(['BOOL','SINT','INT','DINT','UDINT','UINT','USINT','REAL','LREAL','LINT','ULINT','BYTE','WORD','DWORD','TIME','DATE','TIME_OF_DAY','TOD','DATE_AND_TIME','DT']);
    
    // Extract array dimensions
    const rawDimsOrig = Array.isArray(tag.type?.dimensions) 
      ? tag.type.dimensions 
      : (tag.type?.arrayDims 
        ? (Array.isArray(tag.type.arrayDims) ? tag.type.arrayDims : [tag.type.arrayDims])
        : []);
    const sanitizedDims = rawDimsOrig.filter(d => typeof d === 'number' && d > 0);
    
    const rawTypeName = (tag.type?.typeName || '').toString();
    const typeNameUpper = rawTypeName.toUpperCase();
    const isStringType = typeNameUpper.startsWith('STRING');
    const isPrimitive = primitiveTypes.has(typeNameUpper);
    const rawStructureFlag = !!tag.type?.structure;
    
    const base = {
      id: `tag:${tag.name}`,
      name: tag.name,
      type: tag.displayType,
      rawTypeName: rawTypeName,
      kind: 'tag',
      structure: rawStructureFlag,
      arrayDims: sanitizedDims,
      children: [],
      rawName: tag.name,
      skipSelect: isStringType, // Strings not selectable
      expanded: false,
      rawTag: tag // Store original tag data for accessing members
    };

    return base;
  };

  // Expand structure members using PyComm3 members data
  const expandStructure = (node) => {
    if (!node.structure || !node.rawTag) {
      return [];
    }
    
    // Get members from PyComm3 data (added in backend)
    const members = node.rawTag.members || [];
    if (members.length === 0) {
      return [];
    }
    
    const children = [];
    
    for (const member of members) {
      if (!member?.name) continue;
      
      const memberType = member.data_type || 'UNKNOWN';
      const mt = memberType.toString().toUpperCase();
      const isStructMember = member.tag_type === 'struct';
      
      const child = {
        id: `${node.id}.${member.name}`,
        name: member.name,
        type: memberType,
        rawTypeName: memberType,
        kind: 'member',
        arrayDims: [], // Structure members don't have array dimensions in current implementation
        structure: isStructMember,
        children: [],
        rawName: `${node.rawName}.${member.name}`,
        skipSelect: mt.startsWith('STRING'),
        expanded: false,
        offset: member.offset,
        bit: member.bit // For BOOL members in structs
      };
      
      // Note: If we want to support nested structures, we would need to fetch
      // the member definitions recursively from the backend
      
      children.push(child);
    }
    
    return children;
  };


  // Expand array elements with pagination
  const expandArray = (node, limit = 100) => {
    if (!node.arrayDims || node.arrayDims.length === 0) {
      return [];
    }
    
    const dims = node.arrayDims;
    const total = dims.reduce((p, c) => (c > 0 ? p * c : p), 1);
    const dimCount = dims.length;
    const children = [];
    
    // Get current pagination state for this node
    const currentLimit = nodePagination[node.id]?.limit || limit;
    const itemsToShow = Math.min(currentLimit, total);
    
    // Safety: warn for very large arrays
    if (total > 1000) {
      children.push({
        id: `${node.id}:info`,
        name: `Array with ${total} elements (showing ${itemsToShow})`,
        kind: 'info',
        children: [],
        rawName: node.rawName,
        skipSelect: true,
        expanded: false
      });
    }
    
    // Generate array element nodes up to the limit
    for (let n = 0; n < itemsToShow; n++) {
      let rem = n;
      const idx = new Array(dimCount);
      for (let d = dimCount - 1; d >= 0; d--) {
        const size = dims[d] || 1;
        idx[d] = rem % size;
        rem = Math.floor(rem / size);
      }
      const idxStr = '[' + idx.join(',') + ']';
      
      children.push({
        id: `${node.id}${idxStr}`,
        name: idxStr,
        kind: 'array-item',
        type: node.type,
        rawTypeName: node.rawTypeName,
        children: [],
        rawName: `${node.rawName}${idxStr}`,
        skipSelect: false,
        expanded: false
      });
    }
    
    // Add "Load More" button if there are more items
    if (itemsToShow < total) {
      children.push({
        id: `${node.id}:loadmore`,
        name: `Load More (${total - itemsToShow} remaining)`,
        kind: 'load-more',
        children: [],
        rawName: node.rawName,
        skipSelect: true,
        expanded: false,
        parentNodeId: node.id,
        totalItems: total,
        currentLimit: itemsToShow
      });
    }
    
    return children;
  };

  const loadPollGroups = async () => {
    try {
      const result = await connectivityService.getPollGroups();
      const groups = result.poll_groups || [];
      setPollGroups(groups);
      // Set default to group_id 5 if it exists, otherwise first group
      if (groups.length > 0) {
        const defaultGroup = groups.find(g => g.group_id === 5) || groups[0];
        setSelectedPollGroup(defaultGroup.group_id);
      }
    } catch (err) {
      console.error('Failed to load poll groups:', err);
    }
  };

  const loadUnits = async () => {
    try {
      const result = await connectivityService.getUnits();
      setUnits(result.units || []);
    } catch (err) {
      console.error('Failed to load units:', err);
    }
  };

  useEffect(() => {
    loadPollGroups();
    loadUnits();
  }, []);

  useEffect(() => {
    // Reload tags when program filter changes
    if (selectedConnection && selectedProgram !== '') {
      loadTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgram]);

  const loadTags = async () => {
    if (!selectedConnection) return;

    setLoading(true);
    setError(null);
    setSelectedTags([]); // Clear selection when loading new tags

    try {
      // First, create a snapshot
      const createResult = await connectivityService.getEipTags(selectedConnection, {
        action: 'create'
      });

      const snapshotResult = createResult;
      if (snapshotResult.error) {
        throw new Error(snapshotResult.error);
      }

      const snapshotId = snapshotResult.snapshot;
      setSnapshot(snapshotId);

      // Get the tag list from the snapshot with raw data (includes templates)
      const tagsResult = await connectivityService.getEipTags(selectedConnection, {
        snapshot: snapshotId,
        scope: 'controller',
        raw: true // Get templates for structure expansion
      });

      // Store templates for structure expansion
      setTemplates(tagsResult.raw?.templates || {});

      // Extract available programs from the response
      const availablePrograms = tagsResult.programs || [];
      setPrograms(availablePrograms);
      
      // Set default to Controller scope if not already set to a specific program
      if (selectedProgram === '' || (selectedProgram === 'Controller' && availablePrograms.length === 0)) {
        setSelectedProgram('Controller');
      }

      // Normalize PyComm3 format to expected format
      const processedTags = (tagsResult.items || []).map(tag => ({
        ...tag,
        name: tag.tag_name || tag.name, // PyComm3 uses tag_name
        displayType: formatDataType(tag.data_type || tag.type), // Pre-format type for display
        program: tag.program || null, // Store program name
        type: {
          typeName: tag.data_type_name || tag.data_type || tag.type,
          dimensions: tag.dimensions || [0, 0, 0],
          arrayDims: tag.dimensions?.filter(d => d > 0) || [],
          structure: tag.tag_type === 'struct' // PyComm3 indicates structures with tag_type
        }
      }));

      // Filter tags based on selected program
      let filteredByProgram = processedTags;
      if (selectedProgram) {
        if (selectedProgram === 'Controller') {
          // Show only controller-scoped tags (program is null or undefined)
          filteredByProgram = processedTags.filter(tag => !tag.program);
        } else {
          // Show only tags from the selected program
          filteredByProgram = processedTags.filter(tag => tag.program === selectedProgram);
        }
      }

      // Deduplicate tags by name
      const uniqueTags = [];
      const seen = new Set();
      for (const tag of filteredByProgram) {
        if (!seen.has(tag.name)) {
          seen.add(tag.name);
          uniqueTags.push(tag);
        }
      }

      // Build tree structure from deduplicated tags with children pre-loaded
      const tree = uniqueTags.map(tag => {
        const node = buildTreeFromTag(tag);
        node.rawTag = tag; // Store raw tag for expansion
        
        // Pre-load children for structures and arrays
        if (node.structure) {
          node.children = expandStructure(node);
        } else if (node.arrayDims && node.arrayDims.length > 0) {
          node.children = expandArray(node);
        }
        
        return node;
      });

      setTags(uniqueTags);
      setFilteredTags(uniqueTags);
      setTreeData(tree);
      // selectableNodesRef is now updated via useEffect when treeData changes
    } catch (err) {
      setError(err.message || 'Failed to load tags');
      setTags([]);
      setFilteredTags([]);
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setSelectedTags([]);
    setSearchTerm('');
    loadTags();
  };

  const handleNodeToggle = (event, nodeIds) => {
    setExpandedNodes(nodeIds);
  };

  // Helper to find node data by tag name in the tree
  const findNodeByName = (nodes, targetName) => {
    for (const node of nodes) {
      if (node.rawName === targetName && !node.skipSelect) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNodeByName(node.children, targetName);
        if (found) return found;
      }
    }
    return null;
  };

  const handleToggleTag = (node, event) => {
    // Create a tag object from the node for selection
    const tagToSelect = {
      name: node.rawName, // Use rawName which includes path like "Tag.Member" or "Tag[0]"
      displayType: node.type,
      type: node.rawTag?.type || {} // Preserve original type object if available
    };

    // Helper to find a node in the tree by rawName
    const findNodeByName = (nodes, targetName) => {
      for (const n of nodes) {
        if (n.rawName === targetName) return n;
        if (n.children && n.children.length > 0) {
          const found = findNodeByName(n.children, targetName);
          if (found) return found;
        }
      }
      return null;
    };

    setSelectedTags(prevSelected => {
      const exists = prevSelected.find(t => t.name === tagToSelect.name);
      
      // Ctrl/Cmd+Click: Toggle single tag
      if (event?.ctrlKey || event?.metaKey) {
        lastAnchorRef.current = tagToSelect.name;
        if (exists) {
          return prevSelected.filter(t => t.name !== tagToSelect.name);
        } else {
          return [...prevSelected, tagToSelect];
        }
      }
      
      // Shift+Click: Range selection
      if (event?.shiftKey && lastAnchorRef.current) {
        const selectableNames = selectableNodesRef.current;
        const anchorIdx = selectableNames.indexOf(lastAnchorRef.current);
        const currentIdx = selectableNames.indexOf(tagToSelect.name);
        
        if (anchorIdx >= 0 && currentIdx >= 0) {
          const [start, end] = anchorIdx < currentIdx 
            ? [anchorIdx, currentIdx] 
            : [currentIdx, anchorIdx];
          const rangeNames = selectableNames.slice(start, end + 1);
          
          // Check if all in range are selected
          const allSelected = rangeNames.every(name => 
            prevSelected.some(t => t.name === name)
          );
          
          let next = [...prevSelected];
          
          if (allSelected) {
            // Deselect all in range
            next = next.filter(t => !rangeNames.includes(t.name));
          } else {
            // Select all in range - look up correct node data for each
            const toAdd = rangeNames.filter(name => 
              !next.some(t => t.name === name)
            ).map(name => {
              const foundNode = findNodeByName(treeData, name);
              if (foundNode) {
                return {
                  name: foundNode.rawName,
                  displayType: foundNode.type,
                  type: foundNode.rawTag?.type || {}
                };
              }
              
              // If node not found, try to derive type from array parent for array elements
              if (name.includes('[') && name.includes(']')) {
                const arrayBaseName = name.substring(0, name.indexOf('['));
                const parentNode = findNodeByName(treeData, arrayBaseName);
                if (parentNode && parentNode.type) {
                  return {
                    name,
                    displayType: parentNode.type,
                    type: parentNode.rawTag?.type || {}
                  };
                }
              }
              
              // Final fallback if node not found (shouldn't happen)
              return {
                name,
                displayType: 'UNKNOWN',
                type: {}
              };
            });
            next = [...next, ...toAdd];
          }
          
          return next;
        }
      }
      
      // Regular click: Toggle single
      lastAnchorRef.current = tagToSelect.name;
      if (exists) {
        return prevSelected.filter(t => t.name !== tagToSelect.name);
      } else {
        return [...prevSelected, tagToSelect];
      }
    });
  };

  const isTagSelected = (tagName) => {
    return selectedTags.some(t => t.name === tagName);
  };

  // Recursive function to render TreeItems
  const renderTreeItems = (nodes) => {
    return nodes.map((node) => {
      // Handle Load More button
      if (node.kind === 'load-more') {
        const handleLoadMore = (e) => {
          e.stopPropagation();
          // Update pagination state to show 100 more items
          const newLimit = node.currentLimit + 100;
          setNodePagination(prev => ({
            ...prev,
            [node.parentNodeId]: { limit: newLimit }
          }));
          
          // Trigger tree rebuild by updating the tree data
          setTreeData(prevTree => {
            const updateNode = (nodes) => {
              return nodes.map(n => {
                if (n.id === node.parentNodeId) {
                  // Rebuild this array node with new limit
                  return { ...n, children: expandArray(n, newLimit) };
                }
                if (n.children && n.children.length > 0) {
                  return { ...n, children: updateNode(n.children) };
                }
                return n;
              });
            };
            return updateNode(prevTree);
          });
        };

        return (
          <TreeItem 
            key={node.id} 
            itemId={node.id}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0, minHeight: '32px' }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleLoadMore}
                  sx={{ 
                    textTransform: 'none', 
                    fontSize: '0.688rem',
                    height: '24px',
                    py: 0,
                    px: 1
                  }}
                >
                  {node.name}
                </Button>
              </Box>
            }
            sx={{
              '& .MuiTreeItem-content': {
                py: 0,
                px: 0.5,
                minHeight: '32px',
                height: '32px',
              }
            }}
          />
        );
      }

      const canSelect = !node.skipSelect && (
        (node.kind === 'tag' && !node.structure && (!node.arrayDims || node.arrayDims.length === 0)) ||
        node.kind === 'member' ||
        node.kind === 'array-item'
      );

      const label = (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          width: '100%',
          gap: 0,
          py: 0,
          pr: 1,
          minHeight: '32px',
          ml: -3.5, // Pull left to align with header
        }}>
          {/* Checkbox Column - Fixed width, absolutely positioned to left */}
          <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {canSelect && (
              <Checkbox
                checked={isTagSelected(node.rawName)}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleTag(node, e);
                }}
                size="small"
                onClick={(e) => e.stopPropagation()}
                sx={{ p: 0.5 }}
              />
            )}
          </Box>
          
          {/* Spacer for expand icon - TreeView adds this automatically */}
          <Box sx={{ width: 24, flexShrink: 0 }} />
          
          {/* Tag Name Column - Flexible width (takes remaining space) */}
          <Box sx={{ flex: 1, overflow: 'hidden', pr: 1 }}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: !canSelect ? 'text.secondary' : 'text.primary',
                fontStyle: node.kind === 'info' ? 'italic' : 'normal',
                fontWeight: node.kind === 'tag' ? 500 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.813rem',
                lineHeight: 1.5
              }}
            >
              {node.name}
            </Typography>
          </Box>
          
          {/* Type Column - Auto width, center aligned */}
          <Box sx={{ width: 'auto', minWidth: 80, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1 }}>
            {node.kind !== 'info' && node.kind !== 'load-more' && node.type && (
              <Typography 
                variant="body2"
                sx={{ 
                  fontSize: '0.813rem',
                  color: node.structure ? 'primary.main' : 'text.primary'
                }}
              >
                {node.type}
              </Typography>
            )}
          </Box>
          
          {/* Array Dimensions Column - Auto width, center aligned */}
          <Box sx={{ width: 'auto', minWidth: 100, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pr: 1 }}>
            {node.arrayDims && node.arrayDims.length > 0 && (
              <Typography 
                variant="body2"
                sx={{ 
                  fontSize: '0.813rem',
                  color: 'text.secondary'
                }}
              >
                [{node.arrayDims.join(',')}]
              </Typography>
            )}
          </Box>
          
          {/* Remove the empty spacer at the end */}
        </Box>
      );

      return (
        <TreeItem 
          key={node.id} 
          itemId={node.id} 
          label={label}
          sx={{
            '& .MuiTreeItem-content': {
              py: 0,
              px: 0.5,
              minHeight: '32px',
              height: '32px',
              borderRadius: 0,
              '&:hover': {
                backgroundColor: 'action.hover',
              },
              '&.Mui-selected': {
                backgroundColor: 'action.selected',
                '&:hover': {
                  backgroundColor: 'action.selected',
                },
              },
            },
            '& .MuiTreeItem-group': {
              ml: 3,
              borderLeft: '1px solid',
              borderColor: 'divider',
            },
            '& .MuiTreeItem-iconContainer': {
              width: 20,
              marginRight: 0.5,
            },
          }}
        >
          {node.children && node.children.length > 0 && renderTreeItems(node.children)}
        </TreeItem>
      );
    });
  };

  const handleSave = async () => {
    if (selectedTags.length === 0) {
      setError('No tags selected');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // First pass: identify tags that need type resolution
      const tagsNeedingTypeResolution = [];
      const processedTags = selectedTags.map(tag => {
        let dataType = tag.displayType || formatDataType(tag.type);
        
        // Additional fallback for array elements: derive type from parent array
        if (dataType === 'UNKNOWN' && tag.name.includes('[') && tag.name.includes(']')) {
          const arrayBaseName = tag.name.substring(0, tag.name.indexOf('['));
          const parentNode = findNodeByName(treeData, arrayBaseName);
          if (parentNode && parentNode.type) {
            dataType = parentNode.type;
          }
        }
        
        // If still unknown and not an array element, mark for type resolution
        if (dataType === 'UNKNOWN' && (!tag.name.includes('[') || !tag.name.includes(']'))) {
          tagsNeedingTypeResolution.push(tag.name);
        }
        
        return {
          nodeId: tag.name,
          name: tag.name,
          type: dataType,
        };
      });

      // If there are tags needing type resolution, query the EIP driver
      if (tagsNeedingTypeResolution.length > 0) {
        setError(`Resolving types for ${tagsNeedingTypeResolution.length} tags...`);
        
        try {
          // Request type information from EIP driver for unknown tags
          const typeResolutionResponse = await connectivityService.resolveTagTypes(
            selectedConnection, 
            tagsNeedingTypeResolution
          );
          
          // Update the processed tags with resolved types
          processedTags.forEach(item => {
            if (item.type === 'UNKNOWN' && typeResolutionResponse.types) {
              const resolvedType = typeResolutionResponse.types[item.name];
              if (resolvedType) {
                item.type = resolvedType;
              }
            }
          });
          
          setError(null); // Clear the "resolving types" message
        } catch (typeError) {
          console.warn('Failed to resolve tag types:', typeError);
          setError('Warning: Some tag types could not be resolved and will be saved as UNKNOWN');
          // Continue with save anyway, but with a warning
          // Wait a moment to show the warning, then clear it before proceeding
          setTimeout(() => setError(null), 2000);
        }
      }

      const payload = {
        id: selectedConnection,
        items: processedTags,
        poll_group_id: selectedPollGroup,
        subscribe: true, // Always enable subscription for newly saved tags
        unit_id: selectedUnit || null, // Include selected unit of measure
        // Write on change settings
        on_change_enabled: changeDetectionEnabled,
        on_change_deadband: deadband,
        on_change_deadband_type: deadbandType,
        on_change_heartbeat_ms: forcePublishInterval * 1000, // Convert seconds to milliseconds
      };

      await connectivityService.saveTags(payload);
      setSelectedTags([]);
      setSavedTagsRefreshKey(prev => prev + 1); // Trigger SavedTagsList refresh
      
      if (onTagsSaved) {
        onTagsSaved();
      }
    } catch (err) {
      setError(err.message || 'Failed to save tags');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
      {/* Side-by-side layout for Tag Browser and Saved Tags */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Tag Browser - Left Side */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              <Typography variant="h6" gutterBottom>
                EtherNet/IP Tag Browser
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Browse and select tags from the Allen-Bradley PLC
              </Typography>

              {/* Device Selection Section */}
              {connections && connections.length > 0 ? (
                <>
                  <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      select
                      size="small"
                      label="Select EIP Device"
                      value={selectedConnection}
                      onChange={(e) => setSelectedConnection(e.target.value)}
                      sx={{ flex: 1 }}
                    >
                      {connections.map((conn) => (
                        <MenuItem key={conn.id} value={conn.id}>
                          {conn.name || conn.id} - {conn.host}:{conn.port || 44818} (Slot: {conn.slot})
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{ minWidth: 120, flexShrink: 0 }}
                    >
                      Refresh
                    </Button>
                  </Box>
                  
                  {/* Program Filter - Only show if connection is selected */}
                  {selectedConnection && (
                    <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
                      <TextField
                        select
                        size="small"
                        label="Program Scope"
                        value={selectedProgram}
                        onChange={(e) => setSelectedProgram(e.target.value)}
                        sx={{ minWidth: 250 }}
                        helperText="Filter tags by program scope"
                      >
                        <MenuItem value="Controller">Controller Scope</MenuItem>
                        {programs.map((prog) => (
                          <MenuItem key={prog} value={prog}>
                            Program: {prog}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {programs.length > 0 
                          ? `${programs.length} program(s) available`
                          : 'All tags are controller-scoped'
                        }
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Alert severity="warning" sx={{ mb: 3 }}>
                  No EtherNet/IP connections available. Create a connection in the Devices tab to browse tags.
                </Alert>
              )}

              {!selectedConnection ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Select a device above to browse EtherNet/IP tags.
                </Alert>
              ) : (
                <>
                  {/* Search Bar */}
                  <Box sx={{ mb: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Search tags..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>

                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                      {error}
                    </Alert>
                  )}

                  {/* Show info message when no tags loaded yet */}
                  {!loading && tags.length === 0 && !error && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Click "Refresh" to load tags from the PLC
                    </Alert>
                  )}

                  {/* Tag List */}
                  {loading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4 }}>
                      <CircularProgress />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Loading tags from PLC...
                      </Typography>
                    </Box>
                  ) : treeData.length === 0 ? (
                    <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        No tags found. Click "Refresh" to load tags from the PLC.
                      </Typography>
                    </Paper>
                  ) : (
                    <Paper sx={{ mb: 2, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {/* Column Headers - Sticky - matches SavedTagsList */}
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 0.5,
                        py: 1,
                        px: 1,
                        borderBottom: 1, 
                        borderColor: 'divider',
                        bgcolor: 'background.default',
                        flexShrink: 0,
                        minHeight: '40px'
                      }}>
                        {/* Select All Checkbox */}
                        <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                          <Checkbox
                            indeterminate={
                              selectedTags.length > 0 && 
                              selectedTags.length < selectableNodesRef.current.length
                            }
                            checked={
                              selectableNodesRef.current.length > 0 && 
                              selectedTags.length === selectableNodesRef.current.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all filtered selectable tags
                                const allTags = selectableNodesRef.current.map(name => {
                                  const nodeData = findNodeByName(treeData, name);
                                  if (nodeData) {
                                    return {
                                      name: nodeData.rawName,
                                      displayType: nodeData.type,
                                      type: nodeData.rawTag?.type || {}
                                    };
                                  }
                                  
                                  // If node not found, try to derive type from array parent for array elements
                                  if (name.includes('[') && name.includes(']')) {
                                    const arrayBaseName = name.substring(0, name.indexOf('['));
                                    const parentNode = findNodeByName(treeData, arrayBaseName);
                                    if (parentNode && parentNode.type) {
                                      return {
                                        name,
                                        displayType: parentNode.type,
                                        type: parentNode.rawTag?.type || {}
                                      };
                                    }
                                  }
                                  
                                  // Final fallback if node not found
                                  return {
                                    name,
                                    displayType: 'UNKNOWN',
                                    type: {}
                                  };
                                });
                                setSelectedTags(allTags);
                              } else {
                                // Deselect all
                                setSelectedTags([]);
                              }
                              lastAnchorRef.current = null;
                            }}
                            size="small"
                            sx={{ p: 0.5 }}
                          />
                        </Box>
                        {/* Spacer for tree expand icons */}
                        <Box sx={{ width: 24, flexShrink: 0 }} />
                        <Box sx={{ flex: 1, pl: 0 }}>
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }}>Name</Typography>
                        </Box>
                        <Box sx={{ width: 'auto', minWidth: 80, flexShrink: 0, textAlign: 'center' }}>
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }}>Type</Typography>
                        </Box>
                        <Box sx={{ width: 'auto', minWidth: 100, flexShrink: 0, textAlign: 'center', pr: 1 }}>
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }}>Dimensions</Typography>
                        </Box>
                      </Box>
                      
                      {/* Tree View with alternating row backgrounds */}
                      <Box sx={{ 
                        flex: 1,
                        overflow: 'auto',
                        '& > div': {
                          '& .MuiTreeItem-root': {
                            '&:nth-of-type(odd) > .MuiTreeItem-content': {
                              backgroundColor: 'background.paper',
                            },
                            '&:nth-of-type(even) > .MuiTreeItem-content': {
                              backgroundColor: 'action.hover',
                            },
                          }
                        }
                      }}>
                        <SimpleTreeView
                          expandedItems={expandedNodes}
                          onExpandedItemsChange={handleNodeToggle}
                          sx={{
                            '& .MuiTreeItem-content': {
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                            }
                          }}
                        >
                          {renderTreeItems(treeData)}
                        </SimpleTreeView>
                      </Box>
                    </Paper>
                  )}

                  {/* Info */}
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="caption" component="div">
                      <strong>Total Tags:</strong> {tags.length}
                      {searchTerm && <> | <strong>Filtered:</strong> {filteredTags.length}</>}
                      {selectedTags.length > 0 && <> | <strong>Selected:</strong> {selectedTags.length}</>}
                      {snapshot && <> | <strong>Snapshot:</strong> {snapshot}</>}
                    </Typography>
                  </Alert>

                  {/* Save Section with Poll Group and Value Change Detection */}
                  {selectedTags.length > 0 && (
                    <Paper sx={{ p: 2, mb: 2, backgroundColor: 'background.default' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Tag Configuration
                      </Typography>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Poll Group"
                            value={selectedPollGroup}
                            onChange={(e) => setSelectedPollGroup(Number(e.target.value))}
                          >
                            {pollGroups.map((group) => (
                              <MenuItem key={group.group_id} value={group.group_id}>
                                {group.name} ({formatPollRate(group.poll_rate_ms)})
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Tooltip title="Only save values when they change, reducing database writes for stable values" arrow>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Checkbox
                                checked={changeDetectionEnabled}
                                onChange={(e) => setChangeDetectionEnabled(e.target.checked)}
                                size="small"
                              />
                              <Typography variant="body2">
                                Write on Change
                              </Typography>
                            </Box>
                          </Tooltip>
                        </Grid>
                        {changeDetectionEnabled && (
                          <>
                            <Grid item xs={12} sm={6} md={2}>
                              <Tooltip title="Minimum change required to trigger a write. Set to 0 for exact match (any change writes)" arrow>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  label="Deadband"
                                  value={deadband}
                                  onChange={(e) => setDeadband(Number(e.target.value))}
                                  inputProps={{ min: 0, step: 0.1 }}
                                />
                              </Tooltip>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <Tooltip title="Absolute: fixed value difference (e.g., ±5 units). Percent: relative change (e.g., ±5% of current value)" arrow>
                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  label="Deadband Type"
                                  value={deadbandType}
                                  onChange={(e) => setDeadbandType(e.target.value)}
                                >
                                  <MenuItem value="absolute">Absolute</MenuItem>
                                  <MenuItem value="percent">Percent</MenuItem>
                                </TextField>
                              </Tooltip>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <Tooltip title="Force publish interval even if unchanged - ensures monitoring systems know connection is alive" arrow>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  label="Heartbeat (s)"
                                  value={forcePublishInterval}
                                  onChange={(e) => setForcePublishInterval(Number(e.target.value))}
                                  inputProps={{ min: 1, step: 1 }}
                                />
                              </Tooltip>
                            </Grid>
                          </>
                        )}
                      </Grid>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                          variant="contained"
                          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                          onClick={handleSave}
                          disabled={saving || selectedTags.length === 0}
                        >
                          Save {selectedTags.length} Tag{selectedTags.length !== 1 ? 's' : ''}
                        </Button>
                      </Box>
                    </Paper>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Saved Tags List - Right Side */}
        {selectedConnection && (
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <SavedTagsList
              connectionId={selectedConnection}
              onTagsChanged={() => {
                if (onTagsSaved) onTagsSaved();
              }}
              refreshTrigger={savedTagsRefreshKey}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default EIPTagBrowser;
