import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Grid
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

/**
 * User details panel for managing password
 */
export default function UserDetails({ user, onPasswordUpdate }) {
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  // Clear password field when user changes
  useEffect(() => {
    setNewPassword('');
    setMessage('');
  }, [user]);

  const handleUpdatePassword = async () => {
    if (!user || !newPassword.trim()) return;
    
    setPasswordLoading(true);
    setMessage('');
    
    try {
      await onPasswordUpdate(user.id, newPassword);
      setNewPassword('');
      setMessage('Password updated. Existing sessions revoked.');
      setMessageType('success');
    } catch (err) {
      setMessage(err.message || 'Failed to update password');
      setMessageType('error');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            <em>Select a user to view details</em>
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {user.email}
        </Typography>

        <Grid container spacing={2}>
          {/* Password Management */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>
              Password Reset
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="password"
              label="New Password"
              placeholder="Set/reset password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <Button
              fullWidth
              variant="outlined"
              onClick={handleUpdatePassword}
              disabled={!newPassword.trim() || passwordLoading}
              startIcon={<VpnKeyIcon />}
            >
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </Button>
          </Grid>

          {/* Message Display */}
          {message && (
            <Grid item xs={12}>
              <Alert severity={messageType}>{message}</Alert>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
}
