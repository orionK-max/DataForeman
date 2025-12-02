import React from 'react';
import { Box, useTheme } from '@mui/material';

/**
 * DividerBlock - Visual separator between sections
 * 
 * Renders a horizontal line with configurable styling.
 */
export const DividerBlock = ({ 
  color, 
  thickness = 1, 
  margin = 8,
  style = 'solid'
}) => {
  const theme = useTheme();

  const borderStyle = {
    solid: 'solid',
    dashed: 'dashed',
    dotted: 'dotted'
  }[style] || 'solid';

  return (
    <Box
      sx={{
        height: 0,
        borderTop: `${thickness}px ${borderStyle} ${color || theme.palette.divider}`,
        marginY: `${margin}px`,
        width: '100%'
      }}
    />
  );
};
