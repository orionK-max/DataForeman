import React from 'react';
import { Typography, useTheme } from '@mui/material';

/**
 * SubtitleBlock - Secondary text below header
 * 
 * Displays operation names, tag names, or other secondary information.
 */
export const SubtitleBlock = ({ text, color, fontSize = 12, fontWeight = 400 }) => {
  const theme = useTheme();

  if (!text) {
    return null;
  }

  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        color: color || theme.palette.text.secondary,
        fontSize: fontSize,
        fontWeight: fontWeight,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        mb: 0.5
      }}
    >
      {text}
    </Typography>
  );
};
