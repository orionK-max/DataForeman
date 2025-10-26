import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  Slider,
  Stack,
} from '@mui/material';
import {
  Add,
  Delete,
} from '@mui/icons-material';
import { useChartComposer } from '../../contexts/ChartComposerContext';
import ConnectionSelector from './ConnectionSelector';
import QueryControls from './QueryControls';

const TABS = ['Query List', 'Series', 'Display', 'Axes & Scaling', 'References'];

const ChartConfigPanel = ({ 
  compact = false,
  saveButton = null, // Optional save button to show in header
  // Optional props - if not provided, will use ChartComposerContext
  chartConfig: propChartConfig = null,
  onUpdateChartConfig: propUpdateChartConfig = null,
  onUpdateTagConfig: propUpdateTagConfig = null,
  onUpdateAxis: propUpdateAxis = null,
  onAddAxis: propAddAxis = null,
  onRemoveAxis: propRemoveAxis = null,
  onAddReferenceLine: propAddReferenceLine = null,
  onUpdateReferenceLine: propUpdateReferenceLine = null,
  onRemoveReferenceLine: propRemoveReferenceLine = null,
  onUpdateGridConfig: propUpdateGridConfig = null,
  onUpdateBackgroundConfig: propUpdateBackgroundConfig = null,
  onUpdateDisplayConfig: propUpdateDisplayConfig = null,
}) => {
  // Try to get from context, but allow props to override
  let contextValues = null;
  try {
    contextValues = useChartComposer();
  } catch (e) {
    // Not in HistorianProvider context - that's okay if props are provided
  }

  // Use props if provided, otherwise fall back to context
  const chartConfig = propChartConfig || contextValues?.chartConfig;
  const updateChartConfig = propUpdateChartConfig || contextValues?.updateChartConfig;
  const updateTagConfig = propUpdateTagConfig || contextValues?.updateTagConfig;
  const updateAxis = propUpdateAxis || contextValues?.updateAxis;
  const addAxis = propAddAxis || contextValues?.addAxis;
  const removeAxis = propRemoveAxis || contextValues?.removeAxis;
  const addReferenceLine = propAddReferenceLine || contextValues?.addReferenceLine;
  const updateReferenceLine = propUpdateReferenceLine || contextValues?.updateReferenceLine;
  const removeReferenceLine = propRemoveReferenceLine || contextValues?.removeReferenceLine;
  const updateGridConfig = propUpdateGridConfig || contextValues?.updateGridConfig;
  const updateBackgroundConfig = propUpdateBackgroundConfig || contextValues?.updateBackgroundConfig;
  const updateDisplayConfig = propUpdateDisplayConfig || contextValues?.updateDisplayConfig;

  // Validate that we have the required data
  if (!chartConfig) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">
          Chart configuration not available. Please provide chartConfig prop or use within HistorianProvider.
        </Typography>
      </Box>
    );
  }

  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (newValue) => {
    setActiveTab(newValue);
  };


  // Generate a unique ID
  const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleAddAxis = () => {
    const newId = generateId();
    const axesCount = chartConfig.axes.length;
    addAxis({
      id: newId,
      label: `Axis ${axesCount + 1}`,
      orientation: axesCount % 2 === 0 ? 'left' : 'right',
      domain: ['auto', 'auto'],
    });
  };

  const handleAddReferenceLine = () => {
    const newId = generateId();
    const firstAxisId = chartConfig.axes[0]?.id || 'default';
    addReferenceLine({
      id: newId,
      value: 50,
      label: 'Reference',
      color: '#9ca3af',
      lineWidth: 2,
      lineStyle: '8 4',
      yAxisId: firstAxisId,
    });
  };

  const interpolationOptions = [
    { value: 'linear', label: 'Linear' },
    { value: 'monotone', label: 'Smooth' },
    { value: 'step', label: 'Step' },
    { value: 'stepBefore', label: 'Step Before' },
    { value: 'stepAfter', label: 'Step After' },
  ];

  // Validate dash pattern: space-delimited numbers 1-100
  const validateDashPattern = (pattern) => {
    if (!pattern || pattern.trim() === '' || pattern === '0') return { valid: true, value: '0' };
    
    const parts = pattern.trim().split(/\s+/);
    const numbers = [];
    
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (!Number.isFinite(num) || num < 1 || num > 100) {
        return { valid: false, error: 'All numbers must be 1-100' };
      }
      numbers.push(num);
    }
    
    if (numbers.length === 0) {
      return { valid: false, error: 'Enter at least one number' };
    }
    
    return { valid: true, value: numbers.join(' ') };
  };

  const gridDashOptions = [
    { value: '', label: 'Solid' },
    { value: '4 4', label: 'Dashed (4 4)' },
    { value: '8 4', label: 'Dashed (8 4)' },
    { value: '2 2', label: 'Dotted (2 2)' },
    { value: '8 4 2 4', label: 'Dash-Dot' },
  ];

  const lineStyleOptions = [
    { value: '0', label: 'Solid' },
    { value: '8 4', label: 'Dashed' },
    { value: '2 2', label: 'Dotted' },
    { value: '8 4 2 4', label: 'Dash-Dot' },
  ];

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 0: // Query List
        return (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* Left side - Connection & Tag Selection */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <ConnectionSelector />
            </Box>
            
            {/* Right side - Query Controls */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <QueryControls />
            </Box>
          </Box>
        );
        
      case 1: // Series
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {chartConfig.tagConfigs.length === 0 ? (
              <Box sx={{ 
                p: 4, 
                textAlign: 'center', 
                bgcolor: 'action.hover',
                borderRadius: 1,
                border: '1px dashed',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" color="text.secondary">
                  No tags selected
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                  Query data to configure series
                </Typography>
              </Box>
            ) : (
              <>
                {/* Table Header */}
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '280px 60px 60px 120px 110px 100px 80px', 
                  gap: 1, 
                  px: 1.5,
                  py: 0.75,
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                  borderBottom: '2px solid',
                  borderColor: 'divider',
                  bgcolor: 'action.hover'
                }}>
                  <div>Alias / Connection/Tag</div>
                  <div style={{ textAlign: 'center' }}>Color</div>
                  <div style={{ textAlign: 'center' }}>Width</div>
                  <div style={{ textAlign: 'center' }}>Pattern</div>
                  <div style={{ textAlign: 'center' }}>Interpolation</div>
                  <div style={{ textAlign: 'center' }}>Axis</div>
                  <div style={{ textAlign: 'center' }}>Hidden</div>
                </Box>
                
                {/* Tag Rows */}
                {chartConfig.tagConfigs.map((tag) => (
                  <Box 
                    key={tag.tag_id} 
                    sx={{ 
                      display: 'grid', 
                      gridTemplateColumns: '280px 60px 60px 120px 110px 100px 80px', 
                      gap: 1, 
                      alignItems: 'center',
                      px: 1.5,
                      py: 1,
                      bgcolor: tag.hidden ? 'action.hover' : 'background.paper',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        boxShadow: 1
                      }
                    }}
                  >
                    {/* Alias / Connection/Tag */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <TextField
                        value={tag.alias || ''}
                        onChange={(e) => updateTagConfig(tag.tag_id, 'alias', e.target.value)}
                        placeholder="Alias"
                        size="small"
                        sx={{ 
                          width: 120,
                          flexShrink: 0,
                          '& .MuiInputBase-root': { 
                            fontSize: '0.75rem',
                            height: 28,
                            px: 0.75
                          }
                        }}
                      />
                      {tag.connection_id && tag.name && (
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            fontSize: '0.6875rem', 
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'monospace'
                          }}
                          title={`${tag.connection_id}/${tag.name}`}
                        >
                          {tag.name}
                        </Typography>
                      )}
                    </Box>
                    
                    {/* Color */}
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={tag.color || '#3b82f6'}
                        onChange={(e) => updateTagConfig(tag.tag_id, 'color', e.target.value)}
                        style={{ 
                          width: 40, 
                          height: 28, 
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    </Box>
                    
                    {/* Line Width */}
                    <TextField
                      value={tag.thickness || 2}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val === '') {
                          updateTagConfig(tag.tag_id, 'thickness', 2);
                        } else {
                          const num = parseInt(val);
                          updateTagConfig(tag.tag_id, 'thickness', Math.min(8, Math.max(1, num)));
                        }
                      }}
                      size="small"
                      sx={{ 
                        '& .MuiInputBase-root': { 
                          fontSize: '0.75rem',
                          height: 28,
                          px: 0.75
                        },
                        '& input': { textAlign: 'center' }
                      }}
                    />
                    
                    {/* Line Pattern (space-delimited 1-100, e.g., "1 2 1" or "50 30") */}
                    <TextField
                      value={tag.strokeType || '0'}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateTagConfig(tag.tag_id, 'strokeType', val);
                      }}
                      onBlur={(e) => {
                        const val = e.target.value;
                        const validation = validateDashPattern(val);
                        if (validation.valid) {
                          updateTagConfig(tag.tag_id, 'strokeType', validation.value);
                        } else {
                          // Reset to previous valid value if invalid
                          updateTagConfig(tag.tag_id, 'strokeType', tag.strokeType || '0');
                        }
                      }}
                      placeholder="e.g., 10 5 or 0 for solid"
                      title="Enter space-separated numbers (1-100) for dash pattern. Example: '10 5' = 10px dash, 5px gap. Use '0' for solid line."
                      size="small"
                      sx={{ 
                        '& .MuiInputBase-root': { 
                          fontSize: '0.75rem',
                          height: 28,
                          px: 0.75
                        },
                        '& input': { textAlign: 'center' }
                      }}
                    />
                    
                    {/* Interpolation */}
                    <Select
                      value={tag.interpolation || 'monotone'}
                      onChange={(e) => updateTagConfig(tag.tag_id, 'interpolation', e.target.value)}
                      size="small"
                      sx={{ 
                        fontSize: '0.75rem',
                        height: 28,
                        '& .MuiSelect-select': { 
                          fontSize: '0.75rem',
                          py: 0.5,
                          px: 1
                        }
                      }}
                    >
                      {interpolationOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.75rem' }}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                    
                    {/* Axis */}
                    <Select
                      value={tag.axisId || 'default'}
                      onChange={(e) => updateTagConfig(tag.tag_id, 'axisId', e.target.value)}
                      size="small"
                      sx={{ 
                        fontSize: '0.75rem',
                        height: 28,
                        '& .MuiSelect-select': { 
                          fontSize: '0.75rem',
                          py: 0.5,
                          px: 1
                        }
                      }}
                    >
                      {chartConfig.axes.map(axis => (
                        <MenuItem key={axis.id} value={axis.id} sx={{ fontSize: '0.75rem' }}>{axis.label}</MenuItem>
                      ))}
                    </Select>
                    
                    {/* Hidden Checkbox */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <Checkbox
                        checked={!!tag.hidden}
                        onChange={(e) => updateTagConfig(tag.tag_id, 'hidden', e.target.checked)}
                        sx={{ 
                          p: 0,
                          '& .MuiSvgIcon-root': { fontSize: 20 }
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </>
            )}
          </Box>
        );

      case 2: // Display
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Legend and Tooltip - Outside Table */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', px: 1.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={chartConfig.display?.showLegend === true}
                    onChange={(e) => updateDisplayConfig('showLegend', e.target.checked)}
                    sx={{ p: 0.5, '& .MuiSvgIcon-root': { fontSize: 20 } }}
                  />
                }
                label="Legend"
                sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
              />
              {chartConfig.display?.showLegend && (
                <Select
                  value={chartConfig.display?.legendPosition || 'bottom'}
                  onChange={(e) => updateDisplayConfig('legendPosition', e.target.value)}
                  size="small"
                  sx={{ 
                    fontSize: '0.75rem',
                    height: 28,
                    minWidth: 80,
                    '& .MuiSelect-select': { 
                      fontSize: '0.75rem',
                      py: 0.5,
                      px: 1
                    }
                  }}
                >
                  <MenuItem value="top" sx={{ fontSize: '0.75rem' }}>Top</MenuItem>
                  <MenuItem value="bottom" sx={{ fontSize: '0.75rem' }}>Bottom</MenuItem>
                </Select>
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={chartConfig.display?.showTooltip === true}
                    onChange={(e) => updateDisplayConfig('showTooltip', e.target.checked)}
                    sx={{ p: 0.5, '& .MuiSvgIcon-root': { fontSize: 20 } }}
                  />
                }
                label="Tooltip"
                sx={{ m: 0, ml: 2, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
              />
            </Box>

            {/* Header Row */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 60px 60px 140px 120px', 
              gap: 1, 
              alignItems: 'center',
              px: 1.5,
              py: 0.75,
              bgcolor: 'action.hover',
              borderRadius: 1
            }}>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary' }}>
                Property
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Color
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Width
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Opacity
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Pattern
              </Typography>
            </Box>

            {/* Crosshair Row */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 60px 60px 140px 120px', 
              gap: 1, 
              alignItems: 'center',
              px: 1.5,
              py: 1,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                bgcolor: 'action.hover',
                boxShadow: 1
              }
            }}>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                Crosshair
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="color"
                  value={chartConfig.display?.crosshairColor || '#00ff00'}
                  onChange={(e) => updateDisplayConfig('crosshairColor', e.target.value)}
                  style={{ 
                    width: 40, 
                    height: 28, 
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              </Box>
              <TextField
                value={chartConfig.display?.crosshairThickness || 1}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  if (val === '') {
                    updateDisplayConfig('crosshairThickness', 1);
                  } else {
                    const num = parseInt(val);
                    updateDisplayConfig('crosshairThickness', Math.min(5, Math.max(1, num)));
                  }
                }}
                size="small"
                sx={{ 
                  '& .MuiInputBase-root': { 
                    fontSize: '0.75rem',
                    height: 28,
                    px: 0.75
                  },
                  '& input': { textAlign: 'center' }
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Slider
                  value={chartConfig.display?.crosshairOpacity ?? 0.7}
                  onChange={(e, value) => updateDisplayConfig('crosshairOpacity', value)}
                  min={0}
                  max={1}
                  step={0.1}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <Typography variant="caption" sx={{ minWidth: 35, textAlign: 'right', fontSize: '0.6875rem' }}>
                  {Math.round((chartConfig.display?.crosshairOpacity ?? 0.7) * 100)}%
                </Typography>
              </Box>
              <TextField
                value={chartConfig.display?.crosshairPattern || '0'}
                onChange={(e) => updateDisplayConfig('crosshairPattern', e.target.value)}
                onBlur={(e) => {
                  const val = e.target.value;
                  const validation = validateDashPattern(val);
                  if (validation.valid) {
                    updateDisplayConfig('crosshairPattern', validation.value);
                  } else {
                    updateDisplayConfig('crosshairPattern', chartConfig.display?.crosshairPattern || '0');
                  }
                }}
                placeholder="e.g., 10 5 or 0 for solid"
                title="Space-separated numbers 1-100. e.g., '10 5'"
                size="small"
                sx={{ 
                  '& .MuiInputBase-root': { 
                    fontSize: '0.75rem',
                    height: 28,
                    px: 0.75
                  },
                  '& input': { textAlign: 'center' }
                }}
              />
            </Box>

            {/* Grid Row */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 60px 60px 140px 120px', 
              gap: 1, 
              alignItems: 'center',
              px: 1.5,
              py: 1,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                bgcolor: 'action.hover',
                boxShadow: 1
              }
            }}>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                Grid
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="color"
                  value={chartConfig.grid?.color || '#cccccc'}
                  onChange={(e) => updateGridConfig('color', e.target.value)}
                  style={{ 
                    width: 40, 
                    height: 28, 
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              </Box>
              <TextField
                value={chartConfig.grid?.thickness ?? 1}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  if (val === '') {
                    updateGridConfig('thickness', 1);
                  } else {
                    const num = parseFloat(val);
                    updateGridConfig('thickness', Math.min(5, Math.max(0.5, num)));
                  }
                }}
                size="small"
                sx={{ 
                  '& .MuiInputBase-root': { 
                    fontSize: '0.75rem',
                    height: 28,
                    px: 0.75
                  },
                  '& input': { textAlign: 'center' }
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Slider
                  value={chartConfig.grid?.opacity ?? 0.3}
                  onChange={(e, value) => updateGridConfig('opacity', value)}
                  min={0}
                  max={1}
                  step={0.1}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <Typography variant="caption" sx={{ minWidth: 35, textAlign: 'right', fontSize: '0.6875rem' }}>
                  {Math.round((chartConfig.grid?.opacity ?? 0.3) * 100)}%
                </Typography>
              </Box>
              <TextField
                value={chartConfig.grid?.dash || '4 4'}
                onChange={(e) => updateGridConfig('dash', e.target.value)}
                onBlur={(e) => {
                  const val = e.target.value;
                  const validation = validateDashPattern(val);
                  if (validation.valid) {
                    updateGridConfig('dash', validation.value);
                  } else {
                    updateGridConfig('dash', chartConfig.grid?.dash || '4 4');
                  }
                }}
                placeholder="e.g., 10 5 or 0 for solid"
                title="Space-separated numbers 1-100. e.g., '4 4'"
                size="small"
                sx={{ 
                  '& .MuiInputBase-root': { 
                    fontSize: '0.75rem',
                    height: 28,
                    px: 0.75
                  },
                  '& input': { textAlign: 'center' }
                }}
              />
            </Box>

            {/* Background Row */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 60px auto', 
              gap: 1, 
              alignItems: 'center',
              px: 1.5,
              py: 1,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                bgcolor: 'action.hover',
                boxShadow: 1
              }
            }}>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                Background
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="color"
                  value={chartConfig.background?.color || '#000000'}
                  onChange={(e) => updateBackgroundConfig('color', e.target.value)}
                  style={{ 
                    width: 40, 
                    height: 28, 
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              </Box>
              <Box />
            </Box>
          </Box>
        );

      case 3: // Axes & Scaling
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>
              Configure Y axes with custom scaling. Tags are assigned to axes in the Series tab.
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, mb: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontSize: '0.8125rem' }}>
                Y Axes ({chartConfig.axes.length})
              </Typography>
              <Button 
                onClick={handleAddAxis} 
                variant="contained" 
                size="small"
                startIcon={<Add />}
              >
                Add Axis
              </Button>
            </Box>

            {/* Table Header */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: '180px 100px 160px 70px 100px 80px 60px', 
              gap: 1, 
              alignItems: 'center',
              px: 1.5,
              py: 0.75,
              bgcolor: 'action.hover',
              borderRadius: 1
            }}>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary' }}>
                Label
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Position
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Range (min – max)
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Offset
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Name Position
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                Name Offset
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
              </Typography>
            </Box>

            {chartConfig.axes.map((axis) => (
              <Box 
                key={axis.id}
                sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '180px 100px 160px 70px 100px 80px 60px', 
                  gap: 1, 
                  alignItems: 'center',
                  px: 1.5,
                  py: 1,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: 'action.hover',
                    boxShadow: 1
                  }
                }}
              >
                {/* Label */}
                <TextField
                  value={axis.label || ''}
                  onChange={(e) => updateAxis(axis.id, 'label', e.target.value)}
                  size="small"
                  placeholder="Axis label"
                  sx={{ 
                    '& .MuiInputBase-root': { 
                      fontSize: '0.75rem',
                      height: 28,
                      px: 0.75
                    }
                  }}
                />
                
                {/* Position */}
                <Select
                  value={axis.orientation || 'left'}
                  onChange={(e) => updateAxis(axis.id, 'orientation', e.target.value)}
                  size="small"
                  sx={{ 
                    fontSize: '0.75rem',
                    height: 28,
                    '& .MuiSelect-select': { 
                      fontSize: '0.75rem',
                      py: 0.5,
                      px: 1
                    }
                  }}
                >
                  <MenuItem value="left" sx={{ fontSize: '0.75rem' }}>Left</MenuItem>
                  <MenuItem value="right" sx={{ fontSize: '0.75rem' }}>Right</MenuItem>
                </Select>
                
                {/* Range */}
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    value={axis.domain?.[0] === 'auto' ? 'auto' : (axis.domain?.[0] ?? 'auto')}
                    onChange={(e) => {
                      const val = e.target.value === 'auto' ? 'auto' : e.target.value;
                      const domain = [...(axis.domain || ['auto', 'auto'])];
                      domain[0] = val;
                      updateAxis(axis.id, 'domain', domain);
                    }}
                    placeholder="min"
                    sx={{ 
                      width: 75, 
                      '& .MuiInputBase-root': { 
                        fontSize: '0.75rem',
                        height: 28,
                        px: 0.75
                      },
                      '& input': { textAlign: 'center' }
                    }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>–</Typography>
                  <TextField
                    size="small"
                    value={axis.domain?.[1] === 'auto' ? 'auto' : (axis.domain?.[1] ?? 'auto')}
                    onChange={(e) => {
                      const val = e.target.value === 'auto' ? 'auto' : e.target.value;
                      const domain = [...(axis.domain || ['auto', 'auto'])];
                      domain[1] = val;
                      updateAxis(axis.id, 'domain', domain);
                    }}
                    placeholder="max"
                    sx={{ 
                      width: 75, 
                      '& .MuiInputBase-root': { 
                        fontSize: '0.75rem',
                        height: 28,
                        px: 0.75
                      },
                      '& input': { textAlign: 'center' }
                    }}
                  />
                </Box>
                
                {/* Offset */}
                <TextField
                  size="small"
                  type="number"
                  value={axis.offset ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateAxis(axis.id, 'offset', isNaN(val) ? 0 : val);
                  }}
                  placeholder="0"
                  sx={{ 
                    '& .MuiInputBase-root': { 
                      fontSize: '0.75rem',
                      height: 28,
                      px: 0.75
                    },
                    '& input': { 
                      textAlign: 'center',
                      // Hide number input spinner arrows
                      '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                        WebkitAppearance: 'none',
                        margin: 0,
                      },
                      '&[type=number]': {
                        MozAppearance: 'textfield',
                      },
                    }
                  }}
                />
                
                {/* Name Position */}
                <Select
                  value={axis.nameLocation || 'inside'}
                  onChange={(e) => updateAxis(axis.id, 'nameLocation', e.target.value)}
                  size="small"
                  sx={{ 
                    fontSize: '0.75rem',
                    height: 28,
                    '& .MuiSelect-select': { 
                      fontSize: '0.75rem',
                      py: 0.5,
                      px: 1
                    }
                  }}
                >
                  <MenuItem value="inside" sx={{ fontSize: '0.75rem' }}>Inside</MenuItem>
                  <MenuItem value="outside" sx={{ fontSize: '0.75rem' }}>Outside</MenuItem>
                </Select>
                
                {/* Name Offset */}
                <TextField
                  size="small"
                  type="number"
                  value={axis.nameGap ?? 25}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateAxis(axis.id, 'nameGap', isNaN(val) ? 25 : val);
                  }}
                  placeholder="25"
                  sx={{ 
                    '& .MuiInputBase-root': { 
                      fontSize: '0.75rem',
                      height: 28,
                      px: 0.75
                    },
                    '& input': { 
                      textAlign: 'center',
                      // Hide number input spinner arrows
                      '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                        WebkitAppearance: 'none',
                        margin: 0,
                      },
                      '&[type=number]': {
                        MozAppearance: 'textfield',
                      },
                    }
                  }}
                />
                
                {/* Remove Button */}
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  {axis.id !== 'default' && (
                    <IconButton 
                      size="small" 
                      color="error" 
                      onClick={() => removeAxis(axis.id)}
                      title="Remove axis"
                      sx={{ p: 0.5 }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Box>
            ))}

            {/* X-Axis Configuration */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, mt: 3, mb: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontSize: '0.8125rem' }}>
                X-Axis (Time)
              </Typography>
            </Box>

            <Box sx={{ 
              px: 1.5,
              py: 1.5,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                  Time Tick Density
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem', minWidth: 40 }}>
                    Less
                  </Typography>
                  <Slider
                    value={chartConfig.xAxisTickCount ?? 5}
                    onChange={(e, value) => {
                      updateChartConfig({ xAxisTickCount: value });
                    }}
                    min={2}
                    max={15}
                    step={1}
                    marks
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem', minWidth: 40, textAlign: 'right' }}>
                    More
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem', fontStyle: 'italic', textAlign: 'center' }}>
                  Adjust the number of time labels shown on the X-axis
                </Typography>
              </Box>
            </Box>
          </Box>
        );

      case 4: // References
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button 
              onClick={handleAddReferenceLine} 
              variant="contained" 
              size="small"
              startIcon={<Add />}
              sx={{ alignSelf: 'flex-start', mb: 0.5 }}
            >
              Add Reference Line
            </Button>

            {(!chartConfig.referenceLines || chartConfig.referenceLines.length === 0) ? (
              <Box sx={{ 
                p: 4, 
                textAlign: 'center', 
                bgcolor: 'action.hover',
                borderRadius: 1,
                border: '1px dashed',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" color="text.secondary">
                  No reference lines configured
                </Typography>
              </Box>
            ) : (
              <>
                {/* Table Header */}
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '140px 60px 80px 100px 60px 120px 60px', 
                  gap: 1, 
                  alignItems: 'center',
                  px: 1.5,
                  py: 0.75,
                  bgcolor: 'action.hover',
                  borderRadius: 1
                }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary' }}>
                    Label
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                    Color
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                    Value
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                    Axis
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                    Width
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                    Pattern
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}>
                  </Typography>
                </Box>

                {/* Reference Line Rows */}
                {chartConfig.referenceLines.map((line) => (
                  <Box 
                    key={line.id}
                    sx={{ 
                      display: 'grid', 
                      gridTemplateColumns: '140px 60px 80px 100px 60px 120px 60px', 
                      gap: 1, 
                      alignItems: 'center',
                      px: 1.5,
                      py: 1,
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        boxShadow: 1
                      }
                    }}
                  >
                    {/* Label */}
                    <TextField
                      value={line.label || ''}
                      onChange={(e) => updateReferenceLine(line.id, 'label', e.target.value)}
                      size="small"
                      placeholder="Label"
                      sx={{ 
                        '& .MuiInputBase-root': { 
                          fontSize: '0.75rem',
                          height: 28,
                          px: 0.75
                        }
                      }}
                    />

                    {/* Color */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="color"
                        value={line.color || '#9ca3af'}
                        onChange={(e) => updateReferenceLine(line.id, 'color', e.target.value)}
                        style={{ 
                          width: 40, 
                          height: 28, 
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    </Box>

                    {/* Value */}
                    <TextField
                      value={line.value ?? 0}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.-]/g, '');
                        updateReferenceLine(line.id, 'value', parseFloat(val) || 0);
                      }}
                      size="small"
                      sx={{ 
                        '& .MuiInputBase-root': { 
                          fontSize: '0.75rem',
                          height: 28,
                          px: 0.75
                        },
                        '& input': { textAlign: 'center' }
                      }}
                    />

                    {/* Axis Assignment */}
                    <Select
                      value={line.yAxisId || 'default'}
                      onChange={(e) => updateReferenceLine(line.id, 'yAxisId', e.target.value)}
                      size="small"
                      sx={{ 
                        fontSize: '0.75rem',
                        height: 28,
                        '& .MuiSelect-select': { 
                          fontSize: '0.75rem',
                          py: 0.5,
                          px: 1
                        }
                      }}
                    >
                      {chartConfig.axes.map(axis => (
                        <MenuItem key={axis.id} value={axis.id} sx={{ fontSize: '0.75rem' }}>
                          {axis.label || axis.id}
                        </MenuItem>
                      ))}
                    </Select>

                    {/* Line Width */}
                    <TextField
                      value={line.lineWidth || 2}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val === '') {
                          updateReferenceLine(line.id, 'lineWidth', 2);
                        } else {
                          const num = parseInt(val);
                          updateReferenceLine(line.id, 'lineWidth', Math.min(8, Math.max(1, num)));
                        }
                      }}
                      size="small"
                      sx={{ 
                        '& .MuiInputBase-root': { 
                          fontSize: '0.75rem',
                          height: 28,
                          px: 0.75
                        },
                        '& input': { textAlign: 'center' }
                      }}
                    />

                    {/* Line Style/Pattern */}
                    <TextField
                      value={line.lineStyle || '0'}
                      onChange={(e) => updateReferenceLine(line.id, 'lineStyle', e.target.value)}
                      onBlur={(e) => {
                        const val = e.target.value;
                        const validation = validateDashPattern(val);
                        if (validation.valid) {
                          updateReferenceLine(line.id, 'lineStyle', validation.value);
                        } else {
                          updateReferenceLine(line.id, 'lineStyle', line.lineStyle || '0');
                        }
                      }}
                      placeholder="e.g., 10 5 or 0 for solid"
                      title="Enter space-separated numbers (1-100) for dash pattern. Example: '10 5' = 10px dash, 5px gap. Use '0' for solid line."
                      size="small"
                      sx={{ 
                        '& .MuiInputBase-root': { 
                          fontSize: '0.75rem',
                          height: 28,
                          px: 0.75
                        },
                        '& input': { textAlign: 'center' }
                      }}
                    />

                    {/* Remove Button */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeReferenceLine(line.id)}
                        title="Remove reference line"
                        sx={{ p: 0.5 }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </>
            )}
          </Box>
        );

      default:
        return null;
    }
  };


  // Content for the panel
  const panelContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header with Save button */}
      {compact && saveButton && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          alignItems: 'center',
          px: 2, 
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper'
        }}>
          {saveButton}
        </Box>
      )}
      
      {/* Content area with sidebar and tabs */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Sidebar Navigation */}
        <Box sx={{ 
          width: 180, 
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}>
          {/* Header */}
          <Typography variant="subtitle1" sx={{ px: 1.5, py: 1.5, fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider' }}>
            {compact ? 'Preferences' : 'Configuration'}
          </Typography>

          {/* Tab Buttons */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 1.5 }}>
            {TABS.map((tab, index) => (
              <Button
                key={tab}
                onClick={() => handleTabChange(index)}
                variant={activeTab === index ? 'contained' : 'text'}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: activeTab === index ? 600 : 400,
                  px: 1.5,
                  py: 0.75,
                  bgcolor: activeTab === index ? 'primary.main' : 'transparent',
                  color: activeTab === index ? 'primary.contrastText' : 'text.primary',
                  '&:hover': {
                    bgcolor: activeTab === index ? 'primary.dark' : 'action.hover',
                  },
                  borderRadius: 1,
                }}
              >
                {tab}
              </Button>
            ))}
          </Box>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {renderTabContent()}
        </Box>
      </Box>
    </Box>
  );

  // Return compact or regular version
  if (compact) {
    return <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{panelContent}</Box>;
  }

  return (
    <Card sx={{ height: 'calc(70vh - 80px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {panelContent}
    </Card>
  );
};

export default ChartConfigPanel;

