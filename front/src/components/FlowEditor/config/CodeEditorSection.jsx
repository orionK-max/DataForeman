import React, { useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import Editor from '@monaco-editor/react';
import FullscreenCodeEditorDialog from './FullscreenCodeEditorDialog';

/**
 * Code editor section using Monaco editor
 */
const CodeEditorSection = ({ section, nodeData, onChange }) => {
  const value = nodeData?.[section.property] ?? section.defaultValue ?? '';
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  
  const handleEditorMount = (editor, monaco) => {
    // Register autocomplete if provided
    if (section.autocomplete && section.autocomplete.length > 0) {
      monaco.languages.registerCompletionItemProvider(section.language || 'javascript', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };

          const suggestions = section.autocomplete.map(item => {
            // Map kind string to monaco kind enum
            const kindMap = {
              'Variable': monaco.languages.CompletionItemKind.Variable,
              'Method': monaco.languages.CompletionItemKind.Method,
              'Function': monaco.languages.CompletionItemKind.Function,
              'Class': monaco.languages.CompletionItemKind.Class,
              'Property': monaco.languages.CompletionItemKind.Property,
            };
            
            return {
              label: item.label,
              kind: kindMap[item.kind] || monaco.languages.CompletionItemKind.Text,
              documentation: item.documentation,
              insertText: item.insertText,
              insertTextRules: item.isSnippet 
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet 
                : undefined,
              range: range
            };
          });

          return { suggestions };
        }
      });
    }
  };
  
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        {section.label && (
          <Typography variant="body2">
            {section.label}
          </Typography>
        )}
        <Tooltip title="Open fullscreen editor">
          <IconButton
            size="small"
            onClick={() => setFullscreenOpen(true)}
            sx={{ ml: 'auto' }}
          >
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Box 
        sx={{ 
          height: section.height || 300, 
          border: '1px solid rgba(0, 0, 0, 0.23)', 
          borderRadius: 1 
        }}
      >
        <Editor
          height="100%"
          defaultLanguage={section.language || 'javascript'}
          value={value}
          onChange={(val) => onChange({ [section.property]: val })}
          onMount={handleEditorMount}
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
      
      {section.helperText && (
        <Typography 
          variant="caption" 
          color="text.secondary" 
          sx={{ display: 'block', mt: 0.5 }}
        >
          {section.helperText}
        </Typography>
      )}

      <FullscreenCodeEditorDialog
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        value={value}
        onChange={(val) => onChange({ [section.property]: val })}
        language={section.language || 'javascript'}
        title={section.label || 'Code Editor'}
        autocomplete={section.autocomplete || []}
      />
    </Box>
  );
};

export default CodeEditorSection;
