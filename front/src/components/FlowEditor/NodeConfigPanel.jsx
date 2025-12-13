import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Divider,
  Chip,
  FormControlLabel,
  Switch,
  Collapse,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material';
import { 
  Close as CloseIcon, 
  Add as AddIcon, 
  Edit as EditIcon, 
  ExpandMore as ExpandMoreIcon,
  Public as PublicIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { getInternalTags } from '../../services/flowsApi';
import TagSelectionDialog from './TagSelectionDialog';
import { getNodeMetadata } from '../../constants/nodeTypes';

const NodeConfigPanel = ({ node, onDataChange, onClose }) => {
  const [tagSelectionOpen, setTagSelectionOpen] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  const handleChange = (field, value) => {
    onDataChange({ [field]: value });
  };

  const handleTagSelected = (tag) => {
    handleChange('tagId', tag.tag_id);
    handleChange('tagPath', tag.tag_path);
    handleChange('tagName', tag.tag_name || tag.tag_path);
    handleChange('dataType', tag.data_type);
    handleChange('source', tag.source);
    handleChange('driverType', tag.driver_type); // Store driver type (OPCUA, EIP, S7, INTERNAL, SYSTEM)
    handleChange('connectionId', tag.connectionId);
    handleChange('connectionName', tag.connectionName); // Store connection name for visual display
  };

  // Check if property should be shown based on displayOptions.show
  const shouldShowProperty = (property, nodeData, metadata) => {
    if (!property.displayOptions?.show) return true;
    
    for (const [fieldName, expectedValues] of Object.entries(property.displayOptions.show)) {
      // Get current value or use default from metadata
      let currentValue = nodeData[fieldName];
      
      // If value is undefined, try to get default from metadata
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

  // Check if property is exposed to user
  const isPropertyExposed = (propertyName) => {
    return node.data?._exposedParams?.[propertyName]?.exposed === true;
  };

  // Toggle property exposure
  const togglePropertyExposure = (propertyName, property) => {
    const currentExposure = node.data?._exposedParams?.[propertyName] || {};
    const isCurrentlyExposed = currentExposure.exposed === true;
    
    const updatedExposedParams = {
      ...(node.data?._exposedParams || {}),
      [propertyName]: isCurrentlyExposed 
        ? { exposed: false }
        : {
            exposed: true,
            parameterKind: 'input',
            displayName: currentExposure.displayName || property.displayName || propertyName,
            description: currentExposure.description || property.description || '',
            required: currentExposure.required ?? false,
            // For options type, include the valid options
            ...(property.type === 'options' ? { options: property.options } : {})
          }
    };
    
    handleChange('_exposedParams', updatedExposedParams);
  };

  // Update exposure configuration
  const updateExposureConfig = (propertyName, configField, value) => {
    const updatedExposedParams = {
      ...(node.data?._exposedParams || {}),
      [propertyName]: {
        ...(node.data?._exposedParams?.[propertyName] || {}),
        [configField]: value
      }
    };
    
    handleChange('_exposedParams', updatedExposedParams);
  };

  // Render a single property based on its type
  const renderProperty = (property, value, onChange) => {
    const key = property.name;
    
    switch (property.type) {
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
              onChange={(e) => onChange(property.name, e.target.value)}
              multiline={property.placeholder?.includes('\n') || (value && value.length > 50)}
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
              onChange={(e) => onChange(property.name, e.target.value === '' ? undefined : parseFloat(e.target.value))}
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
      
      case 'boolean':
        return (
          <FormControlLabel
            key={key}
            control={
              <Switch
                checked={value ?? property.default ?? false}
                onChange={(e) => onChange(property.name, e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">{property.displayName}</Typography>
                {property.description && (
                  <Typography variant="caption" color="text.secondary">
                    {property.description}
                  </Typography>
                )}
              </Box>
            }
            sx={{ mb: 2, display: 'block', alignItems: 'flex-start' }}
          />
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
                onChange={(e) => onChange(property.name, e.target.value)}
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
                onChange={(val) => onChange(property.name, val)}
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
      
      case 'tag':
        // Special handling for tag selection - skip here, handled separately
        return null;
      
      case 'collection':
        // Collection type - render nested properties  (expandable options section)
        return (
          <Box key={key} sx={{ mb: 2, p: 2, border: '1px solid rgba(0, 0, 0, 0.12)', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {property.displayName}
            </Typography>
            {property.options?.map((nestedProp) => {
              const nestedValue = value?.[nestedProp.name];
              return renderProperty(nestedProp, nestedValue, (name, val) => {
                const currentCollection = value || {};
                onChange(property.name, { ...currentCollection, [name]: val });
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

  // Section header component
  const SectionHeader = ({ children }) => (
    <Box sx={{ mb: 1.5, mt: 2 }}>
      <Typography 
        variant="caption" 
        sx={{ 
          textTransform: 'uppercase', 
          letterSpacing: 0.5, 
          color: 'text.secondary',
          fontWeight: 600 
        }}
      >
        {children}
      </Typography>
    </Box>
  );

  // Render property with optional exposure UI
  const renderPropertyWithExposure = (property, value, onChange) => {
    const propertyInput = renderProperty(property, value, onChange);
    
    // Skip exposure UI for tag type (handled specially) or if property is not userExposable
    if (property.type === 'tag' || !property.userExposable) {
      return <Box key={property.name} sx={{ mb: 1.5 }}>{propertyInput}</Box>;
    }

    const isExposed = isPropertyExposed(property.name);
    const exposureConfig = node.data?._exposedParams?.[property.name] || {};

    return (
      <Box key={property.name} sx={{ mb: 2 }}>
        {/* Property Input - Primary */}
        <Box sx={{ mb: 0.5 }}>
          {propertyInput}
        </Box>
        
        {/* Divider before exposure toggle */}
        <Divider sx={{ my: 1 }} />
        
        {/* Exposure Toggle - Minimal, inline with required */}
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            py: 0.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Switch
              checked={isExposed}
              onChange={() => togglePropertyExposure(property.name, property)}
              size="small"
              color="primary"
            />
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: isExposed ? 500 : 400, 
                color: isExposed ? 'text.primary' : 'text.secondary',
              }}
            >
              Expose to user
            </Typography>
          </Box>
          
          {/* Required toggle inline */}
          {isExposed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Switch
                checked={exposureConfig.required ?? false}
                onChange={(e) => updateExposureConfig(property.name, 'required', e.target.checked)}
                size="small"
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                Required
              </Typography>
            </Box>
          )}
        </Box>
        
        {/* Exposure Configuration - Child block, indented, animated */}
        <Collapse in={isExposed} timeout="auto">
          <Box 
            sx={{ 
              mt: 1,
              ml: 2,
              p: 1.5,
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(33, 150, 243, 0.08)'
                : 'rgba(33, 150, 243, 0.05)',
              borderRadius: 1,
              border: '1px solid',
              borderColor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(33, 150, 243, 0.2)'
                : 'rgba(33, 150, 243, 0.15)',
            }}
          >
            <Box sx={{ mb: 1 }}>
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
                Label
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={exposureConfig.displayName || property.displayName || property.name}
                onChange={(e) => updateExposureConfig(property.name, 'displayName', e.target.value)}
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
            
            <Box>
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
                Help Text
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={exposureConfig.description || property.description || ''}
                onChange={(e) => updateExposureConfig(property.name, 'description', e.target.value)}
                multiline
                rows={2}
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
          </Box>
        </Collapse>
      </Box>
    );
  };

  const renderConfig = () => {
    // Get node metadata from backend
    const metadata = getNodeMetadata(node.type);
    
    // Special cases that need completely custom UI
    switch (node.type) {
      case 'tag-input':
      case 'tag-output':
        const isOutput = node.type === 'tag-output';
        const hasTag = node.data?.tagId && node.data?.tagPath;
        
        return (
          <Box>
            {/* Display selected tag */}
            {hasTag ? (
              <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Selected Tag
                  </Typography>
                  <IconButton size="small" onClick={() => setTagSelectionOpen(true)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
                  {(node.data.connectionName || (node.data.source === 'internal' ? 'Internal' : node.data.source === 'system' ? 'System' : '')) && `${node.data.connectionName || (node.data.source === 'internal' ? 'Internal' : node.data.source === 'system' ? 'System' : '')}: `}
                  {node.data.tagName || node.data.tagPath}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  {node.data.dataType && (
                    <Chip label={node.data.dataType} size="small" />
                  )}
                  {node.data.source && (
                    <Chip 
                      label={node.data.source === 'internal' ? 'Internal' : node.data.source === 'system' ? 'System' : 'Connectivity'} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No tag selected
              </Typography>
            )}
            
            {/* Tag selection button */}
            <Button
              variant={hasTag ? "outlined" : "contained"}
              fullWidth
              startIcon={hasTag ? <EditIcon /> : <AddIcon />}
              onClick={() => setTagSelectionOpen(true)}
              sx={{ mb: 2 }}
            >
              {hasTag ? 'Change Tag' : 'Select Tag'}
            </Button>
            
            {/* Save Configuration (only for output with internal tags) */}
            {isOutput && hasTag && node.data?.source === 'internal' && (
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Database Saving
                </Typography>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={node.data?.saveToDatabase ?? true}
                      onChange={(e) => handleChange('saveToDatabase', e.target.checked)}
                    />
                  }
                  label="Save to Database"
                />
                
                {(node.data?.saveToDatabase ?? true) && (
                  <>
                    <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                      <InputLabel>Save Strategy</InputLabel>
                      <Select
                        value={node.data?.saveStrategy || 'on-change'}
                        onChange={(e) => handleChange('saveStrategy', e.target.value)}
                        label="Save Strategy"
                      >
                        <MenuItem value="always">Always (every execution)</MenuItem>
                        <MenuItem value="on-change">On Change Only</MenuItem>
                        <MenuItem value="never">Never (flow-local only)</MenuItem>
                      </Select>
                    </FormControl>
                    
                    {(node.data?.saveStrategy || 'on-change') === 'on-change' && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          On-Change Settings
                        </Typography>
                        
                        <TextField
                          fullWidth
                          size="small"
                          label="Deadband"
                          type="number"
                          value={node.data?.deadband ?? 0}
                          onChange={(e) => handleChange('deadband', parseFloat(e.target.value) || 0)}
                          helperText="Minimum change required (0 = any change)"
                          sx={{ mb: 1.5 }}
                          inputProps={{ min: 0, step: 0.1 }}
                        />
                        
                        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                          <InputLabel>Deadband Type</InputLabel>
                          <Select
                            value={node.data?.deadbandType || 'absolute'}
                            onChange={(e) => handleChange('deadbandType', e.target.value)}
                            label="Deadband Type"
                          >
                            <MenuItem value="absolute">Absolute</MenuItem>
                            <MenuItem value="percent">Percent</MenuItem>
                          </Select>
                        </FormControl>
                        
                        <TextField
                          fullWidth
                          size="small"
                          label="Heartbeat Interval (ms)"
                          type="number"
                          value={node.data?.heartbeatMs ?? 60000}
                          onChange={(e) => handleChange('heartbeatMs', parseInt(e.target.value) || 0)}
                          helperText="Force save after this interval (0 = disabled)"
                          inputProps={{ min: 0, step: 1000 }}
                        />
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}
            
            {/* Maximum Data Age (only for input) */}
            {!isOutput && hasTag && (
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  label="Maximum Data Age (seconds)"
                  type="number"
                  value={node.data?.maxDataAge ?? -1}
                  onChange={(e) => handleChange('maxDataAge', parseFloat(e.target.value))}
                  helperText="-1 = any age (cached), 0 = live only (1s tolerance), >0 = custom max age"
                  size="small"
                />
              </Box>
            )}
          </Box>
        );

      case 'script-js':
        // Script node needs Monaco editor with custom autocomplete
        return (
          <Box>
            <Typography variant="body2" gutterBottom>
              JavaScript Code
            </Typography>
            <Box sx={{ height: 300, mb: 2, border: '1px solid rgba(0, 0, 0, 0.23)', borderRadius: 1 }}>
              <Editor
                height="100%"
                defaultLanguage="javascript"
                value={node.data?.code || '// Write your JavaScript code here\n// Available: $input, $tags.get/history, $flow.state.get/set, $fs.*\n// Use console.log() for debugging\n\nreturn $input;'}
                onChange={(value) => handleChange('code', value)}
                onMount={(editor, monaco) => {
                  // Register custom autocomplete for Flow Studio APIs
                  monaco.languages.registerCompletionItemProvider('javascript', {
                    provideCompletionItems: (model, position) => {
                      const word = model.getWordUntilPosition(position);
                      const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn
                      };

                      const suggestions = [
                        {
                          label: '$input',
                          kind: monaco.languages.CompletionItemKind.Variable,
                          documentation: 'Input value from previous node',
                          insertText: '$input',
                          range: range
                        },
                        {
                          label: '$tags.get',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Get current tag value: await $tags.get("tagPath") - Returns {value, quality, timestamp}',
                          insertText: 'await $tags.get("${1:tagPath}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$tags.history',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Get tag history: await $tags.history("tagPath", "1h") - Returns array of {value, quality, timestamp}',
                          insertText: 'await $tags.history("${1:tagPath}", "${2:1h}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$flow.state.get',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Get flow state: await $flow.state.get("key") - Returns stored value or entire state object',
                          insertText: 'await $flow.state.get("${1:key}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$flow.state.set',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Set flow state: await $flow.state.set("key", value) - Persists state to database',
                          insertText: 'await $flow.state.set("${1:key}", ${2:value})',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.readFile',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Read file contents: await $fs.readFile("path", "utf8") - Max 10MB',
                          insertText: 'await $fs.readFile("${1:path}", "${2:utf8}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.writeFile',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Write file contents: await $fs.writeFile("path", data, "utf8") - Max 10MB',
                          insertText: 'await $fs.writeFile("${1:path}", ${2:data}, "${3:utf8}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.exists',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Check if file exists: await $fs.exists("path") - Returns boolean',
                          insertText: 'await $fs.exists("${1:path}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.readdir',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'List directory contents: await $fs.readdir("dirPath") - Returns array of filenames',
                          insertText: 'await $fs.readdir("${1:dirPath}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        }
                      ];

                      return { suggestions };
                    }
                  });
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                }}
              />
            </Box>
            
            <TextField
              fullWidth
              type="number"
              label="Timeout (ms)"
              value={node.data?.timeout || 10000}
              onChange={(e) => handleChange('timeout', parseInt(e.target.value))}
              sx={{ mb: 2 }}
            />
            
            <FormControl fullWidth>
              <InputLabel>On Error</InputLabel>
              <Select
                value={node.data?.onError || 'stop'}
                onChange={(e) => handleChange('onError', e.target.value)}
                label="On Error"
              >
                <MenuItem value="stop">Stop Flow</MenuItem>
                <MenuItem value="continue">Continue (return null)</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      default:
        // Generic property renderer for all other nodes
        if (!metadata || !metadata.properties || metadata.properties.length === 0) {
          return (
            <Typography variant="body2" color="text.secondary">
              No configuration available
            </Typography>
          );
        }

        // Separate exposable from non-exposable
        const regularProps = [];
        const exposableProps = [];
        
        metadata.properties.forEach(property => {
          if (!shouldShowProperty(property, node.data || {}, metadata)) {
            return;
          }
          
          if (property.userExposable) {
            exposableProps.push(property);
          } else {
            regularProps.push(property);
          }
        });

        return (
          <Box>
            <SectionHeader>Configuration</SectionHeader>
            
            {/* Regular properties */}
            {regularProps.map((property) => {
              const value = node.data?.[property.name];
              return renderProperty(property, value, handleChange);
            })}
            
            {/* Exposable parameters - with exposure UI */}
            {exposableProps.map((property) => {
              const value = node.data?.[property.name];
              return renderPropertyWithExposure(property, value, handleChange);
            })}
            
            {/* Output Parameters - Exposure UI */}
            {metadata.outputs && metadata.outputs.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <SectionHeader>Outputs</SectionHeader>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, px: 0 }}>
                  Expose outputs to make them visible when executing this flow
                </Typography>
                {metadata.outputs.map((output, index) => {
                  // Use name if available, otherwise use index as identifier
                  const outputId = output.name || `output_${index}`;
                  const isExposed = node.data?._exposedParams?.[outputId]?.exposed === true;
                  const exposureConfig = node.data?._exposedParams?.[outputId] || {};
                  
                  return (
                    <Box key={outputId} sx={{ mb: 2 }}>
                      {/* Output Info */}
                      <Box sx={{ 
                        p: 1.5, 
                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.02)',
                        borderRadius: 1,
                        mb: 0.5
                      }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {output.displayName || outputId}
                        </Typography>
                        {output.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {output.description}
                          </Typography>
                        )}
                        <Chip label={output.type} size="small" sx={{ mt: 1 }} />
                      </Box>
                      
                      <Divider sx={{ my: 1 }} />
                      
                      {/* Exposure Toggle */}
                      <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                        <Switch
                          checked={isExposed}
                          onChange={() => {
                            const updatedExposedParams = {
                              ...(node.data?._exposedParams || {}),
                              [outputId]: isExposed 
                                ? { exposed: false }
                                : {
                                    exposed: true,
                                    parameterKind: 'output',
                                    displayName: exposureConfig.displayName || output.displayName || outputId,
                                    description: exposureConfig.description || output.description || ''
                                  }
                            };
                            handleChange('_exposedParams', updatedExposedParams);
                          }}
                          size="small"
                          color="primary"
                        />
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontWeight: isExposed ? 500 : 400, 
                            color: isExposed ? 'text.primary' : 'text.secondary',
                          }}
                        >
                          Expose to user
                        </Typography>
                      </Box>
                      
                      {/* Exposure Configuration */}
                      <Collapse in={isExposed} timeout="auto">
                        <Box 
                          sx={{ 
                            mt: 1,
                            ml: 2,
                            p: 1.5,
                            bgcolor: (theme) => theme.palette.mode === 'dark'
                              ? 'rgba(255, 255, 255, 0.02)'
                              : 'rgba(0, 0, 0, 0.02)',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                          }}
                        >
                          <TextField
                            key={`${outputId}-displayName`}
                            fullWidth
                            size="small"
                            label="Display Name"
                            value={exposureConfig.displayName || output.displayName || outputId}
                            onChange={(e) => updateExposureConfig(outputId, 'displayName', e.target.value)}
                            sx={{ mb: 1 }}
                          />
                          <TextField
                            key={`${outputId}-description`}
                            fullWidth
                            size="small"
                            label="Description"
                            value={exposureConfig.description || output.description || ''}
                            onChange={(e) => updateExposureConfig(outputId, 'description', e.target.value)}
                            multiline
                            rows={2}
                          />
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        );
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        width: 380,
        height: '100%',
        overflow: 'auto',
        borderLeft: '1px solid rgba(0, 0, 0, 0.12)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Node Configuration
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      
      <Divider />
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* Node Info Section */}
        <Box sx={{ 
          px: 2, 
          pt: 1.5, 
          pb: 0.75,
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(255, 255, 255, 0.02)'
            : 'rgba(0, 0, 0, 0.02)',
        }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25, fontSize: '1rem' }}>
            {node.type}
          </Typography>
          <Tooltip title="Unique node identifier">
            <Typography 
              variant="caption" 
              sx={{ 
                fontFamily: 'monospace', 
                color: 'text.disabled',
                fontSize: '0.65rem',
                display: 'block',
                lineHeight: 1.2
              }}
            >
              {node.id}
            </Typography>
          </Tooltip>
        </Box>
        
        <Divider sx={{ my: 1.5 }} />
        
        {/* Main Configuration */}
        <Box sx={{ 
          px: 2,
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(0, 0, 0, 0.15)'
            : 'rgba(0, 0, 0, 0.01)',
          py: 1.5,
        }}>
          {renderConfig()}
        </Box>
        
        {/* Advanced Section - Collapsed by default */}
        <Box sx={{ mt: 2 }}>
          <Accordion 
            expanded={advancedExpanded} 
            onChange={() => setAdvancedExpanded(!advancedExpanded)}
            disableGutters
            elevation={0}
            sx={{ 
              '&:before': { display: 'none' },
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(0, 0, 0, 0.15)'
                : 'rgba(0, 0, 0, 0.01)',
            }}
          >
            <AccordionSummary 
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                px: 2,
                minHeight: 40,
                '& .MuiAccordionSummary-content': { my: 0.5 }
              }}
            >
              <Typography 
                variant="caption" 
                sx={{ 
                  textTransform: 'uppercase', 
                  letterSpacing: 0.5, 
                  color: 'text.secondary',
                  fontWeight: 600 
                }}
              >
                Advanced
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
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
                Log Level
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={node.data?.logLevel || 'none'}
                  onChange={(e) => handleChange('logLevel', e.target.value)}
                  sx={{
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(0, 0, 0, 0.3)'
                      : 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="debug">Debug</MenuItem>
                </Select>
              </FormControl>
            </AccordionDetails>
          </Accordion>
        </Box>
      </Box>

      {/* Tag Selection Dialog */}
      {tagSelectionOpen && (
        <TagSelectionDialog
          open={tagSelectionOpen}
          onClose={() => setTagSelectionOpen(false)}
          onSelect={handleTagSelected}
          currentTagId={node.data?.tagId}
        />
      )}
    </Paper>
  );
};

export default NodeConfigPanel;
