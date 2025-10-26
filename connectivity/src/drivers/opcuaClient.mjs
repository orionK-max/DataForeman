import pino from 'pino';
import opcuaPkg from 'node-opcua';
const {
  OPCUAClient,
  AttributeIds,
  TimestampsToReturn,
  DataType,
  SecurityPolicy,
  MessageSecurityMode,
  DataChangeFilter,
  DataChangeTrigger,
  DeadbandType,
  NodeClass,
} = opcuaPkg;

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'opcua' });

// Contract:
// - ctor(opts): { endpoint, auth, tagMap: { [tag_id:number]: nodeId:string }, samplingMs, deadband, queueSize }
// - onData(cb): cb({ tag_id, ts, v, q, src_ts }) for subscription updates
// - connect()/disconnect()
// - browse(rootNodeId?:string)
// - subscribe(tagIds:number[])
// - read(tagIds:number[])
// - write(requests: Array<{ tag_id:number, v:any }>)

export class OPCUAClientDriver {
  constructor(opts) {
    this.endpoint = opts.endpoint;
    this.auth = opts.auth || {};
    this.tagMap = opts.tagMap || {}; // tag_id -> nodeId
    this.samplingMs = opts.samplingMs ?? 1000;
    this.deadband = opts.deadband ?? 0; // percentage for PercentDeadband
    this.queueSize = opts.queueSize ?? 10;
  this.securityStrategy = opts.security_strategy || 'auto'; // 'auto' | 'none_first' | 'secure_first'
    this._onData = () => {};
    this.client = null;
    this.session = null;
    // Single-subscription fields (kept for backward compat but no longer used for multi-rate)
    this.subscription = null;
    this.monitoredItems = new Map(); // tag_id -> monitoredItem (spans all groups)
  this.namespaceArray = [];
  this._subscriptionTerminated = false;
  // Future multi-rate support placeholders
  this._pollGroups = new Map(); // group_id -> { samplingMs, tagIds: Set<number> }
  // Multi-rate: group subscriptions map
  this.groupSubscriptions = new Map(); // groupKey -> { subscription, samplingMs, monitored: Map<tagId, MonitoredItem>, terminated: boolean }
  // Write on change
  this._lastValues = new Map(); // tag_id -> { value, timestamp, quality }
  this._tagConfigs = new Map(); // tag_id -> { on_change_enabled, on_change_deadband, on_change_deadband_type, on_change_heartbeat_ms }
  }

  listActiveTagIds() {
    try {
      const ids = new Set();
      // From back-compat single subscription map
      for (const tid of this.monitoredItems.keys()) ids.add(tid);
      // From group subscriptions
      for (const [, gs] of this.groupSubscriptions) {
        if (gs?.monitored) { for (const tid of gs.monitored.keys()) ids.add(tid); }
      }
      return Array.from(ids.values());
    } catch { return []; }
  }

  async removeTag(tagId) {
    const tid = Number(tagId);
    if (!Number.isFinite(tid)) return;
    let removed = false;
    // Remove from single subscription map if present
    try {
      if (this.monitoredItems?.has(tid)) {
        try { await this.monitoredItems.get(tid)?.terminate?.(); } catch {}
        this.monitoredItems.delete(tid);
        removed = true;
      }
    } catch {}
    // Remove from all group subscriptions
    try {
      for (const [gk, gs] of this.groupSubscriptions) {
        if (gs?.monitored?.has(tid)) {
          try { await gs.monitored.get(tid)?.terminate?.(); } catch {}
          gs.monitored.delete(tid);
          removed = true;
        }
      }
    } catch {}
    // Remove from tagMap to prevent re-subscribe on next reload
    try { if (this.tagMap && this.tagMap[tid] != null) { delete this.tagMap[tid]; removed = true; } } catch {}
    if (removed) {
      log.info({ tagId: tid }, 'OPC UA client removed tag');
    }
  }

  onData(cb) { this._onData = cb; }

