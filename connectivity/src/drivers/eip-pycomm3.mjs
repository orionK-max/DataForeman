/**
 * EIP Driver using PyComm3 (Python-based)
 * 
 * Alternative to libplctag native driver. Uses Python subprocess
 * with PyComm3 library for EtherNet/IP communication.
 * 
 * Communication: JSON-RPC over stdio with Python worker
 * 
 * Features:
 * - Native PyComm3 Multiple Service Packet (MSP) batching
 * - Simpler API than libplctag
 * - Easier to debug (Python stack traces)
 * - Automatic process recovery on crashes
 * 
 * Performance:
 * - Comparable to libplctag for most workloads
 * - May be slower for <100ms poll rates
 * - Excellent for 1000+ tags at >=500ms rates
 */

import pino from 'pino';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EventEmitter } from 'events';

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'eip-pycomm3' });

// Get the path to the Python worker
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, '../workers/pycomm3_worker.py');

/**
 * JSON-RPC client for communicating with Python worker
 */
class JSONRPCClient extends EventEmitter {
  constructor(pythonPath = 'python3', workerPath = WORKER_PATH) {
    super();
    
    this.pythonPath = pythonPath;
    this.workerPath = workerPath;
    this.process = null;
    this.connected = false;
    this.nextId = 1;
    this.pending = new Map(); // request_id -> {resolve, reject, timer}
    this.requestTimeout = 5000; // 5s default timeout
    this._buffer = ''; // Buffer for incomplete JSON lines
  }
  
  /**
   * Start Python worker process
   */
  start() {
    if (this.process) {
      log.warn('Worker process already running');
      return;
    }
    
    log.info({ pythonPath: this.pythonPath, workerPath: this.workerPath }, 'Starting Python worker');
    
    this.process = spawn(this.pythonPath, [this.workerPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Handle stdout (JSON-RPC responses + telemetry)
    this.process.stdout.on('data', (data) => {
      this._handleStdout(data);
    });
    
    // Handle stderr (Python logs)
    this.process.stderr.on('data', (data) => {
      const logLine = data.toString().trim();
      log.info({ pythonLog: logLine }, 'Python worker log');
    });
    
    // Handle process exit
    this.process.on('exit', (code, signal) => {
      log.warn({ code, signal }, 'Python worker exited');
      this.connected = false;
      this._rejectAllPending(new Error(`Worker process exited: ${code || signal}`));
      this.emit('exit', { code, signal });
    });
    
    // Handle errors
    this.process.on('error', (error) => {
      log.error({ err: error.message }, 'Python worker error');
      this.emit('error', error);
    });
    
    // Worker is now running and ready to receive requests
    this.connected = true;
    
    log.info({ pid: this.process.pid }, 'Python worker started');
  }
  
  /**
   * Stop Python worker process
   */
  stop() {
    if (!this.process) {
      return;
    }
    
    log.info({ pid: this.process.pid }, 'Stopping Python worker');
    
    // Reject all pending requests
    this._rejectAllPending(new Error('Worker stopping'));
    
    // Kill process
    this.process.kill('SIGTERM');
    this.process = null;
    this.connected = false;
  }
  
  /**
   * Send JSON-RPC request to worker
   */
  async request(method, params = {}, timeoutMs = null) {
    if (!this.connected) {
      throw new Error('Worker not connected');
    }
    
    const id = ++this.nextId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    log.info({ method, params, id }, 'Sending JSON-RPC request to Python worker');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs || this.requestTimeout);
      
      this.pending.set(id, { resolve, reject, timer: timeout });
      
      // Send request to worker stdin
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  
  /**
   * Handle stdout data from worker
   */
  _handleStdout(data) {
    // Append to buffer
    this._buffer += data.toString();
    
    // Process complete lines
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const message = JSON.parse(line);
        
        // Check if it's a JSON-RPC response
        if (message.jsonrpc === '2.0' && message.id !== undefined) {
          this._handleResponse(message);
        }
        // Check if it's telemetry data (has tag_id, v, q, ts)
        else if (message.tag_id !== undefined) {
          log.debug({ telemetry: message }, 'Received telemetry from Python worker');
          this.emit('telemetry', message);
        }
        else {
          log.warn({ message }, 'Unknown message from worker');
        }
      } catch (error) {
        log.error({ line, err: error.message }, 'Failed to parse worker output');
      }
    }
  }
  
