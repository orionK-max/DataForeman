import React from 'react';
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
  IconButton,
  Tooltip,
  Box,
  FormControlLabel,
  Switch,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import StatusChip from './StatusChip';
import ProtocolBadge from './ProtocolBadge';

/**
 * ConnectionStatusTable - Display live connection statuses with actions
 * @param {Object} props
 * @param {Array} props.connections - Saved connections
 * @param {Array} props.statuses - Live connection statuses
 * @param {boolean} props.autoRefresh - Auto-refresh enabled
 * @param {Function} props.onToggleAutoRefresh - Toggle auto-refresh
 * @param {Function} props.onRefresh - Manual refresh
 * @param {Function} props.onStart - Start connection
 * @param {Function} props.onStop - Stop connection
 * @param {Function} props.onDelete - Delete connection
 * @param {Function} props.onEdit - Edit connection
 */
const ConnectionStatusTable = ({
  connections = [],
  statuses = [],
  autoRefresh = true,
  onToggleAutoRefresh,
  onRefresh,
  onStart,
  onStop,
  onDelete,
  onEdit,
}) => {
  // Create a map of status by connection ID
  const statusMap = statuses.reduce((acc, status) => {
    acc[status.id] = status;
    return acc;
  }, {});

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Connection Status
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No connections configured. Create a new connection to get started.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Connection Status
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => onToggleAutoRefresh?.(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="caption">Auto-refresh</Typography>}
            />
            <Tooltip title="Refresh now">
              <IconButton onClick={onRefresh} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Protocol</TableCell>
                <TableCell>Endpoint/Host</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Enabled</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.map((conn) => {
                const status = statusMap[conn.id];
                const isRunning = conn.enabled !== false;

                return (
                  <TableRow key={conn.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {conn.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <ProtocolBadge type={conn.type} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {conn.endpoint || conn.host || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {status ? (
                        <StatusChip state={status.state} reason={status.reason} />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={isRunning ? 'success.main' : 'text.secondary'}>
                        {isRunning ? 'Yes' : 'No'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        {isRunning ? (
                          <Tooltip title="Stop connection">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => onStop?.(conn)}
                            >
                              <StopIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Start connection">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => onStart?.(conn)}
                            >
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete connection">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onDelete?.(conn)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
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

export default ConnectionStatusTable;
