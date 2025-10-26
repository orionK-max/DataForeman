import pino from 'pino';
const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 's7' });

// Lazy import for CJS module
async function getSnap7() {
  const mod = await import('node-snap7');
  // node-snap7 is CJS default export
  return mod.default || mod;
}

// Parse addresses like:
//  - DB1.DBX0.0  (Bool)
//  - DB1.DBB0    (Byte)
//  - DB1.DBW0    (Int16)
//  - DB1.DBD0    (Real)
//  - MB0 / MW0 / MD0 (Marker area byte/word/dword)
//  - IB0 / IW0 / ID0 (Inputs area)
//  - QB0 / QW0 / QD0 (Outputs area)
function parseS7Address(addr) {
  if (typeof addr !== 'string') throw new Error(`invalid_address:${addr}`);
  let m;
  if ((m = /^DB(\d+)\.DBX(\d+)\.(\d+)$/.exec(addr))) {
    return { area: 'DB', db: Number(m[1]), kind: 'BOOL', byte: Number(m[2]), bit: Number(m[3]) };
  }
  if ((m = /^DB(\d+)\.DBB(\d+)$/.exec(addr))) {
    return { area: 'DB', db: Number(m[1]), kind: 'BYTE', byte: Number(m[2]) };
  }
  if ((m = /^DB(\d+)\.DBW(\d+)$/.exec(addr))) {
    return { area: 'DB', db: Number(m[1]), kind: 'INT', byte: Number(m[2]) };
  }
  if ((m = /^DB(\d+)\.DBD(\d+)$/.exec(addr))) {
    return { area: 'DB', db: Number(m[1]), kind: 'REAL', byte: Number(m[2]) };
  }
  if ((m = /^(M|I|Q)B(\d+)$/.exec(addr))) {
    return { area: m[1], kind: 'BYTE', byte: Number(m[2]) };
  }
  if ((m = /^(M|I|Q)W(\d+)$/.exec(addr))) {
    return { area: m[1], kind: 'INT', byte: Number(m[2]) };
  }
  if ((m = /^(M|I|Q)D(\d+)$/.exec(addr))) {
    return { area: m[1], kind: 'REAL', byte: Number(m[2]) };
  }
  if ((m = /^(M|I|Q)X(\d+)\.(\d+)$/.exec(addr))) {
    return { area: m[1], kind: 'BOOL', byte: Number(m[2]), bit: Number(m[3]) };
  }
  throw new Error(`unsupported_address:${addr}`);
}

export class S7Driver {
  constructor(opts = {}) {
    this.host = opts.host;
    this.rack = opts.rack ?? 0;
    this.slot = opts.slot ?? 1;
    this.port = opts.port ?? 102; // not used by node-snap7 ConnectTo
    this.tagMap = opts.tagMap || {}; // tag_id -> address string
    this.samplingMs = opts.samplingMs ?? 1000;
    this._onData = () => {};
    this.client = null;
    this._snap7 = null; // raw import (compat)
    this.snap7 = null;  // module object exposing constants (S7AreaDB, S7WL*, etc.)
    this._pollTimer = null;
    this._polling = false;
    this._activeTags = [];
    // Multi-rate support
    this._pollGroups = new Map(); // group_id -> { rate_ms, tagIds: Set<number>, timer: NodeJS.Timer, polling: boolean }
    // Write on change
    this._lastValues = new Map(); // tag_id -> { value, timestamp, quality }
    this._tagConfigs = new Map(); // tag_id -> { on_change_enabled, on_change_deadband, on_change_deadband_type, on_change_heartbeat_ms }
  }

  listActiveTagIds() {
    try {
      const set = new Set();
      for (const id of this._activeTags) set.add(id);
      // Include any keys from tagMap (active candidate list)
      for (const k of Object.keys(this.tagMap || {})) set.add(Number(k));
      return Array.from(set.values()).filter(n => Number.isFinite(n));
    } catch { return []; }
  }

  async removeTag(tagId) {
    const tid = Number(tagId);
    if (!Number.isFinite(tid)) return;
    let removed = false;
    try {
      if (this.tagMap && this.tagMap[tid] != null) { delete this.tagMap[tid]; removed = true; }
      const before = this._activeTags.length;
      this._activeTags = this._activeTags.filter(id => id !== tid);
      if (before !== this._activeTags.length) removed = true;
      // If using poll groups placeholder
      for (const [, g] of this._pollGroups) { if (g?.tagIds?.delete && g.tagIds.delete(tid)) removed = true; }
    } catch {}
    if (removed) log.info({ tagId: tid }, 'S7 removed tag');
  }

  onData(cb) { this._onData = cb; }

