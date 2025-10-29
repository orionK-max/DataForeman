import pkg from 'pg';
import pino from 'pino';

const { Pool } = pkg;
const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'db-helper' });

export class DatabaseHelper {
  constructor(opts = {}) {
    this.pool = new Pool({
      host: opts.host || process.env.PGHOST || 'db',
      port: opts.port || process.env.PGPORT || 5432,
      database: opts.database || process.env.PGDATABASE || 'dataforeman',
      user: opts.user || process.env.PGUSER || 'postgres',
      password: opts.password || process.env.PGPASSWORD || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      log.error({ err: String(err?.message || err) }, 'Database pool error');
    });

    log.info({ 
      host: this.pool.options.host, 
      database: this.pool.options.database 
    }, 'Database helper initialized');
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
  log.debug({ query: text.slice(0, 100), duration, rows: res.rowCount }, 'Database query');
      return res;
    } catch (err) {
      const duration = Date.now() - start;
      log.error({ 
        query: text.slice(0, 100), 
        duration, 
        err: String(err?.message || err) 
      }, 'Database query failed');
      throw err;
    }
  }

  async getPollGroups() {
    try {
      const { rows } = await this.query(`
        SELECT group_id, name, poll_rate_ms, description, is_active, created_at
        FROM poll_groups 
        WHERE is_active = true
        ORDER BY group_id
      `);
      
      log.debug({ count: rows.length }, 'Fetched poll groups');
      return rows;
    } catch (err) {
      log.error({ err: String(err?.message || err) }, 'Failed to fetch poll groups');
      throw err;
    }
  }

  async getTagMetadataByConnection(connectionId) {
    // Skip database query for test connections (ID starts with "test-")
    if (typeof connectionId === 'string' && connectionId.startsWith('test-')) {
      log.debug({ connectionId }, 'Skipping tag metadata fetch for test connection');
      return [];
    }
    
    try {
      const { rows } = await this.query(`
        SELECT tm.tag_id, tm.connection_id, tm.driver_type, tm.tag_path, 
               tm.tag_name, tm.data_type, tm.poll_group_id, tm.is_subscribed,
               tm.metadata, pg.poll_rate_ms,
               tm.on_change_enabled, tm.on_change_deadband, 
               tm.on_change_deadband_type, tm.on_change_heartbeat_ms
        FROM tag_metadata tm
        JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
        WHERE tm.connection_id = $1 AND tm.is_subscribed = true
        ORDER BY tm.poll_group_id, tm.tag_path
      `, [connectionId]);
      
      log.debug({ connectionId, count: rows.length }, 'Fetched tag metadata for connection');
      return rows;
    } catch (err) {
      log.error({ 
        connectionId, 
        err: String(err?.message || err) 
      }, 'Failed to fetch tag metadata');
      throw err;
    }
  }

  async getAllSubscribedTags() {
    try {
      const { rows } = await this.query(`
        SELECT tm.tag_id, tm.connection_id, tm.driver_type, tm.tag_path, 
               tm.tag_name, tm.data_type, tm.poll_group_id, tm.is_subscribed,
               tm.metadata, pg.poll_rate_ms,
               tm.on_change_enabled, tm.on_change_deadband, 
               tm.on_change_deadband_type, tm.on_change_heartbeat_ms
        FROM tag_metadata tm
        JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
        WHERE tm.is_subscribed = true
        ORDER BY tm.connection_id, tm.poll_group_id, tm.tag_path
      `);
      
      log.debug({ count: rows.length }, 'Fetched all subscribed tags');
      return rows;
    } catch (err) {
      log.error({ err: String(err?.message || err) }, 'Failed to fetch all subscribed tags');
      throw err;
    }
  }

  // Group tags by connection and poll group for driver configuration
  groupTagsByConnectionAndPollGroup(tags) {
    const result = {};
    
    for (const tag of tags) {
      const connId = tag.connection_id;
      const pollGroupId = tag.poll_group_id;
      
      if (!result[connId]) {
        result[connId] = {};
      }
      
      if (!result[connId][pollGroupId]) {
        result[connId][pollGroupId] = [];
      }
      
      result[connId][pollGroupId].push(tag);
    }
    
    return result;
  }

  async close() {
    try {
      await this.pool.end();
      log.info('Database helper closed');
    } catch (err) {
      log.error({ err: String(err?.message || err) }, 'Database helper close failed');
    }
  }

  // Health check
  async isHealthy() {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
