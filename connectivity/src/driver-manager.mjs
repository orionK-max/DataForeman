/**
 * Driver Manager (installable connectivity drivers framework, Phase 0)
 *
 * Maintains an in-memory registry of installable driver types, sourced from the
 * `connectivity_driver_types` table (populated by core's Library Manager when a
 * "connectivityDriver" extension is installed/enabled/disabled — see
 * core/src/routes/libraries.js). connectivity queries this table directly via its
 * own DB connection (dbHelper) rather than core pushing it over NATS.
 *
 * This does NOT replace the existing static if/else dispatch for the 5 built-in
 * drivers (opcua-client, opcua-server, s7, eip, mqtt) in index-multirate.mjs — it
 * only adds a lookup path for anything else, routed through the generic
 * RemoteSidecarDriver proxy.
 */

import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'driver-manager' });

class DriverManagerClass {
  constructor() {
    this._types = new Map(); // driver_type -> { rpcSubjectPrefix, sidecarBaseUrl, sidecarServiceName, libraryId }
  }

  async refresh(dbHelper) {
    if (!dbHelper) return;
    try {
      const { rows } = await dbHelper.query(
        `SELECT driver_type, rpc_subject_prefix, sidecar_base_url, sidecar_service_name, library_id
         FROM connectivity_driver_types
         WHERE enabled = true`
      );
      const next = new Map();
      for (const row of rows) {
        next.set(row.driver_type, {
          rpcSubjectPrefix: row.rpc_subject_prefix,
          sidecarBaseUrl: row.sidecar_base_url,
          sidecarServiceName: row.sidecar_service_name,
          libraryId: row.library_id
        });
      }
      const added = [...next.keys()].filter(t => !this._types.has(t));
      const removed = [...this._types.keys()].filter(t => !next.has(t));
      this._types = next;
      if (added.length || removed.length) {
        log.info({ added, removed, total: this._types.size }, 'Installable driver type registry refreshed');
      }
    } catch (err) {
      // Table may not exist yet on older DBs mid-migration; degrade gracefully.
      log.warn({ err: String(err?.message || err) }, 'Failed to refresh installable driver types');
    }
  }

  has(driverType) {
    return this._types.has(driverType);
  }

  get(driverType) {
    return this._types.get(driverType);
  }

  types() {
    return [...this._types.keys()];
  }
}

export const DriverManager = new DriverManagerClass();
export default DriverManager;
