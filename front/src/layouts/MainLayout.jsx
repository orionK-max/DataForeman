import React, { useState, useEffect, useRef } from 'react';
import { Box, Toolbar } from '@mui/material';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ServiceStatusBanner from '../components/ServiceStatusBanner';
import diagnosticService from '../services/diagnosticService';

const drawerWidth = 240;

const MainLayout = ({ children }) => {
  const [summary, setSummary] = useState(null);
  const failureCounts = useRef({});

  useEffect(() => {
    // Require 2 consecutive "down" readings before showing a service as
    // unavailable, but clear immediately on the first "up" reading. This
    // smooths over a single slow/transient health-check poll (e.g. broker
    // briefly busy) so the status banners don't flap on/off every 15s.
    const applyHysteresis = (key, ok) => {
      if (ok !== false) {
        failureCounts.current[key] = 0;
        return ok;
      }
      const count = (failureCounts.current[key] || 0) + 1;
      failureCounts.current[key] = count;
      return count >= 2 ? false : true;
    };

    const fetchSummary = async () => {
      try {
        const data = await diagnosticService.getSummary();
        setSummary((prev) => ({
          ...data,
          broker: { ...data.broker, ok: applyHysteresis('broker', data.broker?.ok) },
          connectivity: { ...data.connectivity, ok: applyHysteresis('connectivity', data.connectivity?.ok) },
        }));
      } catch (err) {
        // Silently fail - user might not have diagnostic permissions
        // or might not be on a page that requires this
      }
    };

    fetchSummary();
    const interval = setInterval(fetchSummary, 15000); // Poll every 15 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ display: 'flex' }}>
      <TopBar />
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          p: 3,
          width: `calc(100% - ${drawerWidth}px)`,
          minHeight: '100vh',
        }}
      >
        <Toolbar /> {/* This creates space below the AppBar */}
        <ServiceStatusBanner summary={summary} />
        {children}
      </Box>
    </Box>
  );
};

export default MainLayout;
