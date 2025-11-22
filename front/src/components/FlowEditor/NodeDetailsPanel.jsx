import React, { useState, useEffect } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Button,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  PlayArrow as ExecuteIcon,
  PushPin as PinIcon,
  PushPinOutlined as UnpinIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { getNodeMetadata } from '../../constants/nodeTypes';
import DataDisplayPanel from './DataDisplayPanel';
import PinDataDialog from './PinDataDialog';
import SchemaPreview from './SchemaPreview';
import { getInputDataForNode } from '../../utils/schemaInference';

/**
 * Node Details View (NDV) - Modal panel for node configuration and data inspection
 * 
 * Features:
 * - Three-pane layout: Input | Settings | Output
 * - Execute node button
 * - Display mode toggle (Table/JSON)
 * - Run selector for multiple executions
 * - Execution status and timing
 * - Data pinning for consistent debugging
 */
const NodeDetailsPanel = ({ 
  open, 
  onClose, 
  node, 
  onNodeDataChange,
  onExecuteNode,
  onExecuteFromNode,
  onPinData,
  onUnpinData,
  pinnedData = null,
  executionData = null,
  isExecuting = false,
  flowDefinition = null
}) => {
  const [activeTab, setActiveTab] = useState(1); // 0=Input, 1=Settings, 2=Output, 3=Logs
  const [displayMode, setDisplayMode] = useState('table');
  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  const metadata = node ? getNodeMetadata(node.type) : null;

  // Load display mode preference
  useEffect(() => {
    if (node) {
      try {
        const saved = localStorage.getItem(`flow-ndv-mode-${node.type}`);
        if (saved) {
          setDisplayMode(saved);
        }
      } catch (error) {
        console.error('Error loading display mode:', error);
      }
    }
  }, [node]);

  // Save display mode preference
  const handleDisplayModeChange = (mode) => {
    setDisplayMode(mode);
    if (node) {
      try {
        localStorage.setItem(`flow-ndv-mode-${node.type}`, mode);
      } catch (error) {
        console.error('Error saving display mode:', error);
      }
    }
  };

  const handleClose = () => {
    setActiveTab(1); // Reset to settings tab
    onClose();
  };

  const handleExecute = () => {
    if (onExecuteNode && node) {
      onExecuteNode(node.id);
    }
  };

  const handleExecuteFromHere = () => {
    if (onExecuteFromNode && node) {
      onExecuteFromNode(node.id);
    }
  };

  const handlePinData = (data) => {
    if (onPinData && node) {
      onPinData(node.id, data);
    }
  };

  const handleUnpinData = () => {
    if (onUnpinData && node) {
      onUnpinData(node.id);
    }
  };

  const handleOpenPinDialog = () => {
    setPinDialogOpen(true);
  };

  // Handle Esc key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && open) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!node || !metadata) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          maxHeight: '800px',
        }
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
            }}
          >
            {metadata.icon}
          </Box>
          <Typography variant="h6">
            {metadata.displayName}
          </Typography>
          {node.data?.label && (
            <Typography variant="body2" color="text.secondary">
              ({node.data.label})
            </Typography>
          )}
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label="Input" disabled={!metadata.hasInput} />
          <Tab label="Settings" />
          <Tab label="Output" disabled={!metadata.hasOutput} />
          <Tab label="Logs" disabled={!executionData?.logs || executionData.logs.length === 0} />
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Input Panel */}
        {activeTab === 0 && (
          <DataDisplayPanel
            title="Input Data"
            data={executionData?.input}
            displayMode={displayMode}
            onDisplayModeChange={handleDisplayModeChange}
            noDataMessage="No input data. Execute the flow to see data."
          />
        )}

        {/* Settings Panel */}
        {activeTab === 1 && (
          <Box sx={{ p: 3, overflow: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom>
              Node Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {metadata.description}
            </Typography>

            {/* Node-specific configuration will go here */}
            {/* For now, show basic info */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Node ID: {node.id}
              </Typography>
            </Box>
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Type: {node.type}
              </Typography>
            </Box>

            {/* Test execution button */}
            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                startIcon={isExecuting ? <CircularProgress size={16} /> : <ExecuteIcon />}
                onClick={handleExecute}
                disabled={isExecuting}
                fullWidth
              >
                {isExecuting ? 'Executing...' : 'Test Node'}
              </Button>
            </Box>

            {/* Test from here button (partial execution) */}
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ExecuteIcon />}
                onClick={handleExecuteFromHere}
                disabled={!flowDefinition}
                fullWidth
              >
                Test from Here
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Execute this node and all downstream nodes
              </Typography>
            </Box>
          </Box>
        )}

        {/* Output Panel */}
        {activeTab === 2 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Execution info and pin controls */}
            {executionData?.output && (
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="success.main">
                    ✓ Success
                  </Typography>
                  {executionData.executionTime !== undefined && (
                    <Typography variant="caption" color="text.secondary">
                      Executed in {executionData.executionTime}ms
                    </Typography>
                  )}
                  {pinnedData && (
                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
                      <PinIcon fontSize="small" />
                      Pinned data active
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {pinnedData ? (
                    <Button
                      size="small"
                      startIcon={<UnpinIcon />}
                      onClick={handleUnpinData}
                      variant="outlined"
                    >
                      Unpin Data
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      startIcon={<PinIcon />}
                      onClick={handleOpenPinDialog}
                      variant="outlined"
                    >
                      Pin Data
                    </Button>
                  )}
                </Box>
              </Box>
            )}

            {/* Show schema preview if no execution data, otherwise show actual data */}
            {!executionData?.output && !pinnedData ? (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <SchemaPreview
                  node={node}
                  inputData={flowDefinition ? getInputDataForNode(node?.id, flowDefinition, {}) : {}}
                  flowDefinition={flowDefinition}
                  onExecuteNode={handleExecute}
                />
              </Box>
            ) : (
              <DataDisplayPanel
                title="Output Data"
                data={pinnedData || executionData?.output}
                displayMode={displayMode}
                onDisplayModeChange={handleDisplayModeChange}
                noDataMessage="No output data. Execute the node to see results."
                showActions={true}
              />
            )}
          </Box>
        )}

        {/* Logs Panel */}
        {activeTab === 3 && (
          <Box sx={{ p: 2, overflow: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom>
              Console Logs
            </Typography>
            {executionData?.logs && executionData.logs.length > 0 ? (
              <Box sx={{ mt: 2 }}>
                {executionData.logs.map((log, index) => (
                  <Box
                    key={index}
                    sx={{
                      mb: 1,
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: log.level === 'error' ? '#ffebee' : log.level === 'warn' ? '#fff3e0' : '#f5f5f5',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                    }}
                  >
                    {log.level === 'error' && <ErrorIcon sx={{ color: '#d32f2f', fontSize: 20 }} />}
                    {log.level === 'warn' && <WarningIcon sx={{ color: '#f57c00', fontSize: 20 }} />}
                    {(log.level === 'log' || log.level === 'info') && <InfoIcon sx={{ color: '#1976d2', fontSize: 20 }} />}
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {log.args.join(' ')}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No console logs. Use console.log(), console.warn(), or console.error() in your script.
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Pin Data Dialog */}
      <PinDataDialog
        open={pinDialogOpen}
        onClose={() => setPinDialogOpen(false)}
        onSave={handlePinData}
        initialData={pinnedData || executionData?.output}
        nodeName={metadata?.displayName || node?.type || 'Node'}
      />
    </Dialog>
  );
};

export default NodeDetailsPanel;
