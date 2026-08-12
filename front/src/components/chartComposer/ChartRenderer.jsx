import React from 'react';
import { Card, CardContent, Box, CircularProgress, Typography, IconButton, Stack, Tooltip, Switch, FormControlLabel, TextField, MenuItem, useTheme } from '@mui/material';
import { ZoomIn, ZoomOut, RestartAlt, Settings, DashboardCustomize, ChevronLeft, ChevronRight } from '@mui/icons-material';
import ExtensionChartPlugin from '../shared/ExtensionChartPlugin.jsx';
import PluginRegistry from '../../utils/PluginRegistry.js';
import ReactECharts from 'echarts-for-react';
import ChartConfigPanel from './ChartConfigPanel';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import chartComposerService from '../../services/chartComposerService';

/**
 * Derive filled-band intervals for a "state" overlay (see temp/States and Events.md).
 * Pure function, exported for unit testing — no ECharts/DOM dependency.
 *
 * Only exact-match is supported (valueMap lookup or activeValue equality) — no
 * threshold/range logic here by design; that decision belongs in a Flow upstream.
 *
 * @param {Map<number, number>} tagData - sorted-by-key Map<timestampMs, value> for the overlay's sourceTagId
 * @param {Object} overlay - overlay config { activeValue, valueMap, color, opacity, unknownStyle, border }
 * @param {{ ts: string|number, v: any } | null | undefined} lastValueBefore - last known value before queryStartTime
 * @param {number} queryStartTime - ms epoch
 * @param {number} queryEndTime - ms epoch
 * @returns {Array<{ start: number, end: number, isUnknown: boolean, color: string, opacity: number, label?: string }>}
 */
export function deriveStateBands(tagData, overlay, lastValueBefore, queryStartTime, queryEndTime) {
  if (!(tagData instanceof Map) || queryEndTime <= queryStartTime) return [];

  const timestamps = Array.from(tagData.keys()).sort((a, b) => a - b);

  // Build the ordered [{ t, v }] timeline. v === undefined marks "unknown" (no known value yet).
  const points = [];
  if (lastValueBefore != null && lastValueBefore.v !== undefined && lastValueBefore.v !== null) {
    points.push({ t: queryStartTime, v: Number(lastValueBefore.v) });
  } else {
    points.push({ t: queryStartTime, v: undefined }); // unknown until first real sample
  }
  timestamps.forEach(t => points.push({ t, v: tagData.get(t) }));

  // Resolve a single point's value into a display style, or null if it should render as
  // a "gap" (known value, but not matching any active/mapped state — nothing drawn there).
  const resolveStyle = (v) => {
    if (v === undefined) {
      // Opt-in only (default off): most users don't need to distinguish "no data yet" from
      // "known inactive" — both render as nothing unless explicitly enabled. See
      // temp/States and Events.md for the reasoning (absence of evidence vs evidence of absence).
      if (!overlay.unknownStyle?.enabled) return null;
      const u = overlay.unknownStyle;
      return { isUnknown: true, color: u.color || '#666666', opacity: u.opacity ?? 0.1, label: undefined };
    }
    if (Array.isArray(overlay.valueMap) && overlay.valueMap.length > 0) {
      const entry = overlay.valueMap.find(e => e.enabled !== false && Number(e.value) === Number(v));
      if (!entry) return null;
      return { isUnknown: false, color: entry.color, opacity: overlay.opacity ?? 0.25, label: entry.label };
    }
    if ('activeValue' in overlay && overlay.activeValue !== undefined) {
      const match = Number(v) === Number(overlay.activeValue) || v === overlay.activeValue;
      if (!match) return null;
      return { isUnknown: false, color: overlay.color, opacity: overlay.opacity ?? 0.25, label: overlay.name };
    }
    return null;
  };

  const bands = [];
  for (let i = 0; i < points.length; i++) {
    const start = points[i].t;
    const end = (i + 1 < points.length) ? points[i + 1].t : queryEndTime;
    if (end <= start) continue;
    const style = resolveStyle(points[i].v);
    if (!style) continue; // known-but-inactive: no band drawn, base chart shows through

    const prev = bands[bands.length - 1];
    if (prev && prev.end === start && prev.isUnknown === style.isUnknown &&
        prev.color === style.color && prev.label === style.label) {
      prev.end = end; // merge adjacent identical segments
    } else {
      bands.push({ start, end, ...style });
    }
  }
  return bands;
}

/**
 * Derive instant occurrences for an "event" overlay (see temp/States and Events.md).
 * Pure function, exported for unit testing — no ECharts/DOM dependency.
 *
 * risingEdge/fallingEdge/eitherEdge are bool-native (0/nonzero transitions). specificValue
 * and everySample also work for int/real tags — exact match only, no threshold crossing.
 *
 * @param {Map<number, number>} tagData - Map<timestampMs, value> for the overlay's sourceTagId
 * @param {Object} overlay - overlay config { trigger, triggerValue, color, opacity, name }
 * @param {{ ts: string|number, v: any } | null | undefined} lastValueBefore - last known value before queryStartTime
 * @param {number} queryStartTime - ms epoch
 * @param {number} queryEndTime - ms epoch
 * @returns {Array<{ timestamp: number, color: string, opacity: number, label?: string }>}
 */
export function deriveEventMarkers(tagData, overlay, lastValueBefore, queryStartTime, queryEndTime) {
  if (!(tagData instanceof Map)) return [];

  const timestamps = Array.from(tagData.keys()).sort((a, b) => a - b);
  const events = [];
  let prevValue = (lastValueBefore != null && lastValueBefore.v !== undefined && lastValueBefore.v !== null)
    ? Number(lastValueBefore.v)
    : undefined;

  for (const t of timestamps) {
    if (t < queryStartTime || t > queryEndTime) { prevValue = tagData.get(t); continue; }
    const v = tagData.get(t);
    let fire = false;

    switch (overlay.trigger) {
      case 'everySample':
        fire = true;
        break;
      case 'specificValue':
        fire = Number(v) === Number(overlay.triggerValue) || v === overlay.triggerValue;
        break;
      case 'risingEdge':
        fire = prevValue !== undefined && Number(prevValue) === 0 && Number(v) !== 0;
        break;
      case 'fallingEdge':
        fire = prevValue !== undefined && Number(prevValue) !== 0 && Number(v) === 0;
        break;
      case 'eitherEdge':
        fire = prevValue !== undefined && Number(prevValue) !== Number(v);
        break;
      default:
        fire = false;
    }

    if (fire) {
      events.push({ timestamp: t, color: overlay.color, opacity: overlay.opacity ?? 1, label: overlay.name });
    }
    prevValue = v;
  }
  return events;
}

/**
 * Human-readable duration for state-overlay tooltips (Section 7 — see temp/States and Events.md).
 * e.g. 90000 -> "1m 30s", 7200000 -> "2h 0m".
 */
function formatOverlayDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Pick black or white text so a state-band caption stays readable against its fill color
 * (see temp/States and Events.md, on-chart label positioning). Standard relative-luminance
 * threshold, not color-accuracy-critical so a cheap approximation is fine.
 */
function getContrastingTextColor(hexColor) {
  const hex = (hexColor || '').replace('#', '');
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#000000' : '#ffffff';
}

