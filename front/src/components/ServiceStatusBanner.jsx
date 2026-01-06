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
  const hasConnections = summary.connectivity?.hasConnections ?? true;

  if (!connectivityDown) return null;
  if (dismissed) return null;

  // Change severity and message if no connections are configured
  const severity = !hasConnections ? 'warning' : 'error';
  const title = !hasConnections ? 'No Connections Configured' : 'Connectivity Service Stopped';
  const message = !hasConnections 
    ? 'Add a device connection to start collecting telemetry data.'
    : 'Device communication is unavailable. Restart the connectivity service to restore device connections.';

  return (
    <Collapse in={!dismissed}>
      <Alert
        severity={severity}
        icon={<WarningIcon />}
        sx={{ 
          borderRadius: 0,
          '& .MuiAlert-message': { width: '100%' }
        }}
        action={
          <>
            {hasConnections && can('diagnostic.system', 'update') ? (
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
            ) : hasConnections ? (
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
            ) : null}
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
          {title}
        </AlertTitle>
        <Typography variant="body2">
          {message}
        </Typography>
      </Alert>
    </Collapse>
  );
};

export default ServiceStatusBanner;
