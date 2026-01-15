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
  Button,
  Divider,
  Collapse,
  Tooltip,
} from '@mui/material';
import Editor from '@monaco-editor/react';
import { getInputConfig, parseInputConfig } from '../../../utils/ioRulesUtils';

/**
 * Property group section - renders properties from node metadata
 * This replaces the old generic property renderer
 */
const PropertyGroupSection = ({ section, nodeData, metadata, flow, onChange }) => {
  const isManualFlow = flow?.execution_mode === 'manual';
  
  // Helper to check if property should be shown based on displayOptions.show
  const shouldShowProperty = (property) => {
    if (!property.displayOptions?.show) return true;
    
    for (const [fieldName, expectedValues] of Object.entries(property.displayOptions.show)) {
      let currentValue = nodeData[fieldName];
      
      if (currentValue === undefined) {
        const fieldProperty = metadata?.properties?.find(p => p.name === fieldName);
        currentValue = fieldProperty?.default;
      }
      
      if (!expectedValues.includes(currentValue)) {
        return false;
      }
    }
    return true;
  };
  
  // Helper to check if property is exposed to user
  const isPropertyExposed = (propertyName) => {
    return nodeData?._exposedParams?.[propertyName]?.exposed === true;
  };
  
  // Toggle property exposure
  const togglePropertyExposure = (propertyName, property) => {
    const currentExposure = nodeData?._exposedParams?.[propertyName] || {};
    const isCurrentlyExposed = currentExposure.exposed === true;
    
    const updatedExposedParams = {
      ...(nodeData?._exposedParams || {}),
      [propertyName]: isCurrentlyExposed 
        ? { exposed: false }
        : {
            exposed: true,
            parameterKind: 'input',
            displayName: currentExposure.displayName || property.displayName || propertyName,
            description: currentExposure.description || property.description || '',
            required: currentExposure.required ?? false,
            ...(property.type === 'options' ? { options: property.options } : {})
          }
    };
    
    onChange({ _exposedParams: updatedExposedParams });
  };
  
  // Update exposure configuration
  const updateExposureConfig = (propertyName, configField, value) => {
    const updatedExposedParams = {
      ...(nodeData?._exposedParams || {}),
      [propertyName]: {
        ...(nodeData?._exposedParams?.[propertyName] || {}),
        [configField]: value
      }
    };
    
    onChange({ _exposedParams: updatedExposedParams });
  };
  
  // Render a single property based on its type
  const renderProperty = (property, value, handleChange) => {
    const key = property.name;
    
    switch (property.type) {
      case 'fileUpload':
        return (
          <Box key={key}>
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
              {property.displayName}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button component="label" variant="outlined" size="small">
                Choose file…
                <input
                  type="file"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const maxBytes = 10 * 1024 * 1024; // 10MB
                    if (file.size > maxBytes) {
                      console.warn(`Selected file is too large (${file.size} bytes)`);
                      e.target.value = '';
                      return;
                    }

                    const arrayBuffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);

                    // Convert to base64 (keep simple; file size is capped)
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) {
                      binary += String.fromCharCode(bytes[i]);
                    }
                    const dataBase64 = btoa(binary);

                    handleChange(property.name, {
                      name: file.name,
                      mimeType: file.type || 'application/octet-stream',
                      size: file.size,
                      lastModified: file.lastModified,
                      dataBase64,
                    });

                    // Allow re-selecting the same file
                    e.target.value = '';
                  }}
                />
              </Button>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {value?.name ? value.name : 'No file selected'}
              </Typography>
            </Box>

            {property.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {property.description}
              </Typography>
            )}
          </Box>
        );

      case 'string':
        return (
          <Box key={key}>
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
              {property.displayName}
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder={property.placeholder || property.description}
              value={value ?? property.default ?? ''}
              onChange={(e) => handleChange(property.name, e.target.value)}
              multiline={Boolean(property.placeholder?.includes('\n') || (value && value.length > 50))}
              rows={property.placeholder?.includes('\n') ? 3 : undefined}
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
          </Box>
        );
      
      case 'number':
        return (
          <Box key={key}>
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
              {property.displayName}
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="number"
              placeholder={property.placeholder || property.description}
              value={value ?? property.default ?? ''}
              onChange={(e) => handleChange(property.name, e.target.value === '' ? undefined : parseFloat(e.target.value))}
              inputProps={{
                step: 'any'
              }}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: (theme) => theme.palette.mode === 'dark' 
                    ? 'rgba(0, 0, 0, 0.3)'
                    : 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid',
                  borderColor: 'divider',
                },
                '& input[type=number]': {
                  MozAppearance: 'textfield'
                },
                '& input[type=number]::-webkit-outer-spin-button': {
                  WebkitAppearance: 'none',
                  margin: 0
                },
                '& input[type=number]::-webkit-inner-spin-button': {
                  WebkitAppearance: 'none',
                  margin: 0
                }
              }}
            />
          </Box>
        );
      
      case 'boolean':
        return (
          <Box key={key}>
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
              {property.displayName}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={value ?? property.default ?? false}
                  onChange={(e) => handleChange(property.name, e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  {value ?? property.default ?? false ? 'On' : 'Off'}
                </Typography>
              }
              sx={{ ml: 0 }}
            />
          </Box>
        );
      
      case 'options':
        return (
          <Box key={key}>
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
              {property.displayName}
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={value ?? property.default ?? ''}
                onChange={(e) => handleChange(property.name, e.target.value)}
                sx={{
                  bgcolor: (theme) => theme.palette.mode === 'dark' 
                    ? 'rgba(0, 0, 0, 0.3)'
                    : 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {property.options?.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        );
      
      case 'select':
        return (
          <Box key={key}>
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
              {property.displayName}
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={value ?? property.default ?? ''}
                onChange={(e) => handleChange(property.name, e.target.value)}
                sx={{
                  bgcolor: (theme) => theme.palette.mode === 'dark' 
                    ? 'rgba(0, 0, 0, 0.3)'
                    : 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {property.options?.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        );
      
      case 'code':
        return (
          <Box key={key} sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              {property.displayName}
            </Typography>
            <Box sx={{ height: 200, border: '1px solid rgba(0, 0, 0, 0.23)', borderRadius: 1 }}>
              <Editor
                height="100%"
                defaultLanguage="javascript"
                value={value ?? property.default ?? ''}
                onChange={(val) => handleChange(property.name, val)}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </Box>
            {property.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {property.description}
              </Typography>
            )}
          </Box>
        );
      
      case 'collection':
        return (
          <Box key={key} sx={{ mb: 2, p: 2, border: '1px solid rgba(0, 0, 0, 0.12)', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {property.displayName}
            </Typography>
            {property.options?.map((nestedProp) => {
              const nestedValue = value?.[nestedProp.name];
              return renderProperty(nestedProp, nestedValue, (name, val) => {
                const currentCollection = value || {};
                handleChange(property.name, { ...currentCollection, [name]: val });
              });
            })}
          </Box>
        );
      
      default:
        return (
          <Typography key={key} variant="caption" color="error">
            Unknown property type: {property.type}
          </Typography>
        );
    }
  };
  
  // Render property with optional exposure UI
  const renderPropertyWithExposure = (property) => {
    const value = nodeData?.[property.name];
    
    // Skip exposure UI if property is not userExposable or if continuous flow
    if (!property.userExposable || !isManualFlow) {
      const propertyInput = renderProperty(property, value, (name, val) => onChange({ [name]: val }));
      return <Box key={property.name} sx={{ mb: 1.5 }}>{propertyInput}</Box>;
    }

    const isExposed = isPropertyExposed(property.name);
    const exposureConfig = nodeData?._exposedParams?.[property.name] || {};

    return (
      <Box key={property.name} sx={{ mb: 2 }}>
        {/* Inline row layout: Label | Control | Expose */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            {renderProperty(property, value, (name, val) => onChange({ [name]: val }))}
          </Box>
          <Tooltip 
            title="Expose this input to make it configurable when executing this flow manually or when using this flow as a function in other flows"
            placement="left"
            arrow
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pt: '26px' }}>
              <Switch
                checked={isExposed}
                onChange={() => togglePropertyExposure(property.name, property)}
                size="small"
                color="primary"
              />
              <Typography 
                variant="caption" 
                sx={{ 
                  fontWeight: 500,
                  color: 'text.secondary',
                  fontSize: '0.7rem',
                  whiteSpace: 'nowrap',
                  cursor: 'help'
                }}
              >
                Expose
              </Typography>
            </Box>
          </Tooltip>
        </Box>
        
        <Collapse in={isExposed} timeout="auto">
          <Box sx={{ mt: 1, ml: 3, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  color: 'text.secondary',
                  fontSize: '0.7rem',
                  fontWeight: 500
                }}
              >
                Alias
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={exposureConfig.alias ?? ''}
                onChange={(e) => updateExposureConfig(property.name, 'alias', e.target.value)}
                placeholder="Optional label shown during execution"
              />
            </Box>

            <Box sx={{ flex: '0 0 auto' }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  color: 'text.secondary',
                  fontSize: '0.7rem',
                  fontWeight: 500
                }}
              >
                Required
              </Typography>
              <Switch
                checked={exposureConfig.required ?? false}
                onChange={(e) => updateExposureConfig(property.name, 'required', e.target.checked)}
                size="small"
              />
            </Box>
          </Box>
        </Collapse>
      </Box>
    );
  };
  
  // Get properties to render
  const propertiesToRender = section.properties 
    ? metadata?.properties?.filter(p => section.properties.includes(p.name))
    : metadata?.properties || [];
  
  // Filter by visibility
  const visibleProperties = propertiesToRender.filter(shouldShowProperty);
  
  // Separate exposable from non-exposable
  const regularProps = visibleProperties.filter(p => !p.userExposable);
  const exposableProps = visibleProperties.filter(p => p.userExposable);
  
  return (
    <Box sx={{ mb: 2 }}>
      {/* Compact section divider - no title per UI rules */}
      {section.title && (
        <Divider sx={{ my: 1.5 }} />
      )}
      
      {/* Regular properties */}
      {regularProps.map((property) => {
        const value = nodeData?.[property.name];
        return <Box key={property.name} sx={{ mb: 1.5 }}>
          {renderProperty(property, value, (name, val) => onChange({ [name]: val }))}
        </Box>;
      })}
      
      {/* Divider after regular properties */}
      {regularProps.length > 0 && (exposableProps.length > 0 || (metadata.outputs && metadata.outputs.length > 0)) && (
        <Divider sx={{ my: 2 }} />
      )}
      
      {/* Dynamic Input Count Control */}
      {(() => {
        const inputConfig = getInputConfig(metadata, nodeData);
        if (!inputConfig) return null;
        
        const parsed = parseInputConfig(inputConfig, nodeData);
        if (!parsed.canAdd && !parsed.canRemove) return null;
        
        const currentCount = nodeData?.inputCount || parsed.default || 2;
        const canDecrease = parsed.canRemove && currentCount > parsed.min;
        const canIncrease = parsed.canAdd && currentCount < parsed.max;
        
        return (
          <Box sx={{ mt: 3 }}>
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'block', 
                mb: 1.5, 
                textTransform: 'uppercase', 
                letterSpacing: 0.5, 
                color: 'text.secondary',
                fontWeight: 600 
              }}
            >
              Inputs
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  if (canDecrease) {
                    onChange({ inputCount: currentCount - 1 });
                  }
                }}
                disabled={!canDecrease}
                sx={{ minWidth: 36, px: 1 }}
              >
                −
              </Button>
              
              <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center', fontWeight: 500 }}>
                {currentCount} inputs
              </Typography>
              
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  if (canIncrease) {
                    onChange({ inputCount: currentCount + 1 });
                  }
                }}
                disabled={!canIncrease}
                sx={{ minWidth: 36, px: 1 }}
              >
                +
              </Button>
              
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ 
                  fontSize: '0.7rem',
                  whiteSpace: 'nowrap',
                  fontStyle: 'italic'
                }}
              >
                Range: {parsed.min}–{parsed.max}
              </Typography>
            </Box>
          </Box>
        );
      })()}
      
      {/* Divider after input control */}
      {getInputConfig(metadata, nodeData) && exposableProps.length > 0 && (
        <Divider sx={{ my: 2 }} />
      )}
      
      {/* Exposable parameters - with exposure UI */}
      {exposableProps.map(renderPropertyWithExposure)}
      
      {/* Divider before outputs */}
      {exposableProps.length > 0 && isManualFlow && metadata.outputs && metadata.outputs.length > 0 && (
        <Divider sx={{ my: 2 }} />
      )}
      
      {/* Output Parameters - Exposure UI (manual flows only) */}
      {isManualFlow && metadata.outputs && metadata.outputs.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              display: 'block', 
              mb: 1.5, 
              textTransform: 'uppercase', 
              letterSpacing: 0.5, 
              color: 'text.secondary',
              fontWeight: 600 
            }}
          >
            Outputs
          </Typography>
          {metadata.outputs.map((output, index) => {
            const outputId = output.name || `output_${index}`;
            const isExposed = nodeData?._exposedParams?.[outputId]?.exposed === true;
            const exposureConfig = nodeData?._exposedParams?.[outputId] || {};
            
            return (
              <Box key={outputId} sx={{ mb: 2 }}>
                {/* Inline row layout: Label | Output value display | Expose */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ flex: 1 }}>
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
                      {output.displayName || outputId}
                    </Typography>
                    {/* Output value - read-only display, no input chrome */}
                    <Box 
                      sx={{ 
                        p: 1,
                        minHeight: '40px',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        bgcolor: (theme) => theme.palette.mode === 'dark' 
                          ? 'rgba(255, 255, 255, 0.02)'
                          : 'rgba(0, 0, 0, 0.02)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        color: 'text.secondary'
                      }}
                    >
                      {output.description || '(output value)'}
                    </Box>
                  </Box>
                  <Tooltip 
                    title="Expose this output to make it visible when executing this flow manually or to return it as a value when using this flow as a function in other flows"
                    placement="left"
                    arrow
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pt: '26px' }}>
                      <Switch
                        checked={isExposed}
                        onChange={() => {
                          const updatedExposedParams = {
                            ...(nodeData?._exposedParams || {}),
                            [outputId]: isExposed 
                              ? { exposed: false }
                              : {
                                  exposed: true,
                                  parameterKind: 'output',
                                  displayName: exposureConfig.displayName || output.displayName || outputId,
                                  description: exposureConfig.description || output.description || ''
                                }
                          };
                          onChange({ _exposedParams: updatedExposedParams });
                        }}
                        size="small"
                        color="primary"
                      />
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontWeight: 500,
                          color: 'text.secondary',
                          fontSize: '0.7rem',
                          whiteSpace: 'nowrap',
                          cursor: 'help'
                        }}
                      >
                        Expose
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default PropertyGroupSection;
