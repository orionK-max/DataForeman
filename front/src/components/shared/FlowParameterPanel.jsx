import React from 'react';
import { 
  Box, 
  Typography, 
  Chip, 
  Tooltip, 
  Divider 
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import ParameterInput from '../flowStudio/ParameterInput';

/**
 * Shared component for rendering flow input/output parameters in a control panel layout.
 * Used by both FlowWidget (dashboard) and ParameterExecutionDialog (flow list).
 * 
 * @param {Object[]} inputSchema - Array of input parameter definitions
 * @param {Object[]} outputSchema - Array of output parameter definitions
 * @param {Object} inputValues - Current input values {paramName: value}
 * @param {Object} outputValues - Current output values {paramName: value}
 * @param {Function} onInputChange - Callback for input value changes (paramName, newValue)
 * @param {Object} errors - Validation errors {paramName: errorMessage}
 * @param {boolean} disabled - Whether inputs are disabled (e.g., during execution)
 * @param {string} outputPlaceholder - Placeholder text for outputs with no value (default: "Waiting…")
 * @param {string} lastExecutionTime - ISO timestamp of last execution (optional, shows in outputs header)
 */
export default function FlowParameterPanel({
  inputSchema = [],
  outputSchema = [],
  inputValues = {},
  outputValues = {},
  onInputChange,
  errors = {},
  disabled = false,
  outputPlaceholder = 'Waiting…',
  lastExecutionTime = null
}) {
  const hasInputs = inputSchema.length > 0;
  const hasOutputs = outputSchema.length > 0;

  // Helper to render a single output value as plain text or chip
  const renderOutputValue = (param, value) => {
    if (value === undefined || value === null) {
      // Show state-aware placeholder based on type
      if (param.type === 'boolean') {
        return (
          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.8125rem' }}>
            true / false
          </Typography>
        );
      }
      return (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.8125rem' }}>
          {outputPlaceholder}
        </Typography>
      );
    }

    let displayValue = value;
    if (param.type === 'boolean') {
      return (
        <Chip
          label={value ? 'true' : 'false'}
          size="small"
          sx={{
            height: 22,
            fontSize: '0.8125rem',
            fontWeight: 500,
            bgcolor: value ? 'success.main' : 'error.main',
            color: 'white',
            '& .MuiChip-label': { px: 1.5 }
          }}
        />
      );
    } else if (param.type === 'number') {
      displayValue = typeof value === 'number' ? value.toLocaleString() : value;
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    }

    return (
      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.8125rem' }}>
        {displayValue}
      </Typography>
    );
  };

  return (
    <Box sx={{ 
      display: 'grid',
      gridTemplateColumns: { 
        xs: '1fr', 
        sm: hasInputs && hasOutputs ? '1fr auto 1fr' : '1fr' 
      },
      gap: 3
    }}>
      {/* Input Parameters - Compact Inline Layout */}
      {hasInputs && (
        <Box>
          <Typography 
            variant="caption" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'uppercase', 
              color: 'text.disabled',
              letterSpacing: 1,
              fontSize: '0.6875rem',
              mb: 1.25,
              display: 'block'
            }}
          >
            Inputs
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {inputSchema.map((param) => (
              <Box 
                key={param.name}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: 1.5
                }}
              >
                {/* Label with tooltip */}
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 90, flex: '0 0 auto', pt: 1 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'text.secondary'
                    }}
                  >
                    {param.alias || param.displayName || param.name}
                  </Typography>
                  {param.description && (
                    <Tooltip title={param.description} arrow placement="top">
                      <InfoIcon sx={{ fontSize: 14, ml: 0.5, color: 'text.disabled', cursor: 'help' }} />
                    </Tooltip>
                  )}
                </Box>
                {/* Control */}
                <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                  <ParameterInput
                    param={{ ...param, description: null }}
                    value={inputValues[param.name]}
                    onChange={onInputChange}
                    error={errors[param.name]}
                    disabled={disabled || param.readOnly}
                    size="small"
                    margin="none"
                  />
                  {errors[param.name] && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                      {errors[param.name]}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      
      {/* Vertical Divider - only show when both inputs and outputs exist */}
      {hasInputs && hasOutputs && (
        <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
      )}
      
      {/* Output Parameters - Plain Text Display */}
      {hasOutputs && (
        <Box>
          <Typography 
            variant="caption" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'uppercase', 
              color: 'text.disabled',
              letterSpacing: 1,
              fontSize: '0.6875rem',
              mb: 1.25,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            Outputs
            {lastExecutionTime && (
              <Typography 
                component="span" 
                variant="caption" 
                sx={{ 
                  color: 'text.disabled',
                  fontSize: '0.625rem',
                  fontWeight: 400,
                  textTransform: 'none',
                  opacity: 0.7
                }}
              >
                ({new Date(lastExecutionTime).toLocaleTimeString()})
              </Typography>
            )}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {outputSchema.map((param) => (
              <Box 
                key={param.name}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: 1.5
                }}
              >
                {/* Label with tooltip */}
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 90, flex: '0 0 auto', pt: 0.5 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontSize: '0.875rem',
                      fontWeight: 400,
                      color: 'text.disabled'
                    }}
                  >
                    {param.displayName || param.name}
                  </Typography>
                  {param.description && (
                    <Tooltip title={param.description} arrow placement="top">
                      <InfoIcon sx={{ fontSize: 14, ml: 0.5, color: 'text.disabled', opacity: 0.5, cursor: 'help' }} />
                    </Tooltip>
                  )}
                </Box>
                {/* Value Display */}
                <Box sx={{ flex: '1 1 auto', minWidth: 0, pt: 0.5 }}>
                  {renderOutputValue(param, outputValues[param.name])}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
