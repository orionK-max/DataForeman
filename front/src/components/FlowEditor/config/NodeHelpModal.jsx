import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LinkIcon from '@mui/icons-material/Link';

/**
 * Modal displaying help documentation for a node type
 */
const NodeHelpModal = ({ open, onClose, metadata }) => {
  const help = metadata?.help;
  
  if (!help) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              bgcolor: metadata.color || '#666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
            }}
          >
            {metadata.icon || '📦'}
          </Box>
          <Box>
            <Typography variant="h6">{metadata.displayName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {metadata.name} • v{metadata.version || 1}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Overview */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <InfoOutlinedIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" color="primary">
              Overview
            </Typography>
          </Box>
          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {help.overview}
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Use Cases */}
        {help.useCases && help.useCases.length > 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1.5 }}>
                Common Use Cases
              </Typography>
              <List dense disablePadding>
                {help.useCases.map((useCase, index) => (
                  <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" color="text.secondary">
                          • {useCase}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
            <Divider sx={{ my: 3 }} />
          </>
        )}

        {/* Examples */}
        {help.examples && help.examples.length > 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1.5 }}>
                Examples
              </Typography>
              <Stack spacing={2}>
                {help.examples.map((example, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      bgcolor: (theme) =>
                        theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.03)'
                          : 'rgba(0, 0, 0, 0.02)',
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      {example.title}
                    </Typography>
                    {example.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        {example.description}
                      </Typography>
                    )}
                    
                    <Box sx={{ display: 'grid', gap: 1, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {example.configuration && (
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            Configuration:
                          </Typography>{' '}
                          <Typography variant="caption" component="span" sx={{ color: 'primary.main' }}>
                            {JSON.stringify(example.configuration)}
                          </Typography>
                        </Box>
                      )}
                      {example.input !== undefined && (
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            Input:
                          </Typography>{' '}
                          <Typography variant="caption" component="span" sx={{ color: 'success.main' }}>
                            {typeof example.input === 'object'
                              ? JSON.stringify(example.input)
                              : String(example.input)}
                          </Typography>
                        </Box>
                      )}
                      {example.output !== undefined && (
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            Output:
                          </Typography>{' '}
                          <Typography variant="caption" component="span" sx={{ color: 'warning.main' }}>
                            {typeof example.output === 'object'
                              ? JSON.stringify(example.output)
                              : String(example.output)}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Stack>
            </Box>
            <Divider sx={{ my: 3 }} />
          </>
        )}

        {/* Tips */}
        {help.tips && help.tips.length > 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LightbulbOutlinedIcon fontSize="small" color="warning" />
                <Typography variant="subtitle2" color="warning.main">
                  Tips & Best Practices
                </Typography>
              </Box>
              <List dense disablePadding>
                {help.tips.map((tip, index) => (
                  <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" color="text.secondary">
                          • {tip}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          </>
        )}

        {/* Related Nodes */}
        {help.relatedNodes && help.relatedNodes.length > 0 && (
          <>
            <Divider sx={{ my: 3 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LinkIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" color="text.secondary">
                  Related Nodes
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {help.relatedNodes.map((nodeType) => (
                  <Chip
                    key={nodeType}
                    label={nodeType}
                    size="small"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                  />
                ))}
              </Box>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NodeHelpModal;
