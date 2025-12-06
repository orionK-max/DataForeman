import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nodeTypes } from '../components/FlowEditor/CustomNodes';
import { validateForSave, validateForDeploy } from '../utils/flowValidation';
import {
  Box,
  Paper,
  Button,
  IconButton,
  Typography,
  Toolbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  Checkbox,
  FormGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  Save as SaveIcon,
  CloudUpload as DeployIcon,
  CloudOff as UndeployIcon,
  Settings as SettingsIcon,
  ArrowBack as BackIcon,
  History as HistoryIcon,
  Add as AddIcon,
  Terminal as TerminalIcon,
  Visibility as LiveIcon,
  Memory as ResourceIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { getFlow, updateFlow, deployFlow, executeFlow, testExecuteNode, executeFromNode, fireTrigger, calculateExecutionOrder } from '../services/flowsApi';
import { getNodeMetadata, getBackendMetadata } from '../constants/nodeTypes';
import NodeBrowser from '../components/FlowEditor/NodeBrowser';
import NodeConfigPanel from '../components/FlowEditor/NodeConfigPanel';
import NodeDetailsPanel from '../components/FlowEditor/NodeDetailsPanel';
import FlowSettingsDialog from '../components/FlowEditor/FlowSettingsDialog';
import ExecutionHistoryDialog from '../components/FlowEditor/ExecutionHistoryDialog';
import LogPanel from '../components/FlowEditor/LogPanel';
import FlowResourceMonitor from '../components/FlowEditor/FlowResourceMonitor';
import ExportFlowButton from '../components/flowStudio/ExportFlowButton';
import { useFlowLiveData } from '../hooks/useFlowLiveData';
import { useFlowResources } from '../hooks/useFlowResources';
import { usePageTitle } from '../contexts/PageTitleContext';

const FlowEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flow, setFlow] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [nodeBrowserOpen, setNodeBrowserOpen] = useState(false);
  const [ndvOpen, setNdvOpen] = useState(false);
  const [ndvNode, setNdvNode] = useState(null);
  const [ndvExecutionData, setNdvExecutionData] = useState(null);
  const [isExecutingNode, setIsExecutingNode] = useState(false);
  const [pinnedData, setPinnedData] = useState({}); // { nodeId: data }
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [executingTriggers, setExecutingTriggers] = useState(new Set()); // Track which triggers are executing
  const [isTestMode, setIsTestMode] = useState(false); // Track if flow is in test mode
  const [testModeDisableWrites, setTestModeDisableWrites] = useState(false); // Disable writes in test mode
  const [testModeAutoExit, setTestModeAutoExit] = useState(false); // Auto-exit test mode after execution
  const [testModeAutoExitMinutes, setTestModeAutoExitMinutes] = useState(5); // Minutes before auto-exit
  const [testModeAutoExitSeconds, setTestModeAutoExitSeconds] = useState(0); // Seconds before auto-exit
  const [testModeDialogOpen, setTestModeDialogOpen] = useState(false); // Test mode configuration dialog
  const [testModeTimer, setTestModeTimer] = useState(null); // Timer reference for auto-exit
  const [testModeTimeRemaining, setTestModeTimeRemaining] = useState(null); // Seconds remaining in test mode
  const [logPanelOpen, setLogPanelOpen] = useState(false); // Log panel visibility
  const [logPanelPosition, setLogPanelPosition] = useState('right'); // 'bottom' or 'right'
  const [currentExecutionId, setCurrentExecutionId] = useState(null); // Current execution for logs
  const [executionOrder, setExecutionOrder] = useState(null); // { nodeId: orderNumber } map
  const [showExecutionOrder, setShowExecutionOrder] = useState(false); // Toggle execution order display
  const [showLiveValues, setShowLiveValues] = useState(false); // Toggle live values display on nodes
  const [resourceMonitorOpen, setResourceMonitorOpen] = useState(false); // Resource monitor dialog
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // Track unsaved changes
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Fetch live cached tag values when showLiveValues is enabled
  const liveData = useFlowLiveData(id, showLiveValues);
  
  // Fetch flow resource usage when deployed
  const { data: resourceData, loading: resourceLoading, refetch: refetchResources } = useFlowResources(
    id,
    resourceMonitorOpen && flow?.deployed,
    5000 // Poll every 5 seconds when dialog is open
  );

  // Use ref to store trigger handler so it has a stable reference
  const handleExecuteTriggerRef = useRef(null);
  
  // Wrap onNodesChange to detect position changes
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    // Mark as having unsaved changes when nodes are moved
    if (changes.some(change => change.type === 'position' && change.dragging === false)) {
      setHasUnsavedChanges(true);
    }
  }, [onNodesChange]);

  // Wrap onEdgesChange to detect edge removals
  const handleEdgesChange = useCallback((changes) => {
    onEdgesChange(changes);
    // Mark as having unsaved changes when edges are removed
    if (changes.some(change => change.type === 'remove')) {
      setHasUnsavedChanges(true);
    }
  }, [onEdgesChange]);
  
  // Update the ref whenever dependencies change
  handleExecuteTriggerRef.current = async (triggerNodeId) => {
    if (!flow?.deployed && !isTestMode) {
      setSnackbar({ open: true, message: 'Flow must be deployed or in test mode to execute. Use Test Run for testing.', severity: 'warning' });
      return;
    }

    try {
      // Add to executing set
      setExecutingTriggers(prev => new Set(prev).add(triggerNodeId));
      
      // Update node state to show executing
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === triggerNodeId) {
            return { ...node, data: { ...node.data, isExecuting: true } };
          }
          return node;
        })
      );

      // For continuous flows (deployed), just fire the trigger
      // The running session will pick it up on next scan
      const result = await fireTrigger(id, triggerNodeId);
      setSnackbar({ open: true, message: 'Trigger fired - will execute on next scan', severity: 'success' });
      
      // Remove from executing set after a brief moment
      setTimeout(() => {
        setExecutingTriggers(prev => {
          const newSet = new Set(prev);
          newSet.delete(triggerNodeId);
          return newSet;
        });
        
        // Update node state
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === triggerNodeId) {
              return { ...node, data: { ...node.data, isExecuting: false } };
            }
            return node;
          })
        );
      }, 500);
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to fire trigger: ' + error.message, severity: 'error' });
      
      // Remove from executing set on error
      setExecutingTriggers(prev => {
        const newSet = new Set(prev);
        newSet.delete(triggerNodeId);
        return newSet;
      });
      
      // Update node state
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === triggerNodeId) {
            return { ...node, data: { ...node.data, isExecuting: false } };
          }
          return node;
        })
      );
    }
  };
  
  // Stable wrapper function that calls the ref
  const handleExecuteTrigger = useCallback((triggerNodeId) => {
    return handleExecuteTriggerRef.current?.(triggerNodeId);
  }, []); // Empty deps - function reference never changes

  // Load flow
  useEffect(() => {
    if (id) {
      loadFlow();
    }
  }, [id]);

  // Set page title when flow loads
  useEffect(() => {
    if (flow) {
      setPageTitle('Flow Studio');
      setPageSubtitle(flow.name || '');
    }
  }, [flow, setPageTitle, setPageSubtitle]);

  
  // Update nodes with execution handler and deployed state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === 'trigger-manual') {
          return {
            ...node,
            data: {
              ...node.data,
              onExecute: handleExecuteTrigger,
              deployed: flow?.deployed || false, // Only deployed state
              isExecuting: executingTriggers.has(node.id),
              canExecute: flow?.deployed && !executingTriggers.has(node.id), // Can execute only when deployed
            },
          };
        }
        return node;
      })
    );
  }, [flow?.deployed, isTestMode, executingTriggers, nodes.length, handleExecuteTrigger]); // handleExecuteTrigger is now stable

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // "/" to open node browser (only if not typing in an input)
      if (event.key === '/' && !nodeBrowserOpen) {
        const target = event.target;
        const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName);
        
        if (!isTyping) {
          event.preventDefault();
          setNodeBrowserOpen(true);
        }
      }
      
      // Delete or Backspace to delete selected nodes/edges
      if ((event.key === 'Delete' || event.key === 'Backspace') && !nodeBrowserOpen) {
        const target = event.target;
        const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName);
        
        if (!isTyping) {
          event.preventDefault();
          
          // Get selected nodes and edges
          const selectedNodes = nodes.filter(node => node.selected);
          const selectedEdges = edges.filter(edge => edge.selected);
          
          if (selectedNodes.length > 0) {
            setNodes(nodes.filter(node => !node.selected));
            // Close config panel if selected node was deleted
            if (selectedNode && selectedNodes.some(n => n.id === selectedNode.id)) {
              setSelectedNode(null);
            }
          }
          
          if (selectedEdges.length > 0) {
            setEdges(edges.filter(edge => !edge.selected));
          }
        }
      }
      
      // Ctrl/Cmd+L to toggle log panel
      if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
        event.preventDefault();
        setLogPanelOpen(prev => !prev);
      }
      
      // Ctrl/Cmd+Shift+C to clear logs (when panel is open)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'C' && logPanelOpen) {
        event.preventDefault();
        // Will be handled by LogPanel component
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodeBrowserOpen, logPanelOpen, nodes, edges, selectedNode, setNodes, setEdges]);

  // Load log panel preferences from localStorage
  useEffect(() => {
    const savedPosition = localStorage.getItem('df_log_panel_position');
    if (savedPosition) {
      setLogPanelPosition(savedPosition);
    }
  }, []);

  // Save log panel position to localStorage
  const handleLogPanelPositionChange = (newPosition) => {
    setLogPanelPosition(newPosition);
    localStorage.setItem('flowLogPanelPosition', newPosition);
  };

  // Highlight node in canvas (from log click)
  const highlightNode = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // Add highlight style and animate
          return {
            ...node,
            style: {
              ...node.style,
              boxShadow: '0 0 20px 4px rgba(33, 150, 243, 0.8)',
              border: '2px solid #2196f3',
              transition: 'all 0.3s ease-in-out',
            },
          };
        }
        return node;
      })
    );

    // Center on node if reactFlowInstance is available
    if (reactFlowInstance) {
      const node = reactFlowInstance.getNode(nodeId);
      if (node) {
        reactFlowInstance.fitView({
          nodes: [node],
          duration: 300,
          padding: 0.5,
        });
      }
    }

    // Remove highlight after 2 seconds
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const { boxShadow, border, transition, ...restStyle } = node.style || {};
            return {
              ...node,
              style: restStyle,
            };
          }
          return node;
        })
      );
    }, 2000);
  }, [setNodes, reactFlowInstance]);

  // Update nodes with execution order when it changes
  useEffect(() => {
    if (showExecutionOrder && executionOrder) {
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            executionOrder: executionOrder[node.id] || null,
          },
        }))
      );
    } else {
      // Clear execution order from nodes
      setNodes((nds) =>
        nds.map((node) => {
          const { executionOrder, ...restData } = node.data;
          return {
            ...node,
            data: restData,
          };
        })
      );
    }
  }, [showExecutionOrder, executionOrder, setNodes]);

  // Update nodes with showLiveValues flag when it changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          _showLiveValues: showLiveValues,
        },
      }))
    );
  }, [showLiveValues, setNodes]);

  const loadFlow = async () => {
    try {
      const data = await getFlow(id);
      setFlow(data.flow);
      setIsTestMode(data.flow.test_mode || false); // Load test mode state
      setTestModeDisableWrites(data.flow.test_disable_writes || false); // Load disable writes setting
      setTestModeAutoExit(data.flow.test_auto_exit || false); // Load auto-exit setting
      const totalMinutes = data.flow.test_auto_exit_minutes || 5;
      setTestModeAutoExitMinutes(Math.floor(totalMinutes));
      setTestModeAutoExitSeconds(Math.round((totalMinutes % 1) * 60));
      if (data.flow.definition) {
        // Load nodes and immediately attach onExecute to manual trigger nodes
        const loadedNodes = (data.flow.definition.nodes || []).map(node => {
          if (node.type === 'trigger-manual') {
            return {
              ...node,
              data: {
                ...node.data,
                onExecute: handleExecuteTrigger,
                deployed: data.flow.deployed || false,
                canExecute: data.flow.deployed && !executingTriggers.has(node.id),
                isExecuting: executingTriggers.has(node.id)
              }
            };
          }
          return node;
        });
        setNodes(loadedNodes);
        setEdges(data.flow.definition.edges || []);
        // Load pinned data if exists
        if (data.flow.definition.pinData) {
          setPinnedData(data.flow.definition.pinData);
        }
      }
    } catch (error) {
      showSnackbar('Failed to load flow: ' + error.message, 'error');
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // Handle node highlighting from query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nodeIdToHighlight = params.get('highlight');
    if (nodeIdToHighlight && nodes.length > 0 && reactFlowInstance) {
      // Highlight the node
      highlightNode(nodeIdToHighlight);
      // Clear the highlight parameter from URL after a short delay
      setTimeout(() => {
        navigate(`/flows/${id}`, { replace: true });
      }, 100);
    }
  }, [location.search, nodes.length, reactFlowInstance, id]); // Only depend on values that actually change

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Save flow
  const handleSave = async () => {
    try {
      const definition = {
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data || {}
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        }))
      };

      // Validate before saving
      const validation = validateForSave(nodes, edges);
      if (!validation.valid) {
        showSnackbar('Validation failed: ' + validation.errors[0].message, 'error');
        return;
      }

      await updateFlow(id, { definition });
      setHasUnsavedChanges(false); // Clear unsaved changes after save
      showSnackbar('Flow saved successfully', 'success');
      
      // Show warnings if any
      if (validation.warnings.length > 0) {
        setTimeout(() => {
          showSnackbar('Warning: ' + validation.warnings[0].message, 'warning');
        }, 2000);
      }
    } catch (error) {
      showSnackbar('Failed to save flow: ' + error.message, 'error');
    }
  };

  // Calculate and show execution order
  const handleShowExecutionOrder = async () => {
    if (showExecutionOrder) {
      // Toggle off - hide the order
      setShowExecutionOrder(false);
      setExecutionOrder(null);
      return;
    }

    try {
      const result = await calculateExecutionOrder(id);
      
      // Convert array to map: { nodeId: orderNumber }
      const orderMap = {};
      result.executionOrder.forEach(item => {
        orderMap[item.nodeId] = item.order;
      });
      
      setExecutionOrder(orderMap);
      setShowExecutionOrder(true);
      showSnackbar(`Execution order calculated: ${result.totalNodes} nodes`, 'success');
    } catch (error) {
      console.error('Calculate execution order failed:', error);
      showSnackbar('Failed to calculate execution order: ' + error.message, 'error');
    }
  };

  // Deploy/undeploy
  const handleDeploy = async () => {
    try {
      const newDeployed = !flow.deployed;
      
      if (newDeployed) {
        // Validate before deploying
        const validation = validateForDeploy(nodes, edges);
        if (!validation.valid) {
          const errorList = validation.errors.map(e => e.message).join('; ');
          showSnackbar('Cannot deploy: ' + errorList, 'error');
          return;
        }
        
        // Show warnings
        if (validation.warnings.length > 0) {
          const warningList = validation.warnings.map(w => w.message).join('; ');
          showSnackbar('Warning: ' + warningList, 'warning');
        }
      }
      
      await deployFlow(id, newDeployed);
      setFlow({ ...flow, deployed: newDeployed });
      showSnackbar(`Flow ${newDeployed ? 'deployed' : 'undeployed'} successfully`, 'success');
    } catch (error) {
      console.error('Deploy failed:', error);
      showSnackbar('Failed to deploy flow: ' + error.message + ' (see Logs panel for details)', 'error');
    }
  };

  // Test run flow (creates temporary deployment)
  const handleRun = async () => {
    if (flow?.deployed) {
      showSnackbar('Cannot test when deployed. Undeploy first to test the flow.', 'warning');
      return;
    }

    // If already in test mode, just toggle it off
    if (isTestMode) {
      try {
        // Clear auto-exit timer if exists
        if (testModeTimer) {
          clearTimeout(testModeTimer);
          setTestModeTimer(null);
        }
        
        await updateFlow(id, { 
          test_mode: false, 
          test_disable_writes: false, 
          test_auto_exit: false,
          test_auto_exit_minutes: 5 
        });
        setIsTestMode(false);
        setTestModeDisableWrites(false);
        setTestModeAutoExit(false);
        setTestModeAutoExitMinutes(5);
        setTestModeAutoExitSeconds(0);
        setTestModeTimeRemaining(null);
        setFlow({ ...flow, test_mode: false, test_disable_writes: false, test_auto_exit: false, test_auto_exit_minutes: 5 });
        showSnackbar('Test mode disabled', 'info');
      } catch (error) {
        showSnackbar('Failed to disable test mode: ' + error.message, 'error');
      }
      return;
    }

    // Show test mode configuration dialog
    setTestModeDialogOpen(true);
  };

  // Start test mode with configuration
  const handleStartTestMode = async (disableWrites, autoExit, autoExitMinutes, autoExitSeconds) => {
    try {
      // Check for trigger nodes and show warning if none found
      const triggerNode = nodes.find(n => n.type === 'trigger-manual');
      if (!triggerNode) {
        showSnackbar('Warning: No manual trigger node found. Flow must be triggered manually or via events.', 'warning');
        // Continue anyway - trigger might be in user script
      }

      // Validate before test deployment
      const validation = validateForDeploy(nodes, edges);
      if (!validation.valid) {
        const errorList = validation.errors.map(e => e.message).join('; ');
        showSnackbar('Cannot start test: ' + errorList, 'error');
        return;
      }

      // Convert to total minutes (with fractional seconds)
      const totalMinutes = autoExitMinutes + (autoExitSeconds / 60);

      // Enable test mode
      await updateFlow(id, { 
        test_mode: true, 
        test_disable_writes: disableWrites, 
        test_auto_exit: autoExit,
        test_auto_exit_minutes: totalMinutes 
      });
      setIsTestMode(true);
      setTestModeDisableWrites(disableWrites);
      setTestModeAutoExit(autoExit);
      setTestModeAutoExitMinutes(autoExitMinutes);
      setTestModeAutoExitSeconds(autoExitSeconds);
      setFlow({ 
        ...flow, 
        test_mode: true, 
        test_disable_writes: disableWrites, 
        test_auto_exit: autoExit,
        test_auto_exit_minutes: totalMinutes 
      });
      
      // Set countdown timer if auto-exit is enabled
      if (autoExit) {
        const totalSeconds = autoExitMinutes * 60 + autoExitSeconds;
        setTestModeTimeRemaining(totalSeconds);
        
        // Update countdown every second
        const countdownInterval = setInterval(() => {
          setTestModeTimeRemaining(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        // Set auto-exit timer based on total seconds
        const timer = setTimeout(async () => {
          clearInterval(countdownInterval);
          try {
            await updateFlow(id, { 
              test_mode: false, 
              test_disable_writes: false, 
              test_auto_exit: false,
              test_auto_exit_minutes: 5 
            });
            setIsTestMode(false);
            setTestModeDisableWrites(false);
            setTestModeAutoExit(false);
            setTestModeAutoExitMinutes(5);
            setTestModeAutoExitSeconds(0);
            setTestModeTimer(null);
            setTestModeTimeRemaining(null);
            setFlow({ ...flow, test_mode: false, test_disable_writes: false, test_auto_exit: false, test_auto_exit_minutes: 5 });
            const timeStr = autoExitMinutes > 0 ? `${autoExitMinutes} minute${autoExitMinutes > 1 ? 's' : ''}` : '';
            const secStr = autoExitSeconds > 0 ? `${autoExitSeconds} second${autoExitSeconds > 1 ? 's' : ''}` : '';
            const fullTimeStr = [timeStr, secStr].filter(Boolean).join(' ');
            showSnackbar(`Test mode auto-exited after ${fullTimeStr}`, 'info');
          } catch (error) {
            showSnackbar('Failed to auto-exit test mode: ' + error.message, 'warning');
          }
        }, totalSeconds * 1000);
        
        setTestModeTimer(timer);
      }
      
      const writesMsg = disableWrites ? ' (writes disabled)' : '';
      const timeStr = autoExitMinutes > 0 ? `${autoExitMinutes}m` : '';
      const secStr = autoExitSeconds > 0 ? `${autoExitSeconds}s` : '';
      const fullTimeStr = [timeStr, secStr].filter(Boolean).join(' ');
      const autoExitMsg = autoExit ? ` (auto-exit in ${fullTimeStr})` : '';
      showSnackbar(`Test mode enabled${writesMsg}${autoExitMsg} - Flow is temporarily deployed.`, 'success');
    } catch (error) {
      showSnackbar('Failed to enable test mode: ' + error.message, 'error');
    }
  };

  // Execute single node (for testing in NDV)
  const handleExecuteNode = async (nodeId) => {
    if (!flow || !nodeId) return;

    setIsExecutingNode(true);
    setNdvExecutionData(null);

    try {
      const result = await testExecuteNode(flow.id, nodeId);
      
      // Format execution data for NDV
      const executionData = {
        input: result.input,
        output: result.output,
        executionTime: result.executionTime,
        status: result.status,
        error: result.error,
        logs: result.output?.logs || []
      };

      setNdvExecutionData(executionData);
      
      if (result.status === 'success') {
        showSnackbar(`Node executed in ${result.executionTime}ms`, 'success');
      } else {
        showSnackbar(`Node execution failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showSnackbar('Failed to execute node: ' + error.message, 'error');
      setNdvExecutionData({
        input: null,
        output: null,
        executionTime: 0,
        status: 'error',
        error: error.message
      });
    } finally {
      setIsExecutingNode(false);
    }
  };

  // Execute from node (partial execution - test from this node)
  const handleExecuteFromNode = async (nodeId) => {
    if (!flow || !nodeId) return;

    try {
      const result = await executeFromNode(flow.id, nodeId);
      showSnackbar(
        `Partial execution started from node "${result.startNode}" (${result.nodesInSubgraph} nodes): ${result.jobId}`,
        'success'
      );
    } catch (error) {
      showSnackbar('Failed to execute from node: ' + error.message, 'error');
    }
  };

  // Pin data to node
  const handlePinData = async (nodeId, data) => {
    try {
      const updatedPinnedData = { ...pinnedData, [nodeId]: data };
      setPinnedData(updatedPinnedData);

      // Save to flow definition
      const updatedDefinition = {
        ...flow.definition,
        pinData: updatedPinnedData
      };

      await updateFlow(id, { definition: updatedDefinition });
      setFlow({ ...flow, definition: updatedDefinition });
      showSnackbar('Data pinned successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to pin data: ' + error.message, 'error');
    }
  };

  // Unpin data from node
  const handleUnpinData = async (nodeId) => {
    try {
      const updatedPinnedData = { ...pinnedData };
      delete updatedPinnedData[nodeId];
      setPinnedData(updatedPinnedData);

      // Save to flow definition
      const updatedDefinition = {
        ...flow.definition,
        pinData: updatedPinnedData
      };

      await updateFlow(id, { definition: updatedDefinition });
      setFlow({ ...flow, definition: updatedDefinition });
      showSnackbar('Data unpinned successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to unpin data: ' + error.message, 'error');
    }
  };

  // Update nodes with hasPinnedData flag and runtime data
  // Use live data when available, otherwise fall back to pinned data
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        // Prefer live data over pinned data
        const runtimeData = liveData[node.id] || pinnedData[node.id] || {};
        
        return {
          ...node,
          data: {
            ...node.data,
            hasPinnedData: !!pinnedData[node.id],
            runtime: runtimeData,
          },
        };
      })
    );
  }, [pinnedData, liveData, setNodes]);

  // Update flow settings
  const handleSaveSettings = async (settings) => {
    try {
      await updateFlow(id, settings);
      setFlow({ ...flow, ...settings });
      showSnackbar('Flow settings updated', 'success');
    } catch (error) {
      showSnackbar('Failed to update settings: ' + error.message, 'error');
    }
  };

  // Validate connection compatibility
  const isValidConnection = useCallback((connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) {
      showSnackbar('Cannot connect: nodes not found', 'error');
      return false;
    }
    
    // Get metadata for both nodes
    const sourceMetadata = getBackendMetadata(sourceNode.type);
    const targetMetadata = getBackendMetadata(targetNode.type);
    
    if (!sourceMetadata || !targetMetadata) return true; // Allow if metadata not available
    
    // Get output type from source (always uses sourceHandle which is just 'source')
    // Handle both array format ([...]) and object format ({value: {...}, quality: {...}})
    let sourceOutput;
    if (Array.isArray(sourceMetadata.outputs)) {
      sourceOutput = sourceMetadata.outputs[0];
    } else if (sourceMetadata.outputs && typeof sourceMetadata.outputs === 'object') {
      // For object format, get first value
      const outputKeys = Object.keys(sourceMetadata.outputs);
      sourceOutput = outputKeys.length > 0 ? sourceMetadata.outputs[outputKeys[0]] : undefined;
    }
    
    if (!sourceOutput) {
      showSnackbar('Cannot connect: source node has no output', 'error');
      return false;
    }
    
    // Get input type from target using targetHandle (e.g., 'input-0', 'input-1')
    const targetHandleIndex = connection.targetHandle ? parseInt(connection.targetHandle.split('-')[1]) : 0;
    
    // Handle both array format ([...]) and object format ({input0: {...}, input1: {...}})
    let targetInput;
    if (Array.isArray(targetMetadata.inputs)) {
      targetInput = targetMetadata.inputs[targetHandleIndex];
    } else if (targetMetadata.inputs && typeof targetMetadata.inputs === 'object') {
      // For object format, get the Nth value
      const inputKeys = Object.keys(targetMetadata.inputs);
      const key = inputKeys[targetHandleIndex];
      targetInput = key ? targetMetadata.inputs[key] : undefined;
    }
    
    if (!targetInput) {
      showSnackbar('Cannot connect: target node has no input', 'error');
      return false;
    }
    
    // Type compatibility rules
    const sourceType = sourceOutput.type;
    const targetType = targetInput.type;
    
    // Same type is always valid
    if (sourceType === targetType) return true;
    
    // 'main' type (generic data from tag nodes) can connect to any specific type
    if (sourceType === 'main') return true;
    
    // 'any' target type can accept anything
    if (targetType === 'any') return true;
    
    // String target is flexible - can accept most types
    if (targetType === 'string') return true;
    
    // Number target can accept number only
    if (targetType === 'number' && sourceType !== 'number') {
      showSnackbar(`Cannot connect: ${sourceNode.data?.name || sourceNode.type} outputs ${sourceType}, but ${targetNode.data?.name || targetNode.type} expects number`, 'error');
      return false;
    }
    
    // Boolean target can accept boolean only
    if (targetType === 'boolean' && sourceType !== 'boolean') {
      showSnackbar(`Cannot connect: ${sourceNode.data?.name || sourceNode.type} outputs ${sourceType}, but ${targetNode.data?.name || targetNode.type} expects boolean`, 'error');
      return false;
    }
    
    // Trigger type should only connect to trigger inputs (prevents trigger -> number/boolean)
    if (sourceType === 'trigger' && targetType !== 'trigger') {
      showSnackbar(`Cannot connect: trigger outputs cannot connect to ${targetType} inputs`, 'error');
      return false;
    }
    
    // Default: allow connection
    return true;
  }, [nodes, showSnackbar]);

  // Handle edge connection
  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed }
    }, eds));
    setHasUnsavedChanges(true); // Mark as having unsaved changes
  }, [setEdges]);

  // Handle node deletion
  const onNodesDelete = useCallback((deleted) => {
    // Close node config panel if the deleted node was selected
    const deletedIds = deleted.map(node => node.id);
    if (selectedNode && deletedIds.includes(selectedNode.id)) {
      setSelectedNode(null);
    }
    setHasUnsavedChanges(true); // Mark as having unsaved changes
  }, [selectedNode]);

  // Handle edge deletion
  const onEdgesDelete = useCallback((deleted) => {
    // No additional cleanup needed for edge deletion
    setHasUnsavedChanges(true); // Mark as having unsaved changes
  }, []);

  // Handle node drag from palette
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {} // Config panel will manage node data
      };

      setNodes((nds) => nds.concat(newNode));
      setHasUnsavedChanges(true); // Mark as having unsaved changes
      setNodeBrowserOpen(false); // Close browser after adding node
    },
    [reactFlowInstance, setNodes]
  );

  // Handle adding node from browser (click)
  const handleAddNodeFromBrowser = useCallback((nodeType, position = null) => {
    let finalPosition = position;
    
    if (!position && reactFlowInstance) {
      // Get the current viewport (what the user is looking at)
      const viewport = reactFlowInstance.getViewport();
      
      // Get the center of the visible canvas area
      // Account for sidebar (240px) and calculate canvas dimensions
      const canvasWidth = window.innerWidth - 240; // Subtract sidebar width
      const canvasHeight = window.innerHeight - 64; // Subtract topbar height
      
      // Calculate the center point in screen coordinates
      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;
      
      // Convert screen coordinates to flow coordinates
      // by inverting the viewport transformation
      finalPosition = reactFlowInstance.screenToFlowPosition({
        x: centerX,
        y: centerY,
      });
    } else if (!position) {
      // Fallback if reactFlowInstance is not available
      finalPosition = { x: 250, y: 200 };
    }

    // Get metadata for the node type to initialize with defaults
    const metadata = getNodeMetadata(nodeType);
    const inputCount = metadata?.inputs?.length || 0;
    
    // Initialize node data with default values from properties
    const initialData = {
      // Initialize with default input count from node type metadata
      inputCount: inputCount > 0 ? inputCount : undefined,
    };
    
    // Add default values for all properties that have them
    if (metadata?.properties) {
      metadata.properties.forEach(prop => {
        if (prop.default !== undefined && prop.name) {
          initialData[prop.name] = prop.default;
        }
      });
    }
    
    const newNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: finalPosition,
      data: initialData
    };

    setNodes((nds) => nds.concat(newNode));
    setNodeBrowserOpen(false); // Close browser after adding node
  }, [reactFlowInstance, setNodes]);

  // Handle node selection
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  // Handle node double-click (open NDV)
  const onNodeDoubleClick = useCallback((event, node) => {
    setNdvNode(node);
    setNdvOpen(true);
  }, []);

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Update selected node data
  const handleNodeDataChange = useCallback((newData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );
    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...newData } });
    setHasUnsavedChanges(true); // Mark as having unsaved changes
  }, [selectedNode, setNodes]);

  if (!flow) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading flow...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      position: 'fixed',
      top: 64,
      left: 240,
      right: 0,
      bottom: 0,
      overflow: 'hidden'
    }}>
      {/* Toolbar */}
      <Paper elevation={2}>
        <Toolbar>
          <IconButton onClick={() => navigate('/flows')} edge="start">
            <BackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
            {flow.name}
          </Typography>
          
          {hasUnsavedChanges && (
            <Typography variant="caption" color="warning.main" sx={{ mr: 2 }}>
              Unsaved changes
            </Typography>
          )}
          
          <Button
            startIcon={<RunIcon />}
            onClick={handleRun}
            disabled={!isTestMode && flow.deployed}
            variant={isTestMode ? 'contained' : 'outlined'}
            color={isTestMode ? 'warning' : 'primary'}
            sx={{ mr: 1 }}
          >
            {isTestMode ? (testModeTimeRemaining !== null ? `Stop Test (${Math.floor(testModeTimeRemaining / 60)}:${String(testModeTimeRemaining % 60).padStart(2, '0')})` : 'Stop Test') : 'Test Run'}
          </Button>
          
          <Button
            startIcon={<SaveIcon />}
            onClick={handleSave}
            variant="outlined"
            sx={{ mr: 1 }}
          >
            Save
          </Button>
          
          <ExportFlowButton 
            flowId={id} 
            flowName={flow.name}
          />
          
          <Button
            startIcon={flow.deployed ? <UndeployIcon /> : <DeployIcon />}
            onClick={handleDeploy}
            variant="contained"
            color={flow.deployed ? 'secondary' : 'primary'}
            sx={{ mr: 1, ml: 1 }}
          >
            {flow.deployed ? 'Undeploy' : 'Deploy'}
          </Button>

          <Tooltip title={showExecutionOrder ? 'Hide Execution Order' : 'Show Execution Order'}>
            <Button
              onClick={handleShowExecutionOrder}
              variant={showExecutionOrder ? 'contained' : 'outlined'}
              color={showExecutionOrder ? 'info' : 'inherit'}
              sx={{ mr: 1, minWidth: '40px', px: 1 }}
            >
              {showExecutionOrder ? '123' : '123'}
            </Button>
          </Tooltip>
          
          <Tooltip title={showLiveValues ? 'Hide Live Values' : 'Show Live Values'}>
            <IconButton
              onClick={() => setShowLiveValues(!showLiveValues)}
              sx={{
                mr: 1,
                color: showLiveValues ? '#1976d2' : 'inherit',
                bgcolor: showLiveValues ? '#e3f2fd' : 'transparent',
                '&:hover': {
                  bgcolor: showLiveValues ? '#bbdefb' : 'rgba(0, 0, 0, 0.04)',
                },
              }}
            >
              <LiveIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={flow?.deployed ? "Resource Monitor" : "Deploy flow to monitor resources"}>
            <span>
              <IconButton 
                onClick={() => setResourceMonitorOpen(true)}
                disabled={!flow?.deployed}
                sx={{
                  color: resourceMonitorOpen ? '#1976d2' : 'inherit',
                  bgcolor: resourceMonitorOpen ? '#e3f2fd' : 'transparent',
                  '&:hover': {
                    bgcolor: resourceMonitorOpen ? '#bbdefb' : 'rgba(0, 0, 0, 0.04)',
                  },
                }}
              >
                <ResourceIcon />
              </IconButton>
            </span>
          </Tooltip>
          
          <IconButton onClick={() => setNodeBrowserOpen(true)} title="Add Node (/)">
            <AddIcon />
          </IconButton>
          
          <IconButton onClick={() => setHistoryOpen(true)} title="Execution History">
            <HistoryIcon />
          </IconButton>
          
          <Tooltip title={`${logPanelOpen ? 'Hide' : 'Show'} Logs (Ctrl+L)`}>
            <IconButton 
              onClick={() => setLogPanelOpen(!logPanelOpen)} 
              sx={{
                color: logPanelOpen ? '#1976d2' : 'inherit',
                bgcolor: logPanelOpen ? '#e3f2fd' : 'transparent',
                '&:hover': {
                  bgcolor: logPanelOpen ? '#bbdefb' : 'rgba(0, 0, 0, 0.04)',
                },
              }}
            >
              <Badge 
                color="error" 
                variant="dot" 
                invisible={!currentExecutionId || logPanelOpen}
              >
                <TerminalIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          
          <IconButton onClick={() => setSettingsOpen(true)} title="Flow Settings">
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </Paper>

      {/* Main content */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: logPanelOpen && logPanelPosition === 'right' ? 'row' : 'column',
        flex: 1,
        overflow: 'hidden', 
        minHeight: 0,
      }}>
        {/* Canvas and Node Config Panel Container */}
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'row',
          flex: 1,
          overflow: 'hidden',
        }}>
          {/* React Flow Canvas */}
          <Box 
            ref={reactFlowWrapper} 
            sx={{ 
              flex: 1, 
              height: '100%',
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </Box>

          {/* Node Config Panel */}
          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              onDataChange={handleNodeDataChange}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </Box>
        
        {/* Log Panel - Right Position */}
        {logPanelOpen && logPanelPosition === 'right' && (
          <LogPanel
            flowId={id}
            position="right"
            onPositionChange={handleLogPanelPositionChange}
            onClose={() => setLogPanelOpen(false)}
            currentExecutionId={currentExecutionId}
            onNodeHighlight={highlightNode}
          />
        )}
      </Box>
      
      {/* Log Panel - Bottom Position */}
      {logPanelOpen && logPanelPosition === 'bottom' && (
        <LogPanel
          flowId={id}
          position="bottom"
          onPositionChange={handleLogPanelPositionChange}
          onClose={() => setLogPanelOpen(false)}
          currentExecutionId={currentExecutionId}
          onNodeHighlight={highlightNode}
        />
      )}

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Flow Settings Dialog */}
      <FlowSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        flow={flow}
        onSave={handleSaveSettings}
      />

      {/* Execution History Dialog */}
      <ExecutionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        flowId={id}
        flow={flow}
      />

      {/* Node Browser */}
      <NodeBrowser
        open={nodeBrowserOpen}
        onClose={() => setNodeBrowserOpen(false)}
        onAddNode={handleAddNodeFromBrowser}
      />

      {/* Node Details Panel */}
      <NodeDetailsPanel
        open={ndvOpen}
        onClose={() => setNdvOpen(false)}
        node={ndvNode}
        onNodeDataChange={handleNodeDataChange}
        onExecuteNode={handleExecuteNode}
        onExecuteFromNode={handleExecuteFromNode}
        onPinData={handlePinData}
        onUnpinData={handleUnpinData}
        pinnedData={ndvNode ? pinnedData[ndvNode.id] : null}
        executionData={ndvExecutionData}
        isExecuting={isExecutingNode}
        flowDefinition={flow?.definition}
      />

      {/* Test Mode Configuration Dialog */}
      <Dialog open={testModeDialogOpen} onClose={() => setTestModeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Start Test Mode</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Test mode temporarily deploys your flow for testing. Configure options below.
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={testModeDisableWrites}
                    onChange={(e) => setTestModeDisableWrites(e.target.checked)}
                  />
                }
                label="Disable writes to tags"
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
                Tag-output nodes will not write values. Test without affecting production data.
              </Typography>
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={testModeAutoExit}
                    onChange={(e) => setTestModeAutoExit(e.target.checked)}
                  />
                }
                label="Auto-exit test mode after timeout"
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                Automatically exit test mode after the specified duration.
              </Typography>
              
              {testModeAutoExit && (
                <Box sx={{ ml: 4, display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    label="Minutes"
                    type="number"
                    value={testModeAutoExitMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setTestModeAutoExitMinutes(Math.max(0, Math.min(60, val)));
                    }}
                    inputProps={{ min: 0, max: 60 }}
                    sx={{ width: 100 }}
                  />
                  <TextField
                    size="small"
                    label="Seconds"
                    type="number"
                    value={testModeAutoExitSeconds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setTestModeAutoExitSeconds(Math.max(0, Math.min(59, val)));
                    }}
                    inputProps={{ min: 0, max: 59 }}
                    sx={{ width: 100 }}
                  />
                </Box>
              )}
            </FormGroup>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestModeDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              // Validate that at least some time is set
              if (testModeAutoExit && testModeAutoExitMinutes === 0 && testModeAutoExitSeconds === 0) {
                showSnackbar('Please set a duration greater than 0', 'warning');
                return;
              }
              setTestModeDialogOpen(false);
              handleStartTestMode(testModeDisableWrites, testModeAutoExit, testModeAutoExitMinutes, testModeAutoExitSeconds);
            }} 
            variant="contained"
          >
            Start Test
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resource Monitor Dialog */}
      <FlowResourceMonitor
        open={resourceMonitorOpen}
        onClose={() => setResourceMonitorOpen(false)}
        flowId={flow?.id}
        flowName={flow?.name}
        resourceData={resourceData}
        loading={resourceLoading}
        onRefresh={refetchResources}
      />
    </Box>
  );
};

export default FlowEditor;
