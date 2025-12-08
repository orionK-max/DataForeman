import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  PowerSettingsNew as PowerIcon,
  Info as InfoIcon,
  Extension as ExtensionIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { usePageTitle } from '../contexts/PageTitleContext';
import libraryApi from '../services/libraryApi';

const LibraryManager = () => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    setPageTitle('Library Manager');
    setPageSubtitle('Manage Flow Studio node libraries');
    loadLibraries();
  }, [setPageTitle, setPageSubtitle]);

  const loadLibraries = async () => {
    try {
      setLoading(true);
      const data = await libraryApi.list();
      setLibraries(data.libraries || []);
    } catch (error) {
      console.error('Failed to load libraries:', error);
      showSnackbar('Failed to load libraries', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        showSnackbar('Please select a .zip file', 'error');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showSnackbar('Please select a file', 'error');
      return;
    }

    try {
      setUploading(true);
      await libraryApi.upload(selectedFile);
      showSnackbar('Library uploaded successfully. Restart required.', 'success');
      setUploadDialogOpen(false);
      setSelectedFile(null);
      loadLibraries();
    } catch (error) {
      console.error('Upload failed:', error);
      showSnackbar(error.message || 'Failed to upload library', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleEnabled = async (library) => {
    try {
      if (library.enabled) {
        await libraryApi.disable(library.libraryId);
        showSnackbar(`${library.name} disabled. Restart required.`, 'info');
      } else {
        await libraryApi.enable(library.libraryId);
        showSnackbar(`${library.name} enabled. Restart required.`, 'info');
      }
      loadLibraries();
    } catch (error) {
      console.error('Toggle failed:', error);
      showSnackbar('Failed to toggle library', 'error');
    }
  };

  const handleDelete = async (library) => {
    if (!window.confirm(`Are you sure you want to delete ${library.name}? This cannot be undone.`)) {
      return;
    }

    try {
      await libraryApi.delete(library.libraryId);
      showSnackbar(`${library.name} deleted. Restart required.`, 'success');
      loadLibraries();
    } catch (error) {
      console.error('Delete failed:', error);
      showSnackbar('Failed to delete library', 'error');
    }
  };

  const handleShowDetails = async (library) => {
    try {
      const details = await libraryApi.get(library.libraryId);
      setSelectedLibrary(details);
      setDetailsDialogOpen(true);
    } catch (error) {
      console.error('Failed to load library details:', error);
      showSnackbar('Failed to load library details', 'error');
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Node Libraries
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage external node libraries for Flow Studio
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => setUploadDialogOpen(true)}
        >
          Upload Library
        </Button>
      </Box>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Changes to libraries (install, enable, disable, delete) require restarting the core service to take effect.
      </Alert>

      {/* Libraries Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : libraries.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ExtensionIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Libraries Installed
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Upload a library package (.zip) to extend Flow Studio with custom nodes
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
          >
            Upload Your First Library
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {libraries.map((library) => (
            <Grid item xs={12} md={6} lg={4} key={library.libraryId}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" gutterBottom>
                        {library.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                        {library.libraryId} • v{library.version}
                      </Typography>
                    </Box>
                    <Chip
                      label={library.enabled ? 'Enabled' : 'Disabled'}
                      color={library.enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                    {library.description || 'No description'}
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={`${library.nodeCount} nodes`}
                      size="small"
                      variant="outlined"
                    />
                    {library.author && (
                      <Chip
                        label={library.author}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>

                  {library.loadErrors && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      <Typography variant="caption">
                        Load Error: {library.loadErrors}
                      </Typography>
                    </Alert>
                  )}
                </CardContent>

                <CardActions>
                  <Tooltip title={library.enabled ? 'Disable' : 'Enable'}>
                    <IconButton
                      size="small"
                      onClick={() => handleToggleEnabled(library)}
                      color={library.enabled ? 'primary' : 'default'}
                    >
                      <PowerIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Details">
                    <IconButton
                      size="small"
                      onClick={() => handleShowDetails(library)}
                    >
                      <InfoIcon />
                    </IconButton>
                  </Tooltip>

                  <Box sx={{ flex: 1 }} />

                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(library)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => !uploading && setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Library</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Select a library package (.zip file) to upload. The package must contain:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary="• library.manifest.json" />
              </ListItem>
              <ListItem>
                <ListItemText primary="• index.js (entry point)" />
              </ListItem>
              <ListItem>
                <ListItemText primary="• nodes/ (node implementations)" />
              </ListItem>
            </List>

            <Button
              variant="outlined"
              component="label"
              fullWidth
              sx={{ mt: 2 }}
              disabled={uploading}
            >
              {selectedFile ? selectedFile.name : 'Select .zip file'}
              <input
                type="file"
                hidden
                accept=".zip"
                onChange={handleFileSelect}
              />
            </Button>

            {selectedFile && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Ready to upload: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!selectedFile || uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Library Details</DialogTitle>
        <DialogContent>
          {selectedLibrary && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {selectedLibrary.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {selectedLibrary.description}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Library ID
                  </Typography>
                  <Typography variant="body2">
                    {selectedLibrary.libraryId}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Version
                  </Typography>
                  <Typography variant="body2">
                    {selectedLibrary.version}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Author
                  </Typography>
                  <Typography variant="body2">
                    {selectedLibrary.author || 'Unknown'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Status
                  </Typography>
                  <Typography variant="body2">
                    <Chip
                      label={selectedLibrary.enabled ? 'Enabled' : 'Disabled'}
                      color={selectedLibrary.enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Typography>
                </Grid>
              </Grid>

              {selectedLibrary.nodeTypes && selectedLibrary.nodeTypes.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom>
                    Provided Nodes ({selectedLibrary.nodeTypes.length})
                  </Typography>
                  <List dense>
                    {selectedLibrary.nodeTypes.map((nodeType) => (
                      <ListItem key={nodeType}>
                        <ListItemText primary={nodeType} />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}

              {selectedLibrary.loadErrors && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Alert severity="error">
                    <Typography variant="subtitle2" gutterBottom>
                      Load Error
                    </Typography>
                    <Typography variant="body2">
                      {selectedLibrary.loadErrors}
                    </Typography>
                  </Alert>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LibraryManager;
