import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import ChartRenderer from '../chartComposer/ChartRenderer';
import chartComposerService from '../../services/chartComposerService';

/**
 * ChartLoader - Unified chart component that encapsulates all chart logic
 * 
 * Features:
 * - Loads chart configuration by ID
 * - Handles time mode (Fixed, Rolling, Shifted)
 * - Auto-refresh for Rolling/Shifted modes
 * - Data querying and caching
 * - Consistent behavior across Dashboard, Chart Composer, TV Mode, etc.
 * 
 * @param {string} chartId - Chart ID to load
 * @param {boolean} compactMode - Whether to use compact mode (no controls)
 * @param {number} height - Chart height in pixels
 * @param {boolean} showPreferencesButton - Whether to show preferences button
 * @param {object} overrideTimeRange - Optional time range override (for dashboard global time sync)
 * @param {boolean} autoRefreshEnabled - Whether to enable auto-refresh (auto-enabled for rolling/shifted)
 * @param {number} refreshInterval - Refresh interval in seconds (default: 5)
 * @param {function} onChartLoaded - Callback when chart is loaded
 * @param {function} onDataUpdated - Callback when data is updated
 */
const ChartLoader = ({
  chartId,
  compactMode = false,
  height = 360,
  showPreferencesButton = false,
  overrideTimeRange = null,
  autoRefreshEnabled = null, // null = auto-decide based on time mode
  refreshInterval = 5,
  onChartLoaded = null,
  onDataUpdated = null,
  // Pass-through props for ChartRenderer
  saveButton = null,
  hasUnsavedChanges = false,
  onPreferencesClose = null,
  onResetZoom = null,
  contextType = 'dashboard', // 'composer', 'dashboard', 'diagnostic', 'flow-monitor'
}) => {
  // Chart metadata
  const [chart, setChart] = useState(null);
  const [chartConfig, setChartConfig] = useState(null);
  const [chartName, setChartName] = useState('');
  
  // Time mode settings
  const [timeMode, setTimeMode] = useState('fixed');
  const [timeDuration, setTimeDuration] = useState(3600000); // 1 hour default
  const [timeOffset, setTimeOffset] = useState(0);
  const [fixedTimeRange, setFixedTimeRange] = useState(null);
  
  // Data and state
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState('');
  
  // Write-on-change metadata for heartbeat feature
  const [tagMetadata, setTagMetadata] = useState({});
  const [lastValuesBefore, setLastValuesBefore] = useState({});
  
  // Auto-refresh
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const refreshTimerRef = useRef(null);
  const hasQueriedRef = useRef(false); // Track if we've done initial query
  const queryDataRef = useRef(null); // Stable reference to queryData function
  const prevOverrideRef = useRef(null); // Track previous override value (start with null to detect initial override)
  
  // Load chart configuration
  useEffect(() => {
    let alive = true;
    hasQueriedRef.current = false; // Reset query flag when loading new chart

    (async () => {
      setLoadingChart(true);
      setError('');
      
      try {
        const loadedChart = await chartComposerService.getChart(chartId);
        if (!alive) return;
        
        setChart(loadedChart);
        setChartName(loadedChart.name || '');
        
        // Only set config if it's actually different to avoid re-render loops
        const newConfig = loadedChart.options || null;
        setChartConfig(prevConfig => {
          const prevStr = JSON.stringify(prevConfig);
          const newStr = JSON.stringify(newConfig);
          return prevStr === newStr ? prevConfig : newConfig;
        });
        
        // Extract time mode settings
        const mode = loadedChart.time_mode || 'fixed';
        // Parse as numbers (backend returns bigint as strings)
        const duration = loadedChart.time_duration ? parseInt(loadedChart.time_duration, 10) : 3600000;
        const offset = loadedChart.time_offset ? parseInt(loadedChart.time_offset, 10) : 0;
        
        setTimeMode(mode);
        setTimeDuration(duration);
        setTimeOffset(offset);
        
        if (mode === 'fixed' && loadedChart.time_from && loadedChart.time_to) {
          setFixedTimeRange({
            from: new Date(loadedChart.time_from),
            to: new Date(loadedChart.time_to),
          });
        } else {
          setFixedTimeRange(null);
        }
        
        // Auto-enable refresh for rolling/shifted modes
        if (autoRefreshEnabled !== null) {
          setIsAutoRefresh(autoRefreshEnabled);
        } else if (mode === 'rolling' || mode === 'shifted') {
          setIsAutoRefresh(true);
        } else {
          setIsAutoRefresh(false);
        }
        
        if (onChartLoaded) {
          onChartLoaded(loadedChart);
        }
      } catch (err) {
        if (alive) {
          setError(err.message || 'Failed to load chart');
          console.error('Failed to load chart:', err);
        }
      } finally {
        if (alive) setLoadingChart(false);
      }
    })();

    return () => { alive = false; };
  }, [chartId, autoRefreshEnabled, onChartLoaded]);

  // Disable auto-refresh when time range is overridden (from dashboard sync)
  useEffect(() => {
    if (overrideTimeRange && isAutoRefresh) {
      setIsAutoRefresh(false);
    }
  }, [overrideTimeRange, isAutoRefresh]);

  // Calculate effective time range based on time mode
  const calculateTimeRange = useCallback(() => {
    // Helper to ensure we have Date objects
    const ensureDateObject = (value) => {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value === 'number') return new Date(value);
      if (typeof value === 'string') return new Date(value);
      return null;
    };
    
    // Time sync override ALWAYS takes precedence (when active)
    if (overrideTimeRange) {
      return {
        from: ensureDateObject(overrideTimeRange.from),
        to: ensureDateObject(overrideTimeRange.to),
      };
    }
    
    // For fixed mode charts WITH a saved time range, use the saved range
    if (timeMode === 'fixed' && fixedTimeRange) {
      return fixedTimeRange;
    }
    
    const now = new Date();
    
    if (timeMode === 'rolling') {
      return {
        from: new Date(now.getTime() - timeDuration),
        to: now,
      };
    } else if (timeMode === 'shifted') {
      const delayedNow = now.getTime() - timeOffset;
      return {
        from: new Date(delayedNow - timeDuration),
        to: new Date(delayedNow),
      };
    } else {
      // Fixed mode fallback (no saved range)
      return {
        from: new Date(now.getTime() - 3600000),
        to: now,
      };
    }
  }, [timeMode, timeDuration, timeOffset, fixedTimeRange, overrideTimeRange]);

  // Query chart data
  const queryData = useCallback(async (isBackgroundRefresh = false) => {
    const tags = chartConfig?.tags || [];
    
    if (!chartConfig || tags.length === 0) {
      return;
    }

    const effectiveTimeRange = calculateTimeRange();
    
    if (!effectiveTimeRange || !effectiveTimeRange.from || !effectiveTimeRange.to) {
      return;
    }

    // Only show loading spinner for initial loads, not background refreshes
    if (!isBackgroundRefresh) {
      setLoading(true);
    }
    setError('');

    try {
      // Get tag IDs
      const tagIds = tags.map(t => t.tag_id).filter(Boolean);
      
      if (tagIds.length === 0) {
        setChartData([]);
        // Only reset loading state if this was an initial load
        if (!isBackgroundRefresh) {
          setLoading(false);
        }
        return;
      }

      // Fetch tag metadata to get connection_ids and write-on-change settings
      const tagMetaResponse = await chartComposerService.getTagMetadata(tagIds);
      const tagMeta = tagMetaResponse.items || [];
      const metaMap = new Map(tagMeta.map(t => [t.tag_id, t]));
      
      // Store tag metadata for write-on-change feature
      const metadataObj = {};
      tagMeta.forEach(meta => {
        metadataObj[meta.tag_id] = meta;
      });
      setTagMetadata(metadataObj);

      // Group tags by connection_id
      const tagsByConnection = new Map();
      
      tagIds.forEach(tagId => {
        const meta = metaMap.get(tagId);
        
        if (!meta || !meta.connection_id) {
          return;
        }
        
        const connId = meta.connection_id;
        if (!tagsByConnection.has(connId)) {
          tagsByConnection.set(connId, []);
        }
        tagsByConnection.get(connId).push(tagId);
      });

      // Query each connection
      const results = [];
      const lastValsBeforeObj = {};
      
      for (const [connId, tagIds] of tagsByConnection.entries()) {
        const response = await chartComposerService.queryData({
          conn_id: connId,
          tag_ids: tagIds,
          from: typeof effectiveTimeRange.from === 'string' 
            ? effectiveTimeRange.from 
            : effectiveTimeRange.from.toISOString(),
          to: typeof effectiveTimeRange.to === 'string' 
            ? effectiveTimeRange.to 
            : effectiveTimeRange.to.toISOString(),
          limit: 10000,
        });
        
        if (response.items) {
          results.push(...response.items);
        }
        
        // Store last values before query range for write-on-change tags
        if (response.last_values_before) {
          Object.assign(lastValsBeforeObj, response.last_values_before);
        }
      }
      
      setLastValuesBefore(lastValsBeforeObj);
      setChartData(results);
      
      if (onDataUpdated) {
        onDataUpdated(results);
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to query data';
      setError(errorMsg);
    } finally {
      // Only reset loading state if this was an initial load (not a background refresh)
      if (!isBackgroundRefresh) {
        setLoading(false);
      }
    }
  }, [chartConfig, calculateTimeRange, onDataUpdated]);

  // Keep queryDataRef up to date
  useEffect(() => {
    queryDataRef.current = queryData;
  }, [queryData]);

  // Auto-query once when chart config is loaded
  useEffect(() => {
    // Only run initial query once when chartConfig is first set
    if (chartConfig && !hasQueriedRef.current) {
      hasQueriedRef.current = true;
      queryDataRef.current?.(false); // false = initial load, show loading spinner
    }
  }, [chartConfig]); // Only depend on chartConfig, not queryData

  // Re-query when overrideTimeRange changes (for time sync)
  useEffect(() => {
    // Only re-query if:
    // 1. Chart config is loaded
    // 2. The override value has actually changed (not just initial mount/re-render)
    const overrideChanged = prevOverrideRef.current !== overrideTimeRange;
    
    if (chartConfig && overrideChanged) {
      queryDataRef.current?.(false); // Re-query with new time range (or original if override is null)
    }
    
    // Update previous value for next comparison
    prevOverrideRef.current = overrideTimeRange;
  }, [overrideTimeRange, chartConfig, chartId]);

  // Auto-refresh timer
  useEffect(() => {
    if (isAutoRefresh && chartConfig) {
      // Clear any existing timer
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      
      // Get saved refresh interval preferences from chart options
      const savedRefreshValue = chartConfig.refreshIntervalValue;
      const savedCustomInterval = chartConfig.customRefreshInterval;
      
      // Calculate effective refresh interval based on saved preference or prop
      let effectiveInterval;
      
      if (savedRefreshValue === 'auto' || !savedRefreshValue) {
        // Auto mode: use fastest poll rate from tags
        const tags = chartConfig?.tags || [];
        if (tags.length > 0) {
          const pollRates = tags
            .filter(tag => tag.poll_rate_ms)
            .map(tag => tag.poll_rate_ms);
          
          if (pollRates.length > 0) {
            effectiveInterval = Math.min(...pollRates);
          } else {
            effectiveInterval = 1000; // Default 1 second
          }
        } else {
          effectiveInterval = refreshInterval * 1000; // Fallback to prop
        }
      } else if (savedRefreshValue === 'custom') {
        // Custom mode: use saved custom interval
        effectiveInterval = (savedCustomInterval || refreshInterval) * 1000;
      } else {
        // Preset mode (0.5, 1, 5, etc.): use the saved value
        effectiveInterval = savedRefreshValue * 1000;
      }
      
      // Set up new timer - pass true to indicate background refresh (no loading spinner)
      refreshTimerRef.current = setInterval(() => {
        queryDataRef.current?.(true); // Use ref to avoid dependency on queryData
      }, effectiveInterval);
      
      return () => {
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
        }
      };
    }
  }, [isAutoRefresh, chartConfig, refreshInterval]); // Removed queryData dependency

  // Loading state
  if (loadingChart) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error && !chartConfig) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  // No chart configured
  if (!chartConfig) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity="info">No chart configured</Alert>
      </Box>
    );
  }

  return (
    <ChartRenderer
      data={chartData}
      tagConfigs={chartConfig.tags || []}
      axes={chartConfig.axes || []}
      referenceLines={chartConfig.referenceLines || []}
      grid={chartConfig.grid}
      background={chartConfig.background || { color: 'transparent', opacity: 1 }}
      display={chartConfig.display}
      height={height}
      loading={loading}
      showPreferencesButton={showPreferencesButton}
      compactMode={compactMode}
      contextType={contextType}
      hasUnsavedChanges={hasUnsavedChanges}
      saveButton={saveButton}
      requestedTimeRange={calculateTimeRange()}
      autoRefreshEnabled={isAutoRefresh}
      onToggleAutoRefresh={setIsAutoRefresh}
      refreshIntervalValue={refreshInterval}
      onRefreshIntervalChange={(val) => {}} // Not used in loader mode
      onPreferencesClose={onPreferencesClose}
      onResetZoom={onResetZoom || queryData}
      options={chartConfig} // Pass full chart config for options like xAxisTickCount
      tagMetadata={tagMetadata}
      lastValuesBefore={lastValuesBefore}
      timeModeBadge={{
        mode: timeMode,
        duration: timeDuration,
        offset: timeOffset,
        show: true,
      }}
    />
  );
};

export default ChartLoader;
