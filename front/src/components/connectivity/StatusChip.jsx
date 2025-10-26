import React from 'react';
import { Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

/**
 * StatusChip - Display connection status with appropriate color and icon
 * @param {Object} props
 * @param {string} props.state - Connection state (connected, error, connecting, etc.)
 * @param {string} props.reason - Optional reason/error message
 * @param {string} props.size - Chip size (small, medium)
 */
const StatusChip = ({ state, reason, size = 'small' }) => {
  const getStatusConfig = () => {
    switch (state) {
      case 'connected':
        return {
          color: 'success',
          icon: <CheckCircleIcon />,
          label: 'Connected',
        };
      case 'error':
        return {
          color: 'error',
          icon: <ErrorIcon />,
          label: reason || 'Error',
        };
      case 'connecting':
        return {
          color: 'warning',
          icon: <HourglassEmptyIcon />,
          label: 'Connecting',
        };
      case 'timeout':
        return {
          color: 'warning',
          icon: <ErrorIcon />,
          label: 'Timeout',
        };
      default:
        return {
          color: 'default',
          icon: <HelpOutlineIcon />,
          label: state || 'Unknown',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size={size}
      variant="outlined"
    />
  );
};

export default StatusChip;
