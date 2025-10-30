import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import InfoIcon from '@mui/icons-material/Info';
import connectivityService from '../../services/connectivityService';

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const EIPImportExportDialog = ({ open, onClose, connectionId, onComplete }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setMessage('');
    setError('');
  };

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const blob = await connectivityService.exportTagsCSV(connectionId, 'eip');
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eip_tags_${connectionId}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setMessage('CSV file exported successfully');
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const result = await connectivityService.importTagsCSV(connectionId, file, 'eip');
      
      const messages = [];
      if (result.imported > 0) messages.push(`${result.imported} tag${result.imported > 1 ? 's' : ''} imported`);
      if (result.skipped > 0) messages.push(`${result.skipped} skipped (already exist)`);
      
      setMessage(messages.join(', ') || 'Import completed');
      
      if (result.errors && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
        setError(`Some tags failed to import. Check console for details.`);
      }
      
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    setMessage('');
    setError('');
    setActiveTab(0);
    onClose();
  };

  const columnDocs = [
    {
      name: 'tag_name',
      required: true,
      description: 'Tag name/path in PLC',
      examples: 'Program:MainProgram.Speed, LocalTag1',
      notes: 'Used as both name and path'
    },
    {
      name: 'data_type',
      required: true,
      description: 'PLC data type',
      examples: 'DINT, REAL, BOOL, STRING',
      notes: 'Case-insensitive'
    },
    {
      name: 'poll_group',
      required: false,
      description: 'Poll group name',
      examples: 'Fast, Medium, Slow',
      notes: 'Defaults to "Medium"'
    },
    {
      name: 'unit',
      required: false,
      description: 'Unit of measure symbol',
      examples: '°C, bar, RPM, %',
      notes: 'Must match existing unit'
    },
    {
      name: 'write_on_change',
      required: false,
      description: 'Enable write-on-change',
      examples: 'true, false, 1, 0',
      notes: 'Defaults to true'
    },
    {
      name: 'deadband',
      required: false,
      description: 'Change detection threshold',
      examples: '0.5, 1, 5',
      notes: 'Value depends on deadband_type'
    },
    {
      name: 'deadband_type',
      required: false,
      description: 'Deadband calculation method',
      examples: 'absolute, percent',
      notes: 'absolute = fixed value, percent = % of previous value. Defaults to "absolute"'
    },
    {
      name: 'heartbeat_sec',
      required: false,
      description: 'Force publish interval (seconds)',
      examples: '60, 120, 300',
      notes: 'Defaults to 60 seconds'
    }
  ];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        EtherNet/IP Tag Import/Export
      </DialogTitle>
      
      <DialogContent>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab icon={<InfoIcon />} label="Column Reference" />
          <Tab icon={<DownloadIcon />} label="Export" />
          <Tab icon={<UploadIcon />} label="Import" />
        </Tabs>

        {/* Messages */}
        {message && (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setMessage('')}>
            {message}
          </Alert>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Column Reference Tab */}
        <TabPanel value={activeTab} index={0}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            CSV file format for EtherNet/IP tags. Use this reference when creating or editing CSV files in Excel.
          </Typography>
          
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Column</strong></TableCell>
                  <TableCell><strong>Required</strong></TableCell>
                  <TableCell><strong>Description</strong></TableCell>
                  <TableCell><strong>Examples</strong></TableCell>
                  <TableCell><strong>Notes</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {columnDocs.map((col) => (
                  <TableRow key={col.name}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {col.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={col.required ? 'Required' : 'Optional'} 
                        color={col.required ? 'error' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {col.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.813rem">
                        {col.examples}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {col.notes}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Example CSV:</strong>
            </Typography>
            <Box component="pre" sx={{ 
              fontFamily: 'monospace', 
              fontSize: '0.813rem',
              overflowX: 'auto',
              bgcolor: 'background.default',
              p: 1,
              borderRadius: 1,
              mt: 1
            }}>
{`tag_name,data_type,poll_group,unit,write_on_change,deadband,deadband_type,heartbeat_sec
Program:MainProgram.Speed,DINT,Fast,RPM,true,5,percent,60
Program:MainProgram.Temperature,REAL,Medium,°C,true,0.5,absolute,120
LocalTag1,BOOL,Fast,,false,,,`}
            </Box>
          </Alert>
        </TabPanel>

        {/* Export Tab */}
        <TabPanel value={activeTab} index={1}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Export all active EtherNet/IP tags for this connection to a CSV file. The file can be edited in Excel and re-imported.
          </Typography>
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <DownloadIcon />}
              onClick={handleExport}
              disabled={loading}
              size="large"
            >
              {loading ? 'Exporting...' : 'Export to CSV'}
            </Button>
          </Box>
        </TabPanel>

        {/* Import Tab */}
        <TabPanel value={activeTab} index={2}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Import EtherNet/IP tags from a CSV file. Existing tags will be skipped (not overwritten).
          </Typography>
          
          <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
            <Typography variant="body2">
              <strong>Important:</strong>
            </Typography>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>CSV must have headers in the first row</li>
              <li>Required columns: <code>tag_name</code>, <code>data_type</code></li>
              <li>Existing tags with same name will be skipped</li>
              <li>Invalid rows will be reported but won't stop import</li>
            </ul>
          </Alert>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <UploadIcon />}
              onClick={handleImportClick}
              disabled={loading}
              size="large"
            >
              {loading ? 'Importing...' : 'Select CSV File'}
            </Button>
          </Box>

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </TabPanel>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EIPImportExportDialog;
