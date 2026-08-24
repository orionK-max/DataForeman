/**
 * Remote Sidecar Driver
 *
 * Generic proxy driver for the "installable connectivity drivers" framework (Phase 0).
 * Instead of implementing a protocol itself, this driver forwards the standard
 * lifecycle calls (init/start/stop/updateConfig) to an installed driver's sidecar
 * container over HTTP, per the Driver Plugin Protocol:
 *
 *   POST {baseUrl}/init          { connectionId, config }
 *   POST {baseUrl}/start         { connectionId }
 *   POST {baseUrl}/stop          { connectionId }
 *   POST {baseUrl}/update-config { connectionId, config }
 *   POST {baseUrl}/rpc           { connectionId, method, params }
 *   GET  {baseUrl}/health
 *
 * Telemetry is NOT relayed through this driver — sidecars publish directly to
 * `df.telemetry.raw.<connectionId>` on NATS themselves (see docs/implementing-new-communication-driver.md
 * for the payload shape). This driver only handles lifecycle + ad-hoc RPC/control calls.
 *
 * One instance of this class is created per connection, same as every other driver
 * (opcuaClient.mjs, s7.mjs, etc.) — see connectivity/src/index-multirate.mjs.
 */

import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'remote-sidecar-driver' });

const DEFAULT_TIMEOUT_MS = 8000;

export class RemoteSidecarDriver {
  /**
   * @param {Object} opts
   * @param {string} opts.baseUrl - Sidecar base URL, e.g. http://tuya-driver:8200
   * @param {string} opts.connectionId
   * @param {string} opts.driverType - e.g. 'tuya', for logging only
   * @param {number} [opts.timeoutMs]
   */
  constructor({ baseUrl, connectionId, driverType, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.connectionId = connectionId;
    this.driverType = driverType;
    this.timeoutMs = timeoutMs;
  }

  async _post(path, body) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (!res.ok) {
        throw new Error(json?.error || `sidecar returned HTTP ${res.status}`);
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async init(config) {
    log.info({ connectionId: this.connectionId, driverType: this.driverType, baseUrl: this.baseUrl }, 'Initializing remote sidecar driver');
    return this._post('/init', { connectionId: this.connectionId, config });
  }

  async start() {
    return this._post('/start', { connectionId: this.connectionId });
  }

  async stop() {
    return this._post('/stop', { connectionId: this.connectionId });
  }

  // Alias so this fits the same shape as other drivers, which are stopped via disconnect()
  async disconnect() {
    try {
      await this.stop();
    } catch (err) {
      log.warn({ connectionId: this.connectionId, err: String(err?.message || err) }, 'Remote sidecar stop failed during disconnect');
    }
  }

  async updateConfig(config) {
    return this._post('/update-config', { connectionId: this.connectionId, config });
  }

  /**
   * Forward an arbitrary named operation to the sidecar (control/command calls,
   * e.g. Tuya's set_value, or driver-specific browse/discover-style calls).
   * @param {string} method
   * @param {Object} [params]
   */
  async rpc(method, params = {}) {
    return this._post('/rpc', { connectionId: this.connectionId, method, params });
  }

  getMetrics() {
    return null;
  }
}
