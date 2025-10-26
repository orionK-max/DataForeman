import React, { useState } from 'react';
import { Alert, AlertTitle, Button, Collapse, IconButton, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import diagnosticService from '../services/diagnosticService';
import { usePermissions } from '../contexts/PermissionsContext';

const ServiceStatusBanner = ({ summary }) => {
  const { can } = usePermissions();
  const [dismissed, setDismissed] = useState(false);
  const [restartingService, setRestartingService] = useState(null);

  const handleRestartService = async (serviceName) => {
    setRestartingService(serviceName);
    try {
      await diagnosticService.restartService(serviceName);
      // Parent component will refresh summary
    } catch (err) {
      console.error(`Failed to restart ${serviceName}:`, err);
    } finally {
      setRestartingService(null);
      // Reset dismissed state after restart attempt
      setTimeout(() => setDismissed(false), 2000);
    }
  };

  if (!summary) return null;

  // Check if connectivity service is down
  const connectivityDown = summary.connectivity?.ok === false;

  if (!connectivityDown) return null;
  if (dismissed) return null;

  return (
    <Collapse in={!dismissed}>
      <Alert
        severity="error"
        icon={<WarningIcon />}
        sx={{ 
          borderRadius: 0,
          '& .MuiAlert-message': { width: '100%' }
        }}
        action={
          <>
            {can('diagnostic.system', 'update') ? (
              <Button
                color="inherit"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={() => handleRestartService('connectivity')}
                disabled={restartingService === 'connectivity'}
                sx={{ mr: 1 }}
              >
                {restartingService === 'connectivity' ? 'Restarting...' : 'Restart'}
              </Button>
            ) : (
              <Tooltip title="Requires 'System Diagnostics' UPDATE permission">
                <span>
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<RestartAltIcon />}
                    disabled
                    sx={{ mr: 1 }}
                  >
                    Restart
                  </Button>
                </span>
              </Tooltip>
            )}
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => setDismissed(true)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </>
        }
      >
        <AlertTitle sx={{ fontWeight: 600 }}>
          Connectivity Service Stopped
        </AlertTitle>
        <Typography variant="body2">
          Device communication is unavailable. Restart the connectivity service to restore device connections.
        </Typography>
      </Alert>
    </Collapse>
  );
};

export default ServiceStatusBanner;
