import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

/**
 * ValuesBlock - Key-value pairs display
 * 
 * Shows labeled values in horizontal or vertical layout.
 */
export const ValuesBlock = ({ 
  items = [], 
  layout = 'horizontal', 
  spacing = 8,
  labelWidth = 'auto'
}) => {
  const theme = useTheme();

  if (!items || items.length === 0) {
    return null;
  }

  const isHorizontal = layout === 'horizontal';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        gap: `${spacing}px`,
        flexWrap: isHorizontal ? 'wrap' : 'nowrap',
        my: 0.5
      }}
    >
      {items.map((item, index) => {
        // Show value even if falsy (0, false, empty string are valid)
        // Only hide if value is null or undefined
        if (item.value === null || item.value === undefined) {
          return null;
        }

        return (
          <Box
            key={index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: 11,
                fontWeight: 500,
                width: labelWidth !== 'auto' ? `${labelWidth}px` : 'auto',
                flexShrink: 0
              }}
            >
              {item.label}:
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: item.color || theme.palette.text.primary,
                fontSize: 11,
                fontWeight: 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {item.value}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};
