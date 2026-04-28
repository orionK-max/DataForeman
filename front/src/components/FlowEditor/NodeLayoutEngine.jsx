import React from 'react';
import { Box } from '@mui/material';
import {
  HeaderBlock,
  SubtitleBlock,
  TextBlock,
  ValuesBlock,
  BadgesBlock,
  DividerBlock,
  CodeBlock,
  ProgressBlock,
  StatusTextBlock
} from './NodeBlocks';

/**
 * Template Resolver - replaces {{field}} with data values
 * Supports nested paths like {{runtime.progress}}
 */
const resolveTemplate = (template, data) => {
  if (!template || typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    // Support nested paths: runtime.progress -> data.runtime.progress
    const keys = path.trim().split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return match; // Path not found, return original
      }
    }
    
    return value !== undefined && value !== null ? value : '';
  });
};

/**
 * Format values based on format type
 */
const formatValue = (value, format) => {
  if (!format || value === null || value === undefined) {
    return value;
  }

  switch (format) {
    case 'relativeTime': {
      // Convert timestamp (ms) to relative time
      const timestamp = typeof value === 'number' ? value : parseInt(value, 10);
      if (isNaN(timestamp)) return value;
      
      const now = Date.now();
      const diffMs = now - timestamp;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      
      if (diffSec < 60) return `${diffSec}s ago`;
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      return `${diffDay}d ago`;
    }
    
    case 'date': {
      // Format as date/time
      const timestamp = typeof value === 'number' ? value : parseInt(value, 10);
      if (isNaN(timestamp)) return value;
      return new Date(timestamp).toLocaleString();
    }
    
    case 'bytes': {
      // Format bytes as human-readable
      const bytes = typeof value === 'number' ? value : parseInt(value, 10);
      if (isNaN(bytes)) return value;
      
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    
    default:
      return value;
  }
};

/**
 * Evaluate conditional visibility expressions
 * Supports: {{field}}, {{field}} === "value", {{field}} < 100, etc.
 */
const evaluateCondition = (condition, data) => {
  if (!condition) {
    return true; // No condition = always visible
  }

  // Special case: !!{{propertyName}} - check property existence without embedding value
  // This prevents multi-line code/complex values from breaking the eval
  const existenceCheckMatch = condition.match(/^!!\{\{(\w+)\}\}$/);
  if (existenceCheckMatch) {
    const propName = existenceCheckMatch[1];
    const value = data[propName];
    return !!(value && (typeof value !== 'string' || value.trim().length > 0));
  }

  // Resolve all templates first
  const resolved = resolveTemplate(condition, data);
  
  // Simple existence check: if no comparison operators, just check truthiness
  if (!resolved.includes('===') && !resolved.includes('!==') && 
      !resolved.includes('>=') && !resolved.includes('<=') &&
      !resolved.includes('>') && !resolved.includes('<')) {
    return !!resolved; // Truthy check
  }

  // Expression evaluation: resolved === "value"
  try {
    // Add quotes around non-numeric values for string comparison
    let evalExpression = resolved;
    // If comparing with string literal, ensure both sides are quoted
    if (evalExpression.includes('===') || evalExpression.includes('!==')) {
      const parts = evalExpression.split(/(===|!==)/);
      if (parts.length === 3) {
        const left = parts[0].trim();
        const op = parts[1];
        const right = parts[2].trim();
        // If right side is quoted but left isn't, quote the left
        if (right.startsWith('"') && !left.startsWith('"') && isNaN(left)) {
          evalExpression = `"${left}" ${op} ${right}`;
        }
      }
    }
    // Safely evaluate comparison expressions
    // eslint-disable-next-line no-eval
    return eval(evalExpression);
  } catch (e) {
    console.warn('Failed to evaluate condition:', condition, '->', resolved, e);
    return false;
  }
};

/**
 * Resolve color templates (hex colors or templates)
 */
const resolveColor = (color, data) => {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  return resolveTemplate(color, data);
};

/**
 * Block Component Map - maps block types to React components
 */
const blockComponents = {
  header: HeaderBlock,
  subtitle: SubtitleBlock,
  text: TextBlock,
  values: ValuesBlock,
  badges: BadgesBlock,
  divider: DividerBlock,
  code: CodeBlock,
  progress: ProgressBlock,
  'status-text': StatusTextBlock
};

/**
 * NodeLayoutEngine - Renders nodes from visual definitions
 * 
 * Takes a visual definition from the backend and renders it using block components.
 * Handles template resolution, conditional visibility, and nested data access.
 */
export const NodeLayoutEngine = ({ visual, data, executionOrder, runtimeData = {} }) => {
  if (!visual || !visual.layout) {
    return null;
  }

  // Merge runtime data into data object for template resolution
  const mergedData = {
    ...data,
    runtime: runtimeData,
    executionOrder
  };

  return (
    <Box sx={{ width: '100%' }}>
      {visual.layout.map((block, index) => {
        // Check conditional visibility
        if (block.visible !== undefined) {
          const isVisible = evaluateCondition(block.visible, mergedData);
          if (!isVisible) {
            return null;
          }
        }

        const BlockComponent = blockComponents[block.type];
        if (!BlockComponent) {
          console.warn('Unknown block type:', block.type);
          return null;
        }

        // Resolve block props based on type
        const resolvedProps = resolveBlockProps(block, mergedData, executionOrder);

        return (
          <BlockComponent
            key={`block-${index}`}
            {...resolvedProps}
          />
        );
      })}
    </Box>
  );
};

/**
 * Resolve block props - replaces templates in all prop values
 */
const resolveBlockProps = (block, data, executionOrder) => {
  const props = { ...block };
  
  // Special handling for different block types
  switch (block.type) {
    case 'header':
      return {
        icon: resolveTemplate(props.icon, data),
        title: resolveTemplate(props.title, data),
        color: resolveColor(props.color, data),
        badges: props.badges || [],
        executionOrder: props.badges?.includes('executionOrder') ? executionOrder : null,
        fontSize: props.fontSize,
        iconSize: props.iconSize
      };

    case 'subtitle':
      return {
        text: resolveTemplate(props.text, data),
        color: resolveColor(props.color, data),
        fontSize: props.fontSize,
        fontWeight: props.fontWeight
      };

    case 'text':
      return {
        content: resolveTemplate(props.content, data),
        fontSize: props.fontSize,
        fontWeight: props.fontWeight,
        color: resolveColor(props.color, data),
        align: props.align,
        padding: props.padding
      };

    case 'values':
      return {
        items: (props.items || []).map(item => {
          const resolvedValue = resolveTemplate(item.value, data);
          let formattedValue = resolvedValue;
          
          // Apply format if specified
          if (item.format && resolvedValue !== null && resolvedValue !== undefined) {
            formattedValue = formatValue(resolvedValue, item.format);
          }
          
          return {
            label: item.label,
            value: formattedValue,
            color: resolveColor(item.color, data),
            visible: item.visible ? evaluateCondition(item.visible, data) : true
          };
        }).filter(item => item.visible && (item.value !== null && item.value !== undefined)),
        layout: props.layout,
        spacing: props.spacing,
        labelWidth: props.labelWidth
      };

    case 'badges':
      return {
        items: (props.items || []).map(item => {
          const visible = item.visible ? evaluateCondition(item.visible, data) : true;
          if (!visible) return null;

          return {
            text: resolveTemplate(item.text, data),
            color: resolveColor(item.color, data),
            textColor: resolveColor(item.textColor, data),
            icon: resolveTemplate(item.icon, data),
            tooltip: resolveTemplate(item.tooltip, data)
          };
        }).filter(Boolean),
        position: props.position,
        spacing: props.spacing,
        align: props.align
      };

    case 'divider':
      return {
        color: resolveColor(props.color, data),
        thickness: props.thickness,
        margin: props.margin,
        style: props.style
      };

    case 'code':
      return {
        language: props.language,
        content: resolveTemplate(props.content, data),
        maxLines: props.maxLines,
        showLineNumbers: props.showLineNumbers,
        fontSize: props.fontSize,
        fontFamily: props.fontFamily,
        wrap: props.wrap
      };

    case 'progress':
      return {
        value: resolveTemplate(props.value, data),
        max: resolveTemplate(props.max, data),
        label: resolveTemplate(props.label, data),
        color: resolveColor(props.color, data),
        backgroundColor: resolveColor(props.backgroundColor, data),
        height: props.height,
        showPercentage: props.showPercentage
      };

    case 'status-text':
      return {
        text: resolveTemplate(props.text, data),
        color: resolveColor(props.color, data),
        icon: resolveTemplate(props.icon, data),
        fontSize: props.fontSize,
        fontWeight: props.fontWeight,
        align: props.align
      };

    default:
      return props;
  }
};
