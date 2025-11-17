import React from 'react';
import { Box } from '@mui/material';

/**
 * DataJson - Displays data as formatted JSON with syntax highlighting
 */
const DataJson = ({ data }) => {
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 2,
        bgcolor: 'grey.100',
        borderRadius: 1,
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        lineHeight: 1.6,
        '&::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: 'grey.400',
          borderRadius: '4px',
        },
      }}
    >
      <SyntaxHighlight json={jsonString} />
    </Box>
  );
};

/**
 * Simple syntax highlighting for JSON
 */
const SyntaxHighlight = ({ json }) => {
  // Apply syntax highlighting
  const highlighted = json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let className = 'json-number';
      
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          className = 'json-key';
        } else {
          className = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        className = 'json-boolean';
      } else if (/null/.test(match)) {
        className = 'json-null';
      }
      
      return `<span class="${className}">${match}</span>`;
    }
  );

  return (
    <Box
      component="code"
      dangerouslySetInnerHTML={{ __html: highlighted }}
      sx={{
        '& .json-key': {
          color: '#881391',
          fontWeight: 600,
        },
        '& .json-string': {
          color: '#1A1AA6',
        },
        '& .json-number': {
          color: '#098658',
        },
        '& .json-boolean': {
          color: '#0000FF',
          fontWeight: 600,
        },
        '& .json-null': {
          color: '#808080',
          fontWeight: 600,
        },
      }}
    />
  );
};

export default DataJson;
