import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Chip,
  Box,
  Button,
} from '@mui/material';
import {
  Timeline as ChartIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  DriveFileMove as MoveIcon,
  PlayArrow as RunIcon,
  CheckCircle as DeployedIcon,
  Cancel as UndeployedIcon,
  Monitor as ResourceIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';

/**
 * Generic Browser Card Component
 * 
 * Renders a card for Flow, Chart, or Dashboard with type-specific features:
 * - Flows: Deploy status badges, Execute button, Resource Monitor
 * - Charts: Chart icon, updated timestamp
 * - Dashboards: Widget count
 * 
 * All types support: Move, Duplicate, Delete actions
 */
const BrowserCard = ({
  item,
  type, // 'flow' | 'chart' | 'dashboard'
  isOwner,
  viewMode,
  onNavigate,
  onMove,
  onDuplicate,
  onDelete,
  onExecute, // For flows with execution_mode='manual'
  onResourceMonitor, // For deployed flows
}) => {
  const handleCardClick = () => {
    onNavigate(item);
  };

  const stopPropagation = (e) => {
    e.stopPropagation();
  };

  // Format date for display
  const formatDate = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case 'chart':
        return <ChartIcon sx={{ mr: 1, color: 'primary.main' }} />;
      case 'dashboard':
        return <DashboardIcon sx={{ mr: 1, color: 'primary.main' }} />;
      default:
        return null;
    }
  };

  // Render type-specific badges
  const renderBadges = () => {
    if (type === 'flow') {
      // Flow badges: Manual/Deployed/Not Deployed
      if (item.execution_mode === 'manual') {
        return (
          <Chip 
            icon={<RunIcon />} 
            label="Manual" 
            size="small" 
            color="info"
            title="On-demand execution"
          />
        );
      } else {
        return item.deployed ? (
          <Chip icon={<DeployedIcon />} label="Deployed" size="small" color="primary" />
        ) : (
          <Chip icon={<UndeployedIcon />} label="Not Deployed" size="small" />
        );
      }
    } else if (item.is_shared) {
      // Charts and Dashboards: Shared badge
      return <Chip label="Shared" size="small" color="info" />;
    }
    return null;
  };

  // Render type-specific metadata
  const renderMetadata = () => {
    if (type === 'dashboard') {
      return (
        <Typography variant="caption" color="text.secondary">
          {item.layout?.items?.length || 0} widgets
        </Typography>
      );
    } else if (type === 'chart') {
      return (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Updated: {formatDate(item.updated_at)}
        </Typography>
      );
    }
    return null;
  };

  // Render type-specific action buttons
  const renderSpecialActions = () => {
    if (type === 'flow') {
      return (
        <>
          {/* Execute button for manual flows */}
          {item.execution_mode === 'manual' && onExecute && (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<RunIcon />}
              onClick={(e) => {
                stopPropagation(e);
                onExecute(item);
              }}
            >
              Execute
            </Button>
          )}
          
          {/* Resource Monitor for deployed continuous flows */}
          {item.deployed && item.execution_mode === 'continuous' && onResourceMonitor && (
            <IconButton 
              size="small" 
              onClick={(e) => {
                stopPropagation(e);
                onResourceMonitor(item);
              }}
              title="View Resource Monitor"
            >
              <ResourceIcon fontSize="small" />
            </IconButton>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <Card 
      sx={{ 
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': { 
          boxShadow: 4,
          transform: 'translateY(-2px)',
          transition: 'all 0.2s'
        }
      }}
    >
      <CardContent 
        onClick={handleCardClick}
        sx={{ flexGrow: 1, pb: 1 }}
      >
        {/* Header: Icon + Title + Badges */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 0.5 }}>
          {getIcon()}
          <Typography 
            variant="h6" 
            sx={{ 
              flexGrow: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mr: 1
            }}
          >
            {item.name}
          </Typography>
          {renderBadges()}
        </Box>
        
        {/* Description */}
        <Typography 
          variant="body2" 
          color="text.secondary" 
          gutterBottom
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: '2.5em',
          }}
          title={item.description || 'No description'}
        >
          {item.description || 'No description'}
        </Typography>
        
        {/* Metadata (widget count, updated date, etc.) */}
        {renderMetadata()}
        
        {/* Shared indicator for flows (shown at bottom for flows) */}
        {type === 'flow' && item.shared && !isOwner && (
          <Chip label="Shared" size="small" sx={{ mt: 1 }} />
        )}

        {/* Read Only badge for dashboards in shared view */}
        {type === 'dashboard' && viewMode === 'shared' && !isOwner && (
          <Chip label="Read Only" size="small" variant="outlined" sx={{ mt: 1 }} />
        )}
      </CardContent>
      
      {/* Actions */}
      <CardActions sx={{ pt: 0, justifyContent: 'flex-end', px: 2, pb: 2 }}>
        {/* Type-specific actions (Execute, Resource Monitor) */}
        {renderSpecialActions()}
        
        {/* Move to folder */}
        {isOwner && viewMode !== 'shared' && onMove && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              stopPropagation(e);
              onMove(e, item);
            }}
            title="Move to folder"
          >
            <MoveIcon fontSize="small" />
          </IconButton>
        )}
        
        {/* Duplicate */}
        {isOwner && onDuplicate && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              stopPropagation(e);
              onDuplicate(item);
            }}
            title="Duplicate"
          >
            <DuplicateIcon fontSize="small" />
          </IconButton>
        )}
        
        {/* Delete */}
        {isOwner && onDelete && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              stopPropagation(e);
              onDelete(item);
            }}
            title="Delete"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </CardActions>
    </Card>
  );
};

export default BrowserCard;
