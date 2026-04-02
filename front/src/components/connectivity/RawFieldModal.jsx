import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Select,
  InputLabel,
  FormControl,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import mqttService from '../../services/mqttService';

const TEMPLATES = [
  { label: 'Whole payload', build: () => 'payload' },
  { label: 'CSV — column 1 (0-based)', build: () => "payload.split(',')[0]" },
  { label: 'CSV — column 2', build: () => "payload.split(',')[1]" },
  { label: 'CSV — column 3', build: () => "payload.split(',')[2]" },
  { label: 'Key=Value (first capture)', build: () => "payload.match(/KEY=([^,;\\s]+)/)?.[1]" },
  { label: 'Regex capture group 1', build: () => "payload.match(/YOUR_PATTERN/)?.[1]" },
  { label: 'Custom expression', build: () => '' },
];

const DATA_TYPES = ['real', 'int', 'text', 'bool'];

export default function RawFieldModal({ open, onClose, onAdd, subscriptionId, topics = [] }) {
  const [template, setTemplate] = useState('');
  const [expression, setExpression] = useState('');
  const [tagName, setTagName] = useState('');
  const [dataType, setDataType] = useState('real');
  const [topic, setTopic] = useState(topics[0] || '');

  // Preview state
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);

  const handleTemplateChange = (e) => {
    const idx = e.target.value;
    setTemplate(idx);
    if (idx !== '') {
      setExpression(TEMPLATES[idx].build());
    }
    setPreviewResult(null);
  };

  const handleExpressionChange = (e) => {
    setExpression(e.target.value);
    setPreviewResult(null);
  };

  const handlePreview = async () => {
    if (!expression.trim()) return;
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const result = await mqttService.previewExpression(subscriptionId, expression.trim(), topic || null);
      setPreviewResult(result);
    } catch (err) {
      setPreviewResult({ error: err.message || 'Preview failed' });
    } finally {
      setPreviewing(false);
    }
  };

  const handleAdd = () => {
    if (!expression.trim() || !tagName.trim() || !topic) return;
    onAdd({
      topic,
      tag_name: tagName.trim(),
      data_type: dataType,
      value_expression: expression.trim(),
    });
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setTemplate('');
    setExpression('');
    setTagName('');
    setDataType('real');
    setTopic(topics[0] || '');
    setPreviewResult(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const canAdd = expression.trim() && tagName.trim() && topic;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Raw Field Mapping</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>

        {/* Topic selector */}
        {topics.length > 1 ? (
          <FormControl size="small" fullWidth>
            <InputLabel>Topic</InputLabel>
            <Select value={topic} onChange={(e) => setTopic(e.target.value)} label="Topic">
              {topics.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            size="small"
            label="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            fullWidth
          />
        )}

        {/* Template picker */}
        <TextField
          select
          size="small"
          label="Template"
          value={template}
          onChange={handleTemplateChange}
          fullWidth
        >
          <MenuItem value="">— pick a template —</MenuItem>
          {TEMPLATES.map((t, i) => (
            <MenuItem key={i} value={i}>{t.label}</MenuItem>
          ))}
        </TextField>

        {/* Expression editor */}
        <TextField
          size="small"
          label="JS Expression  (variable: payload)"
          value={expression}
          onChange={handleExpressionChange}
          fullWidth
          multiline
          minRows={2}
          placeholder="payload.split(',')[1]"
          inputProps={{ style: { fontFamily: 'monospace' } }}
        />

        {/* Preview button + results */}
        <Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={previewing ? <CircularProgress size={14} /> : <PlayArrowIcon />}
            onClick={handlePreview}
            disabled={previewing || !expression.trim() || !subscriptionId}
          >
            {previewing ? 'Testing…' : 'Test against last message'}
          </Button>

          {previewResult && (
            <Box sx={{ mt: 1.5 }}>
              {previewResult.error && !previewResult.input_payload ? (
                <Alert severity="warning" sx={{ py: 0.5 }}>{previewResult.error}</Alert>
              ) : (
                <>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                    Raw payload ({previewResult.topic}):
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0, p: 1, borderRadius: 1,
                      bgcolor: 'action.hover',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {previewResult.input_payload}
                  </Box>

                  <Divider sx={{ my: 1 }} />

                  {previewResult.error ? (
                    <Alert severity="error" sx={{ py: 0.5 }}>
                      Expression error: {previewResult.error}
                    </Alert>
                  ) : (
                    <Alert severity="success" sx={{ py: 0.5 }}>
                      Result: <strong>{previewResult.result}</strong>
                    </Alert>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>

        <Divider />

        {/* Tag name + data type */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            label="Tag Name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            fullWidth
            placeholder="Speed"
          />
          <TextField
            select
            size="small"
            label="Data Type"
            value={dataType}
            onChange={(e) => setDataType(e.target.value)}
            sx={{ minWidth: 100 }}
          >
            {DATA_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
        </Box>

      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!canAdd}>
          Add Field
        </Button>
      </DialogActions>
    </Dialog>
  );
}
