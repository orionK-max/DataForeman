import { apiClient } from './api';

/**
 * Connectivity Service - API calls for device connection management
 * Supports OPC UA, Siemens S7, and EtherNet/IP protocols
 */

export const connectivityService = {
  // ===== Summary & Status =====
  
  /**
   * Get system summary (NATS, DB status)
   * @returns {Promise<{nats: {ok: boolean}, db: string}>}
   */
  getSummary: () => apiClient.get('/connectivity/summary'),
  
  /**
   * Get live connection statuses
   * @returns {Promise<{items: Array}>}
   */
  getStatus: () => apiClient.get('/connectivity/status'),
  
  /**
   * Get available poll groups
   * @returns {Promise<{poll_groups: Array}>}
   */
  getPollGroups: (options = {}) => {
    const params = new URLSearchParams();
    if (options.includeInactive) {
      params.append('include_inactive', 'true');
    }
    const query = params.toString();
    return apiClient.get(`/connectivity/poll-groups${query ? `?${query}` : ''}`);
  },

  createPollGroup: (payload) =>
    apiClient.post('/connectivity/poll-groups', payload),

  editPollGroup: (groupId, payload) =>
    apiClient.put(`/connectivity/poll-groups/${encodeURIComponent(groupId)}`, payload),

  deletePollGroup: (groupId, options = {}) => {
    const params = new URLSearchParams();
    if (options.reassignTo) {
      params.append('reassign_to', options.reassignTo);
    }
    const query = params.toString();
    return apiClient.delete(`/connectivity/poll-groups/${encodeURIComponent(groupId)}${query ? `?${query}` : ''}`);
  },
  
  // ===== Connection Management =====
  
  /**
   * Get all saved connections
   * @returns {Promise<{items: Array}>}
   */
  getConnections: () => apiClient.get('/connectivity/connections'),
  
  /**
   * Save or update a connection
   * @param {Object} conn - Connection configuration
   * @returns {Promise}
   */
  saveConnection: (conn) => 
    apiClient.post('/connectivity/connections', { op: 'upsert', conn }),
  
  /**
   * Delete a saved connection
   * @param {string} id - Connection ID
   * @returns {Promise}
   */
  deleteConnection: (id) => 
    apiClient.post('/connectivity/connections', { op: 'delete', id }),
  
  // ===== Live Config (Runtime) =====
  
  /**
   * Start a connection (enable in live config)
   * @param {Object} conn - Connection to start
   * @returns {Promise}
   */
  startConnection: (conn) => 
    apiClient.post('/connectivity/config', { 
      op: 'upsert', 
      conn: { ...conn, enabled: true } 
    }),
  
  /**
   * Stop a connection (disable in live config)
   * @param {Object} conn - Connection to stop
   * @returns {Promise}
   */
  stopConnection: (conn) => 
    apiClient.post('/connectivity/config', { 
      op: 'upsert', 
      conn: { ...conn, enabled: false } 
    }),
  
  /**
   * Update live config
   * @param {Object} conn - Connection configuration
   * @returns {Promise}
   */
  updateConfig: (conn) => 
    apiClient.post('/connectivity/config', { op: 'upsert', conn }),
  
  /**
   * Delete from live config
   * @param {string} id - Connection ID
   * @returns {Promise}
   */
  deleteConfig: (id) => 
    apiClient.post('/connectivity/config', { op: 'delete', id }),
  
  // ===== Testing & Discovery =====
  
  /**
   * Discover EtherNet/IP devices on network
   * @param {string} broadcastAddress - Broadcast address (default: '255.255.255.255')
   * @param {boolean} forceRefresh - Force new scan vs cached results
   * @returns {Promise<{devices: Array, cached: boolean}>}
   */
  discoverDevices: (broadcastAddress = '255.255.255.255', forceRefresh = false) =>
    apiClient.post('/connectivity/eip/discover', { 
      broadcast_address: broadcastAddress,
      force_refresh: forceRefresh 
    }),

  /**
   * Identify a specific EtherNet/IP device
   * @param {string} ipAddress - Device IP address
   * @returns {Promise<{ip_address: string, vendor: string, product_name: string, ...}>}
   */
  identifyDevice: (ipAddress) =>
    apiClient.post('/connectivity/eip/identify', { ip_address: ipAddress }),

  /**
   * Get rack configuration for ControlLogix systems
   * @param {string} ipAddress - Device IP address
   * @param {number} slot - Processor slot (default: 0)
   * @returns {Promise<{type: string, processor: Object, modules?: Array, module_count?: number}>}
   */
  getRackConfiguration: (ipAddress, slot = 0) =>
    apiClient.post('/connectivity/eip/rack-config', { ip_address: ipAddress, slot }),

  /**
   * Test any connection (EIP, OPC UA, S7)
   * @param {Object} config - Connection configuration
   * @returns {Promise<{state: string, success: boolean, reason?: string, error?: string}>}
   */
  testConnection: (config) =>
    apiClient.post('/connectivity/test', config),

  /**
   * Test OPC UA connection
   * @param {string} endpoint - OPC UA endpoint URL
   * @param {number} timeout_ms - Timeout in milliseconds (default: 15000)
   * @returns {Promise<{state: string, reason?: string}>}
   */
  testOpcUa: (endpoint, timeout_ms = 15000) => 
    apiClient.post('/connectivity/test', { endpoint, timeout_ms }),
  
  /**
   * Read tag values from a connection
   * @param {string} id - Connection ID
   * @param {string} tag_ids - Comma-separated tag IDs
   * @returns {Promise<{items: Array}>}
   */
  readTags: (id, tag_ids) => 
    apiClient.get(`/connectivity/read?id=${encodeURIComponent(id)}&tag_ids=${tag_ids}`),
  
  /**
   * Browse OPC UA nodes
   * @param {string} id - Connection ID
   * @param {string} node - Node ID to browse (optional, defaults to root)
   * @returns {Promise<{items: Array}>}
   */
  browseNodes: (id, node = null) => {
    const url = node 
      ? `/connectivity/browse/${encodeURIComponent(id)}?node=${encodeURIComponent(node)}`
      : `/connectivity/browse/${encodeURIComponent(id)}`;
    return apiClient.get(url);
  },
  
  /**
   * Get OPC UA node attributes
   * @param {string} id - Connection ID
   * @param {string} node - Node ID
   * @returns {Promise<Object>}
   */
  getNodeAttributes: (id, node) => 
    apiClient.get(`/connectivity/attributes/${encodeURIComponent(id)}?node=${encodeURIComponent(node)}`),
  
  /**
   * Get saved tags for a connection (old schema format)
   * @param {string} id - Connection ID (optional)
   * @returns {Promise<{items: Array}>}
   */
  getSavedTags: (id = null) => {
    const url = id 
      ? `/connectivity/tags/saved?id=${encodeURIComponent(id)}`
      : '/connectivity/tags/saved';
    return apiClient.get(url);
  },

  /**
   * Get tags by connection ID (new schema with poll groups, status, job tracking)
   * @param {string} connectionId - Connection ID
   * @param {boolean} includeDeleted - Whether to include deleted tags
   * @returns {Promise<{connection_id: string, tags: Array, schema: string, total_tags: number}>}
   */
  getTagsByConnection: (connectionId, includeDeleted = false) => {
    const url = `/connectivity/tags/${encodeURIComponent(connectionId)}${includeDeleted ? '?include_deleted=true' : ''}`;
    return apiClient.get(url);
  },

  /**
   * Get tags by connection ID (alias for getTagsByConnection)
   * @param {string} connectionId - Connection ID
   * @param {boolean} includeDeleted - Whether to include deleted tags
   * @returns {Promise<{connection_id: string, tags: Array, schema: string, total_tags: number}>}
   */
  getTags: (connectionId, includeDeleted = false) => {
    const url = `/connectivity/tags/${encodeURIComponent(connectionId)}${includeDeleted ? '?include_deleted=true' : ''}`;
    return apiClient.get(url);
  },

  /**
   * Get all internal tags (Flow Studio tags)
   * @returns {Promise<{tags: Array}>}
   */
  getInternalTags: () => apiClient.get('/connectivity/tags/internal'),
  
  /**
   * Get EIP tag list (with optional snapshot)
   * @param {string} id - Connection ID
   * @param {Object} options - Query options
   * @returns {Promise<{items: Array}>}
   */
  getEipTags: (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.action) params.append('action', options.action);
    if (options.snapshot) params.append('snapshot', options.snapshot);
    if (options.scope) params.append('scope', options.scope);
    if (options.program) params.append('program', options.program);
    if (options.page != null) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.search) params.append('search', options.search);
    if (options.refresh) params.append('refresh', '1');
    if (options.raw) params.append('raw', '1');
    
    const url = `/connectivity/eip/tags/${encodeURIComponent(id)}${params.toString() ? '?' + params.toString() : ''}`;
    return apiClient.get(url);
  },

  /**
   * Resolve data types for specific tag names via EIP driver
   * @param {string} connectionId - EIP connection ID  
   * @param {Array<string>} tagNames - Array of tag names to resolve types for
   * @returns {Promise<{types: Object}>} - Object mapping tag names to their data types
   */
  resolveTagTypes: (connectionId, tagNames) => 
    apiClient.post(`/connectivity/eip/resolve-types/${encodeURIComponent(connectionId)}`, {
      tag_names: tagNames
    }),
  
  // ===== Tag Management =====
  
  /**
   * Save discovered tags
   * @param {Object} payload - Tag save payload
   * @returns {Promise}
   */
  saveTags: (payload) => 
    apiClient.post('/connectivity/tags/save', payload),

  /**
   * Delete a tag (marks as pending_delete, enqueues purge job)
   * @param {Object} payload - { id: connectionId, tag_id: tagId }
   * @returns {Promise}
   */
  deleteTag: (payload) =>
    apiClient.post('/connectivity/tags/remove', payload),

  /**
   * Delete multiple tags in a single job (much faster)
   * @param {Object} payload - { id: connectionId, tag_ids: Array<number> }
   * @returns {Promise}
   */
  deleteTags: (payload) =>
    apiClient.post('/connectivity/tags/remove-batch', payload),

  /**
   * Update poll group for tags
   * @param {Object} payload - { tag_ids: Array, poll_group_id: Number }
   * @returns {Promise}
   */
  updatePollGroup: (payload) =>
    apiClient.put('/connectivity/tags/poll-group', payload),
  
  /**
   * Update units for tags
   * @param {Object} payload - { tag_ids: Array, unit_id: Number|null }
   * @returns {Promise}
   */
  updateTagUnits: (payload) =>
    apiClient.patch('/connectivity/tags/units', payload),
  
  /**
   * Update write on change settings for tags
   * @param {Object} payload - { tag_ids: Array, on_change_enabled: Boolean, on_change_deadband: Number, on_change_deadband_type: String, on_change_heartbeat_ms: Number }
   * @returns {Promise}
   */
  updateTagOnChange: (payload) =>
    apiClient.patch('/connectivity/tags/on-change', payload),
  
  /**
   * Export tags for a connection as JSON
   * @param {string} connectionId - Connection ID
   * @returns {Promise<Blob>} - JSON file blob
   */
  exportTags: async (connectionId) => {
    const response = await fetch(`/api/connectivity/tags/${encodeURIComponent(connectionId)}/export`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(error.error || 'Export failed');
    }
    
    return response.blob();
  },

  /**
   * Import tags from JSON file
   * @param {string} connectionId - Connection ID
   * @param {Object} data - Import data
   * @param {Array} data.tags - Array of tags to import
   * @param {string} data.merge_strategy - 'skip', 'replace', or 'update'
   * @returns {Promise<{imported: number, updated: number, skipped: number, errors?: Array}>}
   */
  importTags: (connectionId, data) =>
    apiClient.post(`/connectivity/tags/${encodeURIComponent(connectionId)}/import`, data),

  /**
   * Export tags for a connection as CSV
   * @param {string} connectionId - Connection ID
   * @param {string} driverType - 's7', 'opcua', or 'eip'
   * @returns {Promise<Blob>} - CSV file blob
   */
  exportTagsCSV: async (connectionId, driverType) => {
    const token = localStorage.getItem('df_token');
    const response = await fetch(`/api/connectivity/tags/${encodeURIComponent(connectionId)}/export-csv?driver=${driverType}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(error.error || 'Export failed');
    }
    
    return response.blob();
  },

  /**
   * Import tags from CSV file
   * @param {string} connectionId - Connection ID
   * @param {File} file - CSV file
   * @param {string} driverType - 's7', 'opcua', or 'eip'
   * @returns {Promise<{imported: number, updated: number, skipped: number, errors?: Array}>}
   */
  importTagsCSV: async (connectionId, file, driverType) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('driver', driverType);
    
    const token = localStorage.getItem('df_token');
    const response = await fetch(`/api/connectivity/tags/${encodeURIComponent(connectionId)}/import-csv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Import failed' }));
      throw new Error(error.error || 'Import failed');
    }
    
    return response.json();
  },
  
  // ===== Units of Measure =====
  
  /**
   * Get all units of measure
   * @param {Object} options - { category?: string, include_custom?: boolean }
   * @returns {Promise<{units: Array}>}
   */
  getUnits: (options = {}) => {
    const params = new URLSearchParams();
    if (options.category) {
      params.append('category', options.category);
    }
    if (options.include_custom === false) {
      params.append('include_custom', 'false');
    }
    const query = params.toString();
    return apiClient.get(`/units${query ? `?${query}` : ''}`);
  },
  
  /**
   * Get all unit categories
   * @returns {Promise<{categories: Array<string>}>}
   */
  getUnitCategories: () => apiClient.get('/units/categories'),
  
  /**
   * Create a new unit of measure
   * @param {Object} payload - { name: string, symbol: string, category: string }
   * @returns {Promise<{unit: Object}>}
   */
  createUnit: (payload) => apiClient.post('/units', payload),
  
  /**
   * Update a unit of measure
   * @param {number} id - Unit ID
   * @param {Object} payload - { name?: string, symbol?: string, category?: string }
   * @returns {Promise<{unit: Object}>}
   */
  updateUnit: (id, payload) => apiClient.patch(`/units/${id}`, payload),
  
  /**
   * Delete a unit of measure
   * @param {number} id - Unit ID
   * @returns {Promise}
   */
  deleteUnit: (id) => apiClient.delete(`/units/${id}`),
};

export default connectivityService;