  async connect() {
    const connectionStrategy = { initialDelay: 500, maxRetry: 1 };
    // Try secure first as recommended by opc-plc: Basic256Sha256 + SignAndEncrypt
    let attempts;
    if (this.securityStrategy === 'none_first') {
      attempts = [
        { policy: SecurityPolicy.None, mode: MessageSecurityMode.None },
        { policy: SecurityPolicy.Basic256Sha256, mode: MessageSecurityMode.SignAndEncrypt },
        { policy: SecurityPolicy.Basic256Sha256, mode: MessageSecurityMode.Sign },
      ];
    } else if (this.securityStrategy === 'secure_first') {
      attempts = [
        { policy: SecurityPolicy.Basic256Sha256, mode: MessageSecurityMode.SignAndEncrypt },
        { policy: SecurityPolicy.Basic256Sha256, mode: MessageSecurityMode.Sign },
        { policy: SecurityPolicy.None, mode: MessageSecurityMode.None },
      ];
    } else { // auto (alias secure_first current behavior)
      attempts = [
        { policy: SecurityPolicy.Basic256Sha256, mode: MessageSecurityMode.SignAndEncrypt },
        { policy: SecurityPolicy.Basic256Sha256, mode: MessageSecurityMode.Sign },
        { policy: SecurityPolicy.None, mode: MessageSecurityMode.None },
      ];
    }

    let lastErr;
    for (const attempt of attempts) {
      try {
        this.client = OPCUAClient.create({
          applicationName: 'DataForeman-OPCUA-Client',
          connectionStrategy,
          endpointMustExist: false,
          keepSessionAlive: true,
          securityPolicy: attempt.policy,
          securityMode: attempt.mode,
        });
        log.info({ endpoint: this.endpoint, policy: SecurityPolicy[attempt.policy], mode: MessageSecurityMode[attempt.mode] }, 'OPC UA connecting');
        await this.client.connect(this.endpoint);
        const userIdentity = this._userIdentityFromAuth(this.auth);
        this.session = await this.client.createSession(userIdentity);
        log.info({ endpoint: this.endpoint, policy: SecurityPolicy[attempt.policy], mode: MessageSecurityMode[attempt.mode] }, 'OPC UA connected');
        try {
          this.namespaceArray = await this.session.readNamespaceArray();
          log.info({ namespaces: this.namespaceArray }, 'OPC UA namespaces');
        } catch (e) {
          log.warn({ err: String(e?.message || e) }, 'Failed to read namespace array');
          this.namespaceArray = [];
        }
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        try { await this.client?.disconnect(); } catch {}
        this.client = null;
        log.warn({ endpoint: this.endpoint, err: String(err?.message || err), policy: SecurityPolicy[attempt.policy], mode: MessageSecurityMode[attempt.mode] }, 'OPC UA connect attempt failed');
      }
    }
    if (!this.session) {
      const msg = `Failed to connect to OPC UA endpoint ${this.endpoint}: ${String(lastErr?.message || lastErr || 'unknown')}`;
      throw new Error(msg);
    }
  }

  _userIdentityFromAuth(auth) {
    if (!auth) return null;
    if (auth.user) return { type: 1, userName: auth.user, password: auth.pass || '' }; // UserNameIdentityToken
    return null;
  }

  async disconnect() {
    // Terminate group subscriptions first (multi-rate)
    try {
      for (const [gk, gs] of this.groupSubscriptions) {
        try { await gs.subscription?.terminate(); } catch {}
      }
    } catch {}
    this.groupSubscriptions.clear();
    // Back-compat single subscription cleanup
    try { if (this.subscription) { await this.subscription.terminate(); } } catch {}
    try { if (this.session) { await this.session.close(); } } catch {}
    try { if (this.client) { await this.client.disconnect(); } } catch {}
    this.subscription = null;
    this._subscriptionTerminated = false;
    this.session = null;
    this.client = null;
    try { this.monitoredItems.clear(); } catch {}
    // Clear value change detection cache on disconnect
    this._lastValues.clear();
  }

