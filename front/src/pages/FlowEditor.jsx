import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from '@mui/icons-material';
import { getFlow, updateFlow, deployFlow, executeFlow, testExecuteNode, executeFromNode } from '../services/flowsApi';
import NodeBrowser from '../components/FlowEditor/NodeBrowser';
import NodeConfigPanel from '../components/FlowEditor/NodeConfigPanel';
import NodeDetailsPanel from '../components/FlowEditor/NodeDetailsPanel';
import FlowSettingsDialog from '../components/FlowEditor/FlowSettingsDialog';
import ExecutionHistoryDialog from '../components/FlowEditor/ExecutionHistoryDialog';

const FlowEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Load flow
  useEffect(() => {
    if (id) {
      loadFlow();
    }
  }, [id]);

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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodeBrowserOpen]);

  const loadFlow = async () => {
    try {
      const data = await getFlow(id);
      setFlow(data.flow);
      if (data.flow.definition) {
        setNodes(data.flow.definition.nodes || []);
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
      showSnackbar('Failed to deploy flow: ' + error.message, 'error');
    }
  };

  // Execute flow
  const handleRun = async () => {
    try {
      // Find trigger node
      const triggerNode = nodes.find(n => n.type === 'trigger-manual');
      if (!triggerNode) {
        showSnackbar('No trigger node found in flow', 'warning');
        return;
      }

      const result = await executeFlow(id, triggerNode.id);
      showSnackbar('Flow execution started: ' + result.jobId, 'success');
    } catch (error) {
      showSnackbar('Failed to execute flow: ' + error.message, 'error');
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

  // Update nodes with hasPinnedData flag when pinnedData changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          hasPinnedData: !!pinnedData[node.id],
        },
      }))
    );
  }, [pinnedData, setNodes]);

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

  // Handle edge connection
  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed }
    }, eds));
  }, [setEdges]);

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

    const newNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: finalPosition,
      data: {}
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
          
          <Button
            startIcon={<RunIcon />}
            onClick={handleRun}
            disabled={!flow.deployed}
            sx={{ mr: 1 }}
          >
            Test Run
          </Button>
          
          <Button
            startIcon={<SaveIcon />}
            onClick={handleSave}
            variant="outlined"
            sx={{ mr: 1 }}
          >
            Save
          </Button>
          
          <Button
            startIcon={flow.deployed ? <UndeployIcon /> : <DeployIcon />}
            onClick={handleDeploy}
            variant="contained"
            color={flow.deployed ? 'secondary' : 'primary'}
            sx={{ mr: 1 }}
          >
            {flow.deployed ? 'Undeploy' : 'Deploy'}
          </Button>
          
          <IconButton onClick={() => setNodeBrowserOpen(true)} title="Add Node (/)">
            <AddIcon />
          </IconButton>
          
          <IconButton onClick={() => setHistoryOpen(true)} title="Execution History">
            <HistoryIcon />
          </IconButton>
          
          <IconButton onClick={() => setSettingsOpen(true)} title="Flow Settings">
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </Paper>

      {/* Main content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* React Flow Canvas */}
        <Box ref={reactFlowWrapper} sx={{ flex: 1, height: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
    </Box>
  );
};

export default FlowEditor;
