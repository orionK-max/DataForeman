import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Typography,
} from '@mui/material';

/**
 * DataTable - Displays data in a table format
 * 
 * Handles different data types:
 * - Single object: Display as key-value pairs
 * - Array of objects: Display as rows with columns
 * - Primitives: Display simple value
 */
const DataTable = ({ data }) => {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return <Typography variant="body2" color="text.secondary">No data</Typography>;
  }

  // Handle primitive types
  if (typeof data !== 'object') {
    return (
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableBody>
            <TableRow>
              <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                Value
              </TableCell>
              <TableCell>{String(data)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  // Handle array
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <Typography variant="body2" color="text.secondary">Empty array</Typography>;
    }

    // If array of objects, show as table
    if (typeof data[0] === 'object' && data[0] !== null) {
      const keys = Object.keys(data[0]);
      
      return (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {keys.map(key => (
                  <TableCell key={key} sx={{ fontWeight: 600 }}>
                    {key}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, idx) => (
                <TableRow key={idx} hover>
                  {keys.map(key => (
                    <TableCell key={key}>
                      {formatValue(row[key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    // Array of primitives
    return (
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Index</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((value, idx) => (
              <TableRow key={idx} hover>
                <TableCell>{idx}</TableCell>
                <TableCell>{formatValue(value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  // Handle single object - show as key-value pairs
  const entries = Object.entries(data);
  
  if (entries.length === 0) {
    return <Typography variant="body2" color="text.secondary">Empty object</Typography>;
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, width: '30%' }}>Property</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key} hover>
              <TableCell component="th" scope="row" sx={{ fontWeight: 500 }}>
                {key}
              </TableCell>
              <TableCell>{formatValue(value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

/**
 * Format value for display in table cell
 */
const formatValue = (value) => {
  if (value === null) {
    return <Chip label="null" size="small" variant="outlined" />;
  }
  
  if (value === undefined) {
    return <Chip label="undefined" size="small" variant="outlined" />;
  }
  
  if (typeof value === 'boolean') {
    return (
      <Chip 
        label={String(value)} 
        size="small" 
        color={value ? 'success' : 'default'}
      />
    );
  }
  
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return <Chip label={`Array[${value.length}]`} size="small" variant="outlined" />;
    }
    return <Chip label="Object" size="small" variant="outlined" />;
  }
  
  if (typeof value === 'number') {
    return <Typography component="span" sx={{ fontFamily: 'monospace' }}>{value}</Typography>;
  }
  
  return String(value);
};

export default DataTable;
