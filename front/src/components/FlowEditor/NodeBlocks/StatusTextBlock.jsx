import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

/**
 * StatusTextBlock - Dynamic status message with icon
 * 
 * Displays status messages for async operations with optional icon.
 */
export const StatusTextBlock = ({ 
  text, 
  color, 
  icon,
  fontSize = 12,
  fontWeight = 500,
  align = 'left'
}) => {
  const theme = useTheme();

  if (!text) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        my: 0.5
      }}
    >
      {icon && (
        <Box
          component="span"
          sx={{
            fontSize: fontSize,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {icon}
        </Box>
      )}
      <Typography
        variant="caption"
        sx={{
          fontSize: fontSize,
          fontWeight: fontWeight,
          color: color || theme.palette.text.primary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {text}
      </Typography>
    </Box>
  );
};