  async browse(rootNodeId = 'RootFolder') {
    // Normalize common aliases to concrete NodeIds for convenience
    const aliasMap = {
      Root: 'RootFolder',
      RootFolder: 'RootFolder',
      Objects: 'ns=0;i=85',
      ObjectsFolder: 'ns=0;i=85',
      Types: 'ns=0;i=86',
      Views: 'ns=0;i=87',
      Server: 'ns=0;i=2253',
    };
    if (typeof rootNodeId === 'string' && aliasMap[rootNodeId]) {
      rootNodeId = aliasMap[rootNodeId];
    }
    let attempts = 0;
    while (attempts < 2) {
      try {
        if (!this.session) {
          await this.connect();
        }
        const result = await this.session.browse(rootNodeId);
        const items = result.references?.map(r => ({
          browseName: r.browseName?.toString?.() || '',
          displayName: r.displayName?.text || '',
          nodeId: r.nodeId?.toString?.() || '',
          // Map numeric nodeClass to its symbolic name for easier UI logic
          nodeClass: (typeof r.nodeClass === 'number' && NodeClass[r.nodeClass]) ? NodeClass[r.nodeClass] : (r.nodeClass ? String(r.nodeClass) : undefined),
        })) || [];
        return items;
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('Session has been closed') && attempts === 0) {
          log.warn({ err: msg }, 'OPC UA browse detected closed session; reconnecting');
          try { await this.disconnect(); } catch {}
          attempts++;
          continue; // retry after reconnect
        }
        throw err;
      }
    }
  }

  async getAttributes(nodeId) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        if (!this.session) {
          await this.connect();
        }
        const nid = this._resolveNodeId(nodeId);
        const toRead = [
          { attributeId: AttributeIds.NodeClass, nodeId: nid },
          { attributeId: AttributeIds.BrowseName, nodeId: nid },
          { attributeId: AttributeIds.DisplayName, nodeId: nid },
          { attributeId: AttributeIds.Description, nodeId: nid },
          { attributeId: AttributeIds.DataType, nodeId: nid },
          { attributeId: AttributeIds.ValueRank, nodeId: nid },
          { attributeId: AttributeIds.ArrayDimensions, nodeId: nid },
          { attributeId: AttributeIds.AccessLevel, nodeId: nid },
          { attributeId: AttributeIds.UserAccessLevel, nodeId: nid },
        ];
        const dvs = await this.session.read(toRead);
        const byAttr = (idx) => dvs[idx]?.value?.value;
        const browseName = byAttr(1)?.toString?.() || String(byAttr(1) ?? '');
        const displayName = byAttr(2)?.text || String(byAttr(2) ?? '');
        const description = byAttr(3)?.text || undefined;
        const dataTypeNodeId = byAttr(4);
        let dataType;
        try {
          if (dataTypeNodeId && typeof dataTypeNodeId === 'object') {
            const ns = dataTypeNodeId.namespace;
            const val = dataTypeNodeId.value;
            if (ns === 0 && typeof val === 'number' && DataType[val] !== undefined) {
              dataType = DataType[val];
            } else if (dataTypeNodeId.toString) {
              dataType = dataTypeNodeId.toString();
            }
          } else if (typeof dataTypeNodeId === 'number' && DataType[dataTypeNodeId]) {
            dataType = DataType[dataTypeNodeId];
          } else if (dataTypeNodeId && dataTypeNodeId.toString) {
            dataType = dataTypeNodeId.toString();
          }
        } catch {}
        const valueRank = byAttr(5);
        const arrayDimensions = byAttr(6);
        const accessLevel = byAttr(7);
        const userAccessLevel = byAttr(8);
        let value = undefined;
        try {
          const dv = await this.session.readVariableValue(nid);
          value = dv?.value?.value;
        } catch {}
        const writable = typeof userAccessLevel === 'number' ? (userAccessLevel & 0x02) > 0 : undefined;
        return {
          nodeId: nodeId,
          browseName,
          displayName,
          description,
          dataType,
          valueRank,
          arrayDimensions,
          accessLevel,
          userAccessLevel,
          writable,
          value,
        };
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('Session has been closed') && attempts === 0) {
          log.warn({ err: msg }, 'OPC UA attributes detected closed session; reconnecting');
          try { await this.disconnect(); } catch {}
          attempts++;
          continue;
        }
        throw err;
      }
    }
  }

  async ensureSubscription() {
    if (this.subscription && !this._subscriptionTerminated) return this.subscription;
    // Reset any stale subscription state
    this.subscription = null;
    this._subscriptionTerminated = false;
    // Auto-establish session if missing to recover from transient disconnects
    if (!this.session) {
      try {
        await this.connect();
      } catch (e) {
        const msg = String(e?.message || e);
        log.error({ err: msg }, 'OPC UA ensureSubscription failed to (re)connect');
        throw e;
      }
    }
    const sub = await this.session.createSubscription2({
      requestedPublishingInterval: this.samplingMs,
      requestedLifetimeCount: 1000,
      requestedMaxKeepAliveCount: 20,
      maxNotificationsPerPublish: 5000,
      publishingEnabled: true,
      priority: 1,
    });
    // Attach lifecycle listeners so we know when to recreate
    sub.on?.('keepalive', () => {
      log.debug?.({ samplingMs: this.samplingMs }, 'OPC UA subscription keepalive');
    });
    sub.on?.('terminated', () => {
      this._subscriptionTerminated = true;
      this.subscription = null;
      const tagCount = this.monitoredItems.size;
      // Clear monitored items cache; they'll be recreated on next subscribe call
      try { this.monitoredItems.clear(); } catch {}
      log.warn({ 
        affectedTags: tagCount,
        timestamp: new Date().toISOString()
      }, 'OPC UA subscription terminated - will auto-recreate on next operation');
    });
    sub.on?.('error', (err) => {
      log.error({ err: String(err?.message || err) }, 'OPC UA subscription error');
    });
    this.subscription = sub;
    log.info({ samplingMs: this.samplingMs }, 'OPC UA subscription created');
    return sub;
  }

  _hasValueChanged(tagId, newValue, newQuality) {
    const config = this._tagConfigs.get(tagId);
    if (!config?.on_change_enabled) return true; // always publish if write on change disabled
    
    const last = this._lastValues.get(tagId);
    
    // Always publish on first read
    if (!last) return true;
    
    // Always publish if quality changed
    if (last.quality !== newQuality) return true;
    
    // Check force publish interval (heartbeat)
    if (config.on_change_heartbeat_ms && config.on_change_heartbeat_ms > 0) {
      const elapsed = Date.now() - last.timestamp;
      if (elapsed >= config.on_change_heartbeat_ms) {
        log.debug?.({ tagId, elapsed, interval: config.on_change_heartbeat_ms }, 'OPC UA force publish (heartbeat)');
        return true;
      }
    }
    
    // Type-specific comparison
    const oldValue = last.value;
    
    // Null/undefined handling
    if (oldValue == null || newValue == null) {
      return oldValue !== newValue;
    }
    
    // Numeric with deadband
    if (typeof newValue === 'number' && typeof oldValue === 'number') {
      const deadband = config.on_change_deadband ?? 0;
      
      if (deadband > 0) {
        if (config.on_change_deadband_type === 'percent') {
          // Percentage-based deadband
          const base = Math.abs(oldValue) || 1; // avoid division by zero
          const percentChange = Math.abs((newValue - oldValue) / base) * 100;
          if (percentChange < deadband) {
            log.debug?.({ tagId, oldValue, newValue, percentChange, deadband }, 'OPC UA skipped (percent deadband)');
            return false;
          }
        } else {
          // Absolute deadband
          const diff = Math.abs(newValue - oldValue);
          if (diff < deadband) {
            log.debug?.({ tagId, oldValue, newValue, diff, deadband }, 'OPC UA skipped (absolute deadband)');
            return false;
          }
        }
      } else {
        // Exact match required
        if (oldValue === newValue) {
          log.debug?.({ tagId, value: newValue }, 'OPC UA skipped (exact match)');
          return false;
        }
      }
      return true;
    }
    
    // Boolean, string, or other types - exact comparison
    if (oldValue === newValue) {
      log.debug?.({ tagId, value: newValue, type: typeof newValue }, 'OPC UA skipped (no change)');
      return false;
    }
    
    return true;
  }

  _updateLastValue(tagId, value, quality) {
    this._lastValues.set(tagId, {
      value,
      quality,
      timestamp: Date.now()
    });
  }

  // Ensure group-specific subscription with its own publishing interval
  async ensureGroupSubscription(groupKey, samplingMs) {
    // Normalize and ensure session
    if (!this.session) {
      await this.connect();
    }
    const existing = this.groupSubscriptions.get(groupKey);
    if (existing && !existing.terminated) {
      // If publishing interval changed significantly (>5%) recreate to honor new rate
      const cur = existing.samplingMs || 0;
      const diff = Math.abs(cur - (samplingMs || 0));
      const thresh = Math.max(5, (cur || 1) * 0.05);
      if (diff <= thresh) return existing.subscription;
      try { await existing.subscription?.terminate(); } catch {}
      this.groupSubscriptions.delete(groupKey);
    }
    const pubInterval = samplingMs ?? this.samplingMs;
    const sub = await this.session.createSubscription2({
      requestedPublishingInterval: pubInterval,
      requestedLifetimeCount: 1000,
      requestedMaxKeepAliveCount: 20,
      maxNotificationsPerPublish: 5000,
      publishingEnabled: true,
      priority: 1,
    });
    const state = { subscription: sub, samplingMs: pubInterval, monitored: new Map(), terminated: false };
    sub.on?.('keepalive', () => {
      log.debug?.({ group: groupKey, samplingMs: pubInterval }, 'OPC UA group subscription keepalive');
    });
    sub.on?.('terminated', () => {
      state.terminated = true;
      const tagCount = state.monitored.size;
      try { state.monitored.clear(); } catch {}
      log.warn({ 
        group: groupKey, 
        samplingMs: pubInterval,
        affectedTags: tagCount,
        timestamp: new Date().toISOString()
      }, 'OPC UA group subscription terminated - will auto-recreate on next refresh');
    });
    sub.on?.('error', (err) => {
      log.error({ group: groupKey, err: String(err?.message || err) }, 'OPC UA group subscription error');
    });
    this.groupSubscriptions.set(groupKey, state);
    log.info({ group: groupKey, samplingMs: pubInterval }, 'OPC UA group subscription created');
    return sub;
  }

  updatePollGroups(pollGroups) {
    // pollGroups: Array<{ group_id, poll_rate_ms }>
    this._pollGroups.clear();
    for (const g of pollGroups || []) {
      this._pollGroups.set(g.group_id, { samplingMs: g.poll_rate_ms, tagIds: new Set() });
    }
  log.debug?.({ groups: this._pollGroups.size }, 'OPC UA poll groups staged');
  }

  async updateTagSubscriptions(tagsByPollGroup) {
    // tagsByPollGroup: { [groupId]: Array<{ tag_id, ... }> }
    if (!tagsByPollGroup) tagsByPollGroup = {};

    // Build set of desired tags per normalized group key and update configurations
    const normalizeGroupKey = (g) => (g === null || g === undefined) ? 'default' : String(g);
    const desiredByGroup = new Map(); // groupKey -> Set<tagId>
    for (const [rawKey, arr] of Object.entries(tagsByPollGroup)) {
      const gk = normalizeGroupKey(rawKey === 'null' ? null : rawKey);
      if (!desiredByGroup.has(gk)) desiredByGroup.set(gk, new Set());
      for (const t of (arr || [])) {
        desiredByGroup.get(gk).add(t.tag_id);
        
        // Update tag configuration for write on change
        this._tagConfigs.set(t.tag_id, {
          on_change_enabled: t.on_change_enabled ?? false,
          on_change_deadband: t.on_change_deadband ?? 0,
          on_change_deadband_type: t.on_change_deadband_type ?? 'absolute',
          on_change_heartbeat_ms: t.on_change_heartbeat_ms ?? 60000
        });
      }
    }

    // Create/update subscriptions per group
    for (const [gk, tagSet] of desiredByGroup) {
      const gIdNum = (gk === 'default') ? undefined : (isNaN(Number(gk)) ? undefined : Number(gk));
      const pg = gIdNum !== undefined ? this._pollGroups.get(gIdNum) : undefined;
      const groupSampling = pg?.samplingMs ?? this.samplingMs;
      
      // Check if subscription exists and is terminated - recreate if needed
      const existingState = this.groupSubscriptions.get(gk);
      if (existingState?.terminated) {
        const affectedTags = existingState.monitored.size;
        log.warn({ 
          group: gk, 
          affectedTags,
          samplingMs: groupSampling 
        }, 'OPC UA detected terminated subscription - recreating');
        try {
          await existingState.subscription?.terminate();
        } catch {}
        this.groupSubscriptions.delete(gk);
        // Clear monitored items for this group
        for (const tagId of existingState.monitored.keys()) {
          this.monitoredItems.delete(tagId);
        }
        existingState.monitored.clear();
      }
      
      const wasTerminated = existingState?.terminated || false;
      const sub = await this.ensureGroupSubscription(gk, groupSampling);
      
      if (wasTerminated) {
        log.info({ 
          group: gk, 
          samplingMs: groupSampling,
          tagCount: tagSet.size 
        }, 'OPC UA subscription successfully recreated after termination');
      }
      
      // Determine currently monitored for this group
      const state = this.groupSubscriptions.get(gk);
      const monitored = state?.monitored || new Map();

      // Unmonitor tags no longer desired in this group
      for (const [tagId, mi] of Array.from(monitored.entries())) {
        if (!tagSet.has(tagId)) {
          try { await mi.terminate?.(); } catch {}
          monitored.delete(tagId);
          this.monitoredItems.delete(tagId);
          log.debug?.({ group: gk, tagId }, 'OPC UA unmonitored tag (removed/moved)');
        }
      }

      // Add new monitored items for tags in this group
      const nodePairs = [];
      for (const tagId of tagSet) {
        if (monitored.has(tagId)) continue;
        const nodeId = this._resolveNodeId(this.tagMap[tagId]);
        if (!nodeId) { log.warn({ tagId }, 'No nodeId for tag (skip subscribe)'); continue; }
        const parameters = {
          samplingInterval: groupSampling,
          discardOldest: true,
          queueSize: this.queueSize,
          filter: this.deadband > 0 ? new DataChangeFilter({
            deadbandType: DeadbandType.Percent,
            deadbandValue: this.deadband,
            trigger: DataChangeTrigger.StatusValue,
          }) : undefined,
        };
        const itemToMonitor = { nodeId, attributeId: AttributeIds.Value };
        try {
          const mi = await sub.monitor(itemToMonitor, parameters, TimestampsToReturn.Both);
          mi.on('changed', (dataValue) => {
            const v = dataValue.value?.value;
            const q = dataValue.statusCode?.value;
            const src_ts = dataValue.sourceTimestamp?.toISOString?.();
            const ts = (dataValue.serverTimestamp || new Date()).toISOString?.() || new Date().toISOString();
            
            // Check if value changed before publishing
            if (this._hasValueChanged(tagId, v, q)) {
              this._onData({ tag_id: tagId, v, q, src_ts, ts });
              this._updateLastValue(tagId, v, q);
            }
          });
          monitored.set(tagId, mi);
          this.monitoredItems.set(tagId, mi);
          nodePairs.push([tagId, nodeId]);
          log.debug?.({ group: gk, tagId, nodeId, samplingInterval: parameters.samplingInterval }, 'OPC UA monitoring started');
        } catch (e) {
          log.error({ group: gk, tagId, nodeId, err: String(e?.message || e) }, 'OPC UA monitor failed');
        }
      }

      // Publish initial snapshot for the group's tags we just added
      if (nodePairs.length > 0) {
        try {
          const nodeIds = nodePairs.map(([, nid]) => nid);
          const dvs = await this.session.readVariableValue(nodeIds);
          const now = new Date().toISOString();
          for (let i = 0; i < dvs.length; i++) {
            const dv = dvs[i];
            const tagId = nodePairs[i][0];
            this._onData({
              tag_id: tagId,
              v: dv?.value?.value,
              q: dv?.statusCode?.value,
              src_ts: dv?.sourceTimestamp?.toISOString?.(),
              ts: dv?.serverTimestamp?.toISOString?.() || now,
            });
          }
          log.debug?.({ group: gk, count: nodePairs.length }, 'OPC UA initial snapshot published');
        } catch (e) {
          log.warn({ group: gk, err: String(e?.message || e) }, 'OPC UA initial snapshot read failed');
        }
      }
    }

    // For any existing groups not present anymore, terminate their subscriptions
    for (const [gk, gs] of Array.from(this.groupSubscriptions.entries())) {
      if (!desiredByGroup.has(gk)) {
        try { await gs.subscription?.terminate(); } catch {}
        this.groupSubscriptions.delete(gk);
        // Remove monitored items for tags that belonged to this group
        try {
          for (const tagId of gs.monitored.keys()) this.monitoredItems.delete(tagId);
        } catch {}
        log.info({ group: gk }, 'OPC UA group subscription removed (no tags)');
      }
    }

    // Done
    const totalTags = Array.from(this.monitoredItems.keys()).length;
    log.info({ groups: desiredByGroup.size, totalTags }, 'OPC UA multi-rate subscriptions updated');
  }

  async subscribe(tagIds) {
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      // Nothing to subscribe; avoid server error BadNothingToDo
      log.debug?.('OPC UA subscribe called with no tags');
      return;
    }
    // Back-compat: subscribe all tags to a single default group
    const gk = 'default';
    const pg = undefined;
    const sampling = this.samplingMs;
    const sub = await this.ensureGroupSubscription(gk, sampling);
    const state = this.groupSubscriptions.get(gk);
    const monitored = state?.monitored || new Map();
    const ops = [];
    for (const tagId of tagIds) {
      if (this.monitoredItems.has(tagId)) continue;
      const nodeId = this._resolveNodeId(this.tagMap[tagId]);
      if (!nodeId) { log.warn({ tagId }, 'No nodeId for tag'); continue; }
      const parameters = {
        samplingInterval: sampling,
        discardOldest: true,
        queueSize: this.queueSize,
        filter: this.deadband > 0 ? new DataChangeFilter({
          deadbandType: DeadbandType.Percent,
          deadbandValue: this.deadband,
          trigger: DataChangeTrigger.StatusValue,
        }) : undefined,
      };
      const itemToMonitor = { nodeId, attributeId: AttributeIds.Value };
      let mi;
      try {
        mi = await sub.monitor(itemToMonitor, parameters, TimestampsToReturn.Both);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('subscription must be active') || msg.includes('terminated')) {
          // Recover by recreating the subscription once
          log.warn({ err: msg }, 'OPC UA monitor failed due to inactive subscription; recreating');
          try { await state.subscription?.terminate(); } catch {}
          this.groupSubscriptions.delete(gk);
          const sub2 = await this.ensureGroupSubscription(gk, sampling);
          mi = await sub2.monitor(itemToMonitor, parameters, TimestampsToReturn.Both);
        } else {
          log.error({ tagId, nodeId, err: msg }, 'OPC UA monitor failed');
          continue;
        }
      }
      log.info({ tagId, nodeId, samplingInterval: parameters.samplingInterval }, 'OPC UA monitoring started');
      mi.on('changed', (dataValue) => {
        const v = dataValue.value?.value;
        const q = dataValue.statusCode?.value;
        const src_ts = dataValue.sourceTimestamp?.toISOString?.();
        const ts = (dataValue.serverTimestamp || new Date()).toISOString?.() || new Date().toISOString();
        log.info({ tagId, v, q, src_ts, ts }, 'OPC UA value changed');
        this._onData({ tag_id: tagId, v, q, src_ts, ts });
      });
      this.monitoredItems.set(tagId, mi);
      monitored.set(tagId, mi);
    }
    // Emit initial snapshot
    try {
      const pairs = tagIds.map((id) => [id, this._resolveNodeId(this.tagMap[id])]).filter(([, nid]) => !!nid);
      if (!pairs || pairs.length === 0) return; // avoid BadNothingToDo
      const nodeIds = pairs.map(([, nid]) => nid);
      const dvs = await this.session.readVariableValue(nodeIds);
      const now = new Date().toISOString();
      const snapshot = dvs.map((dv, i) => ({
        tag_id: pairs[i][0],
        v: dv?.value?.value,
        q: dv?.statusCode?.value,
        src_ts: dv?.sourceTimestamp?.toISOString?.(),
        ts: dv?.serverTimestamp?.toISOString?.() || now,
      }));
      for (const pt of snapshot) {
        this._onData(pt);
      }
      log.info({ count: snapshot.length }, 'OPC UA initial snapshot published');
    } catch (e) {
      log.warn({ err: String(e?.message || e) }, 'OPC UA initial snapshot read failed');
    }
  }

  async read(tagIds) {
    if (!this.session) throw new Error('not_connected');
    const nodeIds = tagIds.map((tagId) => this._resolveNodeId(this.tagMap[tagId]));
    const started = Date.now();
    log.debug({ count: tagIds.length, sample: tagIds.slice(0, 10) }, 'OPC UA read request');
    let dataValues;
    try {
      dataValues = await this.session.readVariableValue(nodeIds);
    } catch (e) {
      const tookMs = Date.now() - started;
      log.error({ err: String(e?.message || e), tookMs, count: tagIds.length }, 'OPC UA read failed');
      throw e;
    }
    const now = new Date().toISOString();
    const tookMs = Date.now() - started;
    log.info({ count: tagIds.length, tookMs }, 'OPC UA read handled');
    return dataValues.map((dv, i) => ({
      tag_id: tagIds[i],
      v: dv.value?.value,
      q: dv.statusCode?.value,
      src_ts: dv.sourceTimestamp?.toISOString?.(),
      ts: dv.serverTimestamp?.toISOString?.() || now,
    }));
  }

  async write(requests) {
    if (!this.session) throw new Error('not_connected');
    const results = [];
    const started = Date.now();
    log.debug({ count: Array.isArray(requests) ? requests.length : 0, sample: (requests || []).slice(0, 5).map((r) => r?.tag_id) }, 'OPC UA write request');
    for (const r of requests) {
      const nodeId = this._resolveNodeId(this.tagMap[r.tag_id]);
      if (!nodeId) {
        log.warn({ tagId: r.tag_id }, 'OPC UA write skipped: unknown nodeId');
        results.push({ tag_id: r.tag_id, status: -1 });
        continue;
      }
      // Choose candidate data types and fall back if server rejects type
      let candidates;
      if (typeof r.v === 'number') {
        const isInt = Number.isInteger(r.v);
        candidates = isInt
          ? [DataType.Double, DataType.Float, DataType.Int32, DataType.UInt32]
          : [DataType.Double, DataType.Float];
      } else if (typeof r.v === 'boolean') {
        candidates = [DataType.Boolean];
      } else {
        candidates = [DataType.String];
      }
      let status = -1;
      for (const dt of candidates) {
        const wv = [{
          nodeId,
          attributeId: AttributeIds.Value,
          value: { value: { dataType: dt, value: r.v } },
        }];
        let sc;
        try {
          [sc] = await this.session.write(wv);
        } catch (e) {
          log.warn({ tagId: r.tag_id, nodeId, dataType: DataType[dt], err: String(e?.message || e) }, 'OPC UA write threw');
          continue;
        }
        status = sc?.value;
        log.info({ tagId: r.tag_id, nodeId, dataType: DataType[dt], status }, 'OPC UA write attempt');
        if (status === 0) break; // Good
      }
      results.push({ tag_id: r.tag_id, status });
    }
    const tookMs = Date.now() - started;
    log.info({ count: results.length, tookMs }, 'OPC UA write handled');
    return results;
  }

  _guessDataType(v) {
    const t = typeof v;
    if (t === 'number') return DataType.Double;
    if (t === 'boolean') return DataType.Boolean;
    return DataType.String;
  }

  _resolveNodeId(nodeIdStr) {
    if (!nodeIdStr || typeof nodeIdStr !== 'string') return nodeIdStr;
    if (nodeIdStr.startsWith('nsu=')) {
      // ExpandedNodeId form: nsu=<uri>;s|i|g|b=<id>
      const m = /^nsu=([^;]+);(s|i|g|b)=(.+)$/.exec(nodeIdStr);
      if (!m) return nodeIdStr;
      const uri = m[1];
      const idType = m[2];
      const idVal = m[3];
      const nsIndex = this.namespaceArray.indexOf(uri);
      const idx = nsIndex >= 0 ? nsIndex : 2; // default fallback
      return `ns=${idx};${idType}=${idVal}`;
    }
    return nodeIdStr;
  }
}
