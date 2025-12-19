import React from 'react';
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  Typography,
} from '@mui/material';

/**
 * Renders individual fields (switch, select, number, text, etc.)
 */
const FieldRenderer = ({ field, nodeData, onChange }) => {
  const value = nodeData?.[field.property] ?? field.default;
  
  const handleChange = (newValue) => {
    onChange({ [field.property]: newValue });
  };
  
  switch (field.type) {
    case 'switch':
      return (
        <FormControlLabel
          key={field.property}
          control={
            <Switch
              checked={value ?? false}
              onChange={(e) => handleChange(e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography variant="body2">{field.label}</Typography>
              {field.helperText && (
                <Typography variant="caption" color="text.secondary">
                  {field.helperText}
                </Typography>
              )}
            </Box>
          }
          sx={{ mb: 2, display: 'block', alignItems: 'flex-start' }}
        />
      );
    
    case 'select':
      return (
        <Box key={field.property} sx={{ mb: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value ?? ''}
              onChange={(e) => handleChange(e.target.value)}
              label={field.label}
              sx={{
                bgcolor: (theme) => theme.palette.mode === 'dark' 
                  ? 'rgba(0, 0, 0, 0.3)'
                  : 'rgba(255, 255, 255, 0.9)',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {field.options?.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label || option.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {field.helperText && (
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ display: 'block', mt: 0.5 }}
            >
              {field.helperText}
            </Typography>
          )}
        </Box>
      );
    
    case 'number':
      return (
        <Box key={field.property} sx={{ mb: 2 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              display: 'block', 
              mb: 0.5, 
              color: 'text.secondary',
              fontSize: '0.75rem',
              fontWeight: 500
            }}
          >
            {field.label}
          </Typography>
          <TextField
            fullWidth
            size="small"
            type="number"
            value={value ?? ''}
            onChange={(e) => handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
            placeholder={field.placeholder}
            inputProps={{
              min: field.min,
              max: field.max,
              step: field.step
            }}
            sx={{
              '& .MuiInputBase-root': {
                bgcolor: (theme) => theme.palette.mode === 'dark' 
                  ? 'rgba(0, 0, 0, 0.3)'
                  : 'rgba(255, 255, 255, 0.9)',
                border: '1px solid',
                borderColor: 'divider',
              }
            }}
          />
          {field.helperText && (
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ display: 'block', mt: 0.5 }}
            >
              {field.helperText}
            </Typography>
          )}
        </Box>
      );
    
    case 'text':
      return (
        <Box key={field.property} sx={{ mb: 2 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              display: 'block', 
              mb: 0.5, 
              color: 'text.secondary',
              fontSize: '0.75rem',
              fontWeight: 500
            }}
          >
            {field.label}
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={value ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={field.placeholder}
            multiline={field.multiline}
            rows={field.rows}
            sx={{
              '& .MuiInputBase-root': {
                bgcolor: (theme) => theme.palette.mode === 'dark' 
                  ? 'rgba(0, 0, 0, 0.3)'
                  : 'rgba(255, 255, 255, 0.9)',
                border: '1px solid',
                borderColor: 'divider',
              }
            }}
          />
          {field.helperText && (
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ display: 'block', mt: 0.5 }}
            >
              {field.helperText}
            </Typography>
          )}
        </Box>
      );
    
    default:
      return (
        <Typography key={field.property} variant="caption" color="error">
          Unknown field type: {field.type}
        </Typography>
      );
  }
};

export default FieldRenderer;