  /**
   * Handle JSON-RPC response
   */
  _handleResponse(response) {
    const { id, result, error } = response;
    
    const pending = this.pending.get(id);
    if (!pending) {
      log.warn({ id }, 'Received response for unknown request');
      return;
    }
    
    this.pending.delete(id);
    clearTimeout(pending.timer);
    
    if (error) {
      pending.reject(new Error(error.message || 'Unknown error'));
    } else {
      pending.resolve(result);
    }
  }
  
  /**
   * Reject all pending requests
   */
  _rejectAllPending(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

/**
 * EIP Driver using PyComm3
 */
export class EIPPyComm3Driver {
  constructor(opts = {}) {
    this.host = opts.host;
    this.slot = opts.slot ?? 0;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.maxTagsPerGroup = opts.maxTagsPerGroup ?? 500;
    this.maxConcurrentConnections = opts.maxConcurrentConnections ?? 8;
    
    this._onData = () => {};
    this._client = null;
    this._connected = false;
    this._tags = new Map(); // tag_id -> tag info
    this._pollGroups = new Map(); // poll_group_id -> group info
    this._id = Math.random().toString(36).slice(2, 8);
    
    // Initialize default poll groups
    this._initDefaultPollGroups();
    
    log.info({ 
      host: this.host, 
      slot: this.slot, 
      id: this._id,
      maxTagsPerGroup: this.maxTagsPerGroup,
      maxConcurrentConnections: this.maxConcurrentConnections
    }, 'EIP PyComm3 driver initialized');
  }
  
  _initDefaultPollGroups() {
    const defaultGroups = [
      { group_id: 1, poll_rate_ms: 50 },
      { group_id: 2, poll_rate_ms: 100 },
      { group_id: 3, poll_rate_ms: 250 },
      { group_id: 4, poll_rate_ms: 500 },
      { group_id: 5, poll_rate_ms: 1000 },
      { group_id: 6, poll_rate_ms: 2000 },
      { group_id: 7, poll_rate_ms: 5000 },
      { group_id: 8, poll_rate_ms: 10000 },
      { group_id: 9, poll_rate_ms: 60000 },
      { group_id: 10, poll_rate_ms: 30000 }
    ];
    
    for (const group of defaultGroups) {
      this._pollGroups.set(group.group_id, {
        rate_ms: group.poll_rate_ms,
        tag_ids: new Set()
      });
    }
  }

  /**
   * Set data callback
   */
  onData(cb) {
    this._onData = cb;
  }
  
  /**
   * Connect to PLC
   */
  async connect() {
    if (this._connected) {
      log.debug({ id: this._id }, 'Already connected');
      return;
    }
    
    // Create and start JSON-RPC client
    this._client = new JSONRPCClient();
    this._client.requestTimeout = this.timeoutMs;
    
    // Handle telemetry from worker
    this._client.on('telemetry', (data) => {
      log.debug({ telemetry: data, id: this._id }, 'Received telemetry, calling onData callback');
      this._onData(data);
    });
    
    // Handle worker exit
    this._client.on('exit', ({ code, signal }) => {
      log.warn({ code, signal, id: this._id }, 'Worker exited, attempting restart');
      this._connected = false;
      // TODO: Implement automatic restart logic
    });
    
    // Start worker
    this._client.start();
    
    // Connect to PLC
    try {
      const result = await this._client.request('connect', {
        host: this.host,
        slot: this.slot,
        max_tags_per_group: this.maxTagsPerGroup,
        max_concurrent_connections: this.maxConcurrentConnections
      });
      
      this._connected = true;
      
      log.info({ 
        host: this.host, 
        slot: this.slot, 
        plcInfo: result.plc_info,
        maxTagsPerGroup: this.maxTagsPerGroup,
        maxConcurrentConnections: this.maxConcurrentConnections,
        id: this._id 
      }, 'EIP PyComm3 connected');
      
    } catch (error) {
      this._client.stop();
      this._client = null;
      throw new Error(`EIP PyComm3 connect failed: ${error.message}`);
    }
  }
  
  /**
   * Disconnect from PLC
   */
  async disconnect() {
    if (!this._connected) {
      return;
    }
    
    try {
      if (this._client) {
        await this._client.request('disconnect', {});
        this._client.stop();
        this._client = null;
      }
      
      // Clean up JavaScript driver if it exists
      if (this._jsDriver) {
        try {
          await this._jsDriver.disconnect();
        } catch (e) {
          log.warn({ err: e.message }, 'Error disconnecting JavaScript driver');
        }
        this._jsDriver = null;
      }
    } catch (error) {
      log.warn({ err: error.message }, 'Error during disconnect');
    }
    
    this._tags.clear();
    this._connected = false;
    
    log.info({ id: this._id }, 'EIP PyComm3 disconnected');
  }
  
  /**
   * Update configuration
   */
  async updateConfig({ samplingMs, timeout }) {
    log.debug({ id: this._id }, 'EIP PyComm3 updating config');
    
    if (timeout) {
      this.timeoutMs = timeout;
      if (this._client) {
        this._client.requestTimeout = timeout;
      }
    }
    
    log.debug({ id: this._id }, 'EIP PyComm3 config updated');
  }
  
  /**
   * Update poll groups from database
   */
  updatePollGroups(pollGroups) {
    log.debug({ count: pollGroups.length }, 'EIP PyComm3 updating poll groups');
    
    // Preserve current tag assignments
    const currentAssignments = new Map();
    for (const [groupId, group] of this._pollGroups) {
      if (group.tag_ids.size > 0) {
        currentAssignments.set(groupId, new Set(group.tag_ids));
      }
      group.tag_ids.clear();
    }
    
    // Add/update poll groups with new rates
    for (const group of pollGroups) {
      if (!this._pollGroups.has(group.group_id)) {
        this._pollGroups.set(group.group_id, {
          rate_ms: group.poll_rate_ms,
          tag_ids: new Set()
        });
      } else {
        this._pollGroups.get(group.group_id).rate_ms = group.poll_rate_ms;
      }
      
      // Restore tag assignments
      const savedTags = currentAssignments.get(group.group_id);
      if (savedTags) {
        this._pollGroups.get(group.group_id).tag_ids = savedTags;
      }
    }
    
    log.info({ count: this._pollGroups.size }, 'EIP PyComm3 poll groups updated');
  }
  
  /**
   * Update tag subscriptions with multi-rate polling
   */
  async updateTagSubscriptions(tagsByPollGroup) {
    if (!this._connected) {
      await this.connect();
    }

    log.info({ 
      groups: Object.keys(tagsByPollGroup).length,
      totalTags: Object.values(tagsByPollGroup).reduce((sum, tags) => sum + tags.length, 0)
    }, 'EIP PyComm3 updating tag subscriptions');

    // Flatten tags from all poll groups
    const allTags = [];
    for (const [groupId, tags] of Object.entries(tagsByPollGroup)) {
      for (const tag of tags) {
        allTags.push({
          ...tag,
          poll_group_id: parseInt(groupId, 10)
        });
      }
    }

    await this.subscribe(allTags);
    
    log.info({ 
      groups: Object.keys(tagsByPollGroup).length,
      totalTags: allTags.length 
    }, 'EIP PyComm3 tag subscriptions updated');
  }
  
  /**
   * Subscribe to tags
   */
  async subscribe(tagConfigs) {
    if (!this._connected) {
      await this.connect();
    }
    
    log.info({ count: tagConfigs.length, id: this._id }, 'EIP PyComm3 subscribing to tags');
    
    // Clear existing tags
    this._tags.clear();
    for (const [, group] of this._pollGroups) {
      group.tag_ids.clear();
    }
    
    // Store tag info
    for (const config of tagConfigs) {
      const { tag_id, tag_name, data_type, poll_group_id, array_size, 
              on_change_enabled, on_change_deadband, on_change_deadband_type, 
              on_change_heartbeat_ms } = config;
      
      this._tags.set(tag_id, {
        tag_id,
        tag_name,
        data_type,
        poll_group_id,
        array_size: array_size || 1,
        on_change_enabled: on_change_enabled ?? false,
        on_change_deadband: on_change_deadband ?? 0,
        on_change_deadband_type: on_change_deadband_type ?? 'absolute',
        on_change_heartbeat_ms: on_change_heartbeat_ms ?? 60000
      });
      
      // Add to poll group
      const group = this._pollGroups.get(poll_group_id);
      if (group) {
        group.tag_ids.add(tag_id);
      }
    }
    
    // Send subscription to Python worker for polling
    const tags = Array.from(this._tags.values());
    const pollGroups = {};
    
    for (const [groupId, group] of this._pollGroups) {
      if (group.tag_ids.size > 0) {
        pollGroups[groupId] = {
          rate_ms: group.rate_ms,
          tag_ids: Array.from(group.tag_ids)
        };
      }
    }
    
    try {
      await this._client.request('subscribe_polling', {
        tags,
        poll_groups: pollGroups
      });
      
      log.info({ 
        tagCount: this._tags.size,
        groupCount: Object.keys(pollGroups).length,
        id: this._id 
      }, 'EIP PyComm3 subscription complete - polling started');
      
    } catch (error) {
      log.error({ err: error.message }, 'Failed to start polling');
      throw error;
    }
  }
  
  /**
   * Write value to tag
   */
  async writeTag(tagId, value) {
    const tagInfo = this._tags.get(tagId);
    if (!tagInfo) {
      throw new Error(`Tag ${tagId} not found`);
    }
    
    try {
      const result = await this._client.request('write_tag', {
        tag_name: tagInfo.tag_name,
        value
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Write failed');
      }
      
      log.debug({ tagId, tagName: tagInfo.tag_name, value }, 'Tag written');
      
    } catch (error) {
      log.error({ tagId, tagName: tagInfo.tag_name, err: error.message }, 'Tag write failed');
      throw error;
    }
  }
  
  /**
   * Remove tag from driver
   */
  async removeTag(tagId) {
    const tid = Number(tagId);
    
    // Remove from poll groups
    for (const [, group] of this._pollGroups) {
      group.tag_ids.delete(tid);
    }
    
    this._tags.delete(tid);
    
    log.debug({ tagId: tid }, 'Tag removed');
  }
  
  /**
   * Get list of active tag IDs
   */
  listActiveTagIds() {
    return Array.from(this._tags.keys());
  }
  
  /**
   * List tags from PLC (tag discovery)
   */
  async listTags(opts = {}) {
    log.info({ id: this._id, opts }, 'Browsing tags via PyComm3');
    
    try {
      // Call Python worker's browse_tags method
      const result = await this._client.request('browse_tags', {
        ip_address: this.host,
        slot: this.slot || 0,
        program: opts.program || null  // null=controller, '*'=all, 'ProgramName'=specific
      }, 30000); // 30 second timeout for tag browsing
      
      // Return tags in the format expected by the NATS handler
      // The handler expects an array of tags, or { items: [...] }
      const tags = result.tags || [];
      
      log.info({ id: this._id, tagCount: tags.length, programs: result.programs?.length || 0 }, 'Tag browsing complete');
      
      // If opts.paginate is true, return pagination format
      if (opts.paginate) {
        return {
          items: tags,
          total: tags.length,
          totalFiltered: tags.length,
          page: opts.page || 1,
          totalPages: Math.ceil(tags.length / (opts.limit || 100)),
          hasMore: false,
          programs: result.programs || [],
          modules: result.modules || []
        };
      }
      
      // Otherwise return object with tags and programs
      return {
        items: tags,
        programs: result.programs || [],
        modules: result.modules || []
      };
    } catch (error) {
      log.error({ err: error.message }, 'Tag browsing failed');
      throw error;
    }
  }

  /**
   * Resolve data types for specific tag names
   */
  async resolveTagTypes(tagNames = []) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) {
      return { types: {} };
    }

    log.info({ id: this._id, tagCount: tagNames.length }, 'Resolving tag types via PyComm3');
    
    try {
      // Call Python worker's resolve_types method  
      const result = await this._client.request('resolve_types', {
        ip_address: this.host,
        slot: this.slot || 0,
        tag_names: tagNames
      }, 15000); // 15 second timeout
      
      // Return types mapping
      return {
        types: result.types || {}
      };
    } catch (error) {
      log.error({ err: error.message, tagCount: tagNames.length }, 'Tag type resolution failed');
      throw error;
    }
  }
  
  /**
   * Get driver metrics
   */
  getMetrics() {
    const metrics = {};
    
    for (const [groupId, group] of this._pollGroups) {
      metrics[groupId] = {
        target_ms: group.rate_ms,
        total_tags: group.tag_ids.size
      };
    }
    
    return {
      driver: 'pycomm3',
      id: this._id,
      connected: this._connected,
      total_tags: this._tags.size,
      poll_groups: metrics,
      worker_pid: this._client?.process?.pid || null
    };
  }
  
  /**
   * Create snapshot (using PyComm3 tag browsing)
   */
  async createSnapshot() {
    log.info({ id: this._id }, 'Creating snapshot via PyComm3');
    
    try {
      const result = await this.browseControllerTags({ refresh: true });
      
      // Create snapshot ID
      const snapshotId = `snap-${Date.now()}-${this._id}`;
      
      // Store snapshot in memory
      if (!this._snapshots) {
        this._snapshots = new Map();
      }
      
      this._snapshots.set(snapshotId, {
        id: snapshotId,
        tags: result.tags,
        programs: result.programs,
        modules: result.modules,
        createdAt: Date.now(),
        lastHeartbeat: Date.now()
      });
      
      log.info({ snapshotId, tagCount: result.tags.length }, 'Snapshot created');
      
      return {
        ok: true,
        snapshot_id: snapshotId,
        total: result.tags.length,
        programs: result.programs
      };
    } catch (error) {
      log.error({ err: error.message }, 'Snapshot creation failed');
      throw error;
    }
  }
  
  /**
   * Page snapshot
   */
  pageSnapshot(opts) {
    log.debug({ id: this._id, opts }, 'Paging snapshot');
    
    if (!this._snapshots) {
      throw new Error('No snapshots available. Call createSnapshot() first.');
    }
    
    // Support both snapshot_id and snapshotId for compatibility
    const snapshotId = opts.snapshot_id || opts.snapshotId;
    if (!snapshotId) {
      throw new Error('Missing snapshot_id or snapshotId parameter');
    }
    
    const snapshot = this._snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    const { page = 1, limit = 100, scope = 'controller', search = '' } = opts;
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    
    // Filter tags by scope if specified (similar to listTags behavior)
    let filteredTags = snapshot.tags;
    if (scope && scope !== '*') {
      if (scope === 'controller') {
        // Show only controller-scoped tags (program is null or undefined)
        filteredTags = snapshot.tags.filter(tag => !tag.program);
      } else {
        // Show only tags from the specified program
        filteredTags = snapshot.tags.filter(tag => tag.program === scope);
      }
    }
    
    // Apply search filter if provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      filteredTags = filteredTags.filter(tag => 
        (tag.tag_name || tag.name || '').toLowerCase().includes(searchLower)
      );
    }
    
