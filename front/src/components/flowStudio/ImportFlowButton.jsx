import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Chip,
  TextField,
} from '@mui/material';
import { Upload, CheckCircle, Warning, Error as ErrorIcon } from '@mui/icons-material';
import { usePermissions } from '../../contexts/PermissionsContext';
import { validateFlowImport, executeFlowImport } from '../../services/flowsApi';

const ImportFlowButton = ({ onImportSuccess, open: controlledOpen, onClose: controlledOnClose }) => {
  const { can } = usePermissions();
  
  const [internalOpen, setInternalOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState(null);
  const [importData, setImportData] = useState(null);
  const [newName, setNewName] = useState('');

  // Use controlled state if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpen = () => {
    setFile(null);
    setError('');
    setValidation(null);
    setImportData(null);
    setNewName('');
    if (!isControlled) {
      setInternalOpen(true);
    }
  };

  const handleClose = () => {
    setFile(null);
    setError('');
    setValidation(null);
    setImportData(null);
    setNewName('');
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalOpen(false);
    }
  };

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError('');
    setValidation(null);
    setValidating(true);

    try {
      // Read file
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      setImportData(data);
      
      // Set default name from imported flow
      if (data.flow?.name && !newName) {
        setNewName(data.flow.name);
      }

      // Validate
      const validationResult = await validateFlowImport(data);
      setValidation(validationResult);

      if (!validationResult.valid) {
        setError('Validation failed - see details below');
      }
    } catch (err) {
      console.error('Validation failed:', err);
      setError(err.message || 'Invalid file format');
      setValidation(null);
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!validation || !importData || !validation.valid) return;

    setImporting(true);
    setError('');

    try {
      const result = await executeFlowImport(importData, validation, newName.trim() || null);
      
      // Success - close and notify parent
      if (onImportSuccess) {
        onImportSuccess(result.flow);
      }
      handleClose();
    } catch (err) {
      console.error('Import failed:', err);
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!can('flows', 'update')) {
    return null;
  }

  const fileInputId = isControlled ? 'flow-import-file-controlled' : 'flow-import-file';

  const dialogContent = (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Flow</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Import a flow from a JSON file exported from another DataForeman instance.
          </Typography>

          {/* File selector */}
          <Box>
            <input
              accept=".json"
              style={{ display: 'none' }}
              id={fileInputId}
              type="file"
              onChange={handleFileSelect}
            />
            <label htmlFor={fileInputId}>
              <Button
                variant="contained"
                component="span"
                startIcon={<Upload />}
                disabled={validating || importing}
              >
                Select Flow File
              </Button>
            </label>
            {file && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Selected: {file.name}
              </Typography>
            )}
          </Box>

          {/* Flow name field - shown after file is selected */}
          {importData && (
            <TextField
              label="Flow Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              disabled={validating || importing}
              helperText="You can rename the flow before importing"
            />
          )}

          {/* Validation in progress */}
          {validating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Validating...</Typography>
            </Box>
          )}

          {/* Errors */}
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Validation results */}
          {validation && !validating && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Validation Results
              </Typography>

              {/* Summary */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Chip
                  icon={<CheckCircle />}
                  label={`${validation.summary?.valid_connections || 0} valid connections`}
                  color="success"
                  size="small"
                />
                {validation.summary?.invalid_connections > 0 && (
                  <Chip
                    icon={<Warning />}
                    label={`${validation.summary.invalid_connections} invalid connections`}
                    color="warning"
                    size="small"
                  />
                )}
                <Chip
                  icon={<CheckCircle />}
                  label={`${validation.summary?.valid_tags || 0} valid tags`}
                  color="success"
                  size="small"
                />
                {validation.summary?.invalid_tags > 0 && (
                  <Chip
                    icon={<Warning />}
                    label={`${validation.summary.invalid_tags} invalid tags`}
                    color="warning"
                    size="small"
                  />
                )}
                {validation.errors?.length > 0 && (
                  <Chip
                    icon={<ErrorIcon />}
                    label={`${validation.errors.length} errors`}
                    color="error"
                    size="small"
                  />
                )}
              </Box>

              {/* Errors list */}
              {validation.errors?.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Errors:
                  </Typography>
                  <List dense>
                    {validation.errors.map((err, idx) => (
                      <ListItem key={idx} disablePadding>
                        <ListItemText primary={err} />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              )}

              {/* Warnings list */}
              {validation.warnings?.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Warnings:
                  </Typography>
                  <List dense>
                    {validation.warnings.map((warn, idx) => (
                      <ListItem key={idx} disablePadding>
                        <ListItemText primary={warn} />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              )}

              {/* Invalid connections details */}
              {validation.invalidConnections?.length > 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Skipped Connections:
                  </Typography>
                  <List dense>
                    {validation.invalidConnections.map((conn, idx) => (
                      <ListItem key={idx} disablePadding>
                        <ListItemText
                          primary={`${conn.connection_name} (${conn.driver_type})`}
                          secondary={conn.message}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              )}

              {/* Invalid tags details */}
              {validation.invalidTags?.length > 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Skipped Tags:
                  </Typography>
                  <List dense>
                    {validation.invalidTags.map((tag, idx) => (
                      <ListItem key={idx} disablePadding>
                        <ListItemText
                          primary={`${tag.tag_name || tag.tag_path} (${tag.connection_name})`}
                          secondary={tag.message}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              )}

              {/* Success message */}
              {validation.valid && validation.summary?.invalid_connections === 0 && validation.summary?.invalid_tags === 0 && (
                <Alert severity="success">
                  All connections and tags validated successfully! Flow ready to import.
                </Alert>
              )}

              {validation.valid && (validation.summary?.invalid_connections > 0 || validation.summary?.invalid_tags > 0) && (
                <Alert severity="warning">
                  Flow can be imported with {validation.summary.valid_connections} connection(s) and {validation.summary.valid_tags} tag(s).
                  Some nodes may not function correctly due to missing dependencies.
                </Alert>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={importing}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={!validation?.valid || importing || validating}
          startIcon={importing ? <CircularProgress size={16} /> : <Upload />}
        >
          {importing ? 'Importing...' : 'Import Flow'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // If controlled mode, only render dialog (no button)
  if (isControlled) {
    return dialogContent;
  }

  // Uncontrolled mode - render button and dialog
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Upload fontSize="small" />}
        onClick={handleOpen}
        size="small"
      >
        Import
      </Button>
      {dialogContent}
    </>
  );
};

export default ImportFlowButton;
