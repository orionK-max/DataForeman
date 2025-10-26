import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { setUnauthorizedHandler, setTokenRefreshedHandler } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [token, setTokenState] = useState(() => localStorage.getItem('df_token') || '');
  const [refreshToken, setRefreshTokenState] = useState(() => localStorage.getItem('df_refresh_token') || '');
  const [role, setRoleState] = useState(() => localStorage.getItem('df_role') || '');

  const isAuthenticated = useMemo(() => Boolean(token), [token]);

  const setToken = (newToken) => {
    setTokenState(newToken);
    // Immediately save to localStorage synchronously
    if (newToken) {
      localStorage.setItem('df_token', newToken);
    } else {
      localStorage.removeItem('df_token');
    }
  };

  const setRefreshToken = (newRefreshToken) => {
    setRefreshTokenState(newRefreshToken);
    // Immediately save to localStorage synchronously
    if (newRefreshToken) {
      localStorage.setItem('df_refresh_token', newRefreshToken);
    } else {
      localStorage.removeItem('df_refresh_token');
    }
  };

  const setRole = (newRole) => {
    setRoleState(newRole);
    // Immediately save to localStorage synchronously
    if (newRole) {
      localStorage.setItem('df_role', newRole);
    } else {
      localStorage.removeItem('df_role');
    }
  };

  const logout = () => {
    setTokenState('');
    setRefreshTokenState('');
    setRoleState('');
    localStorage.removeItem('df_token');
    localStorage.removeItem('df_refresh_token');
    localStorage.removeItem('df_role');
  };

  // Register handler for 401 responses
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
  }, []);

  // Register handler for token refresh
  useEffect(() => {
    setTokenRefreshedHandler((newToken, newRefreshToken) => {
      setToken(newToken);
      setRefreshToken(newRefreshToken);
    });
  }, []);

  const value = {
    token,
    refreshToken,
    role,
    isAuthenticated,
    setToken,
    setRefreshToken,
    setRole,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
