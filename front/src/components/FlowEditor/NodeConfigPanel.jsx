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
} from '@mui/material';
import { Close as CloseIcon, Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { getInternalTags } from '../../services/flowsApi';
import TagSelectionDialog from './TagSelectionDialog';
import { getNodeMetadata } from '../../constants/nodeTypes';

const NodeConfigPanel = ({ node, onDataChange, onClose }) => {
  const [tagSelectionOpen, setTagSelectionOpen] = useState(false);

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

  // Render a single property based on its type
  const renderProperty = (property, value, onChange) => {
    const key = property.name;
    
    switch (property.type) {
      case 'string':
        return (
          <TextField
            key={key}
            fullWidth
            label={property.displayName}
            placeholder={property.placeholder}
            value={value ?? property.default ?? ''}
            onChange={(e) => onChange(property.name, e.target.value)}
            helperText={property.description}
            sx={{ mb: 2 }}
            multiline={property.placeholder?.includes('\n') || (value && value.length > 50)}
            rows={property.placeholder?.includes('\n') ? 3 : undefined}
          />
        );
      
      case 'number':
        return (
          <TextField
            key={key}
            fullWidth
            type="number"
            label={property.displayName}
            placeholder={property.placeholder}
            value={value ?? property.default ?? ''}
            onChange={(e) => onChange(property.name, e.target.value === '' ? undefined : parseFloat(e.target.value))}
            helperText={property.description}
            sx={{ mb: 2 }}
          />
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
          <FormControl key={key} fullWidth sx={{ mb: 2 }}>
            <InputLabel>{property.displayName}</InputLabel>
            <Select
              value={value ?? property.default ?? ''}
              onChange={(e) => onChange(property.name, e.target.value)}
              label={property.displayName}
            >
              {property.options?.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
            {property.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {property.description}
              </Typography>
            )}
          </FormControl>
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

        return (
          <Box>
            {metadata.properties.map((property) => {
              // Check if property should be shown based on displayOptions
              if (!shouldShowProperty(property, node.data || {}, metadata)) {
                return null;
              }

              const value = node.data?.[property.name];
              return renderProperty(property, value, handleChange);
            })}
          </Box>
        );
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        width: 350,
        height: '100%',
        overflow: 'auto',
        borderLeft: '1px solid rgba(0, 0, 0, 0.12)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">
          Node Configuration
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      
      <Divider />
      
      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        <Typography variant="subtitle2" gutterBottom>
          {node.type}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          ID: {node.id}
        </Typography>
        
        {/* Log Level Setting - Common to all nodes */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Log Level</InputLabel>
          <Select
            value={node.data?.logLevel || 'none'}
            onChange={(e) => handleChange('logLevel', e.target.value)}
            label="Log Level"
          >
            <MenuItem value="none">None (No Logs)</MenuItem>
            <MenuItem value="error">Error Only</MenuItem>
            <MenuItem value="info">Info + Error</MenuItem>
            <MenuItem value="debug">Debug + Info + Error</MenuItem>
          </Select>
        </FormControl>
        
        <Divider sx={{ my: 2 }} />
        
        {renderConfig()}
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
