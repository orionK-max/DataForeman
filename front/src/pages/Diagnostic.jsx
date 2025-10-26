import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import OverviewTab from '../components/diagnostic/OverviewTab';
import CapacityTab from '../components/diagnostic/CapacityTab';
import JobsTab from '../components/diagnostic/JobsTab';
import PermissionGuard from '../components/PermissionGuard';
import useSetPageTitle from '../hooks/useSetPageTitle';

const Diagnostic = () => {
  useSetPageTitle('Diagnostic', 'System diagnostics and monitoring');
  
  const [currentTab, setCurrentTab] = useState('overview');

  return (
    <PermissionGuard 
      feature="diagnostic.system" 
      operation="read" 
      showFallback={true}
    >
      <Box sx={{ p: 2 }}>
        <Tabs value={currentTab} onChange={(e, newVal) => setCurrentTab(newVal)} sx={{ mb: 2 }}>
          <Tab label="Overview & Logs" value="overview" />
          <Tab label="Capacity" value="capacity" />
          <Tab label="Jobs" value="jobs" />
        </Tabs>

        {currentTab === 'overview' && <OverviewTab />}
        {currentTab === 'capacity' && <CapacityTab />}
        {currentTab === 'jobs' && <JobsTab />}
      </Box>
    </PermissionGuard>
  );
};

export default Diagnostic;
