import React from 'react';
import { Box, Typography } from '@mui/material';
import Editor from '@monaco-editor/react';

/**
 * Code editor section using Monaco editor
 */
const CodeEditorSection = ({ section, nodeData, onChange }) => {
  const value = nodeData?.[section.property] ?? section.defaultValue ?? '';
  
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
      {section.label && (
        <Typography variant="body2" gutterBottom>
          {section.label}
        </Typography>
      )}
      
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
    </Box>
  );
};

export default CodeEditorSection;
