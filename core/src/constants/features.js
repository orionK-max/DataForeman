/**
 * Feature constants for permission system
 * These define all available features and their metadata
 */

export const FEATURES = {
  DASHBOARDS: 'dashboards',
  CONNECTIVITY_DEVICES: 'connectivity.devices',
  CONNECTIVITY_TAGS: 'connectivity.tags',
  CONNECTIVITY_POLL_GROUPS: 'connectivity.poll_groups',
  CONNECTIVITY_UNITS: 'connectivity.units',
  CHART_COMPOSER: 'chart_composer',
  DIAGNOSTIC_SYSTEM: 'diagnostic.system',
  DIAGNOSTIC_CAPACITY: 'diagnostic.capacity',
  DIAGNOSTIC_LOGS: 'diagnostic.logs',
  DIAGNOSTIC_NETWORK: 'diagnostic.network',
};

export const OPERATIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
};

/**
 * Feature metadata for UI display
 * category: Groups features in the UI
 * label: Human-readable name
 * operations: Which CRUD operations are applicable (some features might be read-only)
 */
export const FEATURE_METADATA = {
  [FEATURES.DASHBOARDS]: {
    label: 'Dashboards',
    category: 'Core',
    description: 'Create and manage dashboards',
    operations: ['create', 'read', 'update', 'delete'],
  },
  [FEATURES.CONNECTIVITY_DEVICES]: {
    label: 'Devices',
    category: 'Connectivity',
    description: 'Manage device connections (OPC UA, S7, EtherNet/IP)',
    operations: ['create', 'read', 'update', 'delete'],
  },
  [FEATURES.CONNECTIVITY_TAGS]: {
    label: 'Tags',
    category: 'Connectivity',
    description: 'Configure and manage tags',
    operations: ['create', 'read', 'update', 'delete'],
  },
  [FEATURES.CONNECTIVITY_POLL_GROUPS]: {
    label: 'Poll Groups',
    category: 'Connectivity',
    description: 'Manage polling schedules',
    operations: ['create', 'read', 'update', 'delete'],
  },
  [FEATURES.CONNECTIVITY_UNITS]: {
    label: 'Units of Measure',
    category: 'Connectivity',
    description: 'Manage measurement units',
    operations: ['create', 'read', 'update', 'delete'],
  },
  [FEATURES.CHART_COMPOSER]: {
    label: 'Chart Composer',
    category: 'Core',
    description: 'Create and edit charts',
    operations: ['create', 'read', 'update', 'delete'],
  },
  [FEATURES.DIAGNOSTIC_SYSTEM]: {
    label: 'System Diagnostics',
    category: 'Diagnostic',
    description: 'View system health and status',
    operations: ['read'],
  },
  [FEATURES.DIAGNOSTIC_CAPACITY]: {
    label: 'Capacity Diagnostics',
    category: 'Diagnostic',
    description: 'View resource usage and capacity',
    operations: ['read'],
  },
  [FEATURES.DIAGNOSTIC_LOGS]: {
    label: 'Logs',
    category: 'Diagnostic',
    description: 'View system logs',
    operations: ['read'],
  },
  [FEATURES.DIAGNOSTIC_NETWORK]: {
    label: 'Network Diagnostics',
    category: 'Diagnostic',
    description: 'View network connectivity status',
    operations: ['read'],
  },
};

/**
 * Get all features grouped by category
 */
export function getFeaturesByCategory() {
  const grouped = {};
  
  Object.entries(FEATURE_METADATA).forEach(([feature, meta]) => {
    if (!grouped[meta.category]) {
      grouped[meta.category] = [];
    }
    grouped[meta.category].push({
      feature,
      ...meta,
    });
  });
  
  return grouped;
}

/**
 * Get feature metadata
 */
export function getFeatureMetadata(feature) {
  return FEATURE_METADATA[feature] || null;
}

/**
 * Check if feature supports operation
 */
export function supportsOperation(feature, operation) {
  const meta = FEATURE_METADATA[feature];
  return meta?.operations?.includes(operation) || false;
}
