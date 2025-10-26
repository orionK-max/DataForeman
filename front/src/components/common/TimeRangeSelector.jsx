import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

const TIME_PRESETS = [
  { label: '1m', value: 1, unit: 'minutes' },
  { label: '5m', value: 5, unit: 'minutes' },
  { label: '15m', value: 15, unit: 'minutes' },
  { label: '30m', value: 30, unit: 'minutes' },
  { label: '1h', value: 1, unit: 'hours' },
  { label: '6h', value: 6, unit: 'hours' },
  { label: '12h', value: 12, unit: 'hours' },
  { label: '24h', value: 24, unit: 'hours' },
];

const TimeRangeSelector = ({ timeRange, onChange }) => {
  const fromDate = React.useMemo(() => {
    return timeRange.from ? new Date(timeRange.from) : new Date(Date.now() - 60 * 60 * 1000);
  }, [timeRange.from]);

  const toDate = React.useMemo(() => {
    return timeRange.to ? new Date(timeRange.to) : new Date();
  }, [timeRange.to]);

  const handlePresetClick = (preset) => {
    const now = new Date();
    const from = new Date(now);
    
    if (preset.unit === 'minutes') {
      from.setMinutes(from.getMinutes() - preset.value);
    } else if (preset.unit === 'hours') {
      from.setHours(from.getHours() - preset.value);
    }
    
    onChange({
      from: from.toISOString(),
      to: now.toISOString(),
    });
  };

  const handleFromChange = (newValue) => {
    if (newValue) {
      onChange({
        ...timeRange,
        from: newValue.toISOString(),
      });
    }
  };

  const handleToChange = (newValue) => {
    if (newValue) {
      onChange({
        ...timeRange,
        to: newValue.toISOString(),
      });
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Stack spacing={2}>
        {/* Quick Time Presets */}
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Quick Presets:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {TIME_PRESETS.map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                onClick={() => handlePresetClick(preset)}
                size="small"
                color="default"
                variant="outlined"
              />
            ))}
          </Stack>
        </Box>

        {/* From Date */}
        <DateTimePicker
          label="From"
          value={fromDate}
          onChange={handleFromChange}
          slotProps={{ textField: { size: 'small', fullWidth: true } }}
        />

        {/* To Date */}
        <DateTimePicker
          label="To"
          value={toDate}
          onChange={handleToChange}
          slotProps={{ textField: { size: 'small', fullWidth: true } }}
        />
      </Stack>
    </LocalizationProvider>
  );
};

export default TimeRangeSelector;
