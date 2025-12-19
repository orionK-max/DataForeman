import React from 'react';
import { Alert } from '@mui/material';
import TagSelectorSection from './TagSelectorSection';
import ConditionalGroupSection from './ConditionalGroupSection';
import CodeEditorSection from './CodeEditorSection';
import PropertyGroupSection from './PropertyGroupSection';
import CustomSection from './CustomSection';

/**
 * Renders a config section based on its type
 */
const ConfigSectionRenderer = ({ section, nodeData, metadata, flow, onChange, onAction }) => {
  switch (section.type) {
    case 'tag-selector':
      return (
        <TagSelectorSection
          section={section}
          nodeData={nodeData}
          onChange={onChange}
        />
      );
    
    case 'conditional-group':
      return (
        <ConditionalGroupSection
          section={section}
          nodeData={nodeData}
          metadata={metadata}
          flow={flow}
          onChange={onChange}
        />
      );
    
    case 'code-editor':
      return (
        <CodeEditorSection
          section={section}
          nodeData={nodeData}
          onChange={onChange}
        />
      );
    
    case 'property-group':
      return (
        <PropertyGroupSection
          section={section}
          nodeData={nodeData}
          metadata={metadata}
          flow={flow}
          onChange={onChange}
        />
      );
    
    case 'custom':
      return (
        <CustomSection
          section={section}
          nodeData={nodeData}
          onAction={onAction}
        />
      );
    
    default:
      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          Unknown section type: {section.type}
        </Alert>
      );
  }
};

export default ConfigSectionRenderer;
