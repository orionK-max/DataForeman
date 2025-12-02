import React from 'react';
import { Box, useTheme } from '@mui/material';

/**
 * CodeBlock - Display code snippet with monospace font
 * 
 * Shows code with syntax highlighting-ready styling.
 * Note: Full syntax highlighting requires Monaco editor integration.
 */
export const CodeBlock = ({ 
  language, 
  content, 
  maxLines = null,
  showLineNumbers = false,
  fontSize = 11,
  fontFamily = 'Fira Code, Consolas, Monaco, monospace',
  wrap = false
}) => {
  const theme = useTheme();

  if (!content) {
    return null;
  }

  const lines = content.split('\n');
  const displayLines = maxLines && lines.length > maxLines 
    ? lines.slice(0, maxLines) 
    : lines;
  
  const hasMore = maxLines && lines.length > maxLines;

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        padding: '6px 8px',
        fontFamily: fontFamily,
        fontSize: fontSize,
        lineHeight: 1.5,
        color: theme.palette.text.primary,
        overflowX: wrap ? 'hidden' : 'auto',
        overflowY: maxLines ? 'hidden' : 'auto',
        maxHeight: maxLines ? `${maxLines * fontSize * 1.5 + 12}px` : 'none',
        whiteSpace: wrap ? 'pre-wrap' : 'pre',
        wordBreak: wrap ? 'break-all' : 'normal',
        my: 0.5
      }}
    >
      {displayLines.map((line, index) => (
        <Box
          key={index}
          sx={{
            display: 'flex',
            alignItems: 'flex-start'
          }}
        >
          {showLineNumbers && (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                minWidth: '24px',
                marginRight: '8px',
                color: theme.palette.text.disabled,
                textAlign: 'right',
                userSelect: 'none'
              }}
            >
              {index + 1}
            </Box>
          )}
          <Box component="span" sx={{ flex: 1 }}>
            {line || ' '}
          </Box>
        </Box>
      ))}
      {hasMore && (
        <Box
          sx={{
            color: theme.palette.text.disabled,
            fontStyle: 'italic',
            mt: 0.5
          }}
        >
          ... ({lines.length - maxLines} more lines)
        </Box>
      )}
    </Box>
  );
};
