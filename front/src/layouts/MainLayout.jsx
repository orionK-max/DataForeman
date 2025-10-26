import React, { useState, useEffect } from 'react';
import { Box, Toolbar } from '@mui/material';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ServiceStatusBanner from '../components/ServiceStatusBanner';
import diagnosticService from '../services/diagnosticService';

const drawerWidth = 240;

const MainLayout = ({ children }) => {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const data = await diagnosticService.getSummary();
        setSummary(data);
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
