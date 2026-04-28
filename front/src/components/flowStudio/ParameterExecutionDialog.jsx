import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  History as HistoryIcon,
  Description as LogsIcon,
} from '@mui/icons-material';
import { getFlowParameters, executeFlow, getLastExecution } from '../../services/flowsApi';
import FlowParameterPanel from '../shared/FlowParameterPanel';
import ExecutionLogsDialog from '../shared/ExecutionLogsDialog';
import ExecutionHistoryDialog from '../shared/ExecutionHistoryDialog';

/**
 * Parameter Execution Dialog
 * Modal dialog for executing flows with parameters
 */
export default function ParameterExecutionDialog({ open, onClose, flow, onExecutionStarted }) {
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [inputSchema, setInputSchema] = useState([]);
  const [outputSchema, setOutputSchema] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [outputValues, setOutputValues] = useState({});
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [lastExecutionTime, setLastExecutionTime] = useState(null);
  const lastDownloadedExecutionIdRef = React.useRef(null);
  const isMountedRef = React.useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // Load parameter schema and history when dialog opens
  useEffect(() => {
    if (open && flow?.id) {
      loadParameters();
    } else {
      // Reset state when dialog closes
      setInputValues({});
      setOutputValues({});
      setErrors({});
      setGeneralError('');
    }
  }, [open, flow?.id]);

  const loadParameters = async () => {
    setLoading(true);
    setGeneralError('');
    
    try {
      // Load parameter schema (now returns inputs and outputs separately)
      const schemaData = await getFlowParameters(flow.id);
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
      const storageKey = `flow_params_${flow.id}`;
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
        const lastExec = await getLastExecution(flow.id);
        if (lastExec.hasExecution && lastExec.outputs) {
          // Map node outputs to output parameters
          // Backend stores: { [nodeId]: { value, quality, logs, error, ... } }
          const mappedOutputs = {};
          for (const outputParam of schemaData.outputs || []) {
            const nodeOutput = lastExec.outputs[outputParam.nodeId];
            
            if (nodeOutput && nodeOutput.value !== undefined) {
              // For single-output nodes, use the value directly
              // For multi-output nodes, value might be an array - index into it
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
    } catch (error) {
      console.error('Failed to load parameters:', error);
      setGeneralError(error.message || 'Failed to load parameters');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (paramName, value) => {
    setInputValues(prev => ({ ...prev, [paramName]: value }));
    // Clear error for this parameter
    if (errors[paramName]) {
      setErrors(prev => {
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
      
      // Check required
      if (param.required && (value === null || value === undefined || value === '')) {
        newErrors[param.name] = `${param.alias || param.displayName || param.name} is required`;
        continue;
      }
      
      // Type-specific validation
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
        
        if (param.type === 'string' || param.type === 'file' || param.type === 'directory') {
          if (param.min !== undefined && value.length < param.min) {
            newErrors[param.name] = `Must be at least ${param.min} characters`;
          } else if (param.max !== undefined && value.length > param.max) {
            newErrors[param.name] = `Must be at most ${param.max} characters`;
          }
        }
      }
    }
    
    return newErrors;
  };

  const handleExecute = async () => {
    setGeneralError('');
    
    // Validate
    const validationErrors = validateParameters();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setExecuting(true);
    
    try {
      // Always save values to localStorage
      const storageKey = `flow_params_${flow.id}`;
      localStorage.setItem(storageKey, JSON.stringify(inputValues));
      
      // Execute flow with parameters
      const result = await executeFlow(flow.id, null, inputValues);

      const pollForDownloadsAndOutputs = async () => {
        try {
          const lastExec = await getLastExecution(flow.id);
          if (lastExec.hasExecution && lastExec.outputs) {
            // Auto-download any Save File outputs (one-time per execution)
            if (lastExec.executionId && lastDownloadedExecutionIdRef.current !== lastExec.executionId) {
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

              lastDownloadedExecutionIdRef.current = lastExec.executionId;
            }

            // If there are outputs, map node outputs to output parameters
            if (outputSchema.length > 0 && isMountedRef.current) {
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
          }
        } catch (err) {
          console.warn('Failed to reload outputs/downloads:', err);
        } finally {
          if (isMountedRef.current) {
            setExecuting(false);
          }
        }
      };
      
      // Always poll once for downloads (and outputs, if any)
      setTimeout(pollForDownloadsAndOutputs, 3000);

      // If there are outputs, keep dialog open to show them
      if (outputSchema.length > 0) {
        if (onExecutionStarted) {
          onExecutionStarted(result);
        }
        return;
      }
      
      // Notify parent and close
      if (onExecutionStarted) {
        onExecutionStarted(result);
      }
      onClose();
    } catch (error) {
      console.error('Failed to execute flow:', error);
      setGeneralError(error.message || 'Failed to execute flow');
    } finally {
      // If we're waiting on last-execution polling, don't flip executing off here.
      if (outputSchema.length === 0) {
        setExecuting(false);
      }
    }
  };



  // (renderOutputValue removed - now handled by FlowParameterPanel)

  if (!flow) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      disableEscapeKeyDown={executing}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" component="div">
            Execute: {flow.name}
          </Typography>
          <IconButton onClick={onClose} disabled={executing} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 2, py: 2 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : generalError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {generalError}
          </Alert>
        ) : (
          <Box>
            {inputSchema.length === 0 && outputSchema.length === 0 ? (
              <Alert severity="info">
                This flow has no configurable parameters.
              </Alert>
            ) : (
              <FlowParameterPanel
                inputSchema={inputSchema}
                outputSchema={outputSchema}
                inputValues={inputValues}
                outputValues={outputValues}
                onInputChange={handleValueChange}
                errors={errors}
                disabled={executing}
                outputPlaceholder="Not executed"
                lastExecutionTime={lastExecutionTime}
              />
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, justifyContent: 'space-between' }}>
        {/* Left side - Logs and History buttons */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            startIcon={<LogsIcon />}
            onClick={() => setLogsDialogOpen(true)}
            disabled={executing}
          >
            Logs
          </Button>
          <Button
            size="small"
            startIcon={<HistoryIcon />}
            onClick={() => setHistoryDialogOpen(true)}
            disabled={executing}
          >
            History
          </Button>
        </Box>

        {/* Right side - Cancel and Execute buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={executing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleExecute}
            disabled={loading || executing}
          >
            {executing ? <CircularProgress size={24} /> : 'Run Now'}
          </Button>
        </Box>
      </DialogActions>

      {/* Logs Dialog */}
      {flow && (
        <ExecutionLogsDialog
          open={logsDialogOpen}
          onClose={() => setLogsDialogOpen(false)}
          flowId={flow.id}
          flowName={flow.name}
          executionId={null}
        />
      )}

      {/* History Dialog */}
      {flow && (
        <ExecutionHistoryDialog
          open={historyDialogOpen}
          onClose={() => setHistoryDialogOpen(false)}
          flowId={flow.id}
          flowDefinition={flow}
        />
      )}
    </Dialog>
  );
}
