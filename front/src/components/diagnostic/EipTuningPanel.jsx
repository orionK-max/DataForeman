import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Grid
} from '@mui/material';
import { apiClient } from '../../services/api';

/**
 * EIP driver tuning panel
 * Allows configuration of EIP driver parameters that apply live
 */
export function EipTuningPanel() {
  const [eipMax, setEipMax] = useState(150);
  const [eipFallback, setEipFallback] = useState(75);
  const [eipBudget, setEipBudget] = useState(450);
  const [eipFbBudget, setEipFbBudget] = useState(225);
  const [eipOverhead, setEipOverhead] = useState(8);
  const [eipFrac, setEipFrac] = useState(0.85);
  const [eipMinShards, setEipMinShards] = useState(1);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');

  useEffect(() => {
    let alive = true;
    const loadConfig = async () => {
      try {
        const cfg = await apiClient.get('/config');
        if (!alive) return;
        
        const num = (k, def) => {
          const v = Number(cfg[k]);
          return Number.isFinite(v) ? v : def;
        };
        
        setEipMax(num('eip.max_taggroup_size', 150));
        setEipFallback(num('eip.fallback_taggroup_size', 75));
        setEipBudget(num('eip.taggroup_byte_budget', 450));
        setEipFbBudget(num('eip.fallback_byte_budget', 225));
        setEipOverhead(num('eip.tag_overhead_bytes', 8));
        setEipFrac(num('eip.shard_budget_frac', 0.85));
        setEipMinShards(num('eip.min_shards_per_tick', 1));
      } catch (err) {
        console.error('Failed to load EIP config:', err);
      }
    };
    
    loadConfig();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setMsg('');
    try {
      const body = {
        'eip.max_taggroup_size': Math.max(1, Math.floor(Number(eipMax) || 150)),
        'eip.fallback_taggroup_size': Math.max(1, Math.floor(Number(eipFallback) || 75)),
        'eip.taggroup_byte_budget': Math.max(64, Math.floor(Number(eipBudget) || 450)),
        'eip.fallback_byte_budget': Math.max(32, Math.floor(Number(eipFbBudget) || Math.floor((Number(eipBudget) || 450) / 2))),
        'eip.tag_overhead_bytes': Math.max(0, Math.floor(Number(eipOverhead) || 8)),
        'eip.shard_budget_frac': Math.max(0.1, Math.min(1.0, Number(eipFrac) || 0.85)),
        'eip.min_shards_per_tick': Math.max(1, Math.floor(Number(eipMinShards) || 1)),
      };
      
      const res = await apiClient.post('/config', body);
      if (res?.error) {
        setMsg(String(res.error));
        setMsgType('error');
      } else {
        setMsg('Saved successfully');
        setMsgType('success');
      }
    } catch (err) {
      setMsg('Failed to save configuration');
      setMsgType('error');
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          EIP Driver Tuning
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          These settings apply live and affect EIP driver shard configuration
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Shard max count"
              type="number"
              inputProps={{ min: 1, step: 1 }}
              value={eipMax}
              onChange={(e) => setEipMax(Number(e.target.value || 0))}
              helperText="Guardrail on tags per shard (default 150)"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Fallback shard max count"
              type="number"
              inputProps={{ min: 1, step: 1 }}
              value={eipFallback}
              onChange={(e) => setEipFallback(Number(e.target.value || 0))}
              helperText="Used when splitting shards after failure (default 75)"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Shard byte budget"
              type="number"
              inputProps={{ min: 64, step: 16 }}
              value={eipBudget}
              onChange={(e) => setEipBudget(Number(e.target.value || 0))}
              helperText="Primary shard sizing in bytes (default 450)"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Fallback byte budget"
              type="number"
              inputProps={{ min: 32, step: 16 }}
              value={eipFbBudget}
              onChange={(e) => setEipFbBudget(Number(e.target.value || 0))}
              helperText="Used when splitting after read failures (default ~225)"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Per-tag overhead (bytes)"
              type="number"
              inputProps={{ min: 0, step: 1 }}
              value={eipOverhead}
              onChange={(e) => setEipOverhead(Number(e.target.value || 0))}
              helperText="Added per symbol during estimation (default 8)"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Shard time budget fraction"
              type="number"
              inputProps={{ min: 0.1, max: 1, step: 0.05 }}
              value={eipFrac}
              onChange={(e) => setEipFrac(Number(e.target.value || 0))}
              helperText="Fraction of group interval spent per tick (default 0.85)"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Minimum shards per tick"
              type="number"
              inputProps={{ min: 1, step: 1 }}
              value={eipMinShards}
              onChange={(e) => setEipMinShards(Number(e.target.value || 0))}
              helperText="Lower bound on shards processed (default 1)"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button variant="contained" onClick={save}>
            Save
          </Button>
          {msg && (
            <Alert severity={msgType} sx={{ flex: 1 }}>
              {msg}
            </Alert>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
