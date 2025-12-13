import React from 'react';
import {
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Folder as FolderIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import { DatePicker, DateTimePicker } from '@mui/x-date-pickers';

/**
 * ParameterInput Component
 * Shared component for rendering flow parameter inputs
 * Used by both ParameterExecutionDialog and FlowWidget
 * 
 * @param {Object} param - Parameter schema from backend
 * @param {any} value - Current parameter value
 * @param {Function} onChange - Value change handler (paramName, newValue)
 * @param {string} error - Validation error message
 * @param {boolean} disabled - Whether input is disabled
 * @param {string} size - Input size ('small' | 'medium')
 * @param {string} margin - Input margin ('none' | 'dense' | 'normal')
 */
export default function ParameterInput({ 
  param, 
  value, 
  onChange, 
  error = null, 
  disabled = false,
  size = 'medium',
  margin = 'normal'
}) {
  const hasError = !!error;
  // Only show helper text if there's an error OR if description exists AND margin is not 'none'
  const helperText = error || (margin !== 'none' ? param.description : null);
  const isReadOnlyOutput = disabled && param.readOnly;
  
  const commonProps = {
    fullWidth: true,
    margin,
    size,
    error: hasError,
    helperText,
    disabled,
  };
  
  // Add read-only styling for outputs
  if (isReadOnlyOutput) {
    commonProps.InputProps = {
      ...commonProps.InputProps,
      readOnly: true,
      sx: {
        bgcolor: (theme) => theme.palette.mode === 'dark' 
          ? 'rgba(255, 255, 255, 0.05)' 
          : 'rgba(0, 0, 0, 0.02)',
        '& input': {
          fontWeight: 500
        }
      }
    };
  }

  const handleChange = (newValue) => {
    onChange(param.name, newValue);
  };

  switch (param.type) {
    case 'string':
    case 'file':
    case 'directory':
      return (
        <TextField
          {...commonProps}
          label={param.displayName || param.name}
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={param.placeholder}
          InputProps={{
            ...(commonProps.InputProps || {}),
            ...((param.type === 'file' || param.type === 'directory') && !isReadOnlyOutput ? {
              endAdornment: (
                <Tooltip title="Browse">
                  <IconButton size="small">
                    <FolderIcon />
                  </IconButton>
                </Tooltip>
              )
            } : {})
          }}
        />
      );

    case 'number':
      return (
        <TextField
          {...commonProps}
          label={param.displayName || param.name}
          type="number"
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={param.placeholder}
          inputProps={{
            min: param.min,
            max: param.max,
            step: param.step || 'any'
          }}
          sx={{
            '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
              WebkitAppearance: 'none',
              margin: 0
            },
            '& input[type=number]': {
              MozAppearance: 'textfield'
            }
          }}
        />
      );

    case 'boolean':
      // For read-only (disabled) booleans, show as text field with the value
      if (disabled && param.readOnly) {
        return (
          <TextField
            {...commonProps}
            label={param.displayName || param.name}
            value={value === true ? 'true' : value === false ? 'false' : ''}
            InputProps={{
              readOnly: true,
              style: { 
                color: value === true ? '#4caf50' : value === false ? '#f44336' : 'inherit',
                fontWeight: 500
              }
            }}
          />
        );
      }
      // For editable booleans, show as checkbox
      return (
        <FormControlLabel
          control={
            <Checkbox
              checked={!!value}
              onChange={(e) => handleChange(e.target.checked)}
              disabled={disabled}
            />
          }
          label={param.displayName || param.name}
        />
      );

    case 'date':
      return (
        <DatePicker
          label={param.displayName || param.name}
          value={value ? new Date(value) : null}
          onChange={(date) => handleChange(date ? date.toISOString().split('T')[0] : null)}
          disabled={disabled}
          slotProps={{
            textField: {
              ...commonProps,
              InputProps: {
                endAdornment: (
                  <IconButton size="small">
                    <CalendarIcon />
                  </IconButton>
                )
              }
            }
          }}
        />
      );

    case 'datetime':
      return (
        <DateTimePicker
          label={param.displayName || param.name}
          value={value ? new Date(value) : null}
          onChange={(date) => handleChange(date ? date.toISOString() : null)}
          disabled={disabled}
          slotProps={{
            textField: {
              ...commonProps,
              InputProps: {
                endAdornment: (
                  <IconButton size="small">
                    <CalendarIcon />
                  </IconButton>
                )
              }
            }
          }}
        />
      );

    case 'options':
      return (
        <FormControl {...commonProps}>
          <InputLabel>{param.displayName || param.name}</InputLabel>
          <Select
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            label={param.displayName || param.name}
          >
            {param.options?.map((option) => {
              const optionValue = typeof option === 'string' ? option : option.value;
              const optionLabel = typeof option === 'string' ? option : option.label || option.value;
              return (
                <MenuItem key={optionValue} value={optionValue}>
                  {optionLabel}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      );

    case 'json':
      return (
        <TextField
          {...commonProps}
          label={param.displayName || param.name}
          value={typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              handleChange(parsed);
            } catch (err) {
              handleChange(e.target.value);
            }
          }}
          multiline
          rows={4}
          placeholder={param.placeholder || '{}'}
        />
      );

    default:
      return (
        <TextField
          {...commonProps}
          label={param.displayName || param.name}
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
        />
      );
  }
}
