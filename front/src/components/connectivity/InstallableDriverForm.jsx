import React, { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { loadExtensionComponent } from '../../utils/ExtensionLoader';

/**
 * InstallableDriverForm
 *
 * Generic wrapper that lazy-loads an installed connectivity driver extension's
 * connection-form component (installable-drivers framework, Phase 0 — see
 * docs/library-system.md, uiExtensions type "connectivity-driver-form").
 *
 * The loaded component receives the same props as the built-in connection forms
 * (initialConnection, onSave, onTest) plus driverType, so it can be written the
 * same way as e.g. MqttConnectionForm.jsx.
 */
export default function InstallableDriverForm({ formComponentUrl, driverType, initialConnection, onSave, onTest }) {
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setError(null);
    if (!formComponentUrl) {
      setError('This driver did not provide a connection form asset.');
      return;
    }
    loadExtensionComponent(formComponentUrl)
      .then((Comp) => { if (!cancelled) setComponent(() => Comp); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load driver form'); });
    return () => { cancelled = true; };
  }, [formComponentUrl]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!Component) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Component
      driverType={driverType}
      initialConnection={initialConnection}
      onSave={onSave}
      onTest={onTest}
    />
  );
}
