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

      case 'math-add':
      case 'math-subtract':
      case 'math-multiply':
      case 'math-divide':
        return (
          <Box>
            <Typography variant="body2" gutterBottom>
              Static Values (comma-separated)
            </Typography>
            <TextField
              fullWidth
              placeholder="10, 20, 30"
              value={node.data?.values?.join(', ') || ''}
              onChange={(e) => {
                const values = e.target.value
                  .split(',')
                  .map(v => parseFloat(v.trim()))
                  .filter(v => !isNaN(v));
                handleChange('values', values);
              }}
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
                <MenuItem value="skip">Skip Node</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 'compare-gt':
      case 'compare-lt':
      case 'compare-eq':
      case 'compare-neq':
        return (
          <Box>
            <Typography variant="body2" gutterBottom>
              Comparison Value
            </Typography>
            <TextField
              fullWidth
              type="number"
              value={node.data?.compareValue || ''}
              onChange={(e) => handleChange('compareValue', parseFloat(e.target.value))}
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
                <MenuItem value="skip">Skip Node</MenuItem>
              </Select>
            </FormControl>
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
                value={node.data?.code || '// Write your JavaScript code here\n// Available: $input, $tags, $flow, $fs\nreturn $input * 2;'}
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
                          label: '$tags.read',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Read a tag value: $tags.read("tagPath")',
                          insertText: '$tags.read("${1:tagPath}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$tags.write',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Write a tag value: $tags.write("tagPath", value)',
                          insertText: '$tags.write("${1:tagPath}", ${2:value})',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$flow.getId',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Get current flow ID',
                          insertText: '$flow.getId()',
                          range: range
                        },
                        {
                          label: '$flow.log',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Log a message: $flow.log("message")',
                          insertText: '$flow.log("${1:message}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.readFile',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Read file contents: await $fs.readFile("path")',
                          insertText: 'await $fs.readFile("${1:path}")',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.writeFile',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'Write file contents: await $fs.writeFile("path", data)',
                          insertText: 'await $fs.writeFile("${1:path}", ${2:data})',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          range: range
                        },
                        {
                          label: '$fs.listFiles',
                          kind: monaco.languages.CompletionItemKind.Method,
                          documentation: 'List files in directory: await $fs.listFiles("dirPath")',
                          insertText: 'await $fs.listFiles("${1:dirPath}")',
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
                <MenuItem value="skip">Skip Node</MenuItem>
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
