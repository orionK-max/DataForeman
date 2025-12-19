import React from 'react';
import { Box, Typography } from '@mui/material';
import { shouldShowSection } from './configUtils';
import FieldRenderer from './FieldRenderer';

/**
 * Conditional group section - renders items based on showWhen conditions
 * Supports nested conditional groups
 */
const ConditionalGroupSection = ({ section, nodeData, metadata, flow, onChange }) => {
  // Check if this group should be shown
  if (!shouldShowSection(section, nodeData)) {
    return null;
  }
  
  return (
    <Box 
      sx={{ 
        mb: 2,
        ...(section.nested && {
          ml: 2,
          p: 1.5,
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(33, 150, 243, 0.08)'
            : 'rgba(33, 150, 243, 0.05)',
          borderRadius: 1,
          border: '1px solid',
          borderColor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(33, 150, 243, 0.2)'
            : 'rgba(33, 150, 243, 0.15)',
        })
      }}
    >
      {/* Title if provided */}
      {section.title && (
        <Typography 
          variant="subtitle2" 
          gutterBottom
          sx={{ 
            mb: 1.5,
            fontWeight: 600
          }}
        >
          {section.title}
        </Typography>
      )}
      
      {/* Render items */}
      {section.items?.map((item, index) => {
        // If item is itself a conditional group, render recursively
        if (item.type === 'conditional-group') {
          return (
            <ConditionalGroupSection
              key={index}
              section={item}
              nodeData={nodeData}
              metadata={metadata}
              flow={flow}
              onChange={onChange}
            />
          );
        }
        
        // Otherwise render as a field
        return (
          <FieldRenderer
            key={index}
            field={item}
            nodeData={nodeData}
            onChange={onChange}
          />
        );
      })}
    </Box>
  );
};

export default ConditionalGroupSection;
