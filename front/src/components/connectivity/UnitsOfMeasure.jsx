import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import connectivityService from '../../services/connectivityService';

const UnitsOfMeasure = ({ onNotify }) => {
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
  const [editingUnit, setEditingUnit] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    category: '',
  });
  
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState(null);

  useEffect(() => {
    loadUnits();
    loadCategories();
  }, []);

  const loadUnits = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await connectivityService.getUnits();
      setUnits(response.units || []);
    } catch (err) {
      setError(err.message || 'Failed to load units');
      onNotify?.('Failed to load units', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await connectivityService.getUnitCategories();
      setCategories(response.categories || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleOpenDialog = (mode, unit = null) => {
    setDialogMode(mode);
    setEditingUnit(unit);
    
    if (mode === 'edit' && unit) {
      setFormData({
        name: unit.name,
        symbol: unit.symbol,
        category: unit.category,
      });
    } else {
      setFormData({
        name: '',
        symbol: '',
        category: '',
      });
    }
    
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingUnit(null);
    setFormData({ name: '', symbol: '', category: '' });
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.symbol || !formData.category) {
      onNotify?.('Please fill in all fields', 'error');
      return;
    }

    try {
      if (dialogMode === 'add') {
        await connectivityService.createUnit(formData);
        onNotify?.('Unit created successfully', 'success');
      } else {
        await connectivityService.updateUnit(editingUnit.id, formData);
        onNotify?.('Unit updated successfully', 'success');
      }
      
      handleCloseDialog();
      await loadUnits();
      await loadCategories();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Operation failed';
      onNotify?.(errorMsg, 'error');
    }
  };

  const handleOpenDeleteDialog = (unit) => {
    setUnitToDelete(unit);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setUnitToDelete(null);
    setDeleteDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!unitToDelete) return;

    try {
      await connectivityService.deleteUnit(unitToDelete.id);
      onNotify?.('Unit deleted successfully', 'success');
      handleCloseDeleteDialog();
      await loadUnits();
      await loadCategories();
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Delete failed';
      onNotify?.(errorMsg, 'error');
      handleCloseDeleteDialog();
    }
  };

  // Group units by category
  const unitsByCategory = units.reduce((acc, unit) => {
    if (!acc[unit.category]) {
      acc[unit.category] = [];
    }
    acc[unit.category].push(unit);
    return acc;
  }, {});

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Units of Measure</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog('add')}
        >
          Add Unit
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {Object.keys(unitsByCategory).sort().map((category) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
            {category}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Symbol</TableCell>
                  <TableCell width={100}>Type</TableCell>
                  <TableCell width={100} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unitsByCategory[category].map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell>{unit.name}</TableCell>
                    <TableCell>{unit.symbol}</TableCell>
                    <TableCell>
                      {unit.is_system ? (
                        <Chip label="System" size="small" color="default" />
                      ) : (
                        <Chip label="Custom" size="small" color="primary" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!unit.is_system && (
                        <>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog('edit', unit)}
                            title="Edit unit"
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDeleteDialog(unit)}
                            title="Delete unit"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogMode === 'add' ? 'Add Unit' : 'Edit Unit'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Name"
              fullWidth
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              required
            />
            <TextField
              label="Symbol"
              fullWidth
              value={formData.symbol}
              onChange={(e) => handleFormChange('symbol', e.target.value)}
              required
            />
            <TextField
              select
              label="Category"
              fullWidth
              value={formData.category}
              onChange={(e) => handleFormChange('category', e.target.value)}
              required
              helperText="Select existing category or type a new one"
            >
              {categories.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Or enter new category"
              fullWidth
              value={formData.category}
              onChange={(e) => handleFormChange('category', e.target.value)}
              placeholder="Type new category name"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {dialogMode === 'add' ? 'Add' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the unit "{unitToDelete?.name}" ({unitToDelete?.symbol})?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UnitsOfMeasure;
