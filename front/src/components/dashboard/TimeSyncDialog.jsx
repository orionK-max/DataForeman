import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Typography,
  Divider,
} from '@mui/material';
import TimeRangeSelector from '../common/TimeRangeSelector';
import { useDashboard } from '../../contexts/DashboardContext';
import chartComposerService from '../../services/chartComposerService';

const TimeSyncDialog = ({ open, onClose }) => {
  const { selectedWidgets, layout, syncTimeRange, createTimeSyncGroup } = useDashboard();
  
  const [mode, setMode] = useState('custom'); // 'custom' or chart ID
  const [timeRange, setTimeRange] = useState({
    from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  });
  const [selectedCharts, setSelectedCharts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load chart information for selected widgets
  useEffect(() => {
    const loadCharts = async () => {
      setLoading(true);
      const widgetIds = Array.from(selectedWidgets);
      const charts = [];
      
      for (const widgetId of widgetIds) {
        const widget = layout.items.find(item => item.i === widgetId);
        if (widget?.chart_id) {
          try {
            const chart = await chartComposerService.getChart(widget.chart_id);
            
            // Get time range from chart's current configuration
            let chartTimeRange = null;
            if (chart.time_from && chart.time_to) {
              chartTimeRange = {
                from: new Date(chart.time_from),
                to: new Date(chart.time_to),
              };
            }
            
            charts.push({
              widgetId,
              chartId: widget.chart_id,
              chartName: chart.name,
              timeRange: chartTimeRange,
            });
          } catch (err) {
            console.error('Failed to load chart:', err);
          }
        }
      }
      
      setSelectedCharts(charts);
      setLoading(false);
    };
    
    if (open && selectedWidgets.size > 0) {
      loadCharts();
    }
  }, [open, selectedWidgets, layout]);

  const handleApply = () => {
    let targetTimeRange = timeRange;
    
    // If a chart is selected, use its time range
    if (mode !== 'custom') {
      const chart = selectedCharts.find(c => c.chartId === mode);
      if (chart?.timeRange) {
        targetTimeRange = chart.timeRange;
      }
    }
    
    // Create a sync group from the selected widgets
    const groupId = createTimeSyncGroup();
    
    // Apply time range to all selected widgets
    const widgetIds = Array.from(selectedWidgets);
    syncTimeRange(targetTimeRange, widgetIds);
    
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sync Time Range</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Apply the same time range to {selectedWidgets.size} selected widget{selectedWidgets.size > 1 ? 's' : ''}
        </Typography>

        <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)} sx={{ mt: 2 }}>
          {/* Option to take time range from each selected chart */}
          {selectedCharts.map((chart) => (
            <FormControlLabel
              key={chart.chartId}
              value={chart.chartId}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2">Take from "{chart.chartName}"</Typography>
                  {chart.timeRange && (
                    <Typography variant="caption" color="text.secondary">
                      {new Date(chart.timeRange.from).toLocaleString()} - {new Date(chart.timeRange.to).toLocaleString()}
                    </Typography>
                  )}
                  {!chart.timeRange && (
                    <Typography variant="caption" color="text.secondary">
                      No time range set
                    </Typography>
                  )}
                </Box>
              }
            />
          ))}

          <Divider sx={{ my: 2 }} />

          {/* Custom time range option */}
          <FormControlLabel
            value="custom"
            control={<Radio />}
            label="Custom time range"
          />
        </RadioGroup>

        {mode === 'custom' && (
          <Box sx={{ mt: 2, pl: 4 }}>
            <TimeRangeSelector
              timeRange={timeRange}
              onChange={setTimeRange}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply} variant="contained" color="primary">
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TimeSyncDialog;
