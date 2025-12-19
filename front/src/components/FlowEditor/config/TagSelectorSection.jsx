import React, { useState } from 'react';
import { Box, Button, Typography, Chip, IconButton } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import TagSelectionDialog from '../TagSelectionDialog';

/**
 * Tag selector section - displays selected tag info and selection button
 */
const TagSelectorSection = ({ section, nodeData, onChange }) => {
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  
  const hasTag = nodeData?.tagId && nodeData?.tagPath;
  
  const handleTagSelected = (tag) => {
    // Map tag object properties to node data based on section.onSelect configuration
    const updates = {};
    
    if (section.onSelect) {
      for (const [nodeProperty, tagProperty] of Object.entries(section.onSelect)) {
        updates[nodeProperty] = tag[tagProperty];
      }
    }
    
    // Apply all updates at once
    onChange(updates);
  };
  
  return (
    <Box sx={{ mb: 2 }}>
      {section.label && (
        <Typography 
          variant="caption" 
          sx={{ 
            display: 'block', 
            mb: 1, 
            color: 'text.secondary',
            fontSize: '0.75rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}
        >
          {section.label}
        </Typography>
      )}
      
      {/* Display selected tag info */}
      {hasTag && section.showInfo && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Tag
            </Typography>
            <IconButton size="small" onClick={() => setTagDialogOpen(true)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Box>
          
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
            {(nodeData.connectionName || 
              (nodeData.source === 'internal' ? 'Internal' : 
               nodeData.source === 'system' ? 'System' : '')) && 
              `${nodeData.connectionName || 
                (nodeData.source === 'internal' ? 'Internal' : 
                 nodeData.source === 'system' ? 'System' : '')}: `}
            {nodeData.tagName || nodeData.tagPath}
          </Typography>
          
          {/* Display configured info properties as chips */}
          {section.infoProperties && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {section.infoProperties.map(prop => {
                const value = nodeData[prop];
                if (!value) return null;
                
                // Special formatting for source property
                if (prop === 'source') {
                  const label = value === 'internal' ? 'Internal' : 
                               value === 'system' ? 'System' : 'Connectivity';
                  return (
                    <Chip 
                      key={prop}
                      label={label} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                  );
                }
                
                return <Chip key={prop} label={value} size="small" />;
              })}
            </Box>
          )}
        </Box>
      )}
      
      {/* No tag selected message */}
      {!hasTag && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No tag selected
        </Typography>
      )}
      
      {/* Tag selection button */}
      <Button
        variant={hasTag ? "outlined" : "contained"}
        fullWidth
        startIcon={hasTag ? <EditIcon /> : <AddIcon />}
        onClick={() => setTagDialogOpen(true)}
      >
        {hasTag ? 'Change Tag' : 'Select Tag'}
      </Button>
      
      {/* Tag Selection Dialog */}
      {tagDialogOpen && (
        <TagSelectionDialog
          open={tagDialogOpen}
          onClose={() => setTagDialogOpen(false)}
          onSelect={(tag) => {
            handleTagSelected(tag);
            setTagDialogOpen(false);
          }}
          currentTagId={nodeData?.tagId}
        />
      )}
    </Box>
  );
};

export default TagSelectorSection;
