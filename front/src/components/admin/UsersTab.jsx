import React, { useState, useEffect } from 'react';
import { Grid, Box, Typography } from '@mui/material';
import UserList from './UserList';
import UserDetails from './UserDetails';
import UserPermissions from './UserPermissions';
import SessionsPanel from './SessionsPanel';
import ConfirmDialog from '../common/ConfirmDialog';
import adminService from '../../services/adminService';

/**
 * Users management tab - combines user list, details, and sessions
 */
export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    onConfirm: null,
    loading: false
  });

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await adminService.getUsers();
      // Filter out system user from display
      const filteredUsers = (data.users || []).filter(u => u.email !== 'system@dataforeman.local');
      setUsers(filteredUsers);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUserCreated = async (email) => {
    await adminService.createUser(email);
    await loadUsers();
  };

  const handleSelectUser = async (user) => {
    setSelectedUser(user);
    
    try {
      // Load user sessions
      const sessionsData = await adminService.getUserSessions(user.id);
      setSessions(sessionsData.sessions || []);
    } catch (err) {
      console.error('Failed to load user details:', err);
    }
  };

  const handlePasswordUpdate = async (userId, password) => {
    await adminService.updateUserPassword(userId, password);
    // Refresh sessions as they are revoked on password change
    const sessionsData = await adminService.getUserSessions(userId);
    setSessions(sessionsData.sessions || []);
  };

  const handleRevokeSession = (sessionId) => {
    setConfirmDialog({
      open: true,
      title: 'Revoke Session',
      message: 'Are you sure you want to revoke this session? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, loading: true }));
        try {
          await adminService.revokeSession(selectedUser.id, sessionId);
          // Refresh sessions
          const sessionsData = await adminService.getUserSessions(selectedUser.id);
          setSessions(sessionsData.sessions || []);
        } finally {
          setConfirmDialog({
            open: false,
            title: '',
            message: '',
            onConfirm: null,
            loading: false
          });
        }
      },
      loading: false
    });
  };

  const handleRevokeAll = () => {
    setConfirmDialog({
      open: true,
      title: 'Revoke All Sessions',
      message: 'Are you sure you want to revoke ALL sessions for this user? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, loading: true }));
        try {
          await adminService.revokeAllSessions(selectedUser.id);
          // Refresh sessions
          const sessionsData = await adminService.getUserSessions(selectedUser.id);
          setSessions(sessionsData.sessions || []);
        } finally {
          setConfirmDialog({
            open: false,
            title: '',
            message: '',
            onConfirm: null,
            loading: false
          });
        }
      },
      loading: false
    });
  };

  const closeConfirmDialog = () => {
    if (!confirmDialog.loading) {
      setConfirmDialog({
        open: false,
        title: '',
        message: '',
        onConfirm: null,
        loading: false
      });
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading users...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Left: User List */}
        <Grid item xs={12} md={4}>
          <UserList
            users={users}
            selectedUser={selectedUser}
            onSelectUser={handleSelectUser}
            onUserCreated={handleUserCreated}
          />
        </Grid>

        {/* Right: User Details, Permissions, and Sessions */}
        <Grid item xs={12} md={8}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <UserDetails
                user={selectedUser}
                onPasswordUpdate={handlePasswordUpdate}
              />
            </Grid>
            
            {selectedUser && (
              <>
                <Grid item xs={12}>
                  <UserPermissions user={selectedUser} />
                </Grid>
                
                <Grid item xs={12}>
                  <SessionsPanel
                    sessions={sessions}
                    onRevokeSession={handleRevokeSession}
                    onRevokeAll={handleRevokeAll}
                  />
                </Grid>
              </>
            )}
          </Grid>
        </Grid>
      </Grid>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
        loading={confirmDialog.loading}
      />
    </Box>
  );
}
