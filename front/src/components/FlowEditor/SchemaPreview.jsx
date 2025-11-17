import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
} from '@mui/material';
import { PlayArrow as ExecuteIcon } from '@mui/icons-material';
import { inferOutputSchema, formatSchema } from '../../utils/schemaInference';

/**
 * SchemaPreview Component
 * Shows expected data structure before node executes
 */
export default function SchemaPreview({ 
  node, 
  inputData, 
  flowDefinition,
  onExecuteNode 
}) {
  if (!node) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">
          No node selected
        </Typography>
      </Box>
    );
  }

  const schema = inferOutputSchema(node, inputData, flowDefinition);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ color: '#000' }}>
        Expected Output Structure
      </Typography>

      {schema?.description && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {schema.description}
        </Alert>
      )}

      <Paper sx={{ p: 2, bgcolor: '#f5f5f5', mb: 2 }}>
        <Typography
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap',
            margin: 0,
            color: '#000'
          }}
        >
          {formatSchemaProperties(schema?.properties)}
        </Typography>
      </Paper>

      <Alert severity="info" icon={false} sx={{ mb: 2 }}>
        ℹ️ Execute this node to see actual values
      </Alert>

      {onExecuteNode && (
        <Button
          variant="contained"
          color="primary"
          startIcon={<ExecuteIcon />}
          onClick={onExecuteNode}
          fullWidth
        >
          Execute Node
        </Button>
      )}
    </Box>
  );
}

/**
 * Format schema properties as readable JSON
 */
function formatSchemaProperties(properties) {
  if (!properties) return '{}';

  const lines = [];
  lines.push('{');

  Object.entries(properties).forEach(([key, prop], index, array) => {
    const isLast = index === array.length - 1;
    let line = `  "${key}": `;

    // Add type
    if (prop.type) {
      line += `<${prop.type}>`;
    }

    // Add example if available
    if (prop.example !== undefined) {
      line += ` // example: ${JSON.stringify(prop.example)}`;
    }

    // Add description if available
    if (prop.description && !prop.example) {
      line += ` // ${prop.description}`;
    }

    if (!isLast) {
      line += ',';
    }

    lines.push(line);
  });

  lines.push('}');

  return lines.join('\n');
}
