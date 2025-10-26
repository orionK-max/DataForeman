import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';

const S7SavedConnectionsList = ({ connections, statuses, onStart, onStop, onDelete, onEdit }) => {
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

  if (!connections || connections.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Saved S7 Connections
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No S7 connections configured yet. Create one using the form above.
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
          Saved S7 Connections
        </Typography>
        
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Host</TableCell>
                <TableCell>Rack/Slot</TableCell>
                <TableCell>Port</TableCell>
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
                      <Typography variant="body2">{conn.host}</Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        Rack: {conn.rack ?? 0} / Slot: {conn.slot ?? 1}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">{conn.port || 102}</Typography>
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
                              onClick={() => onStart(conn)}
                            >
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Stop Connection">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => onStop(conn)}
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
                              onClick={() => onDelete(conn)}
                              disabled={status.tags > 0}
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

export default S7SavedConnectionsList;
