import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SettingsIcon from '@mui/icons-material/Settings';

/**
 * SavedConnectionsList - Display list of saved connections with actions
 * @param {Object} props
 * @param {Array} props.connections - Array of saved connections
 * @param {Array} props.statuses - Array of live statuses
 * @param {Function} props.onStart - Start connection callback
 * @param {Function} props.onStop - Stop connection callback
 * @param {Function} props.onDelete - Delete connection callback
 * @param {Function} props.onEdit - Edit connection callback
 */
const SavedConnectionsList = ({
  connections = [],
  statuses = [],
  onStart,
  onStop,
  onDelete,
  onEdit,
}) => {
  const getStatus = (connId) => {
    const status = statuses.find((s) => s.id === connId);
    if (!status) return { state: 'unknown', color: 'default' };

    const stateColors = {
      connected: 'success',
      connecting: 'info',
      error: 'error',
      disconnected: 'default',
    };

    return {
      state: status.state || 'unknown',
      color: stateColors[status.state] || 'default',
      reason: status.reason,
      tags: status.tag_count || 0,
    };
  };

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Saved OPC UA Connections
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No OPC UA connections configured yet. Create one using the form above.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          Saved OPC UA Connections
        </Typography>
        
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Endpoint</TableCell>
                <TableCell>Security</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.map((conn) => {
                const status = getStatus(conn.id);
                const isRunning = status.state === 'connected' || status.state === 'connecting';

                return (
                  <TableRow key={conn.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {conn.name || conn.id}
                      </Typography>
                    </TableCell>
                    
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {conn.endpoint}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {conn.driver_opts?.security_strategy || 'None'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Tooltip title={status.reason || status.state}>
                        <Chip
                          label={status.state}
                          color={status.color}
                          size="small"
                        />
                      </Tooltip>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">{status.tags}</Typography>
                    </TableCell>

                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {!isRunning ? (
                          <Tooltip title="Start Connection">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => onStart?.(conn)}
                            >
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Stop Connection">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => onStop?.(conn)}
                            >
                              <StopIcon />
                            </IconButton>
                          </Tooltip>
                        )}

                        <Tooltip title="Edit Connection">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => onEdit?.(conn)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title={status.tags > 0 ? "Cannot delete connection with saved tags" : "Delete Connection"}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => onDelete?.(conn)}
                              disabled={status.tag_count > 0}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
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
};

export default SavedConnectionsList;
