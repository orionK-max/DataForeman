import React, { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardActions,
  CardContent,
  Chip,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Settings as SettingsIcon,
  ViewModule as CardViewIcon,
  TableRows as TableViewIcon,
} from '@mui/icons-material';

const DRIVER_LABELS = {
  opcua: 'OPC UA',
  s7: 'Siemens S7',
  eip: 'EtherNet/IP',
  mqtt: 'MQTT',
};

function getConnectionStatusMap(statuses = []) {
  const map = new Map();
  for (const s of statuses) {
    if (!s?.id) continue;
    map.set(s.id, s);
  }
  return map;
}

function getStatusColor(state) {
  const stateColors = {
    connected: 'success',
    connecting: 'info',
    error: 'error',
    disconnected: 'default',
    unknown: 'default',
  };
  return stateColors[state] || 'default';
}

function getDriverFieldLabel(driver) {
  switch (driver) {
    case 'opcua':
      return 'Endpoint';
    case 's7':
    case 'eip':
    case 'mqtt':
      return 'Host';
    default:
      return 'Details';
  }
}

function renderDriverField(driver, conn) {
  switch (driver) {
    case 'opcua':
      return (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
          {conn.endpoint || '—'}
        </Typography>
      );
    case 's7':
      return <Typography variant="body2">{conn.host || '—'}</Typography>;
    case 'eip':
      return <Typography variant="body2">{conn.host || '—'}</Typography>;
    case 'mqtt':
      return <Typography variant="body2">{conn.host || conn.broker_url || '—'}</Typography>;
    default:
      return <Typography variant="body2">—</Typography>;
  }
}

function renderDriverSecondary(driver, conn) {
  switch (driver) {
    case 'opcua':
      return (
        <Typography variant="body2">
          {conn.driver_opts?.security_strategy || 'None'}
        </Typography>
      );
    case 's7':
      return (
        <Typography variant="body2">
          Rack: {conn.rack ?? 0} / Slot: {conn.slot ?? 1} / Port: {conn.port || 102}
        </Typography>
      );
    case 'eip':
      return <Typography variant="body2">Slot: {conn.slot ?? 0}</Typography>;
    case 'mqtt':
      return (
        <Typography variant="body2">
          Client: {conn.client_id || '—'}
        </Typography>
      );
    default:
      return null;
  }
}

/**
 * ConnectionBrowser
 * 
 * A connection-aware browser that matches the "browser" UX style used elsewhere,
 * but with connectivity-specific actions (start/stop) and status fields.
 */
export default function ConnectionBrowser({
  driver,
  connections = [],
  statuses = [],
  onStart,
  onStop,
  onDelete,
  onEdit,
}) {
  const [displayMode, setDisplayMode] = useState('table'); // 'table' | 'card'

  const statusMap = useMemo(() => getConnectionStatusMap(statuses), [statuses]);

  const label = DRIVER_LABELS[driver] || 'Connections';

  const getStatus = (connId) => {
    const status = statusMap.get(connId);
    if (!status) {
      return { state: 'unknown', color: 'default', reason: undefined, tags: 0 };
    }
    return {
      state: status.state || 'unknown',
      color: getStatusColor(status.state || 'unknown'),
      reason: status.reason,
      tags: status.tag_count || 0,
    };
  };

  if (!connections || connections.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon />
            Saved {label} Connections
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No {label} connections configured yet.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0 }}>
            <SettingsIcon />
            Saved {label} Connections
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Card view">
              <IconButton
                size="small"
                onClick={() => setDisplayMode('card')}
                color={displayMode === 'card' ? 'primary' : 'default'}
              >
                <CardViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Table view">
              <IconButton
                size="small"
                onClick={() => setDisplayMode('table')}
                color={displayMode === 'table' ? 'primary' : 'default'}
              >
                <TableViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {displayMode === 'table' ? (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>{getDriverFieldLabel(driver)}</TableCell>
                  <TableCell>Details</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {connections.map((conn) => {
                  const status = getStatus(conn.id);
                  const isRunning = status.state === 'connected' || status.state === 'connecting';
                  const deleteDisabled = status.tags > 0;

                  return (
                    <TableRow key={conn.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {conn.name || conn.id}
                        </Typography>
                      </TableCell>

                      <TableCell>{renderDriverField(driver, conn)}</TableCell>

                      <TableCell>{renderDriverSecondary(driver, conn)}</TableCell>

                      <TableCell>
                        <Tooltip title={status.reason || status.state}>
                          <Chip label={status.state} color={status.color} size="small" />
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">{status.tags}</Typography>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {onStart && onStop && (!isRunning ? (
                            <Tooltip title="Start Connection">
                              <IconButton size="small" color="success" onClick={() => onStart(conn)}>
                                <StartIcon />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Stop Connection">
                              <IconButton size="small" color="warning" onClick={() => onStop(conn)}>
                                <StopIcon />
                              </IconButton>
                            </Tooltip>
                          ))}

                          {onEdit && (
                            <Tooltip title="Edit Connection">
                              <IconButton size="small" color="primary" onClick={() => onEdit(conn)}>
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                          )}

                          {onDelete && (
                            <Tooltip title={deleteDisabled ? 'Cannot delete connection with saved tags' : 'Delete Connection'}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => onDelete(conn)}
                                  disabled={deleteDisabled}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {connections.map((conn) => {
              const status = getStatus(conn.id);
              const isRunning = status.state === 'connected' || status.state === 'connecting';
              const deleteDisabled = status.tags > 0;

              return (
                <Grid item xs={12} sm={6} md={4} key={conn.id}>
                  <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="h6" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conn.name || conn.id}
                        </Typography>
                        <Tooltip title={status.reason || status.state}>
                          <Chip label={status.state} color={status.color} size="small" />
                        </Tooltip>
                      </Box>

                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {getDriverFieldLabel(driver)}
                        </Typography>
                        {renderDriverField(driver, conn)}
                      </Box>

                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Details
                        </Typography>
                        {renderDriverSecondary(driver, conn) || (
                          <Typography variant="body2">—</Typography>
                        )}
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Tags: {status.tags}
                      </Typography>
                    </CardContent>

                    <CardActions sx={{ justifyContent: 'flex-end' }}>
                      {onStart && onStop && (!isRunning ? (
                        <Tooltip title="Start Connection">
                          <IconButton size="small" color="success" onClick={() => onStart(conn)}>
                            <StartIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Stop Connection">
                          <IconButton size="small" color="warning" onClick={() => onStop(conn)}>
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ))}

                      {onEdit && (
                        <Tooltip title="Edit Connection">
                          <IconButton size="small" color="primary" onClick={() => onEdit(conn)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}

                      {onDelete && (
                        <Tooltip title={deleteDisabled ? 'Cannot delete connection with saved tags' : 'Delete Connection'}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => onDelete(conn)}
                              disabled={deleteDisabled}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
