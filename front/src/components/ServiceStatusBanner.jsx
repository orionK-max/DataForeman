import React, { useState } from 'react';
import { Alert, AlertTitle, Button, Collapse, IconButton, Stack, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import diagnosticService from '../services/diagnosticService';
import { usePermissions } from '../contexts/PermissionsContext';

const ServiceStatusBanner = ({ summary }) => {
  const { can } = usePermissions();
  const [dismissed, setDismissed] = useState({});
  const [restartingService, setRestartingService] = useState(null);

  const handleRestartService = async (serviceName) => {
    setRestartingService(serviceName);
    try {
      await diagnosticService.restartService(serviceName);
    } catch (err) {
      console.error(`Failed to restart ${serviceName}:`, err);
    } finally {
      setRestartingService(null);
      setTimeout(() => setDismissed(prev => ({ ...prev, [serviceName]: false })), 2000);
    }
  };

  if (!summary) return null;

  const banners = [];

  // MQTT broker down
  if (summary.broker?.ok === false && !dismissed['broker']) {
    banners.push({
      key: 'broker',
      severity: 'error',
      title: 'MQTT Broker Unavailable',
      message: 'The MQTT broker is not responding. All MQTT device connections are broken and no data is being collected. Restart the broker to restore service.',
      service: 'broker',
    });
  }

  // Connectivity service down (only when connections are configured)
  if (summary.connectivity?.ok === false && summary.connectivity?.hasConnections && !dismissed['connectivity']) {
    banners.push({
      key: 'connectivity',
      severity: 'error',
      title: 'Connectivity Service Stopped',
      message: 'Device communication is unavailable. Restart the connectivity service to restore device connections.',
      service: 'connectivity',
    });
  }

  if (banners.length === 0) return null;

  return (
    <Stack spacing={0}>
      {banners.map(({ key, severity, title, message, service }) => (
        <Collapse key={key} in={!dismissed[key]}>
          <Alert
            severity={severity}
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
                    onClick={() => handleRestartService(service)}
                    disabled={restartingService === service}
                    sx={{ mr: 1 }}
                  >
                    {restartingService === service ? 'Restarting...' : 'Restart'}
                  </Button>
                ) : (
                  <Tooltip title="Requires 'System Diagnostics' UPDATE permission">
                    <span>
                      <Button color="inherit" size="small" startIcon={<RestartAltIcon />} disabled sx={{ mr: 1 }}>
                        Restart
                      </Button>
                    </span>
                  </Tooltip>
                )}
                <IconButton
                  aria-label="close"
                  color="inherit"
                  size="small"
                  onClick={() => setDismissed(prev => ({ ...prev, [key]: true }))}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              </>
            }
          >
            <AlertTitle sx={{ fontWeight: 600 }}>{title}</AlertTitle>
            <Typography variant="body2">{message}</Typography>
          </Alert>
        </Collapse>
      ))}
    </Stack>
  );
};

export default ServiceStatusBanner;