const ChartRenderer = React.forwardRef(({ 
  data = [], 
  tagConfigs = [], 
  axes = [],
  referenceLines = [],
  overlays = [], // States & Events overlays (see temp/States and Events.md)
  grid = { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' },
  background = { color: '#000000', opacity: 1 },
  display = { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
  height = 360,
  loading = false,
  compactMode = false,
  requestedTimeRange = null, // { from, to } - the requested time range to show on x-axis
  options = {}, // Chart options including xAxisTickCount
  contextType = 'composer', // 'composer', 'dashboard', 'diagnostic', 'flow-monitor'
  // Props for write-on-change support (can be passed or use context)
  tagMetadata: tagMetadataProp = null,
  lastValuesBefore: lastValuesBeforeProp = null,
  // Callbacks and controls (matching ChartRenderer.jsx)
  onZoomChange = null,
  hasUnsavedChanges = false,
  saveButton = null,
  updateTagConfig = null,
  autoRefreshEnabled = false,
  onToggleAutoRefresh = null,
  refreshIntervalValue = 5,
  onRefreshIntervalChange = null,
  customRefreshInterval = 5,
  onCustomRefreshIntervalChange = null,
  showPreferencesButton = true,
  timeModeBadge = null,
  updateAxis = null,
  addAxis = null,
  removeAxis = null,
  addReferenceLine = null,
  updateReferenceLine = null,
  removeReferenceLine = null,
  addOverlay = null,
  updateOverlay = null,
  removeOverlay = null,
  moveOverlay = null,
  updateGridConfig = null,
  updateBackgroundConfig = null,
  updateDisplayConfig = null,
  updateExtensionConfig = null,
  updateChartConfig = null,
  onPreferencesClose = null,
  onResetZoom = null,
  onScrollTime = null, // (direction: 'back' | 'forward') => void — shift time window by 50%, stops live mode
  onToggleCompactMode = null,
  // New props for external control
  externalShowPreferences = null,
  externalSetShowPreferences = null,
  externalCrosshairEnabled = null,
  externalSetCrosshairEnabled = null,
  hideInternalControls = false,
  showDataPoints = false,
  externalExtensionSeries = null, // { [pluginId]: series[] } — from ChartComposer's toolbar plugins
}, ref) => {
  // Get MUI theme for background color
  const theme = useTheme();
  
  // Get context for shouldOpenPreferences flag and metadata (if not passed as props)
  // This may be null if component is used outside ChartComposerProvider (e.g., in Dashboard)
  const context = useChartComposer();
  const { 
    shouldOpenPreferences, 
    setShouldOpenPreferences, 
    tagMetadata: tagMetadataContext, 
    lastValuesBefore: lastValuesBeforeContext 
  } = context || {};
  
  // Use props if provided, otherwise fall back to context
  const tagMetadata = tagMetadataProp || tagMetadataContext;
  const lastValuesBefore = lastValuesBeforeProp || lastValuesBeforeContext;
  
  // Preferences overlay state - use external if provided
  const [internalShowPreferences, setInternalShowPreferences] = React.useState(false);
  const showPreferences = externalShowPreferences !== null ? externalShowPreferences : internalShowPreferences;
  const setShowPreferences = externalSetShowPreferences !== null ? externalSetShowPreferences : setInternalShowPreferences;
  const previousShowPreferences = React.useRef(showPreferences);
  
  // Crosshair state - use external if provided
  const [internalCrosshairEnabled, setInternalCrosshairEnabled] = React.useState(false);
  const crosshairEnabled = externalCrosshairEnabled !== null ? externalCrosshairEnabled : internalCrosshairEnabled;
  const setCrosshairEnabled = externalSetCrosshairEnabled !== null ? externalSetCrosshairEnabled : setInternalCrosshairEnabled;
  const [crosshairPosition, setCrosshairPosition] = React.useState(null); // { x, y, time, values }
  
  // ECharts instance reference
  const getLegendGrouping = React.useCallback((seriesName) => {
    const rawName = typeof seriesName === 'string' ? seriesName : '';
    const forecastMatch = rawName.match(/^(.*) \(F\)$/);
    if (forecastMatch) {
      return { baseName: forecastMatch[1], isForecast: true };
    }
    return { baseName: rawName, isForecast: false };
  }, []);

  const chartRef = React.useRef(null);
  
  // Expose methods via ref for parent
  React.useImperativeHandle(ref, () => ({
    getEchartsInstance: () => chartRef.current?.getEchartsInstance(),
  }));
  
  // Persistent storage for last heartbeat values for write-on-change tags
  // Structure: { tagId: { value, originalTime, heartbeatInterval } }
  const persistedHeartbeats = React.useRef({});

  // Extension series map: pluginId → ECharts series array pushed by toolbar slot components
  const [extensionSeriesMap, setExtensionSeriesMap] = React.useState({});
  const handleExtensionSeriesChange = React.useCallback((pluginId, series) => {
    setExtensionSeriesMap(prev => {
      if (series == null) {
        const { [pluginId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [pluginId]: series };
    });
  }, []);
  
  // When extension series are cleared, ECharts' default merge mode (notMerge=false) keeps stale
  // series by index. Use replaceMerge to force-remove them when the count drops to zero.
  const hadExtensionSeriesRef = React.useRef(false);
  React.useEffect(() => {
    const merged = { ...extensionSeriesMap, ...(externalExtensionSeries || {}) };
    const hasAny = Object.values(merged).some(arr => Array.isArray(arr) && arr.length > 0);
    if (hadExtensionSeriesRef.current && !hasAny) {
      const instance = chartRef.current?.getEchartsInstance?.();
      if (instance) {
        instance.setOption(option, { replaceMerge: ['series'] });
      }
    }
    hadExtensionSeriesRef.current = hasAny;
  }, [extensionSeriesMap, externalExtensionSeries]); // eslint-disable-line react-hooks/exhaustive-deps

  // extensionZoom: when forecast data arrives, store the desired zoom window here.
  // This flows into the dataZoom options so ECharts applies it on the next render
  // (dispatchAction gets overridden by the simultaneous options re-render, so we use state instead).
  // Skip zoom lock in rolling/shifted (live) modes to allow chart to scroll naturally with live updates.
  const [extensionZoom, setExtensionZoom] = React.useState(null); // { startValue, endValue } | null
  React.useEffect(() => {
    if (!externalExtensionSeries) return;
    
    // In live modes (rolling/shifted), don't lock the zoom to forecast data
    // because the chart should naturally scroll with time updates.
    const isLiveMode = timeModeBadge?.mode === 'rolling' || timeModeBadge?.mode === 'shifted';
    if (isLiveMode) {
      setExtensionZoom(null);
      return;
    }
    
    let minTs = null, maxTs = null;
    for (const seriesArr of Object.values(externalExtensionSeries)) {
      if (!Array.isArray(seriesArr)) continue;
      for (const s of seriesArr) {
        if (!Array.isArray(s?.data)) continue;
        for (const pt of s.data) {
          const ts = Array.isArray(pt) ? pt[0] : pt?.value?.[0];
          if (typeof ts === 'number') {
            if (minTs === null || ts < minTs) minTs = ts;
            if (maxTs === null || ts > maxTs) maxTs = ts;
          }
        }
      }
    }
    if (minTs !== null && maxTs !== null) {
      const duration = maxTs - minTs;
      const padding = Math.max(duration * 0.3, 5 * 60 * 1000);

      setExtensionZoom({ startValue: minTs - padding, endValue: maxTs + padding });
    } else {
      setExtensionZoom(null);
    }
  }, [externalExtensionSeries, timeModeBadge]);

  // When the user navigates (requestedTimeRange changes) while extensionZoom is active,
  // release the zoom lock so the chart responds normally to back/forward navigation.
  const prevRequestedTimeRangeRef = React.useRef(requestedTimeRange);
  React.useEffect(() => {
    if (prevRequestedTimeRangeRef.current !== requestedTimeRange) {
      prevRequestedTimeRangeRef.current = requestedTimeRange;
      setExtensionZoom(null);
    }
  }, [requestedTimeRange]);

  // Watch for shouldOpenPreferences flag and open preferences panel
  React.useEffect(() => {
    if (shouldOpenPreferences && setShouldOpenPreferences) {
      setShowPreferences(true);
      setShouldOpenPreferences(false); // Reset the flag
    }
  }, [shouldOpenPreferences, setShouldOpenPreferences]);

  // Trigger callback when preferences close
  React.useEffect(() => {
    if (previousShowPreferences.current === true && showPreferences === false) {
      if (onPreferencesClose) {
        onPreferencesClose();
      }
    }
    previousShowPreferences.current = showPreferences;
  }, [showPreferences, onPreferencesClose]);
  
  // Helper: Format time mode badge text
  const formatTimeModeBadge = (mode, duration, offset) => {
    const formatDuration = (ms) => {
      const seconds = ms / 1000;
      const minutes = seconds / 60;
      const hours = minutes / 60;
      const days = hours / 24;
      
      if (days >= 1) return `${Math.round(days)} day${Math.round(days) !== 1 ? 's' : ''}`;
      if (hours >= 1) return `${Math.round(hours)} hour${Math.round(hours) !== 1 ? 's' : ''}`;
      if (minutes >= 1) return `${Math.round(minutes)} min${Math.round(minutes) !== 1 ? 's' : ''}`;
      return `${Math.round(seconds)} sec${Math.round(seconds) !== 1 ? 's' : ''}`;
    };
    
    if (mode === 'rolling') {
      return `Rolling - Last ${formatDuration(duration)}`;
    } else if (mode === 'shifted') {
      const delayText = offset > 0 ? ` - Delayed ${formatDuration(offset)}` : '';
      return `Shifted - ${formatDuration(duration)}${delayText}`;
    }
    return 'Fixed Time Range';
  };
  
  // Zoom handlers
  const handleZoomIn = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      instance.dispatchAction({
        type: 'dataZoom',
        start: 25,
        end: 75
      });
    }
  };
  
  const handleZoomOut = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      instance.dispatchAction({
        type: 'dataZoom',
        start: 0,
        end: 100
      });
    }
  };
  
  // Crosshair click handler
  const handleChartClick = React.useCallback((event) => {
    if (!crosshairEnabled) return;
    
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    
    // Get the chart's DOM element and its position
    const chartDom = instance.getDom();
    const chartRect = chartDom.getBoundingClientRect();
    
    // Calculate position relative to chart
    const x = event.clientX - chartRect.left;
    const y = event.clientY - chartRect.top;
    
    // Convert pixel coordinates to data coordinates
    const pointInGrid = instance.convertFromPixel({ seriesIndex: 0 }, [x, y]);
    if (!pointInGrid) return;
    
    const [timestamp, _value] = pointInGrid;
    
    // Get values for all visible series at this timestamp
    const option = instance.getOption();
    const series = option.series || [];
    const values = {};
    
    series.forEach((s, index) => {
      if (s.data && Array.isArray(s.data)) {
        // Find closest data point
        let closest = null;
        let minDiff = Infinity;
        
        s.data.forEach(point => {
          if (Array.isArray(point) && point.length >= 2) {
            const diff = Math.abs(point[0] - timestamp);
            if (diff < minDiff) {
              minDiff = diff;
              closest = point;
            }
          }
        });
        
        if (closest && closest[1] != null) {
          const yAxisIndex = s.yAxisIndex || 0;
          const axisId = `axis-${yAxisIndex}`;
          values[axisId] = closest[1];
        }
      }
    });
    
    setCrosshairPosition({ x, y, time: timestamp, values });
  }, [crosshairEnabled]);
  
  const handleResetZoom = () => {
    if (onResetZoom) {
      onResetZoom();
    }
  };
  // Helper: Convert dash pattern to ECharts line type
  const getDashType = (dashPattern) => {
    if (!dashPattern || dashPattern === '0' || dashPattern === 'solid') return 'solid';
    if (dashPattern === 'dashed' || dashPattern === '8 4') return 'dashed';
    if (dashPattern === 'dotted' || dashPattern === '2 2') return 'dotted';
    if (dashPattern === 'dash-dot') return [8, 4, 2, 4]; // Custom pattern
    
    // Try parsing space-delimited pattern (e.g., "5 3")
    const parts = String(dashPattern).trim().split(/\s+/);
    const numbers = parts.map(p => parseInt(p, 10)).filter(n => Number.isFinite(n) && n >= 1);
    if (numbers.length > 0) {
      return numbers; // ECharts accepts array of numbers
    }
    
    return 'solid';
  };

  // Helper: Map interpolation types to ECharts properties
  const getInterpolationConfig = (interpolation) => {
    const type = interpolation || 'linear';
    
    // ECharts supports:
    // - smooth: boolean (for smooth curves)
    // - step: 'start' | 'middle' | 'end' (for step lines)
    
    switch (type) {
      case 'monotone':
        return { smooth: true, step: false };
      
      case 'step':
      case 'stepBefore':
        return { smooth: false, step: 'start' };
      
      case 'stepAfter':
        return { smooth: false, step: 'end' };
      
      case 'linear':
      default:
        return { smooth: false, step: false };
    }
  };

  // Transform data to ECharts format
  const echartsData = React.useMemo(() => {
    if (!data || data.length === 0) {
      return { series: [], axisIndexMap: new Map(), stateOverlayBands: [], eventOverlayMarkers: [] };
    }
    
    // Build axis index map from axes config
    const axesArray = Array.isArray(axes) && axes.length > 0 ? axes : [
      { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
    ];
    
    const axisIndexMap = new Map();
    axesArray.forEach((axis, index) => {
      axisIndexMap.set(axis.id, index);
    });
    
    // Group data by tag
    const tagDataMap = new Map();
    
    data.forEach(point => {
      const tagId = String(point.tag_id);
      const time = new Date(point.ts).getTime();
      const value = Number(point.v);
      
      if (!Number.isFinite(value) || !Number.isFinite(time)) return;
      
      if (!tagDataMap.has(tagId)) {
        tagDataMap.set(tagId, new Map());
      }
      
      tagDataMap.get(tagId).set(time, value);
    });
    
    // Whether to extend anchor ghost points beyond the chart edges to preserve smooth curve shape.
    // Suppress the right anchor when extension series (e.g. forecast) are present — the forecast
    // line itself continues the series, so the trailing horizontal stub would be misleading.
    const hasExtensionData = Object.values({ ...extensionSeriesMap, ...(externalExtensionSeries || {}) })
      .some(arr => Array.isArray(arr) && arr.some(s => Array.isArray(s?.data) && s.data.length > 0));
    const extendCurveEdges = options?.extendCurveEdges ?? true;
    const extendRightEdge = extendCurveEdges && !hasExtensionData;

    // Returns the amount (ms) to push anchor points outside the chart boundary.
    // Uses average inter-sample interval when possible, otherwise 10% of the query range.
    const computeEdgeExtension = (timestamps, qStart, qEnd) => {
      if (!extendCurveEdges) return 0;
      if (timestamps.length >= 2) {
        return (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1);
      }
      return Math.max((qEnd - qStart) * 0.1, 60000);
    };

    // Helper: Fill gaps for write-on-change tags (updated 2025-10-23)
    // Persists last heartbeat and keeps it anchored at query start (left edge)
    // `interpolation` (updated 2026-07-25): for step-type series (used for bools/discrete
    // values), the left-edge anchor must HOLD the previous value flat instead of linearly
    // interpolating toward the first real point — linear interpolation of a 0/1 value
    // produces a fractional "half up" plateau which is meaningless for step-rendered data.
    const fillWriteOnChangeGaps = (tagId, tagData, interpolation) => {
      const meta = tagMetadata?.[tagId];
      const isStepType = interpolation === 'step' || interpolation === 'stepBefore' || interpolation === 'stepAfter';
      
      if (!meta?.on_change_enabled) {
        // Not a write-on-change tag - anchor line to left/right edges of the chart window
        const timestamps = Array.from(tagData.keys()).sort((a, b) => a - b);
        if (timestamps.length === 0) {
          // No data in range at all — keep empty
          return [];
        }
        const now = Date.now();
        const queryStartTime = requestedTimeRange ? new Date(requestedTimeRange.from).getTime() : (now - 3600000);
        const queryEndTime   = requestedTimeRange ? new Date(requestedTimeRange.to).getTime()   : now;
        const result = timestamps.map(time => [time, tagData.get(time)]);
        const edgeExt = computeEdgeExtension(timestamps, queryStartTime, queryEndTime);
        // Left anchor: only when extendCurveEdges is enabled AND a known prior value exists.
        // Without lastValuesBefore the tag is brand-new — no left anchor, line starts at first data point.
        if (extendCurveEdges) {
          const lvb = lastValuesBefore?.[tagId];
          if (lvb && result.length >= 1) {
            const tPrev = new Date(lvb.ts).getTime();
            const vPrev = Number(lvb.v);
            const [t0, v0] = result[0];
            const span = t0 - tPrev;
            const edgeValue = isStepType
              ? vPrev // hold flat — step series should not show an interpolated in-between value
              : (span > 0
                ? vPrev + (v0 - vPrev) * ((queryStartTime - tPrev) / span) // interpolate
                : v0);
            result.unshift([queryStartTime, edgeValue]);           // visible anchor at left edge
            result.unshift([queryStartTime - edgeExt, edgeValue]); // ghost beyond left edge
          }
          // No lvb: tag has no data before the window — skip left anchor to avoid extrapolation artifacts
        }
        // Right anchor: only when extendCurveEdges is enabled and no extension data overrides
        if (extendRightEdge) {
          const lastValue = result[result.length - 1][1];
          result.push([queryEndTime + edgeExt, lastValue]);
        }
        return result;
      }
      
      const now = Date.now();
      const queryStartTime = requestedTimeRange ? new Date(requestedTimeRange.from).getTime() : (now - 3600000);
      const queryEndTime = requestedTimeRange ? new Date(requestedTimeRange.to).getTime() : now;
      // Support both heartbeat_interval (seconds) and on_change_heartbeat_ms (milliseconds)
      const heartbeatMs = meta.on_change_heartbeat_ms || (meta.heartbeat_interval * 1000) || 60000;
      const heartbeatInterval = heartbeatMs; // Already in milliseconds
      
      // Get all timestamps from this tag's data within query window, sorted
      const timestamps = Array.from(tagData.keys()).sort((a, b) => a - b);
      
      let persistedHeartbeat = persistedHeartbeats.current[tagId];
      
      // Update persisted heartbeat with new data from query
      if (timestamps.length > 0) {
        // Get the last (most recent) heartbeat from current query data
        const lastTimestamp = timestamps[timestamps.length - 1];
        const lastValue = tagData.get(lastTimestamp);
        
        // Update persisted heartbeat
        persistedHeartbeat = {
          value: lastValue,
          originalTime: lastTimestamp,
          heartbeatInterval: heartbeatInterval
        };
        persistedHeartbeats.current[tagId] = persistedHeartbeat;
      } else if (!persistedHeartbeat && lastValuesBefore?.[tagId]) {
        // No data in query, but we have lastValuesBefore - initialize persisted heartbeat
        const lastValBefore = lastValuesBefore[tagId];
        const lastTime = new Date(lastValBefore.ts).getTime();
        const lastValue = Number(lastValBefore.v);
        
        persistedHeartbeat = {
          value: lastValue,
          originalTime: lastTime,
          heartbeatInterval: heartbeatInterval
        };
        persistedHeartbeats.current[tagId] = persistedHeartbeat;
      }
      
      // Check if persisted heartbeat has expired
      if (persistedHeartbeat) {
        const age = now - persistedHeartbeat.originalTime;
        if (age > persistedHeartbeat.heartbeatInterval) {
          delete persistedHeartbeats.current[tagId];
          persistedHeartbeat = null;
        }
      }
      
      // Strategy: Always show horizontal line for persisted heartbeat (sliding window)
      // This ensures the line appears at the left edge and slides with the window in Live mode
      const edgeExt = computeEdgeExtension(timestamps, queryStartTime, queryEndTime);
      const result = [];

      if (persistedHeartbeat) {
        // We have a valid persisted heartbeat - create horizontal line across the visible range.
        // Ghost + anchor on the left: only when a known prior value exists to interpolate from.
        // Without lastValuesBefore the tag is brand-new — skip left anchor to avoid extrapolation artifacts.
        if (extendCurveEdges) {
          const lvb = lastValuesBefore?.[tagId];
          if (lvb && timestamps.length >= 1) {
            const tPrev = new Date(lvb.ts).getTime();
            const vPrev = Number(lvb.v);
            const t0 = timestamps[0], v0 = tagData.get(t0);
            const span = t0 - tPrev;
            const edgeValue = isStepType
              ? vPrev // hold flat — step series should not show an interpolated in-between value
              : (span > 0
                ? vPrev + (v0 - vPrev) * ((queryStartTime - tPrev) / span)
                : v0);
            result.push([queryStartTime - edgeExt, edgeValue]); // ghost
            result.push([queryStartTime, edgeValue]);            // visible anchor
          }
        }
        
        // Add all actual data points from current query (if any)
        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];
          const value = tagData.get(time);
          result.push([time, value]);
        }
        
        // Right anchor: only when extendCurveEdges is enabled and no extension data overrides
        if (extendRightEdge) {
          result.push([queryEndTime + edgeExt, persistedHeartbeat.value]);
        }
      } else if (timestamps.length > 0) {
        // No persisted heartbeat, but we have data - render it normally
        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];
          const value = tagData.get(time);
          result.push([time, value]);
        }
        
        // Right anchor: only when extendCurveEdges is enabled and no extension data overrides
        if (extendRightEdge) {
          const lastValue = result[result.length - 1][1];
          result.push([queryEndTime + edgeExt, lastValue]);
        }
      }
      
      return result;
    };
    
    // Build series for each tag (excluding hidden)
    const series = tagConfigs
      .filter(tag => !tag.hidden)
      .map(tagConfig => {
        const tagId = String(tagConfig.tag_id);
        const tagData = tagDataMap.get(tagId) || new Map();
        
        // Apply write-on-change gap filling
        const values = fillWriteOnChangeGaps(tagId, tagData, tagConfig.interpolation);
        
        // Get axis index for this tag
        const axisId = tagConfig.axisId || 'default';
        const yAxisIndex = axisIndexMap.get(axisId) ?? 0;
        
        // Get interpolation configuration
        const interpolationConfig = getInterpolationConfig(tagConfig.interpolation);
        
        return {
          name: tagConfig.alias || tagConfig.tag_name || tagConfig.name || `Tag ${tagConfig.tag_id}`,
          type: 'line',
          data: values,
          smooth: interpolationConfig.smooth,
          step: interpolationConfig.step,
          showSymbol: false,
          lineStyle: {
            color: tagConfig.color || '#3b82f6',
            width: tagConfig.thickness || 2,
            type: getDashType(tagConfig.strokeType || 'solid'),
          },
          itemStyle: {
            color: tagConfig.color || '#3b82f6',
          },
          emphasis: {
            focus: 'series',
            blurScope: 'coordinateSystem',
          },
          blur: {
            lineStyle: {
              opacity: 0.15,
            },
          },
          connectNulls: false, // Changed to false so gaps beyond heartbeat show as breaks
          yAxisIndex: yAxisIndex,
        };
      });
    
    // Derive state-overlay filled bands and event-overlay markers. Built here (not in the
    // `option` memo) since tagDataMap/lastValuesBefore are already in scope. Both are returned
    // as raw descriptors (timestamps + % position) — the `option` memo turns them into a
    // pixel-accurate custom-series rect (see Phase 4: percentage-of-plot-area positioning
    // can't be expressed through markArea's axis-value coordinates, so both overlay types
    // share the same renderItem technique, using api.coord() for the true time-accurate
    // x-extent and coordSys's pixel rect for the %-based y-extent).
    const stateOverlayBands = [];
    const eventOverlayMarkers = [];
    if (Array.isArray(overlays)) {
      const nowTs = Date.now();
      const qStart = requestedTimeRange ? new Date(requestedTimeRange.from).getTime() : (nowTs - 3600000);
      const qEnd = requestedTimeRange ? new Date(requestedTimeRange.to).getTime() : nowTs;

      overlays
        .filter(o => o?.type === 'state' && o.enabled !== false)
        .forEach(overlay => {
          const tagData = tagDataMap.get(String(overlay.sourceTagId)) || new Map();
          const lvb = lastValuesBefore?.[String(overlay.sourceTagId)];
          const bands = deriveStateBands(tagData, overlay, lvb, qStart, qEnd);
          bands.forEach(band => {
            stateOverlayBands.push({
              start: band.start,
              end: band.end,
              color: band.color,
              opacity: band.opacity,
              label: band.label,
              isUnknown: band.isUnknown,
              displayPreset: overlay.displayPreset || 'fullBand',
              verticalPosition: overlay.verticalPosition ?? 0,
              height: overlay.height ?? 100,
              border: overlay.border,
              showLabel: !!overlay.label?.show,
              labelText: overlay.label?.text || undefined, // falls back to band.label at render time
              labelVerticalPosition: overlay.label?.verticalPosition ?? 50,
            });
          });
        });

      overlays
        .filter(o => o?.type === 'event' && o.enabled !== false)
        .forEach(overlay => {
          const tagData = tagDataMap.get(String(overlay.sourceTagId)) || new Map();
          const lvb = lastValuesBefore?.[String(overlay.sourceTagId)];
          const markers = deriveEventMarkers(tagData, overlay, lvb, qStart, qEnd);
          markers.forEach(marker => {
            eventOverlayMarkers.push({
              timestamp: marker.timestamp,
              color: marker.color,
              opacity: marker.opacity,
              label: marker.label,
              alignment: overlay.alignment || 'left',
              widthPx: overlay.widthPx ?? 6,
              heightPct: overlay.heightPct ?? 100,
              verticalPosition: overlay.verticalPosition ?? 0,
              displayPreset: overlay.displayPreset || 'fullHeight',
            });
          });
        });
    }

    return { series, axisIndexMap, stateOverlayBands, eventOverlayMarkers };
  }, [data, tagConfigs, axes, tagMetadata, lastValuesBefore, requestedTimeRange, options, overlays]);

  // Build ECharts option
  const option = React.useMemo(() => {
    const hasData = echartsData.series.length > 0;
    
    // Build Y-axes from axes config
    const axesArray = Array.isArray(axes) && axes.length > 0 ? axes : [
      { id: 'default', label: 'Value', orientation: 'left', domain: ['auto', 'auto'] }
    ];
    
    const yAxisConfig = axesArray.map((axis, index) => {
      // Find tags using this axis (for label)
      const tagsOnAxis = tagConfigs.filter(tag => 
        (tag.axisId || 'default') === axis.id && !tag.hidden
      );
      
      // Build label from tag names
      let labelText = axis.label || 'Value';
      if (!compactMode && tagsOnAxis.length > 0) {
        labelText = tagsOnAxis
          .map(tag => tag.alias || tag.name || `Tag ${tag.tag_id}`)
          .join(', ');
      }
      
      // Calculate offset - use manual offset if provided, otherwise auto-calculate
      const position = axis.orientation === 'right' ? 'right' : 'left';
      let offset = 0;
      
      if (axis.offset != null && axis.offset !== undefined) {
        // Use manual offset from axis configuration
        offset = axis.offset;
      } else {
        // Auto-calculate offset based on how many axes are on the same side
        const axesOnSameSide = axesArray.filter((a, i) => 
          i < index && (a.orientation === 'right' ? 'right' : 'left') === position
        );
        offset = axesOnSameSide.length * 70; // 70px offset per axis
      }
      
      // Handle domain (min/max)
      const domain = Array.isArray(axis.domain) ? axis.domain : ['auto', 'auto'];
      
      // Determine name location based on axis configuration
      // 'inside' = name appears on opposite side from numbers (inside chart area)
      // 'outside' = name appears on same side as numbers (outside chart area)  
      const nameLocation = axis.nameLocation || 'inside';
      const nameGap = axis.nameGap ?? 25; // Distance from axis line
      
      // Calculate effective name gap
      // Positive gap = name moves away from axis in the natural direction
      // For left axis: positive = moves left (outside), negative = moves right (inside)
      // For right axis: positive = moves right (outside), negative = moves left (inside)
      let effectiveNameGap = nameGap;
      if (nameLocation === 'inside') {
        // Negative gap to push name to opposite side (inside chart)
        effectiveNameGap = -Math.abs(nameGap);
      } else {
        // Positive gap to keep name on same side (outside chart)
        effectiveNameGap = Math.abs(nameGap);
      }
      
      // Resolve this axis's grid line thickness (0 = hidden)
      const yGridThickness = axis.gridLine?.thickness ?? grid.thickness ?? 1;
      
      const axisConfig = {
        type: 'value',
        name: compactMode ? '' : labelText,
        nameLocation: 'middle', // Always vertically centered
        nameGap: effectiveNameGap,
        nameRotate: 90, // Vertical text
        nameTextStyle: {
          color: '#999',
          fontSize: 12,
        },
        position: position,
        offset: offset,
        axisPointer: {
          show: true,
        },
        axisLabel: {
          color: '#999',
          formatter: (value) => {
            // Format large numbers compactly
            const absValue = Math.abs(value);
            if (absValue >= 1000000000) {
              return (value / 1000000000).toFixed(1) + 'B';
            } else if (absValue >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M';
            } else if (absValue >= 1000) {
              return (value / 1000).toFixed(1) + 'K';
            }
            return value.toFixed(0);
          }
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: '#666',
          },
        },
        splitLine: {
          show: yGridThickness > 0,
          lineStyle: {
            color: axis.gridLine?.color || grid.color || '#333',
            opacity: grid.opacity ?? 0.3,
            width: yGridThickness,
            type: getDashType(axis.gridLine?.dash || grid.dash),
          },
        },
      };
      
      // Apply min/max from domain if not 'auto'
      if (domain[0] !== 'auto' && domain[0] != null) {
        const minVal = Number(domain[0]);
        if (Number.isFinite(minVal)) {
          axisConfig.min = minVal;
        }
      }
      if (domain[1] !== 'auto' && domain[1] != null) {
        const maxVal = Number(domain[1]);
        if (Number.isFinite(maxVal)) {
          axisConfig.max = maxVal;
        }
      }
      
      return axisConfig;
    });
    
    // Build reference lines and add as markLine to series
    const processedSeries = echartsData.series.map((series, seriesIndex) => {
      // Find which axis this series uses
      const seriesAxisIndex = series.yAxisIndex;
      
      // Apply showDataPoints toggle
      const seriesWithPoints = showDataPoints
        ? { ...series, showSymbol: true, symbolSize: 6 }
        : series;
      
      // Find reference lines for this axis
      const axisId = axesArray[seriesAxisIndex]?.id || 'default';
      const linesForThisSeries = referenceLines.filter(line => {
        const lineAxisId = line.yAxisId || 'default';
        const isValid = lineAxisId === axisId && Number.isFinite(line.value);
        return isValid;
      });
      
      // Add markLine only to first series of each axis (to avoid duplicates)
      const isFirstSeriesForAxis = echartsData.series
        .slice(0, seriesIndex)
        .every(s => s.yAxisIndex !== seriesAxisIndex);
      
      if (isFirstSeriesForAxis && linesForThisSeries.length > 0) {
        return {
          ...seriesWithPoints,
          markLine: {
            symbol: 'none',
            silent: false,
            animation: false,
            label: {
              show: true,
              position: 'end',
              formatter: '{b}',
              color: '#fff',
            },
            lineStyle: {
              type: 'solid',
            },
            data: linesForThisSeries.map(line => ({
              name: line.label || '',
              yAxis: line.value,
              lineStyle: {
                color: line.color || '#ff0000',
                width: line.lineWidth || 1,
                type: getDashType(line.lineStyle || 'solid'),
              },
              label: {
                show: !!line.label,
                formatter: line.label || '',
                color: line.color || '#ff0000',
                fontSize: 12,
              },
            })),
          },
        };
      }
      
      return seriesWithPoints;
    });
    
    // If there are reference lines but no series, we need to add them differently
    // This handles the case where all series might be hidden but ref lines should still show
    if (referenceLines.length > 0 && processedSeries.length === 0) {
      // Add invisible dummy series for each axis that has reference lines
      const axesWithLines = new Set(referenceLines.map(l => l.yAxisId || 'default'));
      axesWithLines.forEach(axisId => {
        const axisIndex = echartsData.axisIndexMap.get(axisId) ?? 0;
        const linesForAxis = referenceLines.filter(l => (l.yAxisId || 'default') === axisId);
        
        if (linesForAxis.length > 0) {
          processedSeries.push({
            name: '_refline_dummy_' + axisId,
            type: 'line',
            data: [],
            yAxisIndex: axisIndex,
            showSymbol: false,
            lineStyle: { opacity: 0 },
            markLine: {
              symbol: 'none',
              silent: false,
              animation: false,
              label: {
                show: true,
                position: 'end',
                formatter: '{b}',
                color: '#fff',
              },
              data: linesForAxis.map(line => ({
                name: line.label || '',
                yAxis: line.value,
                lineStyle: {
                  color: line.color || '#ff0000',
                  width: line.lineWidth || 1,
                  type: getDashType(line.lineStyle || 'solid'),
                },
                label: {
                  show: !!line.label,
                  formatter: line.label || '',
                  color: line.color || '#ff0000',
                  fontSize: 12,
                },
              })),
            },
          });
        }
      });
    }
    
    // Merge series from chart plugin extensions (toolbar slot components push series via onSeriesChange)
    const mergedExtensionSeries = { ...extensionSeriesMap, ...(externalExtensionSeries || {}) };

    let extensionDataMaxTs = null;
    for (const extSeries of Object.values(mergedExtensionSeries)) {
      if (Array.isArray(extSeries)) {
        // Resolve _axisId → yAxisIndex so extension series bind to the correct y-axis
        const resolved = extSeries.map(s => {
          if (s._axisId == null) return s;
          const yIdx = echartsData.axisIndexMap.get(s._axisId) ?? 0;
          return { ...s, yAxisIndex: yIdx };
        });

        const resolvedWithPoints = resolved.map(s => {
          if (!showDataPoints) return s;
          if (s.type !== 'line') return s;
          if (!Array.isArray(s.data) || s.data.length === 0) return s;
          if (s._noPointToggle === true) return s;
          return {
            ...s,
            showSymbol: true,
            symbolSize: s.symbolSize ?? 6,
          };
        });

        processedSeries.push(...resolvedWithPoints);
        // Track the max timestamp across all extension series data
        for (const s of extSeries) {
          if (Array.isArray(s.data)) {
            for (const pt of s.data) {
              const ts = Array.isArray(pt) ? pt[0] : pt?.value?.[0];
              if (typeof ts === 'number' && (extensionDataMaxTs === null || ts > extensionDataMaxTs)) {
                extensionDataMaxTs = ts;
              }
            }
          }
        }
      }
    }

    const reorderedSeries = (() => {
      if (!processedSeries.length) return processedSeries;

      const groups = new Map();
      processedSeries.forEach((series, index) => {
        const { baseName, isForecast } = getLegendGrouping(series?.name);
        const key = baseName || `__series_${index}`;
        if (!groups.has(key)) groups.set(key, { base: [], forecast: [] });
        const bucket = isForecast ? groups.get(key).forecast : groups.get(key).base;
        bucket.push(series);
      });

      const ordered = [];
      const emitted = new Set();
      processedSeries.forEach((series, index) => {
        const { baseName } = getLegendGrouping(series?.name);
        const key = baseName || `__series_${index}`;
        if (emitted.has(key)) return;
        emitted.add(key);
        const group = groups.get(key);
        if (!group) return;
        ordered.push(...group.base, ...group.forecast);
      });
      return ordered;
    })();

    // Attach state-overlay bands as a single custom series of pixel-accurate filled rects.
    // Phase 4: "customBand" needs a %-of-plot-area vertical position/height, which markArea's
    // axis-value coordinates can't express without knowing the axis's resolved min/max — so
    // state bands use the same renderItem/coordSys.height technique as event markers (Phase 3),
    // just with a real time-accurate x-extent (two api.coord() calls) instead of a fixed pixel
    // width anchored to one timestamp.
    const stateOverlayBands = echartsData.stateOverlayBands || [];
    if (stateOverlayBands.length > 0) {
      reorderedSeries.push({
        name: '_state_overlay_bands_',
        type: 'custom',
        renderItem: (params, api) => {
          const b = stateOverlayBands[params.dataIndex];
          if (!b) return null;
          const coordSys = params.coordSys;
          const [xStart] = api.coord([b.start, 0]);
          const [xEnd] = api.coord([b.end, 0]);

          let top, height;
          if (b.displayPreset === 'customBand') {
            height = coordSys.height * (Math.min(Math.max(b.height, 0), 100) / 100);
            top = coordSys.y + coordSys.height * (Math.min(Math.max(b.verticalPosition, 0), 100) / 100);
          } else {
            // fullBand (default): spans the full plot height, matches old markArea behavior
            top = coordSys.y;
            height = coordSys.height;
          }

          const rectShape = { x: xStart, y: top, width: Math.max(xEnd - xStart, 0), height };
          const rect = {
            type: 'rect',
            shape: rectShape,
            style: {
              fill: b.color,
              opacity: b.opacity,
              ...(b.border?.enabled && !b.isUnknown
                ? { stroke: b.border.color || b.color, lineWidth: b.border.width || 1 }
                : {})
            },
            silent: true,
          };

          // On-chart caption (Section 7 label positioning — see temp/States and Events.md,
          // "option 1: clamp to visible edge"). Skipped for unknown/no-data bands, which have
          // no meaningful label anyway.
          const labelText = b.showLabel && !b.isUnknown ? (b.labelText || b.label) : null;
          if (!labelText) return rect;

          const viewLeft = coordSys.x;
          const viewRight = coordSys.x + coordSys.width;
          const visibleLeft = Math.max(xStart, viewLeft);
          const visibleRight = Math.min(xEnd, viewRight);
          const visibleWidth = visibleRight - visibleLeft;

          const PADDING = 6;
          const FONT_SIZE = 12;
          const MIN_WIDTH_FOR_LABEL = 24; // px — hide the caption on very narrow/just-started bands
          // Rough width estimate (avoids an expensive text-measure call every frame); if it's
          // wrong we simply hide the label rather than risk it overflowing the band.
          const estTextWidth = labelText.length * FONT_SIZE * 0.6;

          if (visibleWidth < MIN_WIDTH_FOR_LABEL || estTextWidth + PADDING * 2 > visibleWidth) {
            return rect;
          }

          // Anchored to the visible left edge (clamped), so the caption stays on-screen while
          // the band's true start has scrolled off — this math keeps it within [xStart, xEnd]
          // AND within the current viewport without needing canvas-level clipping.
          const textX = visibleLeft + PADDING;
          const textY = top + height * (Math.min(Math.max(b.labelVerticalPosition, 0), 100) / 100);

          return {
            type: 'group',
            children: [
              rect,
              {
                type: 'text',
                silent: true,
                style: {
                  text: labelText,
                  x: textX,
                  y: textY,
                  fill: getContrastingTextColor(b.color),
                  fontSize: FONT_SIZE,
                  fontWeight: 500,
                  textVerticalAlign: 'middle',
                  textAlign: 'left',
                },
              },
            ],
          };
        },
        data: stateOverlayBands.map((_, i) => i), // dummy indices; real data read via closure above
        xAxisIndex: 0,
        yAxisIndex: 0,
        z: 5, // below event markers (z:10), above the base line series
      });
    }

    // Attach event-overlay markers as a single custom series of pixel-accurate filled rects
    // (a "bar", not a stroked markLine — see temp/States and Events.md discussion). Anchored
    // to the exact timestamp via api.coord, which ECharts re-evaluates on every zoom/pan, so
    // no manual dataZoom listener is needed to keep the marker aligned.
    const eventOverlayMarkers = echartsData.eventOverlayMarkers || [];
    if (eventOverlayMarkers.length > 0) {
      reorderedSeries.push({
        name: '_event_overlay_markers_',
        type: 'custom',
        renderItem: (params, api) => {
          const m = eventOverlayMarkers[params.dataIndex];
          if (!m) return null;
          const coordSys = params.coordSys;
          const [px] = api.coord([m.timestamp, 0]);

          let top, height;
          if (m.displayPreset === 'fullHeight') {
            top = coordSys.y;
            height = coordSys.height;
          } else if (m.displayPreset === 'bottomBar') {
            height = coordSys.height * 0.08; // small fixed height, anchored to bottom
            top = coordSys.y + coordSys.height - height;
          } else {
            // customBar: fully respects configured verticalPosition/heightPct
            height = coordSys.height * (Math.min(Math.max(m.heightPct, 0), 100) / 100);
            top = coordSys.y + coordSys.height * (Math.min(Math.max(m.verticalPosition, 0), 100) / 100);
          }

          let x;
          if (m.alignment === 'center') x = px - m.widthPx / 2;
          else if (m.alignment === 'right') x = px - m.widthPx;
          else x = px; // left (default)

          return {
            type: 'rect',
            shape: { x, y: top, width: m.widthPx, height },
            style: { fill: m.color, opacity: m.opacity },
            silent: true,
          };
        },
        data: eventOverlayMarkers.map((_, i) => i), // dummy indices; real data read via closure above
        xAxisIndex: 0,
        yAxisIndex: 0,
        z: 10, // draw above state-overlay bands and lines
      });
    }

    // Overlay legend proxies. State/event overlays render as ONE combined custom series per
    // type, so per-overlay names have no real series ECharts can match in legend.data — using
    // legend.data objects with an itemStyle override doesn't work (ECharts still needs a
    // series with that name to source the icon color, otherwise it warns "series not exists"
    // and renders nothing). So add tiny invisible dummy series instead, one per legend entry,
    // named to match (state overlays with a valueMap get one proxy per enabled mapped value).
    const overlayLegendIcons = new Map(); // name -> icon shape, used by legend.data below
    (Array.isArray(overlays) ? overlays : []).forEach(overlay => {
      if (!overlay || overlay.enabled === false || overlay.showInLegend === false) return;
      const addProxy = (name, color, icon) => {
        if (!name) return;
        overlayLegendIcons.set(name, icon);
        reorderedSeries.push({
          name,
          type: 'line',
          data: [],
          showSymbol: false,
          symbol: 'none',
          lineStyle: { opacity: 0 },
          itemStyle: { color },
          silent: true,
          legendHoverLink: false,
          tooltip: { show: false },
          z: -10,
        });
      };
      if (overlay.type === 'state' && Array.isArray(overlay.valueMap) && overlay.valueMap.length > 0) {
        overlay.valueMap.forEach(entry => {
          if (entry.enabled === false) return;
          addProxy(entry.label, entry.color, 'roundRect');
        });
      } else if (overlay.type === 'state' || overlay.type === 'event') {
        addProxy(overlay.name, overlay.color, overlay.type === 'state' ? 'roundRect' : 'rect');
      }
    });

    // Calculate grid margins based on axes with offsets
    const leftAxes = yAxisConfig.filter(axis => axis.position === 'left');
    const rightAxes = yAxisConfig.filter(axis => axis.position === 'right');
    
    // Find max offset on each side and add space for labels (60px base)
    const maxLeftOffset = leftAxes.length > 0 
      ? Math.max(...leftAxes.map(a => a.offset || 0)) + 60 
      : 60;
    const maxRightOffset = rightAxes.length > 0 
      ? Math.max(...rightAxes.map(a => a.offset || 0)) + 60 
      : 60;
    
    // Use theme background color if background is transparent or black (default)
    const bgColor = background.color === 'transparent' || background.color === '#000000' || !background.color
      ? theme.palette.background.paper
      : background.color;
    
    return {
      backgroundColor: bgColor,
      animation: false,
      grid: {
        left: maxLeftOffset,
        right: maxRightOffset,
        top: compactMode ? 20 : 40,
        bottom: compactMode ? 40 : 100,
        containLabel: false, // Must be false to respect custom offsets
      },
      tooltip: {
        trigger: display.showTooltip !== false ? 'axis' : 'none',
        axisPointer: {
          type: 'line', // Always use line, custom crosshair is rendered separately
          lineStyle: {
            color: '#999',
            type: 'dashed'
          }
        },
        formatter: (params) => {
          if (!params || params.length === 0) return '';

          // Get time from ECharts payload safely (can be undefined while tooltip is kept alive).
          const firstParam = params[0] || {};
          const rawValue = firstParam.value;
          const time = Array.isArray(rawValue)
            ? rawValue[0]
            : (firstParam.axisValue ?? firstParam.axisValueLabel ?? null);
          if (time == null) return '';

          const date = new Date(time);
          if (Number.isNaN(date.getTime())) return '';
          const timeStr = date.toLocaleTimeString();
          const ms = date.getMilliseconds().toString().padStart(3, '0');
          
          // Display time header
          let html = `<div style="font-weight: 600; margin-bottom: 4px;">${timeStr}.${ms}</div>`;
          
          // For ALL visible series, compute the value at cursor time matching the series
          // interpolation mode so the tooltip agrees with the drawn line:
          //   step='start' (stepBefore) → hold last known value
          //   step='end'   (stepAfter)  → hold next value
          //   no step (linear/smooth)   → linearly interpolate between surrounding points
          const allValues = new Map();
          echartsData.series.forEach(s => {
            if (s.name.startsWith('_refline_dummy_')) return;
            const data = s.data;
            if (!data || data.length === 0) return;

            // Binary search: find last index with timestamp <= cursor time
            let lo = 0, hi = data.length - 1, prevIdx = -1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (data[mid][0] <= time) { prevIdx = mid; lo = mid + 1; }
              else { hi = mid - 1; }
            }

            const color = s.itemStyle?.color || s.lineStyle?.color || '#3b82f6';
            const nextIdx = prevIdx + 1;

            if (s.step === 'end') {
              // stepAfter: display the upcoming value
              const pt = nextIdx < data.length ? data[nextIdx] : (prevIdx >= 0 ? data[prevIdx] : null);
              if (pt && pt[1] !== null && pt[1] !== undefined) {
                allValues.set(s.name, { color, value: pt[1] });
              }
            } else if (s.step) {
              // stepBefore / step='start': last known value
              if (prevIdx >= 0 && data[prevIdx][1] !== null && data[prevIdx][1] !== undefined) {
                allValues.set(s.name, { color, value: data[prevIdx][1] });
              }
            } else {
              // linear / smooth: interpolate between surrounding points
              if (
                prevIdx >= 0 && nextIdx < data.length &&
                data[prevIdx][1] !== null && data[prevIdx][1] !== undefined &&
                data[nextIdx][1] !== null && data[nextIdx][1] !== undefined
              ) {
                const t0 = data[prevIdx][0], v0 = data[prevIdx][1];
                const t1 = data[nextIdx][0], v1 = data[nextIdx][1];
                if (t1 !== t0) {
                  const frac = (time - t0) / (t1 - t0);
                  const interpolatedValue = v0 + frac * (v1 - v0);
                  if (Number.isFinite(interpolatedValue)) {
                    allValues.set(s.name, { color, value: interpolatedValue });
                  }
                }
              } else if (prevIdx >= 0 && data[prevIdx][1] !== null && data[prevIdx][1] !== undefined) {
                // Past the last data point — show last value
                allValues.set(s.name, { color, value: data[prevIdx][1] });
              }
            }
          });
          
          // Render in series order
          echartsData.series.forEach(s => {
            if (s.name.startsWith('_refline_dummy_')) return;
            const entry = allValues.get(s.name);
            if (!entry) return;
            if (!Number.isFinite(entry.value)) return;
            html += `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${entry.color};"></span>
                <span>${s.name}: <strong>${entry.value.toFixed(2)}</strong></span>
              </div>
            `;
          });

          // States & Events (Section 7 tooltip integration — see temp/States and Events.md).
          // Independent of the curve loop above since overlays render via combined custom
          // series with dummy data, not real per-timestamp series data.
          const activeStateBands = (echartsData.stateOverlayBands || []).filter(
            b => !b.isUnknown && b.label && b.start <= time && time < b.end
          );
          if (activeStateBands.length > 0) {
            html += `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.15);"></div>`;
            activeStateBands.forEach(b => {
              const startStr = new Date(b.start).toLocaleTimeString();
              const endStr = new Date(b.end).toLocaleTimeString();
              html += `
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${b.color}; opacity: ${b.opacity};"></span>
                  <span><strong>${b.label}</strong> (${startStr}–${endStr}, ${formatOverlayDuration(b.end - b.start)})</span>
                </div>
              `;
            });
          }

          // Events are instantaneous, so "at the cursor" needs a small tolerance rather than
          // an exact match — sized relative to the visible time range.
          const rangeMs = requestedTimeRange
            ? (new Date(requestedTimeRange.to).getTime() - new Date(requestedTimeRange.from).getTime())
            : null;
          const eventTolerance = rangeMs ? Math.max(rangeMs * 0.004, 1000) : 5000;
          const nearbyEvents = (echartsData.eventOverlayMarkers || [])
            .filter(m => Math.abs(m.timestamp - time) <= eventTolerance)
            .sort((a, b) => Math.abs(a.timestamp - time) - Math.abs(b.timestamp - time));
          if (nearbyEvents.length > 0) {
            if (activeStateBands.length === 0) {
              html += `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.15);"></div>`;
            }
            nearbyEvents.forEach(m => {
              const d = new Date(m.timestamp);
              const tStr = d.toLocaleTimeString();
              const ms2 = d.getMilliseconds().toString().padStart(3, '0');
              html += `
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 8px; height: 8px; background: ${m.color}; opacity: ${m.opacity};"></span>
                  <span><strong>${m.label || 'Event'}</strong> at ${tStr}.${ms2}</span>
                </div>
              `;
            });
          }
          
          return html;
        }
      },
      legend: {
        show: display.showLegend !== false && !compactMode,
        // Exclude internal helper series (reference-line dummy series, combined states/events
        // overlay render series) from the legend — ECharts otherwise auto-populates it from
        // every series' name, which would surface raw internal names like
        // "_state_overlay_bands_". Overlay entries themselves come from the invisible proxy
        // series added above (one per overlay/mapped-value with "Show in legend" enabled),
        // matched by name so ECharts can source the icon color from itemStyle.
        data: reorderedSeries
          .filter(s => !s.name?.startsWith('_'))
          .map(s => overlayLegendIcons.has(s.name) ? { name: s.name, icon: overlayLegendIcons.get(s.name) } : s.name),
        bottom: 0,
        type: 'scroll',
        formatter: (name) => name,
        textStyle: {
          color: theme.palette.text.primary,
        },
        pageTextStyle: {
          color: theme.palette.text.primary,
        },
        selector: false,
      },
      xAxis: (() => {
        // Calculate minInterval dynamically based on time range and tick count
        let minInterval = 1000; // Default 1 second
        if (requestedTimeRange) {
          const timeRangeMs = new Date(requestedTimeRange.to).getTime() - new Date(requestedTimeRange.from).getTime();
          const tickCount = options?.xAxisTickCount ?? 5;
          const intervalPerTick = timeRangeMs / tickCount;
          minInterval = Math.max(1000, intervalPerTick / 10);
        }

        // Calculate x-axis max — extend to cover extension series data (e.g. forecast horizon),
        // but only while the extensionZoom is active. Once the user navigates away, the zoom
        // lock is released and the x-axis should follow requestedTimeRange normally.
        const xMax = requestedTimeRange
          ? (extensionZoom
            ? Math.max(new Date(requestedTimeRange.to).getTime(), extensionDataMaxTs ?? 0)
            : new Date(requestedTimeRange.to).getTime())
          : 'dataMax';

        // Resolve the X-axis (time) grid line thickness (0 = hidden)
        const xGridThickness = options?.xAxisGrid?.thickness ?? grid.thickness ?? 1;

        return {
          type: 'time',
          min: requestedTimeRange ? new Date(requestedTimeRange.from).getTime() : 'dataMin',
          max: xMax,
          boundaryGap: false,
          axisPointer: {
            show: true,
            snap: true,
          },
          axisLabel: {
            formatter: (value) => {
              const date = new Date(value);
              // Use compact format: HH:MM:SS without AM/PM for better readability
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              const seconds = date.getSeconds().toString().padStart(2, '0');
              return `${hours}:${minutes}:${seconds}`;
            },
            color: '#999',
            rotate: 0, // Keep labels horizontal for better readability
          },
          splitNumber: options?.xAxisTickCount ?? 5, // Number of X-axis ticks (configurable, default 5)
          minInterval: minInterval, // Dynamically calculated minimum interval between ticks
          axisLine: {
            lineStyle: {
              color: '#666',
            },
          },
          splitLine: {
            show: xGridThickness > 0,
            lineStyle: {
              color: options?.xAxisGrid?.color || grid.color || '#333',
              opacity: grid.opacity ?? 0.3,
              width: xGridThickness,
              type: getDashType(options?.xAxisGrid?.dash || grid.dash),
            },
          },
        };
      })(),
      yAxis: yAxisConfig,
      series: reorderedSeries,
      dataZoom: [
        {
          type: 'inside',
          ...(extensionZoom
            ? { startValue: extensionZoom.startValue, endValue: extensionZoom.endValue }
            : { start: requestedTimeRange ? 0 : undefined, end: requestedTimeRange ? 100 : undefined }),
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        {
          type: 'slider',
          show: !compactMode,
          ...(extensionZoom
            ? { startValue: extensionZoom.startValue, endValue: extensionZoom.endValue }
            : { start: requestedTimeRange ? 0 : undefined, end: requestedTimeRange ? 100 : undefined }),
          filterMode: 'none',
          height: 20,
          bottom: compactMode ? 5 : 45,
          handleIcon: 'path://M10.7,11.9H9.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4h1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z',
          handleSize: '80%',
          handleStyle: {
            color: '#fff',
            shadowBlur: 3,
            shadowColor: 'rgba(0, 0, 0, 0.6)',
            shadowOffsetX: 2,
            shadowOffsetY: 2
          },
          textStyle: {
            color: '#999',
          },
          borderColor: '#666',
        },
      ],
    };
  }, [echartsData, compactMode, axes, tagConfigs, grid, background, display, referenceLines, requestedTimeRange, getDashType, theme, showDataPoints, extensionSeriesMap, externalExtensionSeries, options, extensionZoom, getLegendGrouping]);

  // Loading state
  if (loading) {
    return (
      <Card sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={40} />
            <Typography variant="body1" color="text.secondary">
              Retrieving data, please wait...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
              Large datasets may take a few moments to load
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Check if we have no data
  const hasNoData = !data || data.length === 0;

  return (
    <>
    <Card sx={{ 
      height, 
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative',
      ...(compactMode && {
        border: 'none',
        boxShadow: 'none',
        borderRadius: 0,
      })
    }}>
      {/* Compact Mode Toggle - Always visible as floating button */}
      {onToggleCompactMode && (
        <Tooltip title={compactMode ? "Exit Compact Mode" : "Compact Mode"}>
          <IconButton 
            size="small" 
            onClick={onToggleCompactMode}
            color={compactMode ? "primary" : "default"}
            sx={{
              position: 'absolute',
              top: 60,
              left: 15,
              zIndex: 1100,
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': {
                bgcolor: 'background.paper',
                boxShadow: 2,
              }
            }}
          >
            <DashboardCustomize fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      
      <CardContent sx={{ flex: 1, p: compactMode ? 0 : 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Controls Bar - Hidden when external controls are used */}
        {!compactMode && !hideInternalControls && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
          {/* Left side - Settings button + Live controls */}
          <Stack direction="row" spacing={1} alignItems="center">
            {showPreferencesButton && (
              <Tooltip title="Chart Preferences">
                <IconButton 
                  size="small" 
                  onClick={() => setShowPreferences(!showPreferences)}
                  sx={{ 
                    color: showPreferences ? 'primary.main' : 'inherit',
                    bgcolor: showPreferences ? 'action.selected' : 'transparent'
                  }}
                >
                  <Settings fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {/* Crosshair Toggle */}
            {!showPreferences && (
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={crosshairEnabled}
                    onChange={(e) => setCrosshairEnabled(e.target.checked)}
                  />
                }
                label="Crosshair"
                sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
            )}

            {/* Live Toggle and Interval - Only show when not in preferences mode */}
            {!showPreferences && onToggleAutoRefresh && (
              <>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={autoRefreshEnabled}
                      onChange={(e) => onToggleAutoRefresh(e.target.checked)}
                    />
                  }
                  label="Live"
                  sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                />
                {autoRefreshEnabled && onRefreshIntervalChange && (
                  <>
                    <TextField
                      select
                      value={refreshIntervalValue}
                      onChange={(e) => onRefreshIntervalChange(e.target.value)}
                      size="small"
                      sx={{ 
                        minWidth: 80,
                        '& .MuiInputBase-root': { fontSize: '0.8125rem' },
                        '& .MuiInputBase-input': { py: 0.5 }
                      }}
                    >
                      <MenuItem value={'auto'} sx={{ fontSize: '0.8125rem' }}>Auto</MenuItem>
                      <MenuItem value={0.5} sx={{ fontSize: '0.8125rem' }}>0.5s</MenuItem>
                      <MenuItem value={1} sx={{ fontSize: '0.8125rem' }}>1s</MenuItem>
                      <MenuItem value={5} sx={{ fontSize: '0.8125rem' }}>5s</MenuItem>
                      <MenuItem value={'custom'} sx={{ fontSize: '0.8125rem' }}>Custom</MenuItem>
                    </TextField>
                    {refreshIntervalValue === 'custom' && onCustomRefreshIntervalChange && (
                      <TextField
                        label="Seconds"
                        type="number"
                        value={customRefreshInterval}
                        onChange={(e) => onCustomRefreshIntervalChange(parseFloat(e.target.value))}
                        size="small"
                        inputProps={{ min: 0.1, step: 0.1 }}
                        sx={{ 
                          width: 80,
                          '& .MuiInputBase-root': { fontSize: '0.8125rem' },
                          '& .MuiInputBase-input': { py: 0.5 },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem' }
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </Stack>

          {/* Right side controls */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            {/* Chart plugin toolbar slots — one per installed extension chart plugin */}
            {!showPreferences && PluginRegistry.getChartPlugins().map(plugin => (
              <ExtensionChartPlugin
                key={plugin.id}
                plugin={plugin}
                toolbarProps={{
                  tagConfigs,
                  timeRange: requestedTimeRange,
                  chartConfig: options,
                  contextType,
                  onSeriesChange: (series) => handleExtensionSeriesChange(plugin.id, series),
                }}
              />
            ))}

            {/* Unsaved changes indicator */}
            {hasUnsavedChanges && !showPreferences && (
              <Typography variant="caption" color="warning.main" sx={{ mr: 1 }}>
                Unsaved changes
              </Typography>
            )}
            
            {/* Save button - Show when changes pending and not in preferences mode */}
            {hasUnsavedChanges && !showPreferences && saveButton}
            
            {/* Zoom Controls - Only show when not in preferences mode */}
            {!showPreferences && (
              <>
                {onScrollTime && (
                  <>
                    <Tooltip title="Scroll Back 50%">
                      <IconButton size="small" onClick={() => onScrollTime('back')}>
                        <ChevronLeft fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Scroll Forward 50%">
                      <IconButton size="small" onClick={() => onScrollTime('forward')}>
                        <ChevronRight fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Zoom In">
                  <IconButton size="small" onClick={handleZoomIn}>
                    <ZoomIn fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Zoom Out">
                  <IconButton size="small" onClick={handleZoomOut}>
                    <ZoomOut fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reset Zoom & Re-query">
                  <IconButton size="small" onClick={handleResetZoom}>
                    <RestartAlt fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
        </Box>
        )}

        {/* Chart or Preferences Panel */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {showPreferences ? (
            /* Preferences Panel - fits in chart space */
            <Box sx={{ height: '100%', overflow: 'auto' }}>
              <ChartConfigPanel 
                compact={true}
                saveButton={saveButton}
                chartConfig={{
                  tagConfigs,
                  axes,
                  referenceLines,
                  overlays,
                  grid,
                  background,
                  display,
                  xAxisTickCount: options?.xAxisTickCount ?? 5,
                  extendCurveEdges: options?.extendCurveEdges ?? true,
                  // Pass through any extension-namespaced options (e.g. options.forecast from saved charts)
                  ...Object.fromEntries(
                    Object.entries(options ?? {}).filter(([k]) =>
                      !['axes', 'referenceLines', 'tags', 'grid', 'background', 'display', 'xAxisTickCount', 'extendCurveEdges'].includes(k)
                    )
                  ),
                }}
                onUpdateTagConfig={updateTagConfig}
                onUpdateAxis={updateAxis}
                onAddAxis={addAxis}
                onRemoveAxis={removeAxis}
                onAddReferenceLine={addReferenceLine}
                onUpdateReferenceLine={updateReferenceLine}
                onRemoveReferenceLine={removeReferenceLine}
                onAddOverlay={addOverlay}
                onUpdateOverlay={updateOverlay}
                onRemoveOverlay={removeOverlay}
                onMoveOverlay={moveOverlay}
                onUpdateGridConfig={updateGridConfig}
                onUpdateBackgroundConfig={updateBackgroundConfig}
                onUpdateDisplayConfig={updateDisplayConfig}
                onUpdateExtensionConfig={updateExtensionConfig}
                onUpdateChartConfig={updateChartConfig}
              />
            </Box>
          ) : (
            /* Chart */
            <>
              {/* Chart or No Data Message */}
              <Box 
                sx={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}
                onClick={handleChartClick}
              >
                {hasNoData ? (
                  /* No data message */
                  <Box sx={{ 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 1
                  }}>
                    <Typography variant="body1" color="text.secondary">
                      No data to display.
                    </Typography>
                    {contextType === 'composer' && (
                      <Typography variant="body1" color="text.secondary">
                        Click <strong>Settings</strong> to add tags and configure your chart.
                      </Typography>
                    )}
                    {contextType === 'dashboard' && (
                      <Typography variant="body1" color="text.secondary">
                        This chart has no data. Open it in Chart Composer to configure.
                      </Typography>
                    )}
                    {(contextType === 'diagnostic' || contextType === 'flow-monitor') && (
                      <Typography variant="body1" color="text.secondary">
                        Waiting for data...
                      </Typography>
                    )}
                  </Box>
                ) : (
                  /* Chart */
                  <ReactECharts
                    ref={chartRef}
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge={false}
                    lazyUpdate={true}
                  />
                )}
                
                {/* Crosshair overlay */}
                {crosshairEnabled && crosshairPosition && (
                  <Box sx={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    pointerEvents: 'none',
                    zIndex: 1000
                  }}>
                    {/* Vertical line */}
                    <Box sx={{
                      position: 'absolute',
                      left: `${crosshairPosition.x}px`,
                      top: 0,
                      bottom: 0,
                      width: `${display.crosshairThickness || 1}px`,
                      bgcolor: display.crosshairColor || '#00ff00',
                      opacity: display.crosshairOpacity ?? 0.7,
                      ...(display.crosshairPattern && display.crosshairPattern !== '0' && {
                        backgroundImage: `repeating-linear-gradient(0deg, ${display.crosshairColor || '#00ff00'} 0px, ${display.crosshairColor || '#00ff00'} ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${(parseInt(display.crosshairPattern.split(' ')[0] || 5) + parseInt(display.crosshairPattern.split(' ')[1] || 5))}px)`,
                        bgcolor: 'transparent'
                      })
                    }} />
                    
                    {/* Horizontal line */}
                    <Box sx={{
                      position: 'absolute',
                      top: `${crosshairPosition.y}px`,
                      left: 0,
                      right: 0,
                      height: `${display.crosshairThickness || 1}px`,
                      bgcolor: display.crosshairColor || '#00ff00',
                      opacity: display.crosshairOpacity ?? 0.7,
                      ...(display.crosshairPattern && display.crosshairPattern !== '0' && {
                        backgroundImage: `repeating-linear-gradient(90deg, ${display.crosshairColor || '#00ff00'} 0px, ${display.crosshairColor || '#00ff00'} ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${display.crosshairPattern.split(' ')[0] || 5}px, transparent ${(parseInt(display.crosshairPattern.split(' ')[0] || 5) + parseInt(display.crosshairPattern.split(' ')[1] || 5))}px)`,
                        bgcolor: 'transparent'
                      })
                    }} />
                    
                    {/* Time label */}
                    <Box sx={{
                      position: 'absolute',
                      left: `${crosshairPosition.x}px`,
                      bottom: 80,
                      transform: 'translateX(-50%)',
                      bgcolor: 'rgba(0, 0, 0, 0.7)',
                      color: display.crosshairColor || '#00ff00',
                      px: 1,
                      py: 0.5,
                      borderRadius: 0.5,
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {new Date(crosshairPosition.time).toLocaleTimeString()}.{new Date(crosshairPosition.time).getMilliseconds().toString().padStart(3, '0')}
                    </Box>
                    
                    {/* Y-axis values labels */}
                    {Object.entries(crosshairPosition.values).map(([axisId, value], index) => {
                      const isLeft = index % 2 === 0; // Alternate left/right for multiple axes
                      return (
                        <Box key={axisId} sx={{
                          position: 'absolute',
                          left: isLeft ? 0 : 'auto',
                          right: isLeft ? 'auto' : 0,
                          top: `${crosshairPosition.y}px`,
                          transform: 'translateY(-50%)',
                          bgcolor: 'rgba(0, 0, 0, 0.7)',
                          color: display.crosshairColor || '#00ff00',
                          px: 1,
                          py: 0.5,
                          borderRadius: 0.5,
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}>
                          {value.toFixed(2)}
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  </>
  );
});

ChartRenderer.displayName = 'ChartRenderer';

export default ChartRenderer;
