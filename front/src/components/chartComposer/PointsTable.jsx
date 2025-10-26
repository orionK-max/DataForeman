import React, { useMemo, useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
} from '@mui/material';
import { ExpandMore, ExpandLess, FileDownload } from '@mui/icons-material';
import { useChartComposer } from '../../contexts/ChartComposerContext';

const COLOR_PALETTE = ['#60a5fa', '#f472b6', '#34d399', '#f59e0b', '#a78bfa', '#f87171', '#22d3ee'];

const fmtTsShort = (ts) => {
  try {
    const d = new Date(ts);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  } catch {
    return String(ts);
  }
};

const fmtTs = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
};

const PointsTable = ({ visibleTimeRange = null, hideHeader = false }) => {
  const { items, chartConfig } = useChartComposer();
  const [expanded, setExpanded] = useState(false);
  const [combineClose, setCombineClose] = useState(false);
  const [combineToleranceMs, setCombineToleranceMs] = useState(100);
  const [fillNearest, setFillNearest] = useState(false);
  
  // Virtualization state - only render visible rows
  const [visibleRowStart, setVisibleRowStart] = useState(0);
  const ROWS_PER_PAGE = 100; // Render 100 rows at a time

  // Filter items by visible time range if zoomed
  const filteredItems = useMemo(() => {
    if (!visibleTimeRange) return items;
    
    const [minTime, maxTime] = visibleTimeRange;
    return items.filter(item => {
      const itemTime = typeof item.ts === 'number' ? item.ts : new Date(item.ts).getTime();
      return itemTime >= minTime && itemTime <= maxTime;
    });
  }, [items, visibleTimeRange]);

  // Get display tag IDs from chart config
  const displayTagIds = useMemo(() => {
    return chartConfig.tagConfigs.map(t => t.tag_id);
  }, [chartConfig.tagConfigs]);

  // Build tag name map
  const tagNamesMap = useMemo(() => {
    const map = new Map();
    chartConfig.tagConfigs.forEach(t => {
      map.set(String(t.tag_id), t.alias || t.name || `Tag ${t.tag_id}`);
    });
    return map;
  }, [chartConfig.tagConfigs]);

  // Build tag color map from chart config
  const tagColorMap = useMemo(() => {
    const map = new Map();
    chartConfig.tagConfigs.forEach(t => {
      map.set(String(t.tag_id), t.color || '#3b82f6'); // Use tag's chart color or default blue
    });
    return map;
  }, [chartConfig.tagConfigs]);

  // Count points per tag
  const perTagCounts = useMemo(() => {
    const map = new Map();
    filteredItems.forEach(r => {
      const id = String(r.tag_id);
      map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [filteredItems]);

  // Grouped rows computation (matches old frontend exactly)
  const groupedRows = useMemo(() => {
    if (!combineClose) {
      // Original fast path: one row per exact timestamp
      const byTime = new Map();
      for (const r of filteredItems) {
        if (!byTime.has(r.ts)) byTime.set(r.ts, new Map());
        byTime.get(r.ts).set(r.tag_id, r);
      }
      // Sort in reverse chronological order (newest first)
      return Array.from(byTime.keys()).sort((a, b) => {
        const aNum = typeof a === 'number' ? a : new Date(a).getTime();
        const bNum = typeof b === 'number' ? b : new Date(b).getTime();
        return bNum - aNum;
      }).map(ts => ({ mode: 'exact', ts, map: byTime.get(ts) }));
    }

    // Combine-close path
    const tol = combineToleranceMs;
    // Sort copy by numeric time
    const sorted = [...filteredItems].sort((a, b) => {
      const at = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime();
      const bt = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime();
      return at - bt;
    });

    const bases = [];
    for (const r of sorted) {
      const rTs = typeof r.ts === 'number' ? r.ts : new Date(r.ts).getTime();
      if (!bases.length) {
        bases.push({ ts: rTs, pts: [r] });
        continue;
      }
      const last = bases[bases.length - 1];
      if (rTs - last.ts <= tol) last.pts.push(r);
      else bases.push({ ts: rTs, pts: [r] });
    }

    // Index per tag for nearest search
    const byTag = new Map();
    for (const r of sorted) {
      if (!byTag.has(r.tag_id)) byTag.set(r.tag_id, []);
      byTag.get(r.tag_id).push(r);
    }

    function nearest(tagArr, centerTs, limit, allowOutside) {
      if (!tagArr || !tagArr.length) return null;
      // Binary locate lower bound
      let lo = 0, hi = tagArr.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const midTs = typeof tagArr[mid].ts === 'number' ? tagArr[mid].ts : new Date(tagArr[mid].ts).getTime();
        if (midTs < centerTs) lo = mid + 1;
        else hi = mid;
      }
      let best = null;
      let bestDist = Infinity;
      let left = lo - 1, right = lo;
      const consider = (p) => {
        if (!p) return;
        const pTs = typeof p.ts === 'number' ? p.ts : new Date(p.ts).getTime();
        const d = Math.abs(pTs - centerTs);
        if (!allowOutside && d > limit) return;
        if (d < bestDist) {
          best = p;
          bestDist = d;
        }
      };
      while (left >= 0 || right < tagArr.length) {
        const pl = left >= 0 ? tagArr[left] : null;
        const pr = right < tagArr.length ? tagArr[right] : null;
        const plTs = pl ? (typeof pl.ts === 'number' ? pl.ts : new Date(pl.ts).getTime()) : Infinity;
        const prTs = pr ? (typeof pr.ts === 'number' ? pr.ts : new Date(pr.ts).getTime()) : Infinity;
        const dl = Math.abs(plTs - centerTs);
        const dr = Math.abs(prTs - centerTs);
        const nextD = Math.min(dl, dr);
        if (!allowOutside && nextD > limit && best) break;
        if (dl <= dr) {
          consider(pl);
          left--;
        } else {
          consider(pr);
          right++;
        }
        if (!allowOutside && nextD > limit && best) break;
        if (bestDist === 0) break;
      }
      return best;
    }

    const grouped = [];
    for (const base of bases) {
      const g = { mode: 'cluster', base: base.ts, pts: [...base.pts] };
      const have = new Set(g.pts.map(p => p.tag_id));
      for (const tagId of displayTagIds) {
        if (have.has(tagId)) continue;
        const fill = nearest(byTag.get(tagId), g.base, tol, fillNearest);
        if (fill) g.pts.push({ ...fill, __filled: true });
      }
      grouped.push(g);
    }
    // Reverse to show newest first
    return grouped.reverse();
  }, [filteredItems, combineClose, combineToleranceMs, fillNearest, displayTagIds]);

  // Reset pagination when data changes
  useEffect(() => {
    setVisibleRowStart(0);
  }, [groupedRows.length]);

  // Export CSV Raw
  const exportCsvRaw = () => {
    if (!filteredItems.length) return;
    
    const header = ['timestamp', 'tag_id', 'value'];
    const rows = filteredItems.map(r => [
      fmtTs(r.ts),
      String(r.tag_id),
      String(r.v)
    ]);
    
    const csv = [header, ...rows].map(line => line.map(c => {
      const s = String(c);
      return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `points_raw_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // Export CSV As Shown
  const exportCsvAsShown = () => {
    if (!displayTagIds.length) return;
    
    const header = ['display_ts', 'cluster_size', ...displayTagIds.map(id => `tag_${id}`)];
    const rows = groupedRows.map(g => {
      const ts = fmtTsShort(g.ts ?? g.base);
      const size = g.mode === 'cluster' ? g.pts.length : 1;
      // Build per tag cell
      let tagMap;
      if (g.mode === 'exact') tagMap = g.map;
      else {
        tagMap = new Map();
        for (const p of g.pts) {
          const existing = tagMap.get(p.tag_id);
          const pTs = typeof p.ts === 'number' ? p.ts : new Date(p.ts).getTime();
          const baseTs = g.base;
          if (!existing) tagMap.set(p.tag_id, p);
          else {
            const existingTs = typeof existing.ts === 'number' ? existing.ts : new Date(existing.ts).getTime();
            if (Math.abs(pTs - baseTs) < Math.abs(existingTs - baseTs)) tagMap.set(p.tag_id, p);
          }
        }
      }
      const cells = displayTagIds.map(tid => {
        const d = tagMap.get(tid);
        if (!d) return '';
        // Mark filled cells with * to distinguish synthetic
        return d.__filled ? `${d.v}*` : d.v;
      });
      return [ts, size, ...cells];
    });
    
    const csv = [header, ...rows].map(line => line.map(c => {
      const s = String(c);
      return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `points_table_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // Render the table component (shared by both modes)
  const renderTable = () => (
    <>
      <TableContainer sx={{ 
        maxHeight: 400, 
        border: 1, 
        borderColor: 'divider', 
        borderRadius: 1,
      }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={{ 
                fontWeight: 600, 
                whiteSpace: 'nowrap',
              }}>Time</TableCell>
              {displayTagIds.map((tagId, idx) => {
                const idStr = String(tagId);
                const color = tagColorMap.get(idStr) || '#3b82f6'; // Use chart color
                const name = tagNamesMap.get(idStr) || `Tag ${idStr}`;
                const cnt = perTagCounts.get(idStr) || 0;
                return (
                  <TableCell
                    key={tagId}
                    align="center"
                    sx={{
                      fontWeight: 600,
                      color: color,
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      maxWidth: 180,
                    }}
                    title={`${name} • ${cnt} point${cnt === 1 ? '' : 's'}`}
                  >
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                        {name}
                      </Typography>
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.7 }}>
                        {cnt} pt{cnt === 1 ? '' : 's'}
                      </Typography>
                    </Box>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedRows.slice(visibleRowStart, visibleRowStart + ROWS_PER_PAGE).map((g, sliceIdx) => {
              const rowIdx = visibleRowStart + sliceIdx;
              const tsDisplay = g.ts ?? g.base;
              let tagMap;
              if (g.mode === 'exact') {
                tagMap = g.map;
              } else {
                // cluster
                tagMap = new Map();
                for (const p of g.pts) {
                  const existing = tagMap.get(p.tag_id);
                  const pTs = typeof p.ts === 'number' ? p.ts : new Date(p.ts).getTime();
                  const baseTs = g.base;
                  if (!existing) tagMap.set(p.tag_id, p);
                  else {
                    const existingTs = typeof existing.ts === 'number' ? existing.ts : new Date(existing.ts).getTime();
                    if (Math.abs(pTs - baseTs) < Math.abs(existingTs - baseTs)) tagMap.set(p.tag_id, p);
                  }
                }
              }
              return (
                <TableRow key={rowIdx} hover>
                  <TableCell align="center" sx={{ 
                    fontFamily: 'monospace', 
                    whiteSpace: 'nowrap',
                  }} title={fmtTs(tsDisplay)}>
                    {fmtTsShort(tsDisplay)}
                    {g.mode === 'cluster' && g.pts.length > 1 ? ` (${g.pts.length})` : ''}
                  </TableCell>
                  {displayTagIds.map((tagId, tagIdx) => {
                    const data = tagMap.get(tagId);
                    const idStr = String(tagId);
                    const color = tagColorMap.get(idStr) || '#3b82f6'; // Use chart color
                    return (
                      <TableCell
                        key={tagId}
                        align="center"
                        sx={{
                          fontFamily: 'monospace',
                          color: color,
                          fontStyle: data?.__filled ? 'italic' : 'normal',
                          opacity: data?.__filled ? 0.85 : 1,
                        }}
                        title={data ? (data.__filled ? `Filled from ${fmtTs(data.ts)}` : fmtTs(data.ts)) : 'No point in window'}
                      >
                        {data ? String(data.v) : '—'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
            {!filteredItems.length && (
              <TableRow>
                <TableCell colSpan={1 + displayTagIds.length} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 2 }}>
                    {visibleTimeRange ? 'No data points in visible range' : 'No rows'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Pagination Controls */}
      {groupedRows.length > ROWS_PER_PAGE && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 2 }}>
          <Button
            size="small"
            disabled={visibleRowStart === 0}
            onClick={() => setVisibleRowStart(Math.max(0, visibleRowStart - ROWS_PER_PAGE))}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Showing {visibleRowStart + 1}-{Math.min(visibleRowStart + ROWS_PER_PAGE, groupedRows.length)} of {groupedRows.length} rows
          </Typography>
          <Button
            size="small"
            disabled={visibleRowStart + ROWS_PER_PAGE >= groupedRows.length}
            onClick={() => setVisibleRowStart(visibleRowStart + ROWS_PER_PAGE)}
          >
            Next
          </Button>
        </Box>
      )}
    </>
  );

  if (!displayTagIds.length) {
    return null; // Don't show table if no tags configured
  }

  // When hideHeader is true, render without the outer Card and header
  if (hideHeader) {
    return (
      <CardContent sx={{ pt: 2 }}>
        {/* Controls and Export buttons in one row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'nowrap' }}>
          {/* Left side: Combine controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap' }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={combineClose}
                  onChange={(e) => setCombineClose(e.target.checked)}
                />
              }
              label="Combine"
              title="Combine nearby timestamps into one row"
              sx={{ mr: 0 }}
            />

            {combineClose && (
              <>
                <Select
                  size="small"
                  value={combineToleranceMs}
                  onChange={(e) => setCombineToleranceMs(Number(e.target.value))}
                  sx={{ minWidth: 100 }}
                >
                  <MenuItem value={50}>±50ms</MenuItem>
                  <MenuItem value={100}>±100ms</MenuItem>
                  <MenuItem value={250}>±250ms</MenuItem>
                  <MenuItem value={500}>±500ms</MenuItem>
                  <MenuItem value={1000}>±1s</MenuItem>
                  <MenuItem value={2000}>±2s</MenuItem>
                  <MenuItem value={5000}>±5s</MenuItem>
                </Select>

                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={fillNearest}
                      onChange={(e) => setFillNearest(e.target.checked)}
                    />
                  }
                  label="Fill nearest"
                  title="When combining, fill missing tag values with nearest value within tolerance"
                  sx={{ mr: 0 }}
                />
              </>
            )}
          </Box>

          {/* Right side: Export buttons */}
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={exportCsvRaw}
              disabled={!filteredItems.length}
              title="Export raw point rows (one per DB record)"
            >
              Export Raw
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={exportCsvAsShown}
              disabled={!filteredItems.length}
              title="Export table exactly as displayed (clusters, fills marked with *)"
            >
              Export As Shown
            </Button>
          </Box>
        </Box>

        {/* Table */}
        {renderTable()}
      </CardContent>
    );
  }

  return (
    <Card sx={{ mt: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          pb: expanded ? 1 : 2,
          flexWrap: 'nowrap',
        }}
      >
        {/* Left side: Title and Expand/Collapse */}
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            cursor: 'pointer',
            minWidth: 0,
            '&:hover': { opacity: 0.7 },
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <IconButton size="small" sx={{ pointerEvents: 'none' }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Points
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {expanded ? '(hide)' : `(${filteredItems.length ? `${filteredItems.length} pts` : 'empty'})`}
          </Typography>
          {!expanded && filteredItems.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {displayTagIds.length} tag{displayTagIds.length === 1 ? '' : 's'}
            </Typography>
          )}
        </Box>

        {/* Right side: Export buttons - only shown when expanded */}
        {expanded && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={(e) => {
                e.stopPropagation();
                exportCsvRaw();
              }}
              disabled={!filteredItems.length}
              title="Export raw point rows (one per DB record)"
            >
              Export Raw
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={(e) => {
                e.stopPropagation();
                exportCsvAsShown();
              }}
              disabled={!filteredItems.length}
              title="Export table exactly as displayed (clusters, fills marked with *)"
            >
              Export As Shown
            </Button>
          </Box>
        )}
      </Box>

      <Collapse in={expanded}>
        <CardContent sx={{ pt: 0 }}>
          {/* Controls */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={combineClose}
                    onChange={(e) => setCombineClose(e.target.checked)}
                  />
                }
                label="Combine"
                title="Combine nearby timestamps into one row"
              />

              {combineClose && (
                <>
                  <Select
                    size="small"
                    value={combineToleranceMs}
                    onChange={(e) => setCombineToleranceMs(Number(e.target.value))}
                    sx={{ minWidth: 100 }}
                  >
                    <MenuItem value={50}>±50ms</MenuItem>
                    <MenuItem value={100}>±100ms</MenuItem>
                    <MenuItem value={250}>±250ms</MenuItem>
                    <MenuItem value={500}>±500ms</MenuItem>
                    <MenuItem value={1000}>±1s</MenuItem>
                    <MenuItem value={2000}>±2s</MenuItem>
                    <MenuItem value={5000}>±5s</MenuItem>
                  </Select>

                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={fillNearest}
                        onChange={(e) => setFillNearest(e.target.checked)}
                      />
                    }
                    label="Fill nearest"
                    title="Fill missing values with nearest point even if outside tolerance (italic = filled)"
                  />
                </>
              )}
            </Box>
          </Box>

          {/* Table */}
          {renderTable()}
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default PointsTable;
