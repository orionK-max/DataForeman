import React from 'react';
import { Typography, useTheme } from '@mui/material';

/**
 * TextBlock - General-purpose text display
 * 
 * Used for status messages, help text, and other content.
 */
export const TextBlock = ({ 
  content, 
  fontSize = 12, 
  fontWeight = 400, 
  color, 
  align = 'left',
  padding = 4
}) => {
  const theme = useTheme();

  if (!content) {
    return null;
  }

  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        color: color || theme.palette.text.primary,
        fontSize: fontSize,
        fontWeight: fontWeight,
        textAlign: align,
        paddingY: `${padding}px`,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      {content}
    </Typography>
  );
};
