import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Divider,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  History as HistoryIcon,
  Description as LogsIcon,
} from '@mui/icons-material';
import { getFlow, getFlowParameters, executeFlow, getLastExecution } from '../../services/flowsApi';
import FlowParameterPanel from '../shared/FlowParameterPanel';
import ExecutionLogsDialog from '../shared/ExecutionLogsDialog';
import ExecutionHistoryDialog from '../shared/ExecutionHistoryDialog';

/**
 * FlowWidget Component
 * Displays a flow execution widget on dashboards with inline parameter form
 * Allows users to configure and execute flows directly from the dashboard
 */
export default function FlowWidget({ flowId, config = {}, onFlowLoaded }) {
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [executing, setExecuting] = useState(false);
  const [inputSchema, setInputSchema] = useState([]);
  const [outputSchema, setOutputSchema] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [outputValues, setOutputValues] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [lastExecutionTime, setLastExecutionTime] = useState(null);
  const [lastDownloadedExecutionId, setLastDownloadedExecutionId] = useState(null);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // Load flow data and parameters
  useEffect(() => {
    if (!flowId) {
      setError('No flow ID provided');
      setLoading(false);
      return;
    }

    loadFlowData();
  }, [flowId]);

  const loadFlowData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await getFlow(flowId);
      const flowData = response.flow || response;
      
      // Validate flow is manual mode
      const executionMode = (flowData.execution_mode || '').toString().trim().toLowerCase();
      if (executionMode !== 'manual') {
        setError('Only manual flows can be added to dashboards');
        setLoading(false);
        return;
      }
      
      setFlow(flowData);
      
      // Notify parent component that flow is loaded
      if (onFlowLoaded && typeof onFlowLoaded === 'function') {
        onFlowLoaded(flowData);
      }
      
      // Load parameter schema (now returns inputs and outputs separately)
      const schemaData = await getFlowParameters(flowId);
      setInputSchema(schemaData.inputs || []);
      setOutputSchema(schemaData.outputs || []);
      
      // Initialize default input values
      const defaults = {};
      for (const param of schemaData.inputs || []) {
        if (param.defaultValue !== undefined && param.defaultValue !== null) {
          defaults[param.name] = param.defaultValue;
        }
      }
      
      // Try to load last used input values from localStorage
      const storageKey = `flow_params_${flowId}`;
      const savedValues = localStorage.getItem(storageKey);
      if (savedValues) {
        try {
          const parsed = JSON.parse(savedValues);
          setInputValues({ ...defaults, ...parsed });
        } catch (e) {
          setInputValues(defaults);
        }
      } else {
        setInputValues(defaults);
      }
      
      // Load last execution outputs
      try {
        const lastExec = await getLastExecution(flowId);
        if (lastExec.hasExecution && lastExec.outputs) {
          // Map node outputs to output parameters
          const mappedOutputs = {};
          for (const outputParam of outputSchema) {
            const nodeOutput = lastExec.outputs[outputParam.nodeId];
            
            if (nodeOutput && nodeOutput.value !== undefined) {
              let outputValue = nodeOutput.value;
              
              // If parameter looks like "output_N" and value is array, extract specific index
              if (/^output_\d+$/.test(outputParam.nodeParameter) && Array.isArray(outputValue)) {
                const index = parseInt(outputParam.nodeParameter.split('_')[1], 10);
                outputValue = outputValue[index];
              }
              
              if (outputValue !== undefined) {
                mappedOutputs[outputParam.name] = outputValue;
              }
            }
          }
          setOutputValues(mappedOutputs);
          setLastExecutionTime(lastExec.completedAt);
        }
      } catch (err) {
        console.warn('Failed to load last execution outputs:', err);
        // Not a critical error, continue without outputs
      }
    } catch (err) {
      console.error('Failed to load flow:', err);
      setError(err.message || 'Failed to load flow');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (paramName, value) => {
    setInputValues(prev => ({ ...prev, [paramName]: value }));
    // Clear error for this parameter
    if (validationErrors[paramName]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[paramName];
        return newErrors;
      });
    }
  };

  const validateParameters = () => {
    const newErrors = {};
    
    for (const param of inputSchema) {
      // Skip validation for read-only (connected) inputs
      if (param.readOnly) continue;
      
      const value = inputValues[param.name];
      
      if (param.required && (value === null || value === undefined || value === '')) {
        newErrors[param.name] = `${param.displayName || param.name} is required`;
        continue;
      }
      
      if (value !== null && value !== undefined && value !== '') {
        if (param.type === 'number') {
          const num = Number(value);
          if (isNaN(num)) {
            newErrors[param.name] = 'Must be a valid number';
          } else if (param.min !== undefined && num < param.min) {
            newErrors[param.name] = `Must be at least ${param.min}`;
          } else if (param.max !== undefined && num > param.max) {
            newErrors[param.name] = `Must be at most ${param.max}`;
          }
        }
      }
    }
    
    setValidationErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleExecute = async () => {
    if (!validateParameters()) {
      setSnackbar({ open: true, message: 'Please fix validation errors', severity: 'error' });
      return;
    }

    setExecuting(true);
    
    try {
      // Save values to localStorage
      const storageKey = `flow_params_${flowId}`;
      localStorage.setItem(storageKey, JSON.stringify(inputValues));
      
      // Execute flow
      const result = await executeFlow(flowId, inputValues);
      
      setSnackbar({ 
        open: true, 
        message: `Flow execution started`, 
        severity: 'success' 
      });
      
      // Poll for completion and reload outputs
      // Wait a bit then check for new execution
      setTimeout(async () => {
        try {
          const lastExec = await getLastExecution(flowId);
          if (lastExec.hasExecution && lastExec.outputs) {
            // Auto-download any Save File outputs (one-time per execution)
            if (lastExec.executionId && lastDownloadedExecutionId !== lastExec.executionId) {
              const downloads = [];
              for (const nodeOutput of Object.values(lastExec.outputs)) {
                const payload = nodeOutput?.value?.__download;
                if (payload?.dataBase64 && payload?.filename) {
                  downloads.push(payload);
                }
              }

              if (downloads.length > 0) {
                const triggerDownload = ({ filename, mimeType, dataBase64 }) => {
                  const binary = atob(dataBase64);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                  }
                  const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                };

                downloads.forEach(triggerDownload);
              }

              setLastDownloadedExecutionId(lastExec.executionId);
            }

            // Map node outputs to output parameters
            const mappedOutputs = {};
            for (const outputParam of outputSchema) {
              const nodeOutput = lastExec.outputs[outputParam.nodeId];
              
              if (nodeOutput && nodeOutput.value !== undefined) {
                let outputValue = nodeOutput.value;
                
                // If parameter looks like "output_N" and value is array, extract specific index
                if (/^output_\d+$/.test(outputParam.nodeParameter) && Array.isArray(outputValue)) {
                  const index = parseInt(outputParam.nodeParameter.split('_')[1], 10);
                  outputValue = outputValue[index];
                }
                
                if (outputValue !== undefined) {
                  mappedOutputs[outputParam.name] = outputValue;
                }
              }
            }
            setOutputValues(mappedOutputs);
            setLastExecutionTime(lastExec.completedAt);
            setSnackbar({ 
              open: true, 
              message: 'Flow completed successfully', 
              severity: 'success' 
            });
          }
        } catch (err) {
          console.warn('Failed to reload outputs:', err);
        }
      }, 3000); // Wait 3 seconds for execution to complete
      
    } catch (err) {
      console.error('Failed to execute flow:', err);
      setSnackbar({ 
        open: true, 
        message: err.message || 'Failed to execute flow', 
        severity: 'error' 
      });
    } finally {
      setExecuting(false);
    }
  };



  // Render loading state
  if (loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  // Render error state
  if (error || !flow) {
    return (
      <Box sx={{ height: '100%', p: 2 }}>
        <Alert severity="error">
          {error || 'Flow not found'}
        </Alert>
      </Box>
    );
  }

  const hasInputs = inputSchema.length > 0;
  const hasOutputs = outputSchema.length > 0;

  // Render flow widget with control panel layout
  return (
    <>
      <Box sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Scrollable Content Area */}
        <Box sx={{ 
          flex: 1, 
          overflow: 'auto',
          p: 1.5,
          pb: 0
        }}>
          {/* Flow Description */}
          {flow.description && (
            <Typography 
              variant="body2" 
              color="text.secondary" 
              sx={{ mb: 1.5, fontSize: '0.8125rem', lineHeight: 1.4 }}
            >
              {flow.description}
            </Typography>
          )}

          {/* Parameters Section - Shared Control Panel */}
          {(hasInputs || hasOutputs) && (
            <Box sx={{ mb: 1 }}>
              <FlowParameterPanel
                inputSchema={inputSchema}
                outputSchema={outputSchema}
                inputValues={inputValues}
                outputValues={outputValues}
                onInputChange={handleValueChange}
                errors={validationErrors}
                disabled={executing}
                outputPlaceholder="Waiting…"
                lastExecutionTime={lastExecutionTime}
              />
            </Box>
          )}

          {(!hasInputs && !hasOutputs) && (
            <Typography variant="body2" color="text.disabled" sx={{ mb: 1, fontStyle: 'italic', fontSize: '0.8125rem' }}>
              No parameters configured
            </Typography>
          )}
        </Box>

        {/* Sticky Footer with Actions */}
        <Box sx={{ 
          borderTop: 1, 
          borderColor: 'divider',
          p: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'background.paper'
        }}>
          {/* Left side - Logs and History buttons */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              startIcon={<LogsIcon />}
              onClick={() => setLogsDialogOpen(true)}
              disabled={executing}
              sx={{ 
                minWidth: 'auto',
                fontSize: '0.75rem',
                px: 1
              }}
            >
              Logs
            </Button>
            <Button
              size="small"
              startIcon={<HistoryIcon />}
              onClick={() => setHistoryDialogOpen(true)}
              disabled={executing}
              sx={{ 
                minWidth: 'auto',
                fontSize: '0.75rem',
                px: 1
              }}
            >
              History
            </Button>
          </Box>

          {/* Right side - Execute button */}
          <Button
            variant="contained"
            startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <ExecuteIcon />}
            onClick={handleExecute}
            disabled={executing}
            size="small"
            sx={{ minWidth: 100 }}
          >
            {executing ? 'Executing...' : 'Execute'}
          </Button>
        </Box>
      </Box>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />

      {/* Logs Dialog */}
      <ExecutionLogsDialog
        open={logsDialogOpen}
        onClose={() => setLogsDialogOpen(false)}
        flowId={flowId}
        flowName={flow?.name}
        executionId={null}
      />

      {/* History Dialog */}
      <ExecutionHistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        flowId={flowId}
        flowDefinition={flow}
      />
    </>
  );
}
