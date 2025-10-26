import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Switch,
  FormControlLabel,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import RefreshIcon from '@mui/icons-material/Refresh';
import connectivityService from '../../services/connectivityService';

const formatPollRate = (ms) => {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
};

const PollGroupFormDialog = ({
  open,
  title,
  initialValues,
  onSubmit,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [pollRate, setPollRate] = useState(1000);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setPollRate(initialValues?.poll_rate_ms ?? 1000);
      setDescription(initialValues?.description ?? '');
      setIsActive(initialValues?.is_active ?? true);
      setError('');
      setSubmitting(false);
    }
  }, [open, initialValues]);

  const handleSubmit = async () => {
    const trimmedName = (name || '').trim();
    const rateValue = Number(pollRate);

    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (!Number.isInteger(rateValue) || rateValue <= 0) {
      setError('Poll rate must be a positive integer (milliseconds).');
      return;
    }

    setSubmitting(true);
    const payload = {
      name: trimmedName,
      poll_rate_ms: rateValue,
      description: description?.trim() || null,
      is_active: isActive,
    };

    try {
      const errorMessage = await onSubmit(payload);
      if (errorMessage) {
        setError(errorMessage);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save poll group');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            disabled={submitting}
          />
          <TextField
            label="Poll Rate (ms)"
            type="number"
            value={pollRate}
            onChange={(e) => setPollRate(e.target.value)}
            fullWidth
            required
            helperText="Minimum 1 millisecond"
            inputProps={{ min: 1 }}
            disabled={submitting}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            disabled={submitting}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={submitting}
              />
            }
            label="Active"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const PollGroupDeleteDialog = ({
  open,
  pollGroup,
  pollGroups,
  onClose,
  onConfirm,
}) => {
  const [reassignTo, setReassignTo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReassignTo('');
      setError('');
      setSubmitting(false);
    }
  }, [open, pollGroup?.group_id]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const reassignTarget = reassignTo ? Number(reassignTo) : null;
      const errorMessage = await onConfirm({ reassignTarget });
      if (errorMessage) {
        setError(errorMessage);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to update poll group');
      setSubmitting(false);
    }
  };

  const options = useMemo(() => {
    if (!pollGroups?.length || !pollGroup) return [];
    return pollGroups.filter((pg) => pg.group_id !== pollGroup.group_id && pg.is_active);
  }, [pollGroups, pollGroup]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Deactivate Poll Group</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography>
            Are you sure you want to deactivate <strong>{pollGroup?.name}</strong>?
          </Typography>
          {pollGroup?.tag_count > 0 && (
            <Alert severity="warning">
              This poll group currently has {pollGroup.tag_count} subscribed tag{pollGroup.tag_count === 1 ? '' : 's'}.
              You can optionally move them to another poll group before deactivating.
            </Alert>
          )}
          {options.length > 0 ? (
            <FormControl fullWidth>
              <InputLabel id="reassign-poll-group-label">Reassign tags to</InputLabel>
              <Select
                labelId="reassign-poll-group-label"
                label="Reassign tags to"
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                disabled={submitting}
              >
                <MenuItem value="">Do not reassign</MenuItem>
                {options.map((pg) => (
                  <MenuItem key={pg.group_id} value={pg.group_id}>
                    {pg.name} ({formatPollRate(pg.poll_rate_ms)})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Alert severity="info">
              There are no other active poll groups available for reassignment.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'Deactivating…' : 'Deactivate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const PollGroupsManager = ({ onNotify }) => {
  const [pollGroups, setPollGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formState, setFormState] = useState({ open: false, mode: 'create', pollGroup: null });
  const [deleteState, setDeleteState] = useState({ open: false, pollGroup: null });
  const [refreshing, setRefreshing] = useState(false);

  const fetchPollGroups = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await connectivityService.getPollGroups({ includeInactive: true });
      const groups = (result?.poll_groups || []).map((pg) => ({
        ...pg,
        tag_count: typeof pg.tag_count === 'number' ? pg.tag_count : Number(pg.tag_count || 0),
      }));
      groups.sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        if (a.poll_rate_ms !== b.poll_rate_ms) return a.poll_rate_ms - b.poll_rate_ms;
        return a.group_id - b.group_id;
      });
      setPollGroups(groups);
    } catch (err) {
      console.error('Failed to load poll groups:', err);
      setError(err?.message || 'Failed to load poll groups');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPollGroups();
  }, [fetchPollGroups]);

  const handleCreate = async (payload) => {
    try {
      await connectivityService.createPollGroup(payload);
      await fetchPollGroups();
      onNotify?.('Poll group created', 'success');
      return null;
    } catch (err) {
      console.error('Failed to create poll group:', err);
      return err?.message || 'Failed to create poll group';
    }
  };

  const handleUpdate = async (payload) => {
    if (!formState.pollGroup) return 'No poll group selected';
    try {
      await connectivityService.editPollGroup(formState.pollGroup.group_id, payload);
      await fetchPollGroups();
      onNotify?.('Poll group updated', 'success');
      return null;
    } catch (err) {
      console.error('Failed to update poll group:', err);
      return err?.message || 'Failed to update poll group';
    }
  };

  const handleDeactivate = async ({ reassignTarget }) => {
    if (!deleteState.pollGroup) return 'No poll group selected';
    try {
      await connectivityService.deletePollGroup(deleteState.pollGroup.group_id, {
        reassignTo: reassignTarget || undefined,
      });
      await fetchPollGroups();
      onNotify?.('Poll group deactivated', 'success');
      return null;
    } catch (err) {
      console.error('Failed to deactivate poll group:', err);
      return err?.message || 'Failed to deactivate poll group';
    }
  };

  const handleReactivate = async (pollGroup) => {
    try {
      await connectivityService.editPollGroup(pollGroup.group_id, { is_active: true });
      await fetchPollGroups();
      onNotify?.(`Poll group "${pollGroup.name}" reactivated`, 'success');
    } catch (err) {
      console.error('Failed to reactivate poll group:', err);
      onNotify?.(err?.message || 'Failed to reactivate poll group', 'error');
    }
  };

  const activeCount = useMemo(() => pollGroups.filter((pg) => pg.is_active).length, [pollGroups]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h6">Poll Groups</Typography>
            <Typography variant="body2" color="text.secondary">
              Create reusable polling intervals and manage existing groups.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                setRefreshing(true);
                fetchPollGroups();
              }}
              disabled={loading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setFormState({ open: true, mode: 'create', pollGroup: null })}
            >
              Add Poll Group
            </Button>
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={32} />
          </Box>
        ) : pollGroups.length === 0 ? (
          <Alert severity="info">No poll groups found.</Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ verticalAlign: 'middle' }}>Name</TableCell>
                  <TableCell align="center" sx={{ verticalAlign: 'middle' }}>Poll Rate</TableCell>
                  <TableCell align="center" sx={{ verticalAlign: 'middle' }}>Description</TableCell>
                  <TableCell align="center" sx={{ verticalAlign: 'middle' }}>Tags</TableCell>
                  <TableCell align="center" sx={{ verticalAlign: 'middle' }}>Status</TableCell>
                  <TableCell align="center" sx={{ verticalAlign: 'middle' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pollGroups.map((pollGroup) => (
                  <TableRow key={pollGroup.group_id} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{pollGroup.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID #{pollGroup.group_id}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">{formatPollRate(pollGroup.poll_rate_ms)}</TableCell>
                    <TableCell align="center" sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {pollGroup.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">{pollGroup.tag_count}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={pollGroup.is_active ? 'Active' : 'Inactive'}
                        color={pollGroup.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edit">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => setFormState({ open: true, mode: 'edit', pollGroup })}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {pollGroup.is_active ? (
                        <Tooltip title="Deactivate">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteState({ open: true, pollGroup })}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Reactivate">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleReactivate(pollGroup)}
                              color="primary"
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Box sx={{ mt: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Active poll groups: {activeCount} • Total poll groups: {pollGroups.length}
          </Typography>
        </Box>
      </CardContent>

      <PollGroupFormDialog
        open={formState.open}
        title={formState.mode === 'edit' ? 'Edit Poll Group' : 'Add Poll Group'}
        initialValues={formState.pollGroup}
        onSubmit={formState.mode === 'edit' ? handleUpdate : handleCreate}
        onClose={() => setFormState({ open: false, mode: 'create', pollGroup: null })}
      />

      <PollGroupDeleteDialog
        open={deleteState.open}
        pollGroup={deleteState.pollGroup}
        pollGroups={pollGroups}
        onConfirm={handleDeactivate}
        onClose={() => setDeleteState({ open: false, pollGroup: null })}
      />
    </Card>
  );
};

export default PollGroupsManager;
