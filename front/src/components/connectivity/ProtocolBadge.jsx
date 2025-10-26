import React from 'react';
import { Chip } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import CableIcon from '@mui/icons-material/Cable';

/**
 * ProtocolBadge - Display protocol type with appropriate icon and color
 * @param {Object} props
 * @param {string} props.type - Protocol type (opcua-client, s7, eip)
 * @param {string} props.size - Chip size (small, medium)
 * @param {string} props.variant - Chip variant (filled, outlined)
 */
const ProtocolBadge = ({ type, size = 'small', variant = 'filled' }) => {
  const getProtocolConfig = () => {
    switch (type) {
      case 'opcua-client':
      case 'opcua':
        return {
          icon: <AccountTreeIcon />,
          label: 'OPC UA',
          color: 'primary',
        };
      case 's7':
        return {
          icon: <PrecisionManufacturingIcon />,
          label: 'S7',
          color: 'secondary',
        };
      case 'eip':
        return {
          icon: <CableIcon />,
          label: 'EIP',
          color: 'info',
        };
      default:
        return {
          icon: <CableIcon />,
          label: type || 'Unknown',
          color: 'default',
        };
    }
  };

  const config = getProtocolConfig();

  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size={size}
      variant={variant}
    />
  );
};

export default ProtocolBadge;
