import React, { useEffect, useState } from 'react';
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
  Box,
  Alert,
  Chip,
  Grid,
  Tabs,
  Tab
} from '@mui/material';
import { apiClient } from '../../services/api';

/**
 * EIP shard monitoring panel
 * Shows real-time shard metrics per connection and group
 */
export function EipShardPanel() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [pollInterval, setPollInterval] = useState(5000);
  const [selectedConnection, setSelectedConnection] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = null;

    const loadMetrics = async () => {
      try {
        const sysMetrics = await apiClient.get('/diag/system-metrics');
        if (alive && sysMetrics?.poll_interval_ms) {
          const newInterval = Math.max(2000, sysMetrics.poll_interval_ms);
          setPollInterval(newInterval);
        }
      } catch (err) {
        // Use default interval if metrics unavailable
      }
    };

    const poll = async () => {
      try {
        const data = await apiClient.get('/connectivity/status');
        if (!alive) return;

        // Extract items array and map to extract polling stats
        const raw = Array.isArray(data?.items) ? data.items : [];
        const filtered = raw
          .map(s => ({ 
            id: s.id, 
            type: s.type,
            host: s.host,
            port: s.port,
            state: s.state, 
            polling: s.stats?.polling || null
          }))
          .filter(s => s.polling && s.polling.__driver === 'eip-multirate');
        
        setItems(filtered);
        setError('');
      } catch (err) {
        if (alive) {
          setError('Failed to load EIP shard data');
          console.error('EIP shard poll error:', err);
        }
      }

      if (alive) {
        timer = setTimeout(poll, pollInterval);
      }
    };

    loadMetrics();
    poll();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [pollInterval]);

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No active EIP connections found
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const currentConnection = items[selectedConnection];
  const polling = currentConnection?.polling || {};
  const totals = polling.__totals || {};
  const tuning = polling.__tuning || {};
  const groups = Object.fromEntries(
    Object.entries(polling).filter(([k]) => !k.startsWith('__'))
  );

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        EIP Shard Monitoring
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Real-time shard metrics (auto-refreshes every {Math.round(pollInterval / 1000)}s)
      </Typography>

      {/* Connection Tabs */}
      {items.length > 1 && (
        <Tabs
          value={selectedConnection}
          onChange={(e, newValue) => setSelectedConnection(newValue)}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {items.map((conn, idx) => (
            <Tab
              key={conn.id}
              label={`Connection ${conn.id}`}
              value={idx}
            />
          ))}
        </Tabs>
      )}

      {/* Connection Overview */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Connection Details
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2">
                  <strong>ID:</strong> {currentConnection?.id}
                </Typography>
                <Typography variant="body2">
                  <strong>Type:</strong> {currentConnection?.type || 'EIP'}
                </Typography>
                <Typography variant="body2">
                  <strong>Host:</strong> {currentConnection?.host}:{currentConnection?.port || 44818}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" component="span">
                    <strong>State:</strong>
                  </Typography>
                  <Chip
                    label={currentConnection?.state || 'unknown'}
                    size="small"
                    color={currentConnection?.state === 'connected' ? 'success' : 'default'}
                  />
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Shard Statistics
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2">
                  <strong>Total Shards:</strong> {totals.total_shards ?? '—'}
                </Typography>
                <Typography variant="body2">
                  <strong>Total Tags:</strong> {totals.total_tags ?? '—'}
                </Typography>
                <Typography variant="body2">
                  <strong>Avg Shard Size:</strong> {totals.avg_shard ?? '—'}
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Tuning Parameters
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip label={`Max: ${tuning.MAX ?? '—'}`} size="small" variant="outlined" />
                <Chip label={`Fallback: ${tuning.FALLBACK ?? '—'}`} size="small" variant="outlined" />
                <Chip label={`Bytes: ${tuning.BYTE_BUDGET ?? '—'}/${tuning.FB_BYTE_BUDGET ?? '—'}`} size="small" variant="outlined" />
                <Chip label={`Overhead: ${tuning.OVERHEAD ?? '—'}`} size="small" variant="outlined" />
                <Chip label={`Frac: ${tuning.BUDGET_FRAC ?? '—'}`} size="small" variant="outlined" />
                <Chip label={`Min Shards: ${tuning.MIN_SHARDS ?? '—'}`} size="small" variant="outlined" />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Poll Groups */}
      {Object.keys(groups).length === 0 && (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No poll groups configured
            </Typography>
          </CardContent>
        </Card>
      )}

      {Object.entries(groups).map(([groupName, group]) => {
        const shards = Array.isArray(group.shard_sizes) ? group.shard_sizes : [];
        const estBytes = Array.isArray(group.est_bytes) ? group.est_bytes : [];
        const shardCount = group.shard_count ?? shards.length;

        return (
          <Card key={groupName} sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  {groupName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip label={`${shardCount} shards`} size="small" color="primary" />
                  <Chip label={`Target: ${group.target_ms ?? '?'}ms`} size="small" variant="outlined" />
                  <Chip label={`Effective: ${group.eff_ms ?? '?'}ms`} size="small" variant="outlined" />
                </Box>
              </Box>

              {/* Shard Table */}
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Shard #</strong></TableCell>
                      <TableCell align="right"><strong>Tag Count</strong></TableCell>
                      <TableCell align="right"><strong>Est. Bytes</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shards.map((size, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{idx}</TableCell>
                        <TableCell align="right">{size}</TableCell>
                        <TableCell align="right">
                          {estBytes[idx] !== undefined ? estBytes[idx] : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {shards.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No shards
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Group Parameters */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Byte Budget:</strong> {group.byte_budget ?? '—'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Count Cap:</strong> {group.count_cap ?? '—'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
