import React, { useState } from 'react';
import {
  Card,
  CardContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Button,
  Box,
  Typography,
  Chip
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

/**
 * User list component with create functionality
 */
export default function UserList({ users, selectedUser, onSelectUser, onUserCreated }) {
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!email.trim()) return;
    
    setCreating(true);
    setError('');
    
    try {
      await onUserCreated(email);
      setEmail('');
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && email.trim()) {
      handleCreate();
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Users
        </Typography>

        {/* Create User Form */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={creating}
            error={!!error}
            helperText={error}
          />
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!email.trim() || creating}
            startIcon={<PersonAddIcon />}
          >
            Create
          </Button>
        </Box>

        {/* User List */}
        <List sx={{ 
          border: 1, 
          borderColor: 'divider', 
          borderRadius: 1,
          maxHeight: 400,
          overflow: 'auto',
          bgcolor: 'background.paper'
        }}>
          {users.length === 0 && (
            <ListItem>
              <ListItemText
                primary={<em style={{ color: 'text.secondary' }}>No users</em>}
              />
            </ListItem>
          )}
          
          {users.map((user) => (
            <ListItemButton
              key={user.id}
              selected={selectedUser?.id === user.id}
              onClick={() => onSelectUser(user)}
              sx={{
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-child': { borderBottom: 0 }
              }}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {user.email}
                    {!user.is_active && (
                      <Chip label="Inactive" size="small" color="warning" />
                    )}
                  </Box>
                }
              />
            </ListItemButton>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
