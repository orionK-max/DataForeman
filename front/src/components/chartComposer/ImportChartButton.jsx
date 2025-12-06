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
} from '@mui/material';
import { Upload, CheckCircle, Warning, Error as ErrorIcon } from '@mui/icons-material';
import { usePermissions } from '../../contexts/PermissionContext';
import chartComposerService from '../../services/chartComposerService';

const ImportChartButton = ({ onImportSuccess }) => {
  const { can } = usePermissions();
  
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState(null);
  const [importData, setImportData] = useState(null);

  const handleOpen = () => {
    setFile(null);
    setError('');
    setValidation(null);
    setImportData(null);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setError('');
    setValidation(null);
    setImportData(null);
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

      // Validate
      const validationResult = await chartComposerService.validateImport(data);
      setValidation(validationResult);

      if (!validationResult.valid) {
        setError('Validation failed - see details below');
      }
    } catch (err) {
      console.error('Validation failed:', err);
      setError(err.response?.data?.message || err.message || 'Invalid file format');
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
      const result = await chartComposerService.executeImport(importData, validation);
      
      // Success - close and notify parent
      if (onImportSuccess) {
        onImportSuccess(result.chart);
      }
      handleClose();
    } catch (err) {
      console.error('Import failed:', err);
      setError(err.response?.data?.message || err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!can('chart_composer', 'create')) {
    return null;
  }

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

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Import Chart</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {/* File selector */}
            <Box>
              <input
                accept=".json"
                style={{ display: 'none' }}
                id="chart-import-file"
                type="file"
                onChange={handleFileSelect}
              />
              <label htmlFor="chart-import-file">
                <Button
                  variant="contained"
                  component="span"
                  startIcon={<Upload />}
                  disabled={validating || importing}
                >
                  Select Chart File
                </Button>
              </label>
              {file && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Selected: {file.name}
                </Typography>
              )}
            </Box>

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
                    label={`${validation.summary?.valid_tags || 0} valid tags`}
                    color="success"
                    size="small"
                  />
                  {validation.summary?.invalid_tags > 0 && (
                    <Chip
                      icon={<Warning />}
                      label={`${validation.summary.invalid_tags} skipped tags`}
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

                {/* Invalid tags details */}
                {validation.invalidTags?.length > 0 && (
                  <Alert severity="info">
                    <Typography variant="subtitle2" gutterBottom>
                      Skipped Tags:
                    </Typography>
                    <List dense>
                      {validation.invalidTags.map((tag, idx) => (
                        <ListItem key={idx} disablePadding>
                          <ListItemText
                            primary={`${tag.connection_name} → ${tag.tag_path}`}
                            secondary={tag.message}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Alert>
                )}

                {/* Success message */}
                {validation.valid && validation.summary?.invalid_tags === 0 && (
                  <Alert severity="success">
                    All tags validated successfully! Chart ready to import.
                  </Alert>
                )}

                {validation.valid && validation.summary?.invalid_tags > 0 && (
                  <Alert severity="warning">
                    Chart can be imported with {validation.summary.valid_tags} tag(s). 
                    {validation.summary.invalid_tags} tag(s) will be skipped.
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
            {importing ? 'Importing...' : 'Import Chart'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ImportChartButton;
