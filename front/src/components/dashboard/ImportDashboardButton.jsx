import React, { useState, useRef } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Alert,
  CircularProgress,
  TextField,
  Box,
  List,
  ListItem,
  ListItemText,
  Chip
} from '@mui/material';
import { FileUpload, CheckCircle, Warning, Error as ErrorIcon } from '@mui/icons-material';
import dashboardService from '../../services/dashboardService';

const ImportDashboardButton = ({ onImportSuccess }) => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [newName, setNewName] = useState('');
  const [importData, setImportData] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleOpen = () => setOpen(true);

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setError('');
    setValidation(null);
    setImportData(null);
    setNewName('');
    setValidating(true);

    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      
      setImportData(data);
      
      // Set default name from import data
      if (data.dashboard?.name) {
        setNewName(data.dashboard.name);
      }

      // Validate
      const validationResult = await dashboardService.validateDashboardImport(data);
      setValidation(validationResult);
    } catch (err) {
      console.error('Failed to parse or validate file:', err);
      setError(err.message || 'Failed to read or validate file');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!validation?.valid || !importData) return;

    setImporting(true);
    setError('');

    try {
      const result = await dashboardService.executeDashboardImport(
        importData,
        validation,
        newName
      );

      if (onImportSuccess) {
        onImportSuccess(result);
      }

      handleClose();
    } catch (err) {
      console.error('Failed to import dashboard:', err);
      setError(err.message || 'Failed to import dashboard');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setFileName('');
    setNewName('');
    setImportData(null);
    setValidation(null);
    setError('');
    setValidating(false);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const canImport = validation?.valid && !validating && !importing && newName.trim();

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<FileUpload />}
        onClick={handleOpen}
      >
        Import Dashboard
      </Button>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Dashboard</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Import a dashboard from a JSON file exported from another DataForeman instance.
        </Typography>

        {/* File Selection */}
        <Box sx={{ mb: 3 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="dashboard-file-input"
          />
          <label htmlFor="dashboard-file-input">
            <Button
              variant="contained"
              component="span"
              startIcon={<FileUpload />}
              disabled={validating || importing}
            >
              Select Dashboard File
            </Button>
          </label>
          {fileName && (
            <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
              Selected: {fileName}
            </Typography>
          )}
        </Box>

        {/* Dashboard Name */}
        {importData && (
          <TextField
            fullWidth
            label="Dashboard Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={validating || importing}
            sx={{ mb: 3 }}
            helperText="You can rename the dashboard before importing"
          />
        )}

        {/* Validating */}
        {validating && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Validating dashboard...</Typography>
          </Box>
        )}

        {/* Validation Results */}
        {validation && !validating && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Validation Results
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              {validation.validCharts?.length > 0 && (
                <Chip
                  icon={<CheckCircle />}
                  label={`${validation.validCharts.length} valid charts`}
                  color="success"
                  size="small"
                />
              )}
              {validation.invalidCharts?.length > 0 && (
                <Chip
                  icon={<Warning />}
                  label={`${validation.invalidCharts.length} invalid charts`}
                  color="warning"
                  size="small"
                />
              )}
            </Box>

            {/* Errors */}
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

            {/* Warnings */}
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

            {/* Invalid Charts */}
            {validation.invalidCharts?.length > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Skipped Widgets:
                </Typography>
                <List dense>
                  {validation.invalidCharts.map((chart, idx) => (
                    <ListItem key={idx} disablePadding>
                      <ListItemText
                        primary={chart.chart_name || chart.chart_id}
                        secondary={chart.message}
                      />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}

            {/* Success */}
            {validation.valid && validation.validCharts?.length > 0 && (
              <Alert severity="success">
                Dashboard ready to import with {validation.validCharts.length} widget(s).
                {validation.invalidCharts?.length > 0 && 
                  ` ${validation.invalidCharts.length} widget(s) will be skipped due to missing charts.`
                }
              </Alert>
            )}
          </Box>
        )}

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={importing}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={!canImport}
          startIcon={importing ? <CircularProgress size={16} /> : <FileUpload />}
        >
          Import Dashboard
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default ImportDashboardButton;
