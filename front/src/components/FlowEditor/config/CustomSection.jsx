import React from 'react';
import { Box, Button, Alert } from '@mui/material';
import { Refresh as RefreshIcon, Add as AddIcon } from '@mui/icons-material';

/**
 * Renders custom config sections (like action buttons)
 */
const CustomSection = ({ section, nodeData, onAction }) => {
  if (!section.content) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Custom section missing content
      </Alert>
    );
  }

  // Handle action-buttons type
  if (section.content.type === 'action-buttons') {
    const buttons = section.content.buttons || [];

    const getIcon = (buttonId) => {
      if (buttonId === 'regenId') return <RefreshIcon />;
      if (buttonId === 'createSibling') return <AddIcon />;
      return null;
    };

    return (
      <Box sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
          {buttons.map((button, index) => (
            <Button
              key={index}
              variant={button.variant || 'contained'}
              color={button.color || 'primary'}
              startIcon={getIcon(button.id)}
              onClick={() => onAction && onAction(button.id)}
              fullWidth
            >
              {button.label}
            </Button>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      Unknown custom section type: {section.content.type}
    </Alert>
  );
};

export default CustomSection;
