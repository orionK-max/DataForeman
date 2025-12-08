import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Box,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import AccountCircle from '@mui/icons-material/AccountCircle';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PeopleIcon from '@mui/icons-material/People';
import ExtensionIcon from '@mui/icons-material/Extension';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../contexts/PageTitleContext';
import { usePermissions } from '../contexts/PermissionsContext';

const drawerWidth = 240;

const TopBar = () => {
  const { mode, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { pageTitle, pageSubtitle } = usePageTitle();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNavigateUsers = () => {
    navigate('/admin/users');
    handleClose();
  };

  const handleNavigateLibraries = () => {
    navigate('/admin/libraries');
    handleClose();
  };

  const handleNavigateProfile = () => {
    navigate('/profile');
    handleClose();
  };

  const handleToggleTheme = () => {
    toggleTheme();
  };

  const handleLogout = () => {
    logout();
    handleClose();
  };

  return (
    <AppBar
      position="fixed"
      sx={{
        width: `calc(100% - ${drawerWidth}px)`,
        ml: `${drawerWidth}px`,
      }}
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" noWrap component="div">
            {pageTitle}
          </Typography>
          {pageSubtitle && (
            <Typography variant="caption" color="text.secondary">
              {pageSubtitle}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Notifications */}
          <IconButton color="inherit">
            <NotificationsIcon />
          </IconButton>

          {/* User Menu */}
          <IconButton
            size="large"
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={handleMenu}
            color="inherit"
          >
            <AccountCircle />
          </IconButton>
          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem onClick={handleNavigateProfile}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Profile</ListItemText>
            </MenuItem>
            {can('users', 'update') && (
              <>
                <MenuItem onClick={handleNavigateUsers}>
                  <ListItemIcon>
                    <PeopleIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Users</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleNavigateLibraries}>
                  <ListItemIcon>
                    <ExtensionIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Libraries</ListItemText>
                </MenuItem>
              </>
            )}
            <Divider />
            <MenuItem onClick={handleToggleTheme}>
              <ListItemIcon>
                {mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{mode === 'dark' ? 'Light Mode' : 'Dark Mode'}</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
