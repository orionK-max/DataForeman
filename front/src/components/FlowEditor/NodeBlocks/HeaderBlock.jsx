import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

/**
 * HeaderBlock - Node header with icon, title, and badges
 * 
 * Displays the main identifier for the node with optional execution order badge.
 */
export const HeaderBlock = ({ icon, title, color, badges = [], executionOrder }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: 1
      }}
    >
      {/* Execution order badge (shown before icon) */}
      {badges.includes('executionOrder') && executionOrder && (
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: '#1976d2',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 2px 4px rgba(25, 118, 210, 0.4)',
            flexShrink: 0
          }}
        >
          {executionOrder}
        </Box>
      )}

      {/* Icon box */}
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '6px',
          backgroundColor: color || '#666666',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0
        }}
      >
        {icon}
      </Box>

      {/* Title */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          flex: 1,
          color: theme.palette.text.primary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};
