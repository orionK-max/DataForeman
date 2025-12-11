import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  IconButton,
  Checkbox,
  Typography,
  Box,
  Tooltip,
} from '@mui/material';
import {
  DragIndicator,
  Close,
  Edit,
  VisibilityOff,
  Visibility,
} from '@mui/icons-material';
import { useDashboard } from '../../contexts/DashboardContext';
import ChartLoader from '../chart/ChartLoader';

const DashboardWidget = ({ widgetConfig, syncGroupIndex = null }) => {
  const navigate = useNavigate();
  const {
    editMode,
    selectedWidgets,
    toggleWidgetSelection,
    removeWidget,
    updateWidgetProperty,
    globalTimeRange,
    setWidgetDataState,
  } = useDashboard();

  const [chartName, setChartName] = useState('');
  const [chartHeight, setChartHeight] = useState(320);
  const contentRef = React.useRef(null);

  const widgetId = widgetConfig.i;
  const chartId = widgetConfig.chart_id;
  const isSelected = selectedWidgets.has(widgetId);

  // Measure content height when widget resizes
  React.useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.clientHeight;
      if (height > 100) { // Only update if reasonable height
        setChartHeight(height - 0); // Minimal padding for compact view
      }
    }
  }, [widgetConfig.h, widgetConfig.w]); // Recalculate when widget dimensions change

  // Handle chart loaded callback
  const handleChartLoaded = (chart) => {
    setChartName(chart.name || '');
  };

  // Handle data updated callback
  const handleDataUpdated = (data) => {
    // DISABLED: This was causing all widgets to re-render on every data update
    // setWidgetDataState(widgetId, {
    //   items: data,
    //   loading: false,
    //   error: null,
    // });
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    // Checkboxes always work in multi-select mode
    toggleWidgetSelection(widgetId, true);
  };

  const handleRemove = () => {
    removeWidget(widgetId);
  };

  const handleToggleHideTitle = (e) => {
    e.stopPropagation();
    updateWidgetProperty(widgetId, 'hide_title', !widgetConfig.hide_title);
  };

  const handleOpenProperties = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!chartId) {
      console.error('No chartId available');
      return;
    }
    navigate(`/chart-composer/${chartId}`);
  };

  // Get sync group class name
  const getSyncGroupClass = () => {
    if (syncGroupIndex !== null) {
      return `synced-group-${syncGroupIndex % 6}`;
    }
    return '';
  };

  return (
    <Card 
      className={`dashboard-widget ${isSelected ? 'selected' : ''}`}
      sx={{
        bgcolor: 'background.paper',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: editMode ? (isSelected ? 2 : 1) : 0,
        borderColor: isSelected ? 'primary.main' : 'divider',
      }}
    >
      {/* Header */}
      <Box className="widget-header" sx={{ 
        display: (!editMode && widgetConfig.hide_title) ? 'none' : 'flex' 
      }}>
        {editMode && (
          <>
            <Checkbox
              checked={isSelected}
              onChange={handleSelect}
              size="small"
              onClick={(e) => e.stopPropagation()}
            />
            <DragIndicator className="drag-handle" />
          </>
        )}
        
        <Typography className="widget-title" variant="subtitle2" color="text.primary">
          {widgetConfig.title_override || chartName || 'Loading...'}
        </Typography>

        {syncGroupIndex !== null && (
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: [
                '#f44336',
                '#2196f3',
                '#4caf50',
                '#ff9800',
                '#9c27b0',
                '#00bcd4',
              ][syncGroupIndex % 6],
            }}
          />
        )}

        {editMode && (
          <>
            <Tooltip title={widgetConfig.hide_title ? "Show title in view mode" : "Hide title in view mode"}>
              <IconButton size="small" onClick={handleToggleHideTitle}>
                {widgetConfig.hide_title ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={handleRemove} title="Remove">
              <Close fontSize="small" />
            </IconButton>
          </>
        )}
      </Box>

      {/* Content */}
      <Box 
        ref={contentRef}
        className="widget-content" 
        sx={{ 
          flex: 1, 
          p: 0, 
          overflow: 'hidden', 
          position: 'relative',
          height: (!editMode && widgetConfig.hide_title) ? '100%' : 'calc(100% - 32px)'
        }}
      >
        <ChartLoader
          chartId={chartId}
          compactMode={true}
          height={chartHeight}
          overrideTimeRange={syncGroupIndex !== null ? globalTimeRange : null}
          onChartLoaded={handleChartLoaded}
          onDataUpdated={handleDataUpdated}
          contextType="dashboard"
        />
      </Box>
    </Card>
  );
};

export default DashboardWidget;
