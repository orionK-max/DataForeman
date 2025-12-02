import React from 'react';
import { Box, Chip, Tooltip, useTheme } from '@mui/material';

/**
 * BadgesBlock - Small colored pills/chips for status indicators
 * 
 * Displays badges in inline (horizontal) or stacked (vertical) layout.
 */
export const BadgesBlock = ({ 
  items = [], 
  position = 'inline', 
  spacing = 4,
  align = 'left'
}) => {
  const theme = useTheme();

  if (!items || items.length === 0) {
    return null;
  }

  const isStacked = position === 'stacked';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isStacked ? 'column' : 'row',
        gap: `${spacing}px`,
        alignItems: isStacked ? (align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start') : 'center',
        flexWrap: isStacked ? 'nowrap' : 'wrap',
        my: 0.5,
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
      }}
    >
      {items.map((item, index) => {
        if (!item.text) {
          return null;
        }

        const badge = (
          <Chip
            key={index}
            label={item.text}
            icon={item.icon ? <span style={{ fontSize: 12 }}>{item.icon}</span> : undefined}
            size="small"
            sx={{
              height: 20,
              fontSize: 10,
              fontWeight: 500,
              backgroundColor: item.color || '#757575',
              color: item.textColor || '#ffffff',
              '& .MuiChip-label': {
                padding: '0 6px'
              },
              '& .MuiChip-icon': {
                marginLeft: '4px',
                marginRight: '-2px'
              }
            }}
          />
        );

        return item.tooltip ? (
          <Tooltip key={index} title={item.tooltip} placement="top">
            {badge}
          </Tooltip>
        ) : badge;
      })}
    </Box>
  );
};
