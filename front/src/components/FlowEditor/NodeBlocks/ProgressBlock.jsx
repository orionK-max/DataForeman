import React from 'react';
import { Box, Typography, LinearProgress, useTheme } from '@mui/material';

/**
 * ProgressBlock - Progress bar for async operations
 * 
 * Displays progress with optional label and percentage.
 */
export const ProgressBlock = ({ 
  value, 
  max, 
  label, 
  color = '#2196F3',
  backgroundColor = '#e0e0e0',
  height = 4,
  showPercentage = true
}) => {
  const theme = useTheme();

  if (value === undefined || max === undefined) {
    return null;
  }

  const numValue = Number(value) || 0;
  const numMax = Number(max) || 100;
  const percentage = Math.min(100, Math.max(0, (numValue / numMax) * 100));

  return (
    <Box sx={{ my: 1 }}>
      {(label || showPercentage) && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 0.5
          }}
        >
          {label && (
            <Typography
              variant="caption"
              sx={{
                fontSize: 11,
                color: theme.palette.text.secondary
              }}
            >
              {label}
            </Typography>
          )}
          {showPercentage && (
            <Typography
              variant="caption"
              sx={{
                fontSize: 11,
                color: theme.palette.text.secondary,
                fontWeight: 600
              }}
            >
              {Math.round(percentage)}%
            </Typography>
          )}
        </Box>
      )}
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: height,
          borderRadius: height / 2,
          backgroundColor: backgroundColor,
          '& .MuiLinearProgress-bar': {
            backgroundColor: color,
            borderRadius: height / 2
          }
        }}
      />
    </Box>
  );
};
