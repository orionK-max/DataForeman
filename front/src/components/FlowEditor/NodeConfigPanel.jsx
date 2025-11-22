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
} from '@mui/material';
import { Close as CloseIcon, Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { getInternalTags } from '../../services/flowsApi';
import TagCreationDialog from './TagCreationDialog';
import TagSelectionDialog from './TagSelectionDialog';

const NodeConfigPanel = ({ node, onDataChange, onClose }) => {
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagSelectionOpen, setTagSelectionOpen] = useState(false);

  const handleChange = (field, value) => {
    onDataChange({ [field]: value });
  };

  const handleTagCreated = (newTag) => {
    // Automatically select the newly created tag
    handleChange('tagId', newTag.tag_id);
    handleChange('tagPath', newTag.tag_path);
    handleChange('tagName', newTag.tag_name);
    handleChange('source', 'internal');
  };

  const handleTagSelected = (tag) => {
    handleChange('tagId', tag.tag_id);
    handleChange('tagPath', tag.tag_path);
    handleChange('tagName', tag.tag_name || tag.tag_path);
    handleChange('dataType', tag.data_type);
    handleChange('source', tag.source);
    handleChange('connectionId', tag.connectionId);
  };

  const renderConfig = () => {
    switch (node.type) {
      case 'trigger-manual':
        return (
          <Typography variant="body2" color="text.secondary">
            Manual trigger - no configuration needed
          </Typography>
        );

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
                  {node.data.tagPath}
                </Typography>
                {node.data.tagName && node.data.tagName !== node.data.tagPath && (
                  <Typography variant="caption" color="text.secondary">
                    {node.data.tagName}
                  </Typography>
                )}
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
              sx={{ mb: 1 }}
            >
              {hasTag ? 'Change Tag' : 'Select Tag'}
            </Button>
            
            {/* Create new internal tag (only for output) */}
            {isOutput && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<AddIcon />}
                onClick={() => setTagDialogOpen(true)}
              >
                Create New Internal Tag
              </Button>
            )}
          </Box>
        );

      case 'math':
        return (
          <Box>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Operation</InputLabel>
              <Select
                value={node.data?.operation || 'add'}
                onChange={(e) => handleChange('operation', e.target.value)}
                label="Operation"
              >
                <MenuItem value="add">Add</MenuItem>
                <MenuItem value="subtract">Subtract</MenuItem>
                <MenuItem value="multiply">Multiply</MenuItem>
                <MenuItem value="divide">Divide</MenuItem>
                <MenuItem value="average">Average</MenuItem>
                <MenuItem value="min">Minimum</MenuItem>
                <MenuItem value="max">Maximum</MenuItem>
                <MenuItem value="formula">Custom Formula</MenuItem>
              </Select>
            </FormControl>

            {node.data?.operation === 'formula' && (
              <TextField
                fullWidth
                label="Formula"
                placeholder="input0 * 2 + input1"
                value={node.data?.formula || ''}
                onChange={(e) => handleChange('formula', e.target.value)}
                sx={{ mb: 2 }}
                helperText="Use input0, input1, etc. Supports Math functions."
              />
            )}

            <TextField
              fullWidth
              type="number"
              label="Decimal Places (optional)"
              placeholder="Leave empty for no rounding"
              value={node.data?.decimalPlaces ?? ''}
              onChange={(e) => handleChange('decimalPlaces', e.target.value === '' ? undefined : parseInt(e.target.value))}
              sx={{ mb: 2 }}
            />

            <FormControl fullWidth>
              <InputLabel>Skip Invalid Inputs</InputLabel>
              <Select
                value={node.data?.skipInvalid !== false}
                onChange={(e) => handleChange('skipInvalid', e.target.value)}
                label="Skip Invalid Inputs"
              >
                <MenuItem value={true}>Yes (skip NaN/Infinity)</MenuItem>
                <MenuItem value={false}>No (throw error)</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 'comparison':
        return (
          <Box>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Operation</InputLabel>
              <Select
                value={node.data?.operation || 'gt'}
                onChange={(e) => handleChange('operation', e.target.value)}
                label="Operation"
              >
                <MenuItem value="gt">Greater Than (&gt;)</MenuItem>
                <MenuItem value="lt">Less Than (&lt;)</MenuItem>
                <MenuItem value="gte">Greater or Equal (&gt;=)</MenuItem>
                <MenuItem value="lte">Less or Equal (&lt;=)</MenuItem>
                <MenuItem value="eq">Equal (==)</MenuItem>
                <MenuItem value="neq">Not Equal (!=)</MenuItem>
              </Select>
            </FormControl>

            {(node.data?.operation === 'eq' || node.data?.operation === 'neq') && (
              <TextField
                fullWidth
                type="number"
                label="Equality Tolerance (optional)"
                placeholder="Leave empty for Number.EPSILON"
                value={node.data?.tolerance ?? ''}
                onChange={(e) => handleChange('tolerance', e.target.value === '' ? null : parseFloat(e.target.value))}
                sx={{ mb: 2 }}
                helperText="Tolerance for floating-point comparisons"
              />
            )}
          </Box>
        );

      case 'script-js':
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
        return (
          <Typography variant="body2" color="text.secondary">
            Unknown node type
          </Typography>
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
        
        {renderConfig()}
      </Box>

      {/* Tag Selection Dialog */}
      <TagSelectionDialog
        open={tagSelectionOpen}
        onClose={() => setTagSelectionOpen(false)}
        onSelect={handleTagSelected}
        mode={node.type === 'tag-output' ? 'output' : 'input'}
        title={node.type === 'tag-output' ? 'Select Tag to Write' : 'Select Tag to Read'}
      />

      {/* Tag Creation Dialog */}
      <TagCreationDialog
        open={tagDialogOpen}
        onClose={() => setTagDialogOpen(false)}
        onTagCreated={handleTagCreated}
      />
    </Paper>
  );
};

export default NodeConfigPanel;
