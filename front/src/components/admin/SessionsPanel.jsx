import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  Box,
  IconButton,
  Collapse,
  FormControlLabel,
  Checkbox,
  Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { formatDistanceToNow } from 'date-fns';

/**
 * Sessions management panel
 */
export default function SessionsPanel({ 
  sessions, 
  onRevokeSession, 
  onRevokeAll 
}) {
  const [hideRevoked, setHideRevoked] = useState(false);
  const [expandedJti, setExpandedJti] = useState(new Set());

  const toggleJti = (sessionId) => {
    setExpandedJti(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add toast notification here
      alert('Copied to clipboard');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getSessionStatus = (session) => {
    if (session.revoked_at) return 'revoked';
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) return 'expired';
    return 'active';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'expired': return 'warning';
      case 'revoked': return 'error';
      default: return 'default';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatRelative = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  const filteredSessions = hideRevoked
    ? sessions.filter(s => {
        const status = getSessionStatus(s);
        return status === 'active';
      })
    : sessions;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Sessions
          </Typography>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={onRevokeAll}
            size="small"
          >
            Revoke All
          </Button>
        </Box>

        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={hideRevoked}
                onChange={(e) => setHideRevoked(e.target.checked)}
                size="small"
              />
            }
            label="Hide revoked and expired"
          />
        </Box>

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell><strong>Created</strong></TableCell>
                <TableCell><strong>Expires</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>User Agent</strong></TableCell>
                <TableCell><strong>IP</strong></TableCell>
                <TableCell><strong>JTI</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      <em>No sessions to display</em>
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              
              {filteredSessions.map((session) => {
                const status = getSessionStatus(session);
                const isExpanded = expandedJti.has(session.id);
                
                return (
                  <TableRow key={session.id} hover>
                    <TableCell>
                      <Tooltip title={formatDate(session.created_at)}>
                        <span>{formatRelative(session.created_at)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={formatDate(session.expires_at)}>
                        <span>{formatRelative(session.expires_at)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={status}
                        size="small"
                        color={getStatusColor(status)}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Tooltip title={session.user_agent || 'Unknown'}>
                        <span>{session.user_agent || '—'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{session.ip || '—'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => toggleJti(session.id)}
                        >
                          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                        <Collapse in={isExpanded} orientation="horizontal">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.7rem',
                                maxWidth: 150,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {session.jti}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => copyToClipboard(session.jti)}
                            >
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Collapse>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      {status === 'active' && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => onRevokeSession(session.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
