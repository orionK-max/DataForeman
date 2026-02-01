import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import Editor from '@monaco-editor/react';

/**
 * Fullscreen code editor dialog
 */
const FullscreenCodeEditorDialog = ({ 
  open, 
  onClose, 
  value, 
  onChange, 
  language = 'javascript',
  title = 'Code Editor',
  autocomplete = []
}) => {
  const [localValue, setLocalValue] = useState(value);

  const handleEditorMount = (editor, monaco) => {
    // Register autocomplete if provided
    if (autocomplete && autocomplete.length > 0) {
      monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };

          const suggestions = autocomplete.map(item => {
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

  const handleSave = () => {
    onChange(localValue);
    onClose();
  };

  const handleCancel = () => {
    setLocalValue(value); // Reset to original value
    onClose();
  };

  // Update local value when dialog opens
  React.useEffect(() => {
    if (open) {
      setLocalValue(value);
    }
  }, [open, value]);

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: '95vw',
          height: '90vh',
          maxWidth: 'none',
          m: 2
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FullscreenExitIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6">{title}</Typography>
        </Box>
        <IconButton
          edge="end"
          color="inherit"
          onClick={handleCancel}
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Editor
            height="100%"
            defaultLanguage={language}
            value={localValue}
            onChange={(val) => setLocalValue(val)}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleCancel} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FullscreenCodeEditorDialog;
