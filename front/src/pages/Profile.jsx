import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Grid,
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import useSetPageTitle from '../hooks/useSetPageTitle';
import { apiClient } from '../services/api';

const Profile = () => {
  useSetPageTitle('Profile', 'Manage your account settings');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage('');
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage('All fields are required');
      setMessageType('error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match');
      setMessageType('error');
      return;
    }
    
    if (newPassword.length < 8) {
      setMessage('New password must be at least 8 characters');
      setMessageType('error');
      return;
    }
    
    setLoading(true);
    
    try {
      await apiClient.post('/auth/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      
      setMessage('Password changed successfully. Other sessions have been revoked.');
      setMessageType('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const errorMessage = err.message || 'Failed to change password';
      if (errorMessage.includes('invalid_current_password')) {
        setMessage('Current password is incorrect');
      } else {
        setMessage(errorMessage);
      }
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Change Password
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Update your password to keep your account secure
        </Typography>

        {message && (
          <Alert severity={messageType} sx={{ mb: 2 }}>
            {message}
          </Alert>
        )}

        <form onSubmit={handleChangePassword}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="password"
                label="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                type="password"
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                required
                helperText="Must be at least 8 characters"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                type="password"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                startIcon={<VpnKeyIcon />}
                disabled={loading}
              >
                {loading ? 'Changing Password...' : 'Change Password'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
};

export default Profile;
