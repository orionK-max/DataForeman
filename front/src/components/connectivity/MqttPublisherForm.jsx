/**
 * Form for creating and editing MQTT publishers.
 *
 * Publishers use a template-based payload system:
 *   Display (in UI):  {{ConnectionName|TagName}}
 *   Stored (in DB):   {{tag_id:1234}}
 *
 * The "Insert Tag" panel inserts a display token at the cursor.
 * "Validate" resolves display tokens → ID tokens via the backend,
 * validates JSON structure if needed, then stores the ID-based template.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Switch, Box, Typography, IconButton, Paper,
  Alert, Autocomplete, CircularProgress, Divider, Tooltip,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import api from '../../services/api';

const DRIVER_LABELS = {
  EIP: 'EtherNet/IP', OPCUA: 'OPC-UA', S7: 'S7',
  MQTT: 'MQTT', SYSTEM: 'System', INTERNAL: 'Internal',
};

const DEFAULT_FORM = (connectionId) => ({
  connection_id: connectionId,
  name: '',
  publish_mode: 'on_change',
  interval_ms: 5000,
  min_interval_ms: 500,
  payload_format: 'json',
  payload_template: '',
  mqtt_topic: '',
  qos: 0,
  retain: false,
  enabled: true,
});

export default function MqttPublisherForm({ open, onClose, onSave, connectionId, publisher }) {
  const [formData, setFormData] = useState(DEFAULT_FORM(connectionId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Connections list (all sources — for tag insertion)
  const [connections, setConnections] = useState([]);
  // Insert-tag panel state
  const [insertConnId, setInsertConnId] = useState('');
  const [insertTags, setInsertTags] = useState([]);
  const [insertTagsLoading, setInsertTagsLoading] = useState(false);
  const [insertTag, setInsertTag] = useState(null);

  // Ref to the template textarea for cursor-position insertion
  const templateRef = useRef(null);

  // Validation state: null = dirty/not validated, false = ok, string = error message
  const [jsonError, setJsonError] = useState(null);
  // Resolved template with {{tag_id:N}} tokens — set after successful Validate; sent on save
  const [resolvedTemplate, setResolvedTemplate] = useState(null);
  const [validating, setValidating] = useState(false);

  // ── Load on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    loadConnections();
    if (publisher) {
      loadPublisherDetails();
    } else {
      setFormData(DEFAULT_FORM(connectionId));
      setJsonError(null);
      setResolvedTemplate(null);
      setError(null);
    }
  }, [open, publisher]);

  // ── Load tags when insert connection changes ──────────────────
  useEffect(() => {
    if (!insertConnId) { setInsertTags([]); setInsertTag(null); return; }
    setInsertTagsLoading(true);
    setInsertTag(null);
    api.get(`/connectivity/tags/${insertConnId}`)
      .then(res => setInsertTags(res.tags || []))
      .catch(() => setInsertTags([]))
      .finally(() => setInsertTagsLoading(false));
  }, [insertConnId]);

  const loadConnections = async () => {
    try {
      const res = await api.get('/connectivity/connections');
      setConnections(res.items || []);
    } catch { /* silently ignore */ }
  };

  const loadPublisherDetails = async () => {
    try {
      const res = await api.get(`/mqtt/publishers/${publisher.id}`);
      const p = res.publisher;
      setFormData({
        connection_id: p.connection_id,
        name: p.name,
        publish_mode: p.publish_mode,
        interval_ms: p.interval_ms ?? 5000,
        min_interval_ms: p.min_interval_ms ?? 500,
        payload_format: p.payload_format ?? 'json',
        // Use decoded display template ({{ConnName|TagName}}) for the textarea
        payload_template: res.payload_template_display ?? p.payload_template ?? '',
        mqtt_topic: p.mqtt_topic ?? '',
        qos: p.qos ?? 0,
        retain: p.retain ?? false,
        enabled: p.enabled,
      });
      // Existing publishers are considered already validated (stored template is ID-based)
      setResolvedTemplate(p.payload_template ?? '');
      setJsonError(false);
    } catch {
      setError('Failed to load publisher details');
    }
  };

  const set = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Mark as dirty whenever body or format changes
    if (field === 'payload_template' || field === 'payload_format') {
      setJsonError(null);
      setResolvedTemplate(null);
    }
  };

  /**
   * Validate: resolve {{ConnName|TagName}} tokens → {{tag_id:N}}, then JSON-parse if needed.
   * On success sets resolvedTemplate (the ID-based string to save) and jsonError=false.
   */
  const handleValidate = async () => {
    const body = formData.payload_template.trim();
    if (!body) return;

    // If no display tokens, skip the API call and resolve locally
    if (!body.includes('{{')) {
      setResolvedTemplate(body);
      if (formData.payload_format === 'json') {
        try { JSON.parse(body); setJsonError(false); }
        catch (e) { setJsonError(e.message); setResolvedTemplate(null); }
      } else {
        setJsonError(false);
      }
      return;
    }

    setValidating(true);
    try {
      const res = await api.post('/mqtt/publishers/resolve-tokens', { template: body });

      if (res.errors?.length > 0) {
        setJsonError(res.errors.map(e => e.message).join(' | '));
        setResolvedTemplate(null);
        return;
      }

      const resolved = res.resolved_template;

      if (formData.payload_format === 'json') {
        // Substitute {{tag_id:N}} with 0 for structural JSON validation
        const sanitised = resolved.replace(/\{\{tag_id:\d+\}\}/g, '0');
        try { JSON.parse(sanitised); }
        catch (e) { setJsonError(e.message); setResolvedTemplate(null); return; }
      }

      setResolvedTemplate(resolved);
      setJsonError(false);
    } catch (err) {
      setJsonError(err.message || 'Validation failed');
      setResolvedTemplate(null);
    } finally {
      setValidating(false);
    }
  };

  const insertTokenAtCursor = useCallback(() => {
    if (!insertTag) return;
    const conn = connections.find(c => c.id === insertConnId);
    if (!conn) return;
    // Display token uses tag_name (human-readable); falls back to tag_path if no name set
    const label = insertTag.tag_name || insertTag.tag_path;
    const token = `{{${conn.name}|${label}}}`;
    const el = templateRef.current?.querySelector('textarea');
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + token + el.value.slice(end);
      set('payload_template', newVal);
      // Restore cursor position after React re-renders
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + token.length;
        el.focus();
      }, 0);
    } else {
      set('payload_template', formData.payload_template + token);
    }
    setInsertTag(null);
  }, [insertTag, insertConnId, connections, formData.payload_template]);

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!formData.name.trim()) { setError('Publisher name is required'); return; }
    if (!formData.mqtt_topic.trim()) { setError('MQTT topic is required'); return; }
    if (!formData.payload_template.trim()) { setError('Payload body is required'); return; }
    if ((formData.publish_mode === 'interval' || formData.publish_mode === 'both') && !formData.interval_ms) {
      setError('Interval is required for interval or both modes'); return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        // Send ID-based template to backend; fall back to display template if not resolved
        payload_template: resolvedTemplate ?? formData.payload_template,
        interval_ms: formData.publish_mode === 'on_change' ? null : formData.interval_ms,
      };
      if (publisher) {
        await api.put(`/mqtt/publishers/${publisher.id}`, payload);
      } else {
        await api.post('/mqtt/publishers', payload);
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save publisher');
    } finally {
      setLoading(false);
    }
  };


  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{publisher ? 'Edit Publisher' : 'New Publisher'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>

          {/* ── Basic settings ── */}
          <TextField
            label="Publisher Name" value={formData.name} required fullWidth
            onChange={e => set('name', e.target.value)}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>Publish Mode</InputLabel>
              <Select value={formData.publish_mode} label="Publish Mode"
                onChange={e => set('publish_mode', e.target.value)}>
                <MenuItem value="on_change">On Change</MenuItem>
                <MenuItem value="interval">Interval</MenuItem>
                <MenuItem value="both">Both</MenuItem>
              </Select>
            </FormControl>

            {(formData.publish_mode === 'interval' || formData.publish_mode === 'both') && (
              <TextField
                label="Interval (ms)" type="number" sx={{ flex: 1 }}
                value={formData.interval_ms}
                onChange={e => set('interval_ms', parseInt(e.target.value, 10))}
              />
            )}

            {(formData.publish_mode === 'on_change' || formData.publish_mode === 'both') && (
              <Tooltip title="Minimum time between publishes for on_change mode">
                <TextField
                  label="Min interval (ms)" type="number" sx={{ flex: 1 }}
                  value={formData.min_interval_ms}
                  onChange={e => set('min_interval_ms', parseInt(e.target.value, 10))}
                />
              </Tooltip>
            )}
          </Box>

          <FormControlLabel
            control={<Switch checked={formData.enabled} onChange={e => set('enabled', e.target.checked)} />}
            label="Enabled"
          />

          <Divider />

          {/* ── MQTT publish target ── */}
          <Typography variant="subtitle1" fontWeight={600}>Publish Target</Typography>

          <TextField
            label="MQTT Topic" value={formData.mqtt_topic} required fullWidth
            placeholder="sensors/line1/status"
            onChange={e => set('mqtt_topic', e.target.value)}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>QoS</InputLabel>
              <Select value={formData.qos} label="QoS" onChange={e => set('qos', e.target.value)}>
                <MenuItem value={0}>0 – At most once</MenuItem>
                <MenuItem value={1}>1 – At least once</MenuItem>
                <MenuItem value={2}>2 – Exactly once</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              sx={{ alignSelf: 'center' }}
              control={<Switch checked={formData.retain} onChange={e => set('retain', e.target.checked)} />}
              label="Retain"
            />
          </Box>

          <Divider />

          {/* ── Payload ── */}
          <Typography variant="subtitle1" fontWeight={600}>Message Payload</Typography>

          <FormControl fullWidth>
            <InputLabel>Format</InputLabel>
            <Select value={formData.payload_format} label="Format"
              onChange={e => set('payload_format', e.target.value)}>
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="raw">Raw</MenuItem>
            </Select>
          </FormControl>

          {/* ── Insert Tag Reference panel ── */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Insert Tag Reference</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Source Connection</InputLabel>
                <Select value={insertConnId} label="Source Connection"
                  onChange={e => setInsertConnId(e.target.value)}>
                  {connections.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                      {c.type && (
                        <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                          ({DRIVER_LABELS[c.type] || c.type})
                        </Typography>
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Autocomplete
                  sx={{ flex: 1 }}
                  size="small"
                  disabled={!insertConnId || insertTagsLoading}
                  options={insertTags}
                  getOptionLabel={o => o.tag_name || o.tag_path || ''}
                  renderOption={(props, option) => (
                    <li {...props} key={option.tag_id}>
                      <Box>
                        <Typography variant="body2">{option.tag_name || option.tag_path}</Typography>
                        {option.tag_name && option.tag_name !== option.tag_path && (
                          <Typography variant="caption" color="text.secondary">{option.tag_path}</Typography>
                        )}
                      </Box>
                    </li>
                  )}
                  value={insertTag}
                  onChange={(_, val) => setInsertTag(val)}
                  loading={insertTagsLoading}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Select Tag"
                      placeholder={insertConnId ? 'Search tags…' : 'Select a connection first'}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {insertTagsLoading ? <CircularProgress size={16} color="inherit" /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
                <Button
                  variant="outlined" startIcon={<Add />}
                  disabled={!insertTag}
                  onClick={insertTokenAtCursor}
                >
                  Insert
                </Button>
              </Box>
            </Box>
          </Paper>

          <TextField
            label="Payload Body"
            ref={templateRef}
            value={formData.payload_template}
            onChange={e => set('payload_template', e.target.value)}
            fullWidth multiline rows={5}
            error={typeof jsonError === 'string'}
            placeholder={
              formData.payload_format === 'json'
                ? '{"voltage": {{EIP - Line1|Voltage}}, "status": "{{MQTT - Internal|PumpStatus}}"}'
                : 'Pump {{MQTT - Internal|PumpStatus}} at {{EIP - Line1|SpeedRPM}} RPM'
            }
            helperText={
              typeof jsonError === 'string' ? (
                <span style={{ color: 'inherit' }}>{jsonError}</span>
              ) : jsonError === false ? (
                <span style={{ color: '#2e7d32' }}>✓ Validated — tag references resolved and structure checked</span>
              ) : (
                <span>
                  Use <code>{'{{ConnectionName|TagName}}'}</code> to embed live tag values.
                  Use the panel above to insert with autocomplete.
                </span>
              )
            }
          />

          {formData.payload_template.trim() && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleValidate}
                disabled={validating || !formData.payload_template.trim()}
              >
                {validating ? 'Validating…' : 'Validate'}
              </Button>
            </Box>
          )}


        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            loading ||
            typeof jsonError === 'string' ||
            (formData.payload_template.trim() !== '' && jsonError === null)
          }
        >
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
