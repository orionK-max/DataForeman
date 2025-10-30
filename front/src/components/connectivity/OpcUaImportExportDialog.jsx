import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import connectivityService from '../../services/connectivityService';

function TabPanel({ children, value, index }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      style={{ paddingTop: '16px' }}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export default function OpcUaImportExportDialog({ 
  open, 
  onClose, 
  connectionId,
  onImportComplete 
}) {
  const [currentTab, setCurrentTab] = useState(0);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    setError(null);
    setSuccess(null);
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const blob = await connectivityService.exportTagsCSV(connectionId, 'opcua');
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opcua-tags-${connectionId}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setSuccess('Tags exported successfully');
    } catch (err) {
      console.error('Export error:', err);
      setError(err.message || 'Failed to export tags');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
    setError(null);
    setSuccess(null);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a CSV file');
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await connectivityService.importTagsCSV(connectionId, selectedFile, 'opcua');
      
      setSuccess(
        `Import complete: ${result.imported || 0} tags imported, ` +
        `${result.skipped || 0} skipped, ` +
        `${result.errors?.length || 0} errors`
      );
      
      if (result.errors && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
      }
      
      // Trigger refresh
      if (onImportComplete) {
        onImportComplete();
      }
      
      // Clear file selection
      setSelectedFile(null);
      const fileInput = document.getElementById('opcua-csv-file-input');
      if (fileInput) fileInput.value = '';
      
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import tags');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">OPC UA Tags - CSV Import/Export</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={currentTab} onChange={handleTabChange}>
          <Tab label="Column Reference" />
          <Tab label="Export" />
          <Tab label="Import" />
        </Tabs>

        {/* Column Reference Tab */}
        <TabPanel value={currentTab} index={0}>
          <Typography variant="body2" paragraph>
            The CSV format for OPC UA tags uses the following columns:
          </Typography>
          
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Column</strong></TableCell>
                  <TableCell><strong>Required</strong></TableCell>
                  <TableCell><strong>Description</strong></TableCell>
                  <TableCell><strong>Example</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>node_id</code></TableCell>
                  <TableCell>Yes</TableCell>
                  <TableCell>OPC UA Node ID (e.g., ns=2;s=Temperature)</TableCell>
                  <TableCell>ns=2;s=Machine1.Temperature</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>tag_name</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Display name for the tag (optional, defaults to node_id)</TableCell>
                  <TableCell>Machine 1 Temperature</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>data_type</code></TableCell>
                  <TableCell>Yes</TableCell>
                  <TableCell>Data type (DOUBLE, INT32, STRING, BOOLEAN, etc.)</TableCell>
                  <TableCell>DOUBLE</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>poll_group</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Poll group name (Very Fast, Fast, Medium, Slow, Very Slow)</TableCell>
                  <TableCell>Medium</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>unit</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Unit of measure symbol</TableCell>
                  <TableCell>°C</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>write_on_change</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Enable write-on-change (true/false, default: true)</TableCell>
                  <TableCell>true</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>deadband</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Deadband value (numeric, default: 0)</TableCell>
                  <TableCell>0.5</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>deadband_type</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Deadband type (absolute or percent, default: absolute)</TableCell>
                  <TableCell>absolute</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>heartbeat_sec</code></TableCell>
                  <TableCell>No</TableCell>
                  <TableCell>Force publish interval in seconds (default: 60)</TableCell>
                  <TableCell>60</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Box mt={2}>
            <Typography variant="body2" color="textSecondary">
              <strong>Example CSV:</strong>
            </Typography>
            <Paper variant="outlined" sx={{ p: 1, mt: 1, backgroundColor: '#f5f5f5' }}>
              <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', margin: 0 }}>
{`node_id,tag_name,data_type,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec
ns=2;s=Machine1.Temperature,Machine 1 Temp,DOUBLE,Medium,°C,true,0.5,absolute,60
ns=2;s=Machine1.Pressure,Machine 1 Pressure,DOUBLE,Medium,psi,true,1,absolute,60
ns=2;s=Machine1.Running,Machine 1 Running,BOOLEAN,Fast,,true,,,30
ns=2;s=Machine2.Speed,Machine 2 Speed,INT32,Medium,rpm,true,5,percent,60`}
              </Typography>
            </Paper>
          </Box>

          <Box mt={2}>
            <Alert severity="info">
              <Typography variant="body2">
                <strong>Tips:</strong>
              </Typography>
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                <li>You can edit the exported CSV in Excel or any spreadsheet program</li>
                <li>The node_id must be a valid OPC UA Node ID format (e.g., ns=2;s=TagName or ns=2;i=1234)</li>
                <li>Import will skip tags that already exist (based on node_id)</li>
                <li>Empty optional columns will use default values</li>
                <li>Deadband type "percent" uses percentage-based change detection</li>
              </ul>
            </Alert>
          </Box>
        </TabPanel>

        {/* Export Tab */}
        <TabPanel value={currentTab} index={1}>
          <Typography variant="body2" paragraph>
            Export all OPC UA tags for this connection as a CSV file. You can then edit the file in Excel
            and re-import it.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Button
            variant="contained"
            color="primary"
            startIcon={exporting ? <CircularProgress size={20} /> : <DownloadIcon />}
            onClick={handleExport}
            disabled={exporting}
            fullWidth
          >
            {exporting ? 'Exporting...' : 'Export Tags to CSV'}
          </Button>
        </TabPanel>

        {/* Import Tab */}
        <TabPanel value={currentTab} index={2}>
          <Typography variant="body2" paragraph>
            Import OPC UA tags from a CSV file. The file must follow the format described in the
            "Column Reference" tab.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Box mb={2}>
            <input
              id="opcua-csv-file-input"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <label htmlFor="opcua-csv-file-input">
              <Button
                variant="outlined"
                component="span"
                fullWidth
              >
                {selectedFile ? selectedFile.name : 'Choose CSV File'}
              </Button>
            </label>
          </Box>

          <Button
            variant="contained"
            color="primary"
            startIcon={importing ? <CircularProgress size={20} /> : <UploadIcon />}
            onClick={handleImport}
            disabled={importing || !selectedFile}
            fullWidth
          >
            {importing ? 'Importing...' : 'Import Tags from CSV'}
          </Button>

          {selectedFile && (
            <Box mt={2}>
              <Alert severity="info">
                <Typography variant="body2">
                  Selected file: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
                </Typography>
              </Alert>
            </Box>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
