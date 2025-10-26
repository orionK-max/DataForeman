import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';

const LoginPage = () => {
  const { setToken, setRefreshToken, setRole } = useAuth();
  const { loadPermissions } = usePermissions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoInfo, setDemoInfo] = useState(null);
  const [creatingDemo, setCreatingDemo] = useState(false);

  // Fetch demo mode info on mount
  useEffect(() => {
    const fetchDemoInfo = async () => {
      try {
        const response = await fetch('/api/auth/demo-info');
        if (response.ok) {
          const data = await response.json();
          setDemoInfo(data);
        }
      } catch (err) {
        // Silently fail - demo mode is optional
        console.debug('Failed to fetch demo info:', err);
      }
    };
    fetchDemoInfo();
  }, []);

  const handleCreateDemoUser = async () => {
    setError('');
    setCreatingDemo(true);

    try {
      const response = await fetch('/api/auth/demo-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEmail(data.email);
        setPassword(data.password);
      } else {
        setError('Failed to create demo user. Please try again.');
      }
    } catch (err) {
      setError('Failed to create demo user. Please try again.');
    } finally {
      setCreatingDemo(false);
    }
  };

  const handleDemoLogin = () => {
    if (demoInfo && demoInfo.email && demoInfo.password) {
      setEmail(demoInfo.email);
      setPassword(demoInfo.password);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        setToken(data.token);
        setRefreshToken(data.refresh); // Store refresh token
        setRole(data.role || 'viewer');
        
        // Load user info and permissions
        try {
          const meResponse = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${data.token}` }
          });
          const meData = await meResponse.json();
          if (meData.sub) {
            await loadPermissions(meData.sub);
          }
        } catch (err) {
          console.error('Failed to load permissions:', err);
          // Don't fail login if permissions fail to load
        }
        
        // No need to navigate - App.jsx will re-render with authenticated state
      } else {
        // Provide user-friendly error messages
        if (response.status === 401) {
          setError('Incorrect email or password. Please try again.');
        } else if (data.error) {
          setError(data.error);
        } else {
          setError('Login failed. Please try again.');
        }
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            DataForeman
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom align="center" sx={{ mb: 3 }}>
            Please log in to continue
          </Typography>

          {demoInfo?.enabled && (
            <Card sx={{ mb: 3, backgroundColor: 'info.light', color: 'info.contrastText' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <InfoIcon sx={{ mr: 1, fontSize: 20 }} />
                  <Typography variant="subtitle2" fontWeight="bold">
                    Demo Mode Available
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Try DataForeman with a temporary account. You'll be able to create dashboards and charts, but not modify connections.
                </Typography>
                <Button 
                  variant="contained" 
                  size="medium" 
                  fullWidth
                  onClick={handleCreateDemoUser}
                  disabled={creatingDemo}
                  sx={{ 
                    backgroundColor: 'white',
                    color: 'info.main',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)'
                    }
                  }}
                >
                  {creatingDemo ? <CircularProgress size={24} /> : 'Create Demo Account'}
                </Button>
                {(email || password) && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
                    Your temporary credentials are auto-filled below. Click Login to continue.
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <TextField
              label="Email"
              type="text"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              sx={{ mt: 3 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Login'}
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};

export default LoginPage;
