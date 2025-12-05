import React, { createContext, useContext, useState, useCallback } from 'react';
import chartComposerService from '../services/chartComposerService';

const ChartComposerContext = createContext();

export const useChartComposer = () => {
  const context = useContext(ChartComposerContext);
  // Don't throw error - return null if not within provider
  // This allows ChartRenderer to work outside of ChartComposerProvider
  return context;
};

const defaultAxis = { 
  id: 'default', 
  label: 'Value', 
  orientation: 'left', 
  domain: ['auto', 'auto'] 
};

export const ChartComposerProvider = ({ children }) => {
  // State management
  
  // Data state
  const [items, setItems] = useState([]);
  const [queryList, setQueryList] = useState([]);
  const [savedTags, setSavedTags] = useState([]);
  const [savedConns, setSavedConns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Write-on-change metadata state
  const [tagMetadata, setTagMetadata] = useState({}); // { tag_id: { on_change_enabled, on_change_heartbeat_ms, ... } }
  const [lastValuesBefore, setLastValuesBefore] = useState({}); // { tag_id: { ts, v, q } }

  // Chart state
  const [chartConfig, setChartConfig] = useState({
    tagConfigs: [], // [{ tag_id, name, alias, color, thickness, strokeType, axisId, interpolation, hidden }]
    axes: [defaultAxis],
    referenceLines: [], // [{ id, value, label, color, lineWidth, lineStyle, yAxisId }]
    grid: { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' },
    background: { color: '#000000', opacity: 1 },
    display: { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
    interpolation: 'linear',
    xAxisTickCount: 5, // Default X-axis tick count
  });
  const [loadedChart, setLoadedChart] = useState(null); // { id, name, is_shared }
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [needsAutoQuery, setNeedsAutoQuery] = useState(false); // Flag to trigger auto-query after chart load

  // UI state
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [timeRange, setTimeRange] = useState({
    from: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    to: new Date(),
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5); // seconds
  const [refreshIntervalValue, setRefreshIntervalValue] = useState('auto'); // 'auto', 0.5, 1, 5, or 'custom'
  const [customRefreshInterval, setCustomRefreshInterval] = useState(5); // seconds for custom
  const [chartHeight, setChartHeight] = useState(720);
  const [originalTimeWindow, setOriginalTimeWindow] = useState(null); // For sliding window in auto-refresh
  
  // Time mode state
  const [timeMode, setTimeMode] = useState('fixed');
  const [timeDuration, setTimeDuration] = useState(3600000); // 1 hour in ms
  const [timeOffset, setTimeOffset] = useState(0);
  const [showTimeBadge, setShowTimeBadge] = useState(true);
  
  // Query optimization state
  const [smartCompression, setSmartCompression] = useState(true); // Enable smart compression by default
  const [maxDataPoints, setMaxDataPoints] = useState(10000); // Default max points
  const [limitWarning, setLimitWarning] = useState(null); // { shown: count, available: count, limit: number }

  // Preferences panel state
  const [shouldOpenPreferences, setShouldOpenPreferences] = useState(false);

  // Actions
  const updateChartConfig = useCallback((updates) => {
    setChartConfig(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  }, []);

  const updateTagConfig = useCallback((tagId, field, value) => {
    setChartConfig(prev => ({
      ...prev,
      tagConfigs: prev.tagConfigs.map(tag =>
        tag.tag_id === tagId ? { ...tag, [field]: value } : tag
      ),
    }));
    setHasUnsavedChanges(true);
  }, []);

  const addAxis = useCallback((axis) => {
    setChartConfig(prev => ({
      ...prev,
      axes: [...prev.axes, axis],
    }));
    setHasUnsavedChanges(true);
  }, []);

  const removeAxis = useCallback((axisId) => {
    if (axisId === 'default') return; // Can't remove default axis
    setChartConfig(prev => ({
      ...prev,
      axes: prev.axes.filter(a => a.id !== axisId),
    }));
    setHasUnsavedChanges(true);
  }, []);

  const addReferenceLine = useCallback((line) => {
    setChartConfig(prev => ({
      ...prev,
      referenceLines: [...prev.referenceLines, line],
    }));
    setHasUnsavedChanges(true);
  }, []);

  const removeReferenceLine = useCallback((lineId) => {
    setChartConfig(prev => ({
      ...prev,
      referenceLines: prev.referenceLines.filter(l => l.id !== lineId),
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateReferenceLine = useCallback((lineId, field, value) => {
    setChartConfig(prev => ({
      ...prev,
      referenceLines: prev.referenceLines.map(line =>
        line.id === lineId ? { ...line, [field]: value } : line
      ),
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateAxis = useCallback((axisId, field, value) => {
    setChartConfig(prev => ({
      ...prev,
      axes: prev.axes.map(axis =>
        axis.id === axisId ? { ...axis, [field]: value } : axis
      ),
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateGridConfig = useCallback((field, value) => {
    setChartConfig(prev => ({
      ...prev,
      grid: { ...prev.grid, [field]: value },
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateBackgroundConfig = useCallback((field, value) => {
    setChartConfig(prev => ({
      ...prev,
      background: { ...prev.background, [field]: value },
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateDisplayConfig = useCallback((field, value) => {
    setChartConfig(prev => ({
      ...prev,
      display: { ...prev.display, [field]: value },
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateSelectedTags = useCallback((tagIds) => {
    setSelectedTagIds(tagIds);
  }, []);

  const queryData = useCallback(async (params) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await chartComposerService.queryData(params);
      setItems(response.items || []);
      
      // Store write-on-change metadata if provided
      if (response.tag_metadata) {
        setTagMetadata(response.tag_metadata);
      } else {
        setTagMetadata({});
      }
      if (response.last_values_before) {
        setLastValuesBefore(response.last_values_before);
      } else {
        setLastValuesBefore({});
      }
      
      return response;
    } catch (err) {
      setError(err.message || 'Failed to query data');
      console.error('Query data error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSavedTags = useCallback(async (connectionId) => {
    setLoading(true);
    setError('');
    try {
      const response = await chartComposerService.getTags(connectionId);
      setSavedTags(response.tags || []); // Backend returns { tags: [...] }
    } catch (err) {
      setError(err.message || 'Failed to load tags');
      console.error('Failed to load saved tags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSavedConnections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await chartComposerService.getConnections();
      setSavedConns(response.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load connections');
      console.error('Failed to load connections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChart = useCallback(async (chartId) => {
    setLoading(true);
    setError('');
    setItems([]); // Clear any existing chart data
    try {
      const chart = await chartComposerService.getChart(chartId);
      
      // Set loaded chart metadata
      setLoadedChart({
        id: chart.id,
        name: chart.name,
        is_shared: chart.is_shared,
        is_owner: chart.is_owner,
      });
      
      // Extract and apply chart options
      if (chart.options) {
        const opts = chart.options;
        
        // First, load and normalize axes (we need this to validate tag references)
        let loadedAxes = [defaultAxis];
        if (opts.axes && Array.isArray(opts.axes)) {
          // Validate and normalize axes
          const validAxes = opts.axes
            .filter(axis => axis && typeof axis === 'object' && axis.id)
            .map(axis => ({
              id: axis.id,
              label: axis.label || 'Value',
              orientation: axis.orientation === 'right' ? 'right' : 'left',
              domain: Array.isArray(axis.domain) ? axis.domain : ['auto', 'auto'],
              offset: axis.offset ?? 0,
              nameLocation: axis.nameLocation || 'inside',
              nameGap: axis.nameGap ?? 25,
            }));
          
          if (validAxes.length > 0) {
            loadedAxes = validAxes;
          }
        }
        
        // Get set of valid axis IDs
        const validAxisIds = new Set(loadedAxes.map(a => a.id));
        const defaultAxisId = loadedAxes[0].id;
        
        // Update tag configs if present
        if (opts.tags && Array.isArray(opts.tags)) {
          // Fetch tag metadata for all tags
          const tagIds = opts.tags.map(t => t.tag_id).filter(id => id != null && Number.isFinite(id));
          
          if (tagIds.length > 0) {
            try {
              // Fetch tag metadata AND connections in parallel
              const [metadataRes, connectionsRes] = await Promise.all([
                chartComposerService.getTagMetadata(tagIds),
                chartComposerService.getConnections(),
              ]);
              
              const metadataMap = new Map();
              const connectionsMap = new Map();
              
              if (metadataRes?.items) {
                metadataRes.items.forEach(meta => {
                  metadataMap.set(meta.tag_id, meta);
                });
              }
              
              if (connectionsRes?.items) {
                connectionsRes.items.forEach(conn => {
                  connectionsMap.set(conn.id, conn.name);
                });
              }
              
              // Merge saved config with fetched metadata and fix axis references
              const enrichedTags = opts.tags.map(tagConfig => {
                const meta = metadataMap.get(tagConfig.tag_id);
                const connectionId = meta?.connection_id || tagConfig.connection_id;
                const connectionName = connectionsMap.get(connectionId) || tagConfig.connection_name;
                
                // Fix axisId if it doesn't exist in loaded axes
                let axisId = tagConfig.axisId || defaultAxisId;
                if (!validAxisIds.has(axisId)) {
                  console.warn(`Tag ${tagConfig.tag_id} references non-existent axis ${axisId}, using ${defaultAxisId}`);
                  axisId = defaultAxisId;
                }

                // Check if tag is missing from metadata response (could be deleted)
                let isDeleted = false;
                let deletionReason = null;
                if (metadataRes?.missing_tags && metadataRes.missing_tags[tagConfig.tag_id]) {
                  isDeleted = true;
                  deletionReason = metadataRes.missing_tags[tagConfig.tag_id].reason;
                }
                
                return {
                  ...tagConfig,
                  axisId, // Use validated axis ID
                  name: meta?.tag_name || tagConfig.name || `Tag ${tagConfig.tag_id}`,
                  connection_id: connectionId,
                  connection_name: connectionName,
                  data_type: meta?.data_type || tagConfig.data_type,
                  poll_rate_ms: meta?.poll_rate_ms || tagConfig.poll_rate_ms,
                  driver_type: meta?.driver_type || tagConfig.driver_type,
                  missingMeta: !meta,
                  isDeleted,
                  deletionReason,
                };
              });
              
              setChartConfig(prev => ({
                ...prev,
                tagConfigs: enrichedTags,
                axes: loadedAxes,
              }));
              
              // Set selected tag IDs
              setSelectedTagIds(tagIds);
              
              // Load savedTags for the chart's connection(s) so they appear in the available tags list
              // This is especially important for system charts that use the "System" connection
              const uniqueConnections = new Set(
                enrichedTags.map(t => t.connection_id).filter(Boolean)
              );
              
              // If all tags are from a single connection, load that connection's tags
              if (uniqueConnections.size === 1) {
                const connectionId = Array.from(uniqueConnections)[0];
                try {
                  const tagsResponse = await chartComposerService.getTags(connectionId);
                  setSavedTags(tagsResponse.tags || []);
                } catch (tagsErr) {
                  console.warn('Failed to load connection tags:', tagsErr);
                  // Not critical - chart will still load, just won't show available tags
                }
              }
            } catch (metaErr) {
              console.error('Failed to fetch tag metadata:', metaErr);
              // Still load chart config even if metadata fetch fails, but fix axis refs
              const fixedTags = opts.tags.map(tagConfig => {
                let axisId = tagConfig.axisId || defaultAxisId;
                if (!validAxisIds.has(axisId)) {
                  axisId = defaultAxisId;
                }
                return { ...tagConfig, axisId };
              });
              
              setChartConfig(prev => ({
                ...prev,
                tagConfigs: fixedTags,
                axes: loadedAxes,
              }));
              setSelectedTagIds(tagIds);
            }
          } else {
            setChartConfig(prev => ({
              ...prev,
              tagConfigs: opts.tags,
              axes: loadedAxes,
            }));
          }
        } else {
          // No tags but we have axes
          setChartConfig(prev => ({
            ...prev,
            axes: loadedAxes,
          }));
        }
        
        // Update reference lines if present
        if (opts.referenceLines && Array.isArray(opts.referenceLines)) {
          // Fix axis references in reference lines
          const fixedRefLines = opts.referenceLines.map(line => {
            let yAxisId = line.yAxisId || defaultAxisId;
            if (!validAxisIds.has(yAxisId)) {
              console.warn(`Reference line references non-existent axis ${yAxisId}, using ${defaultAxisId}`);
              yAxisId = defaultAxisId;
            }
            return { ...line, yAxisId };
          });
          
          setChartConfig(prev => ({
            ...prev,
            referenceLines: fixedRefLines,
          }));
        }
        
        // Update grid settings if present and normalize dash pattern
        if (opts.grid) {
          const normalizedGrid = { ...opts.grid };
          
          // Normalize old dash patterns to new format
          if (normalizedGrid.dash) {
            const dashMap = {
              '4 4': 'dashed',
              '8 4': 'dashed',
              '2 2': 'dotted',
              '8 4 2 4': 'dash-dot',
              '0': 'solid',
            };
            
            if (dashMap[normalizedGrid.dash]) {
              normalizedGrid.dash = dashMap[normalizedGrid.dash];
            } else if (!['solid', 'dashed', 'dotted', 'dash-dot'].includes(normalizedGrid.dash)) {
              // Unknown pattern, default to solid
              normalizedGrid.dash = 'solid';
            }
          }
          
          setChartConfig(prev => ({
            ...prev,
            grid: normalizedGrid,
          }));
        }
        
        // Update background if present
        if (opts.background) {
          setChartConfig(prev => ({
            ...prev,
            background: opts.background,
          }));
        }
        
        // Update display options if present
        if (opts.display) {
          setChartConfig(prev => ({
            ...prev,
            display: opts.display,
          }));
        }
        
        // Update interpolation if present
        if (opts.interpolation) {
          setChartConfig(prev => ({
            ...prev,
            interpolation: opts.interpolation,
          }));
        }
        
        // Restore query optimization settings
        if (opts.smartCompression !== undefined) {
          setSmartCompression(opts.smartCompression);
        }
        if (opts.maxDataPoints !== undefined) {
          setMaxDataPoints(opts.maxDataPoints);
        }
        
        // Restore X-axis tick count
        if (opts.xAxisTickCount !== undefined) {
          setChartConfig(prev => ({
            ...prev,
            xAxisTickCount: opts.xAxisTickCount,
          }));
        }
        
        // Restore auto-refresh interval settings (default to 'auto' if not saved)
        setRefreshIntervalValue(opts.refreshIntervalValue !== undefined ? opts.refreshIntervalValue : 'auto');
        if (opts.customRefreshInterval !== undefined) {
          setCustomRefreshInterval(opts.customRefreshInterval);
        }
        
        // Set time range based on time mode
        const timeMode = chart.time_mode || 'fixed';
        // Parse as numbers (backend returns bigint as strings)
        const parsedDuration = chart.time_duration ? parseInt(chart.time_duration, 10) : null;
        const parsedOffset = chart.time_offset ? parseInt(chart.time_offset, 10) : null;
        const timeDuration = (parsedDuration && !isNaN(parsedDuration)) ? parsedDuration : null;
        const timeOffset = (parsedOffset && !isNaN(parsedOffset)) ? parsedOffset : 0;
        
        let from, to;
        
        if (timeMode === 'rolling') {
          // Rolling: show last X time from now
          // Add 100ms buffer to 'to' time to account for ingestion batching delays
          // This prevents gaps on the right edge of the chart while data is in flight
          const now = Date.now();
          const duration = timeDuration || 3600000; // Default 1 hour
          from = new Date(now - duration);
          to = new Date(now + 100); // +100ms buffer for batching delay (50ms max batch age + 50ms margin)
          
          // Set originalTimeWindow for sliding window queries
          setOriginalTimeWindow(duration);
        } else if (timeMode === 'shifted') {
          // Shifted: show time range delayed by X time
          const now = Date.now();
          const duration = timeDuration || 3600000; // Default 1 hour
          const delayedNow = now - timeOffset;
          from = new Date(delayedNow - duration);
          to = new Date(delayedNow); // No buffer for shifted mode (historical data)
          
          // Set originalTimeWindow for sliding window queries
          setOriginalTimeWindow(duration);
        } else {
          // Fixed: use exact saved time range
          from = chart.time_from ? new Date(chart.time_from) : new Date(Date.now() - 60 * 60 * 1000);
          to = chart.time_to ? new Date(chart.time_to) : new Date();
          
          // Calculate and set the time window duration for sliding window queries
          const windowDuration = to.getTime() - from.getTime();
          setOriginalTimeWindow(windowDuration);
        }
        
        setTimeRange({ from, to });
        
        // Set auto-refresh based on saved live_enabled preference OR automatically enable for rolling/shifted modes
        if (chart.live_enabled !== undefined) {
          setAutoRefresh(chart.live_enabled);
        } else if (timeMode === 'rolling' || timeMode === 'shifted') {
          // Automatically enable Live mode for rolling/shifted charts if not explicitly set
          setAutoRefresh(true);
        }
        
        // Set time mode state
        const finalDuration = timeDuration || 3600000;
        const finalOffset = timeOffset;
        
        setTimeMode(timeMode);
        setTimeDuration(finalDuration);
        setTimeOffset(finalOffset);
        setShowTimeBadge(chart.show_time_badge !== false);
        
        // Store time mode info for badge display
        setLoadedChart(prev => ({
          ...prev,
          time_mode: timeMode,
          time_duration: timeDuration,
          time_offset: timeOffset,
          show_time_badge: chart.show_time_badge !== false, // default true
        }));
      }
      
      // Mark as no unsaved changes since we just loaded
      setHasUnsavedChanges(false);
      
      // Set flag to trigger auto-query
      setNeedsAutoQuery(true);
      
    } catch (err) {
      setError(err.message || 'Failed to load chart');
      console.error('Failed to load chart:', err);
      throw err; // Re-throw so caller can handle
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new blank chart
  const newChart = useCallback(() => {
    // Reset all state to defaults
    setLoadedChart(null);
    setItems([]);
    setChartConfig({
      tagConfigs: [],
      axes: [defaultAxis],
      referenceLines: [],
      grid: { color: '#cccccc', opacity: 0.3, thickness: 1, dash: 'solid' },
      background: { color: '#000000', opacity: 1 },
      display: { showLegend: true, showTooltip: true, legendPosition: 'bottom' },
      interpolation: 'linear',
    });
    setHasUnsavedChanges(false);
    setNeedsAutoQuery(false);
    setSelectedTagIds([]);
    setError('');
    setLimitWarning(null);
    
    // Reset time settings to defaults
    setTimeMode('fixed');
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    setTimeRange({ from: new Date(oneHourAgo), to: new Date(now) });
    setTimeDuration(3600000); // 1 hour
    setTimeOffset(0);
    setShowTimeBadge(true);
    setOriginalTimeWindow(3600000);
    
    // Reset auto-refresh
    setAutoRefresh(false);
    setRefreshIntervalValue(5);
    setCustomRefreshInterval(5);
    
    // Reset query optimization
    setSmartCompression(true);
    setMaxDataPoints(10000);
    
    // Open preferences panel so user can add tags
    setShouldOpenPreferences(true);
  }, []);

  // Auto-query data when a chart is loaded with tags
  React.useEffect(() => {
    // Only run if we've been flagged to auto-query
    if (!needsAutoQuery) {
      return;
    }
    
    // Check if we have the required data
    if (chartConfig.tagConfigs.length === 0 || !timeRange.from || !timeRange.to) {
      return;
    }
    
    const visibleTags = chartConfig.tagConfigs.filter(t => !t.hidden);
    
    // Check if all tags have connection_id (metadata loaded)
    const allHaveConnectionId = visibleTags.every(t => t.connection_id);
    
    if (visibleTags.length > 0 && allHaveConnectionId) {
      // Clear the flag immediately to prevent re-querying
      setNeedsAutoQuery(false);
      
      // Set loading state before querying
      setLoading(true);
      
      // Group tags by connection_id and query each connection separately
      const tagsByConnection = new Map();
      visibleTags.forEach(tag => {
        const connId = tag.connection_id;
        if (!tagsByConnection.has(connId)) {
          tagsByConnection.set(connId, []);
        }
        tagsByConnection.get(connId).push(tag.tag_id);
      });

      // Query all connections in parallel
      Promise.all(
        Array.from(tagsByConnection.entries()).map(async ([connId, tagIds]) => {
          try {
            const response = await chartComposerService.queryData({
              conn_id: connId,
              tag_ids: tagIds,
              from: timeRange.from.toISOString(),
              to: timeRange.to.toISOString(),
              limit: maxDataPoints,
              no_aggregation: !smartCompression,
            });
            return { success: true, response };
          } catch (error) {
            console.warn(`Query failed for connection ${connId}:`, error);
            return { success: false, error: error.message || 'Query failed' };
          }
        })
      ).then(results => {
        // Merge all successful results
        let merged = [];
        const mergedTagMetadata = {};
        const mergedLastValuesBefore = {};
        const errors = [];
        
        for (const result of results) {
          if (result.success) {
            const response = result.response;
            const responseItems = Array.isArray(response?.items) ? response.items : [];
            merged = merged.concat(responseItems);
            
            // Extract and merge tag metadata
            if (response?.tag_metadata && typeof response.tag_metadata === 'object') {
              Object.assign(mergedTagMetadata, response.tag_metadata);
            }
            
            // Extract and merge last values before
            if (response?.last_values_before && typeof response.last_values_before === 'object') {
              Object.assign(mergedLastValuesBefore, response.last_values_before);
            }
          } else {
            errors.push(result.error);
          }
        }
        
        // Update state with data AND metadata
        setItems(merged);
        setTagMetadata(mergedTagMetadata);
        setLastValuesBefore(mergedLastValuesBefore);
        setLoading(false);
        
        // Only show error if no data was retrieved
        if (errors.length > 0 && merged.length === 0) {
          console.error('All chart queries failed:', errors);
        } else if (errors.length > 0) {
          console.warn('Some chart queries failed but data is available:', errors);
        }
        
      }).catch(err => {
        console.error('Auto-query after chart load failed:', err);
        setNeedsAutoQuery(false); // Clear flag even on error
        setLoading(false); // Clear loading state on error
      });
    }
    // NOTE: Do NOT add smartCompression or maxDataPoints to dependencies!
    // Auto-query only runs when loading a chart (needsAutoQuery flag).
    // Manual changes to smartCompression/maxDataPoints require clicking Query button.
    // Adding them would cause unwanted re-queries when user changes settings.
  }, [needsAutoQuery, chartConfig.tagConfigs, timeRange]);

  // Auto-refresh interval - polls data at specified intervals when enabled
  React.useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    
    // Calculate interval based on refreshIntervalValue
    let interval;
    
    if (refreshIntervalValue === 'auto') {
      // Use the fastest poll rate from selected tags
      const pollRates = chartConfig.tagConfigs
        .filter(tag => !tag.hidden && tag.poll_rate_ms)
        .map(tag => tag.poll_rate_ms);
      
      if (pollRates.length > 0) {
        interval = Math.min(...pollRates);
      } else {
        interval = 1000; // Default to 1 second
      }
    } else if (refreshIntervalValue === 'custom') {
      interval = customRefreshInterval * 1000;
    } else {
      interval = refreshIntervalValue * 1000;
    }

    // Auto-refresh query function
    const performAutoRefresh = async () => {
      if (chartConfig.tagConfigs.length === 0) {
        return;
      }
      
      try {
        // For auto-refresh, use sliding window if originalTimeWindow is set
        let effectiveFrom = timeRange.from;
        let effectiveTo = timeRange.to;
        
        if (originalTimeWindow) {
          const now = Date.now();
          
          // Handle different time modes
          if (timeMode === 'shifted') {
            // Shifted mode: maintain offset from now
            const shiftedTo = now - timeOffset;
            effectiveTo = new Date(shiftedTo);
            effectiveFrom = new Date(shiftedTo - originalTimeWindow);
          } else {
            // Rolling or fixed mode: slide to now
            // Add 100ms buffer to account for ingestion batching delays
            effectiveTo = new Date(now + 100);
            effectiveFrom = new Date(now - originalTimeWindow);
          }
          
          // Update time range to reflect sliding window
          setTimeRange({ from: effectiveFrom, to: effectiveTo });
        }
        
        // Collect all tag IDs - use same approach as regular query
        const allTagIds = chartConfig.tagConfigs.map(tag => tag.tag_id);

        // Single API call for all tags - same as regular query
        // Backend will auto-detect System tags vs regular tags based on tag_id
        // and handle multi-connection queries internally
        const response = await chartComposerService.queryData({
          tag_ids: allTagIds,
          from: effectiveFrom.toISOString(),
          to: effectiveTo.toISOString(),
          limit: maxDataPoints,
          no_aggregation: !smartCompression,
        });

        // Handle response - same as regular query
        const items = Array.isArray(response?.items) ? response.items : [];
        
        // Extract and set tag metadata
        if (response?.tag_metadata && typeof response.tag_metadata === 'object') {
          setTagMetadata(response.tag_metadata);
        } else {
          setTagMetadata({});
        }
        
        // Extract and set last values before
        if (response?.last_values_before && typeof response.last_values_before === 'object') {
          setLastValuesBefore(response.last_values_before);
        } else {
          setLastValuesBefore({});
        }
        
        // Update items
        setItems(items);
      } catch (err) {
        console.error('[Auto-Refresh] Query failed:', err);
        // Don't stop auto-refresh on error, just log it
      }
    };

    // Set up interval
    const timer = setInterval(performAutoRefresh, interval);
    
    // Cleanup on unmount or when dependencies change
    return () => {
      clearInterval(timer);
    };
  }, [autoRefresh, refreshIntervalValue, customRefreshInterval, chartConfig.tagConfigs, timeRange, originalTimeWindow, timeMode, timeOffset, maxDataPoints, smartCompression]);

  const value = {
    // Data state
    items,
    setItems,
    queryList,
    setQueryList,
    savedTags,
    setSavedTags,
    savedConns,
    setSavedConns,
    loading,
    error,
    setError,
    
    // Write-on-change metadata
    tagMetadata,
    setTagMetadata,
    lastValuesBefore,
    setLastValuesBefore,

    // Chart state
    chartConfig,
    setChartConfig,
    loadedChart,
    setLoadedChart,
    hasUnsavedChanges,
    setHasUnsavedChanges,

    // UI state
    selectedTagIds,
    setSelectedTagIds,
    timeRange,
    setTimeRange,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
    refreshIntervalValue,
    setRefreshIntervalValue,
    customRefreshInterval,
    setCustomRefreshInterval,
    originalTimeWindow,
    setOriginalTimeWindow,
    chartHeight,
    setChartHeight,
    
    // Time mode state
    timeMode,
    setTimeMode,
    timeDuration,
    setTimeDuration,
    timeOffset,
    setTimeOffset,
    showTimeBadge,
    setShowTimeBadge,
    
    // Query optimization state
    smartCompression,
    setSmartCompression,
    maxDataPoints,
    setMaxDataPoints,
    limitWarning,
    setLimitWarning,

    // Preferences panel state
    shouldOpenPreferences,
    setShouldOpenPreferences,

    // Direct state setters (for custom query logic)
    setLoading,

    // Actions
    updateChartConfig,
    updateTagConfig,
    addAxis,
    updateAxis,
    removeAxis,
    addReferenceLine,
    updateReferenceLine,
    removeReferenceLine,
    updateGridConfig,
    updateBackgroundConfig,
    updateDisplayConfig,
    updateSelectedTags,
    queryData,
    loadSavedTags,
    loadChart,
    newChart,
  };

  return (
    <ChartComposerContext.Provider value={value}>
      {children}
    </ChartComposerContext.Provider>
  );
};

export default ChartComposerContext;
