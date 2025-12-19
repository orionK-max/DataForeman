import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { 
  Close as CloseIcon, 
  ExpandMore as ExpandMoreIcon,
  HelpOutline as HelpIcon,
} from '@mui/icons-material';
import { getNodeMetadata } from '../../constants/nodeTypes';
import ConfigSectionRenderer from './config/ConfigSectionRenderer';
import NodeHelpModal from './config/NodeHelpModal';

const NodeConfigPanel = ({ node, flow, onDataChange, onClose, onNodeAction }) => {
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const handleChange = (updates) => {
    onDataChange(updates);
  };

  const handleAction = async (actionName) => {
    if (onNodeAction) {
      await onNodeAction(node, actionName);
    }
  };

  const renderConfig = () => {
    const metadata = getNodeMetadata(node.type);
    
    // All nodes must have configUI - fail gracefully if missing
    if (!metadata?.configUI?.sections) {
      return (
        <Alert severity="error">
          Node type "{node.type}" is missing configUI definition
        </Alert>
      );
    }
    
    return (
      <Box>
        {metadata.configUI.sections.map((section, index) => (
          <ConfigSectionRenderer
            key={index}
            section={section}
            nodeData={node.data}
            metadata={metadata}
            flow={flow}
            onChange={handleChange}
            onAction={handleAction}
          />
        ))}
      </Box>
    );
  };

  return (
    <Paper
      elevation={2}
      sx={{
        width: 380,
        height: '100%',
        overflow: 'auto',
        borderLeft: '1px solid rgba(0, 0, 0, 0.12)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Node Configuration
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          {getNodeMetadata(node.type)?.help && (
            <Tooltip title="Help & Documentation">
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<HelpIcon />}
                onClick={() => setHelpOpen(true)}
                sx={{ minWidth: 80 }}
              >
                Help
              </Button>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>
      
      <Divider />
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* Node Info Section */}
        <Box sx={{ 
          px: 2, 
          pt: 1.5, 
          pb: 0.75,
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(255, 255, 255, 0.02)'
            : 'rgba(0, 0, 0, 0.02)',
        }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25, fontSize: '1rem' }}>
            {node.type}
          </Typography>
          <Tooltip title="Unique node identifier">
            <Typography 
              variant="caption" 
              sx={{ 
                fontFamily: 'monospace', 
                color: 'text.disabled',
                fontSize: '0.65rem',
                display: 'block',
                lineHeight: 1.2
              }}
            >
              {node.id}
            </Typography>
          </Tooltip>
        </Box>
        
        <Divider sx={{ my: 1.5 }} />
        
        {/* Main Configuration */}
        <Box sx={{ 
          px: 2,
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(0, 0, 0, 0.15)'
            : 'rgba(0, 0, 0, 0.01)',
          py: 1.5,
        }}>
          {renderConfig()}
        </Box>
        
        {/* Advanced Section - Collapsed by default */}
        <Box sx={{ mt: 2 }}>
          <Accordion 
            expanded={advancedExpanded} 
            onChange={() => setAdvancedExpanded(!advancedExpanded)}
            disableGutters
            elevation={0}
            sx={{ 
              '&:before': { display: 'none' },
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(0, 0, 0, 0.15)'
                : 'rgba(0, 0, 0, 0.01)',
            }}
          >
            <AccordionSummary 
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                px: 2,
                minHeight: 40,
                '& .MuiAccordionSummary-content': { my: 0.5 }
              }}
            >
              <Typography 
                variant="caption" 
                sx={{ 
                  textTransform: 'uppercase', 
                  letterSpacing: 0.5, 
                  color: 'text.secondary',
                  fontWeight: 600 
                }}
              >
                Advanced
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              <Typography 
                variant="caption" 
                sx={{ 
                  display: 'block', 
                  mb: 0.5, 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}
              >
                Log Level
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={node.data?.logLevel || 'none'}
                  onChange={(e) => handleChange({ logLevel: e.target.value })}
                  sx={{
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(0, 0, 0, 0.3)'
                      : 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="debug">Debug</MenuItem>
                </Select>
              </FormControl>
            </AccordionDetails>
          </Accordion>
        </Box>
      </Box>
      
      {/* Help Modal */}
      <NodeHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        metadata={getNodeMetadata(node.type)}
      />
    </Paper>
  );
};

export default NodeConfigPanel;
