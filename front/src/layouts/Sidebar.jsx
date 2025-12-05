import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Chip,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CableIcon from '@mui/icons-material/Cable';
import TimelineIcon from '@mui/icons-material/Timeline';
import BugReportIcon from '@mui/icons-material/BugReport';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { usePermissions } from '../contexts/PermissionsContext';
import { useTheme as useMuiTheme } from '@mui/material/styles';

const drawerWidth = 240;

const allMenuItems = [
  { text: 'Dashboards', icon: <DashboardIcon />, path: '/dashboards', feature: 'dashboards' },
  { text: 'Connectivity', icon: <CableIcon />, path: '/connectivity', feature: 'connectivity.devices' },
  { text: 'Flow Studio', icon: <AccountTreeIcon />, path: '/flows', feature: 'flows' },
  { text: 'Chart Composer', icon: <TimelineIcon />, path: '/charts', feature: 'chart_composer' },
  { text: 'Diagnostic', icon: <BugReportIcon />, path: '/diagnostic', feature: 'diagnostic.system' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermissions();
  const theme = useMuiTheme();

  // Choose logo based on theme mode
  const logoSrc = theme.palette.mode === 'dark' ? '/logo-dark.png' : '/logo-light.png';

  // Filter menu items based on permissions
  const menuItems = useMemo(() => {
    return allMenuItems.filter(item => can(item.feature, 'read'));
  }, [can]);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <ListItemText
            primary="DataForeman"
            primaryTypographyProps={{
              variant: 'h6',
              fontWeight: 'bold',
            }}
          />
          <Chip
            label="BETA"
            size="small"
            color="warning"
            sx={{
              fontWeight: 'bold',
              fontSize: '0.65rem',
              height: 18,
            }}
          />
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={
                location.pathname === item.path ||
                (item.path === '/dashboards' && location.pathname.startsWith('/dashboards')) ||
                (item.path === '/charts' && location.pathname.startsWith('/charts')) ||
                (item.path === '/flows' && location.pathname.startsWith('/flows'))
              }
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      
      {/* Logo at bottom */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <img
          src={logoSrc}
          alt="DataForeman Logo"
          style={{
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </Box>
    </Drawer>
  );
};

export default Sidebar;
