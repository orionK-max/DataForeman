import React from 'react';
import {
  ArrowDownward,
  ArrowUpward,
  Functions,
  CompareArrows,
  Straighten,
  Adjust,
  ToggleOn,
  AltRoute,
  Code,
  DataArray,
  TextFormat,
  DataObject,
  SwapHoriz,
  InsertDriveFile,
  SaveAlt,
  TrendingUp,
  ShowChart,
  PlayArrow,
  ChatBubbleOutline,
  BugReport,
  Timer,
  Widgets,
  Wifi,
  Build,
  Folder,
  Calculate,
} from '@mui/icons-material';

/**
 * Maps emoji icon strings (from backend node metadata) to MUI icon components.
 * Add new entries here when new nodes use new emoji icons.
 */
const EMOJI_TO_ICON = {
  '📥': ArrowDownward,    // TagInput, JumpIn - data coming into flow
  '📤': ArrowUpward,      // TagOutput, JumpOut - data leaving flow
  '🔢': Functions,        // Math - math/calculation
  '🔍': CompareArrows,    // Comparison - compare values
  '📐': Straighten,       // Clamp - restrict to range
  '🔘': Adjust,           // Round - adjust precision
  '🚪': ToggleOn,         // Gate - pass/block signal
  '🔀': AltRoute,         // Switch, Merge, BooleanLogic - branching
  '📜': Code,             // JavaScript - scripting
  '📊': DataArray,        // ArrayOps - array data
  '📝': TextFormat,       // StringOps - string/text
  '📋': DataObject,       // JSONOps - JSON/object
  '🔄': SwapHoriz,        // TypeConvert - transform type
  '📄': InsertDriveFile,  // LoadFile - read file
  '💾': SaveAlt,          // SaveFile - write file
  '📈': TrendingUp,       // RateOfChange - trend
  '〰️': ShowChart,        // RollingAverage - smoothed value
  '▶️': PlayArrow,        // ManualTrigger - start trigger
  '💬': ChatBubbleOutline, // Comment - annotation
  '🐛': BugReport,        // DebugLog - debug/logging
  '⏱️': Timer,            // Delay - time-based
  '📦': Widgets,          // Default/Library - generic node
  '📡': Wifi,             // Connectivity category
  '🛠️': Build,            // Utility/Tools category
  '📁': Folder,           // Triggers category
  '🔑': Calculate,        // Constant - fixed value
};

/**
 * Resolve an emoji icon string to a MUI icon React element.
 * Falls back to rendering the emoji as text if no mapping is found.
 *
 * @param {string} emoji - The emoji icon string from backend node metadata
 * @param {object} props - Props forwarded to the MUI icon component (e.g. fontSize, sx)
 * @returns {React.ReactElement}
 */
export function resolveNodeIcon(emoji, props = {}) {
  const IconComponent = EMOJI_TO_ICON[emoji];
  if (IconComponent) {
    return <IconComponent fontSize="small" {...props} />;
  }
  // Unknown emoji — render as text with neutral sizing
  return <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>{emoji}</span>;
}
