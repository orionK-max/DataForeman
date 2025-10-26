import React from 'react';
import { Box } from '@mui/material';
import UsersTab from '../components/admin/UsersTab';
import useSetPageTitle from '../hooks/useSetPageTitle';
import PermissionGuard from '../components/PermissionGuard';

const Users = () => {
  useSetPageTitle('Users', 'User management and access control');
  
  return (
    <PermissionGuard feature="users" operation="update">
      <Box sx={{ p: 3 }}>
        <UsersTab />
      </Box>
    </PermissionGuard>
  );
};

export default Users;