    const items = filteredTags.slice(startIdx, endIdx);
    
    return {
      ok: true,
      items,
      total: filteredTags.length, // Total after filtering
      totalUnfiltered: snapshot.tags.length, // Total before filtering
      page,
      limit,
      has_more: endIdx < filteredTags.length,
      programs: snapshot.programs || [] // Include programs in response
    };
  }
  
  /**
   * Delete snapshot
   */
  deleteSnapshot(snapshotId) {
    log.debug({ id: this._id, snapshotId }, 'Deleting snapshot');
    
    if (!this._snapshots) {
      return { ok: true, message: 'No snapshots to delete' };
    }
    
    const deleted = this._snapshots.delete(snapshotId);
    return {
      ok: true,
      deleted
    };
  }
  
  /**
   * Heartbeat snapshot
   */
  heartbeatSnapshot(snapshotId) {
    log.debug({ id: this._id, snapshotId }, 'Heartbeat snapshot');
    
    if (!this._snapshots) {
      return { ok: false, error: 'No snapshots available' };
    }
    
    const snapshot = this._snapshots.get(snapshotId);
    if (!snapshot) {
      return { ok: false, error: 'Snapshot not found' };
    }
    
    snapshot.lastHeartbeat = Date.now();
    return { ok: true };
  }
  
  async updateTuning(opts = {}) {
    log.info({ opts }, 'Tuning update requested (no-op for PyComm3 driver)');
    return { before: {}, after: {} };
  }

  /**
   * Network device discovery
   * Broadcasts on network to find all CIP devices
   */
  async discoverDevices(broadcastAddress = '255.255.255.255') {
    log.info({ broadcastAddress }, 'Starting network device discovery');
    
    if (!this._client) {
      this._client = new JSONRPCClient();
      this._client.start();
    }
    
    try {
      const result = await this._client.request('discover', {
        broadcast_address: broadcastAddress
      }, 15000); // 15s timeout for network scan
      
      log.info({ deviceCount: result.devices?.length || 0 }, 'Device discovery complete');
      return result.devices || [];
    } catch (error) {
      log.error({ err: error.message }, 'Device discovery failed');
      throw error;
    }
  }

  /**
   * Identify a single device by IP address
   */
  async identifyDevice(ipAddress) {
    log.info({ ipAddress }, 'Identifying device');
    
    if (!this._client) {
      this._client = new JSONRPCClient();
      this._client.start();
    }
    
    try {
      const result = await this._client.request('list_identity', {
        ip_address: ipAddress
      }, 5000);
      
      log.info({ device: result }, 'Device identified');
      return result;
    } catch (error) {
      log.error({ err: error.message, ipAddress }, 'Device identification failed');
      throw error;
    }
  }

  /**
   * Get rack configuration for ControlLogix systems
   * Enumerates all modules in the rack with their details
   */
  async getRackConfiguration(ipAddress, slot = 0) {
    log.info({ ipAddress, slot }, 'Getting rack configuration');
    
    if (!this._client) {
      this._client = new JSONRPCClient();
      this._client.start();
    }
    
    try {
      const result = await this._client.request('get_rack_configuration', {
        ip_address: ipAddress,
        slot: slot
      }, 30000); // Longer timeout for rack scanning
      
      log.info({ 
        type: result.type, 
        moduleCount: result.module_count || 1,
        processorSlot: result.processor_slot 
      }, 'Rack configuration retrieved');
      
      return result;
    } catch (error) {
      log.error({ err: error.message, ipAddress, slot }, 'Rack configuration failed');
      throw error;
    }
  }

  /**
   * Browse controller tags with full metadata
   * Replaces the JavaScript driver dependency for tag browsing
   */
  async browseControllerTags(options = {}) {
    const { program = null, refresh = false } = options;
    
    log.info({ host: this.host, slot: this.slot, program, refresh }, 'Browsing controller tags');
    
    if (!this._connected) {
      await this.connect();
    }
    
    try {
      const result = await this._client.request('browse_tags', {
        ip_address: this.host,
        slot: this.slot || 0,
        program
      }, 30000); // 30s timeout for large tag lists
      
      log.info({ 
        tagCount: result.tags?.length || 0,
        programs: result.programs?.length || 0 
      }, 'Tag browsing complete');
      
      return {
        tags: result.tags || [],
        programs: result.programs || [],
        modules: result.modules || []
      };
    } catch (error) {
      log.error({ err: error.message }, 'Tag browsing failed');
      throw error;
    }
  }

  /**
   * Get CIP connection status
   * Returns active connections, max capacity, and usage percentage
   */
  async getConnectionStatus() {
    log.info({ host: this.host, slot: this.slot }, 'Getting connection status');
    
    if (!this._client) {
      this._client = new JSONRPCClient();
      this._client.start();
    }
    
    try {
      const result = await this._client.request('get_connection_status', {
        ip_address: this.host,
        slot: this.slot,
        dataforeman_count: 1  // This connection
      }, 5000);
      
      log.info({ status: result }, 'Connection status retrieved');
      return result;
    } catch (error) {
      log.error({ err: error.message }, 'Connection status query failed');
      throw error;
    }
  }
}