  async connect() {
    if (!this.host) throw new Error('host_required');
    if (!this._snap7) this._snap7 = await getSnap7();
    // node-snap7 exposes constants directly on the module object
    const mod = this._snap7;
    const S7Client = mod.S7Client || mod.default?.S7Client || mod.Client || mod.default?.Client;
    if (!S7Client) throw new Error('snap7_S7Client_not_found');
    this.snap7 = mod;
    this.client = new S7Client();
    await new Promise((resolve, reject) => {
      try {
        this.client.ConnectTo(this.host, this.rack, this.slot, (err) => {
          if (err) return reject(err);
          resolve();
        });
      } catch (e) { reject(e); }
    });
    log.info({ host: this.host, rack: this.rack, slot: this.slot }, 'S7 connected');
  }

  async disconnect() {
    // Stop all poll group timers
    for (const [groupId, group] of this._pollGroups) {
      try {
        if (group.timer) {
          clearInterval(group.timer);
          group.timer = null;
        }
      } catch (e) {
        log.warn({ groupId, err: e.message }, 'Error stopping poll group timer');
      }
    }
    
    // Stop legacy single timer if present
    try { if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; } } catch {}
    
    // Clear value change detection cache on disconnect
    this._lastValues.clear();
    
    try { await new Promise((r) => { try { this.client?.Disconnect(); } catch {} r(); }); } catch {}
    this.client = null;
  }

  async startPolling(tagIds) {
    // Legacy single-rate polling - deprecated in favor of multi-rate poll groups
    log.warn('S7 startPolling called - this is deprecated, use updateTagSubscriptions with poll groups');
    
    this._activeTags = Array.isArray(tagIds) && tagIds.length
      ? tagIds.filter((id) => this.tagMap[id] != null)
      : Object.keys(this.tagMap).map((k) => Number(k)).filter((n) => !Number.isNaN(n));
    if (this._pollTimer) return; // already running
    this._pollTimer = setInterval(() => this._pollOnce().catch((e) => this._handlePollError(e)), this.samplingMs);
    // do an immediate poll for initial snapshot
    this._pollOnce().catch((e) => this._handlePollError(e));
  }

  // Update poll groups from database
  updatePollGroups(pollGroups) {
    // Stop existing timers before updating
    for (const [groupId, group] of this._pollGroups) {
      if (group.timer) {
        clearInterval(group.timer);
        group.timer = null;
      }
    }
    
    this._pollGroups.clear();
    for (const g of (pollGroups || [])) {
      this._pollGroups.set(g.group_id, { 
        rate_ms: g.poll_rate_ms, 
        tagIds: new Set(),
        timer: null,
        polling: false
      });
    }
    log.info({ groups: this._pollGroups.size }, 'S7 poll groups updated');
  }

  async updateTagSubscriptions(tagsByPollGroup) {
    // Stop all existing timers
    for (const [groupId, group] of this._pollGroups) {
      if (group.timer) {
        clearInterval(group.timer);
        group.timer = null;
      }
      group.tagIds.clear();
    }
    
    // Stop legacy single timer
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    
    // Assign tags to poll groups and update configurations
    let totalTags = 0;
    for (const [groupIdStr, tags] of Object.entries(tagsByPollGroup || {})) {
      const groupId = parseInt(groupIdStr, 10);
      const group = this._pollGroups.get(groupId);
      
      if (!group) {
        log.warn({ groupId }, 'Poll group not found, skipping tags');
        continue;
      }
      
      for (const tag of tags) {
        if (this.tagMap[tag.tag_id]) {
          group.tagIds.add(tag.tag_id);
          totalTags++;
          
          // Update tag configuration for write on change
          this._tagConfigs.set(tag.tag_id, {
            on_change_enabled: tag.on_change_enabled ?? false,
            on_change_deadband: tag.on_change_deadband ?? 0,
            on_change_deadband_type: tag.on_change_deadband_type ?? 'absolute',
            on_change_heartbeat_ms: tag.on_change_heartbeat_ms ?? 60000
          });
        }
      }
    }
    
    // Start polling for each group
    for (const [groupId, group] of this._pollGroups) {
      if (group.tagIds.size > 0) {
        this._startPollGroup(groupId, group);
        log.info({ 
          groupId, 
          rate_ms: group.rate_ms, 
          tags: group.tagIds.size 
        }, 'S7 poll group started');
      }
    }
    
    log.info({ 
      groups: this._pollGroups.size, 
      totalTags 
    }, 'S7 multi-rate subscriptions updated');
  }

  _startPollGroup(groupId, group) {
    if (group.timer) return; // already running
    
    // Create timer for this poll group
    group.timer = setInterval(() => {
      this._pollGroupOnce(groupId, group).catch((e) => this._handlePollError(e));
    }, group.rate_ms);
    
    // Do an immediate poll for initial snapshot
    this._pollGroupOnce(groupId, group).catch((e) => this._handlePollError(e));
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
        log.debug?.({ tagId, elapsed, interval: config.on_change_heartbeat_ms }, 'S7 force publish (heartbeat)');
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
            log.debug?.({ tagId, oldValue, newValue, percentChange, deadband }, 'S7 skipped (percent deadband)');
            return false;
          }
        } else {
          // Absolute deadband
          const diff = Math.abs(newValue - oldValue);
          if (diff < deadband) {
            log.debug?.({ tagId, oldValue, newValue, diff, deadband }, 'S7 skipped (absolute deadband)');
            return false;
          }
        }
      } else {
        // Exact match required
        if (oldValue === newValue) {
          log.debug?.({ tagId, value: newValue }, 'S7 skipped (exact match)');
          return false;
        }
      }
      return true;
    }
    
    // Boolean, string, or other types - exact comparison
    if (oldValue === newValue) {
      log.debug?.({ tagId, value: newValue, type: typeof newValue }, 'S7 skipped (no change)');
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

  async _pollGroupOnce(groupId, group) {
    if (group.polling) return; // already polling this group
    group.polling = true;
    
    try {
      if (!this.client) await this._retryConnect();
      if (!this.client) return; // still not available
      
      const now = new Date().toISOString();
      for (const tagId of group.tagIds) {
        const addr = this.tagMap[tagId];
        if (!addr) continue;
        
        try {
          const { v } = await this._readAddress(addr);
          const q = 0; // quality: 0 = good
          
          // Check if value changed
          if (this._hasValueChanged(tagId, v, q)) {
            this._onData({ tag_id: tagId, v, q, ts: now });
            this._updateLastValue(tagId, v, q);
          }
        } catch (e) {
          log.warn({ tagId, addr, groupId, err: this._errorText(e) }, 'S7 read failed');
        }
      }
    } finally {
      group.polling = false;
    }
  }

  async _handlePollError(err) {
    log.warn({ err: String(err?.message || err) }, 'S7 poll failed; reconnecting');
    try { await this.disconnect(); } catch {}
    await this._retryConnect();
  }

  async _retryConnect() {
    for (let i = 0; i < 5; i++) {
      try { await this.connect(); return; } catch (e) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
    }
    // give up for now; next poll tick will try again
  }

  async _pollOnce() {
    if (this._polling) return;
    this._polling = true;
    try {
      if (!this.client) await this._retryConnect();
      if (!this.client) return; // still not available
      const now = new Date().toISOString();
      for (const tagId of this._activeTags) {
        const addr = this.tagMap[tagId];
        try {
          const { v } = await this._readAddress(addr);
          this._onData({ tag_id: tagId, v, q: 0, ts: now });
        } catch (e) {
          log.warn({ tagId, addr, err: this._errorText(e) }, 'S7 read failed');
        }
      }
    } finally {
      this._polling = false;
    }
  }

  async read(tagIds) {
    // One-shot read of provided tag IDs (numbers) using current connection
    const ids = Array.isArray(tagIds) && tagIds.length
      ? tagIds
      : Object.keys(this.tagMap).map((k) => Number(k)).filter((n) => !Number.isNaN(n));
    const now = new Date().toISOString();
    const out = [];
    if (!this.client) await this._retryConnect();
    if (!this.client) return out;
    for (const id of ids) {
      const addr = this.tagMap[id];
      if (!addr) continue;
      try {
        const { v } = await this._readAddress(addr);
        out.push({ tag_id: id, v, q: 0, ts: now });
      } catch (e) {
        out.push({ tag_id: id, v: null, q: -1, ts: now });
      }
    }
    return out;
  }

  // Diagnostics helper (used by tooling/tests): raw DB byte read
  async readDbBytes(db, start, size) {
    if (!this.client) await this._retryConnect();
    if (!this.client) throw new Error('s7client_not_connected');
    return await this._dbRead(Number(db), Number(start), Number(size));
  }

  async _readAddress(addrStr) {
    if (!this.client) throw new Error('s7client_not_connected');
    const a = parseS7Address(addrStr);
    const isDB = a.area === 'DB';
    const areaCode = isDB ? null : this._mapAreaCode(a.area);
    if (a.kind === 'BOOL') {
      // read one byte, then extract bit
      const buf = isDB ? await this._dbRead(a.db, a.byte, 1) : await this._areaRead(areaCode, a.byte, 1);
      const v = (buf[0] >> a.bit) & 1 ? true : false;
      return { v };
    }
    if (a.kind === 'BYTE') {
      const buf = isDB ? await this._dbRead(a.db, a.byte, 1) : await this._areaRead(areaCode, a.byte, 1);
      return { v: buf[0] };
    }
    if (a.kind === 'INT') {
      const buf = isDB ? await this._dbRead(a.db, a.byte, 2) : await this._areaRead(areaCode, a.byte, 2);
      return { v: buf.readInt16BE(0) };
    }
    if (a.kind === 'REAL') {
      const buf = isDB ? await this._dbRead(a.db, a.byte, 4) : await this._areaRead(areaCode, a.byte, 4);
      return { v: buf.readFloatBE(0) };
    }
    throw new Error(`unsupported_kind:${a.kind}`);
  }

  async _dbRead(dbNumber, start, size) {
    // Prefer DBRead for DB area
    if (typeof this.client.DBRead === 'function') {
      return await new Promise((resolve, reject) => {
        this.client.DBRead(dbNumber, start, size, (err, res) => {
          if (err) return reject(err);
          resolve(res);
        });
      });
    }
    // Fallback to ReadArea with WLByte and amount=size
    return await new Promise((resolve, reject) => {
      this.client.ReadArea(this.client.S7AreaDB, dbNumber, start, size, this.client.S7WLByte, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  async _areaRead(areaCode, start, size) {
    return await new Promise((resolve, reject) => {
      this.client.ReadArea(areaCode, 0, start, size, this.client.S7WLByte, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  async write(requests) {
    if (!this.client) throw new Error('s7client_not_connected');
    for (const r of requests) {
      const addrStr = this.tagMap[r.tag_id];
      if (!addrStr) continue;
      const a = parseS7Address(addrStr);
      const isDB = a.area === 'DB';
      try {
        if (a.kind === 'BOOL') {
          // read-modify-write one byte
          const buf = isDB ? await this._dbRead(a.db, a.byte, 1) : await this._areaRead(this._mapAreaCode(a.area), a.byte, 1);
          if (r.v) buf[0] = buf[0] | (1 << a.bit); else buf[0] = buf[0] & ~(1 << a.bit);
          if (isDB) await this._dbWrite(a.db, a.byte, buf); else await this._areaWrite(this._mapAreaCode(a.area), a.byte, buf);
        } else if (a.kind === 'BYTE') {
          const buf = Buffer.from([Number(r.v) & 0xFF]);
          if (isDB) await this._dbWrite(a.db, a.byte, buf); else await this._areaWrite(this._mapAreaCode(a.area), a.byte, buf);
        } else if (a.kind === 'INT') {
          const buf = Buffer.alloc(2);
          buf.writeInt16BE(Number(r.v) | 0, 0);
          if (isDB) await this._dbWrite(a.db, a.byte, buf); else await this._areaWrite(this._mapAreaCode(a.area), a.byte, buf);
        } else if (a.kind === 'REAL') {
          const buf = Buffer.alloc(4);
          buf.writeFloatBE(Number(r.v), 0);
          if (isDB) await this._dbWrite(a.db, a.byte, buf); else await this._areaWrite(this._mapAreaCode(a.area), a.byte, buf);
        } else {
          throw new Error(`unsupported_kind:${a.kind}`);
        }
        log.info({ tagId: r.tag_id, addr: addrStr }, 'S7 write OK');
      } catch (e) {
        log.warn({ tagId: r.tag_id, addr: addrStr, err: this._errorText(e) }, 'S7 write failed');
      }
    }
  }

  async _dbWrite(dbNumber, start, buf) {
    const size = buf?.length ?? 0;
    if (typeof this.client.DBWrite === 'function') {
      await new Promise((resolve, reject) => {
        this.client.DBWrite(dbNumber, start, size, buf, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      return;
    }
    await new Promise((resolve, reject) => {
      this.client.WriteArea(this.client.S7AreaDB, dbNumber, start, size, this.client.S7WLByte, buf, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async _areaWrite(areaCode, start, buf) {
    const size = buf?.length ?? 0;
    await new Promise((resolve, reject) => {
      this.client.WriteArea(areaCode, 0, start, size, this.client.S7WLByte, buf, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  _mapAreaCode(area) {
    if (!this.client) throw new Error('s7client_not_connected');
    switch (area) {
      case 'M': return this.client.S7AreaMK; // Marker (Merker)
      case 'I': return this.client.S7AreaPE; // Inputs (E)
      case 'Q': return this.client.S7AreaPA; // Outputs (A)
      default: throw new Error(`unsupported_area:${area}`);
    }
  }

  _errorText(e) {
    let code = undefined;
    if (typeof e === 'number') code = e;
    else if (typeof e === 'string' && /^\d+$/.test(e)) code = Number(e);
    else if (e && typeof e === 'object') {
      if (typeof e.code === 'number') code = e.code;
      else if (typeof e.errno === 'number') code = e.errno;
      else if (typeof e.message === 'string' && /^\d+$/.test(e.message)) code = Number(e.message);
    }
    if (code && this.client && typeof this.client.ErrorText === 'function') {
      try {
        const t = this.client.ErrorText(code);
        return `${code}${t ? ' ' + t : ''}`;
      } catch (_) {}
    }
    return String(e?.message || e);
  }
}
