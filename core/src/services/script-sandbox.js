// Script Sandbox for Flow Studio
// Provides secure JavaScript execution environment with controlled access to tags, flow state, and filesystem

import vm from 'vm';
import path from 'path';
import fs from 'fs/promises';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_TIMEOUT = 60000; // 60 seconds

/**
 * Create tag access helpers for sandbox
 * @param {Object} app - Fastify app instance
 * @param {String} flowId - Flow ID for access control
 * @param {Map} nodeOutputs - Current node outputs in execution
 * @returns {Object} Tag access API
 */
function createTagsAPI(app, flowId, nodeOutputs) {
  return {
    /**
     * Get current value of a tag
     * @param {String} tagPath - Tag path (e.g., 'plc1.temperature')
     * @returns {Object} { value, quality, timestamp }
     */
    async get(tagPath) {
      if (typeof tagPath !== 'string') {
        throw new Error('Tag path must be a string');
      }
      
      // Query tag by path
      const result = await app.db.query(
        'SELECT tag_id, data_type FROM tag_metadata WHERE tag_path = $1 AND is_deleted = false',
        [tagPath]
      );
      
      if (result.rows.length === 0) {
        return { value: null, quality: 0, timestamp: null, error: 'Tag not found' };
      }
      
      // For now, return placeholder
      // TODO: Integrate with actual tag value cache
      return {
        value: null,
        quality: 0, // Good quality (OPC UA standard)
        timestamp: new Date().toISOString(),
        tagId: result.rows[0].tag_id,
        dataType: result.rows[0].data_type
      };
    },
    
    /**
     * Get historical tag values
     * @param {String} tagPath - Tag path
     * @param {String|Number} duration - Duration as string ('1h', '30m') or milliseconds
     * @returns {Array} Array of { value, quality, timestamp }
     */
    async history(tagPath, duration = '1h') {
      if (typeof tagPath !== 'string') {
        throw new Error('Tag path must be a string');
      }
      
      // Get tag ID
      const tagResult = await app.db.query(
        'SELECT tag_id FROM tag_metadata WHERE tag_path = $1 AND is_deleted = false',
        [tagPath]
      );
      
      if (tagResult.rows.length === 0) {
        return [];
      }
      
      const tagId = tagResult.rows[0].tag_id;
      
      // Parse duration
      let intervalStr = '1 hour';
      if (typeof duration === 'string') {
        const match = duration.match(/^(\d+)(h|m|s|d)$/);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2];
          const units = { s: 'second', m: 'minute', h: 'hour', d: 'day' };
          intervalStr = `${value} ${units[unit]}${value > 1 ? 's' : ''}`;
        }
      } else if (typeof duration === 'number') {
        intervalStr = `${duration} milliseconds`;
      }
      
      // Query TimescaleDB
      const tsdb = app.tsdb || app.db;
      const historyResult = await tsdb.query(
        `SELECT 
           v_num as value,
           quality,
           ts as timestamp
         FROM tag_values
         WHERE tag_id = $1
           AND ts >= NOW() - INTERVAL '${intervalStr}'
         ORDER BY ts DESC
         LIMIT 10000`,
        [tagId]
      );
      
      return historyResult.rows.map(row => ({
        value: row.value,
        quality: row.quality,
        timestamp: row.timestamp
      }));
    }
  };
}

/**
 * Create flow state access helpers
 * @param {Object} app - Fastify app instance
 * @param {String} flowId - Flow ID
 * @returns {Object} Flow state API
 */
function createFlowAPI(app, flowId) {
  return {
    /**
     * Get/set flow static data (persistent state)
     */
    state: {
      async get(key) {
        const result = await app.db.query(
          'SELECT static_data FROM flows WHERE id = $1',
          [flowId]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Flow not found');
        }
        
        const staticData = result.rows[0].static_data || {};
        return key ? staticData[key] : staticData;
      },
      
      async set(key, value) {
        // Get current static_data
        const result = await app.db.query(
          'SELECT static_data FROM flows WHERE id = $1',
          [flowId]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Flow not found');
        }
        
        const staticData = result.rows[0].static_data || {};
        
        if (typeof key === 'object') {
          // Set entire object
          Object.assign(staticData, key);
        } else {
          // Set single key
          staticData[key] = value;
        }
        
        // Update in database
        await app.db.query(
          'UPDATE flows SET static_data = $1, updated_at = now() WHERE id = $2',
          [staticData, flowId]
        );
        
        return staticData;
      }
    }
  };
}

/**
 * Create filesystem access API with path validation
 * @param {Object} app - Fastify app instance
 * @param {Array} allowedPaths - Array of allowed base paths
 * @returns {Object} Filesystem API
 */
function createFilesystemAPI(app, allowedPaths = []) {
  /**
   * Validate and resolve path
   * @param {String} filePath - Path to validate
   * @returns {String} Resolved absolute path
   */
  function validatePath(filePath) {
    if (typeof filePath !== 'string') {
      throw new Error('Path must be a string');
    }
    
    // Resolve to absolute path
    const resolvedPath = path.resolve(filePath);
    
    // Check for path traversal attempts
    if (filePath.includes('..')) {
      throw new Error('Path traversal not allowed');
    }
    
    // Check against allowed paths
    if (allowedPaths.length === 0) {
      throw new Error('No filesystem paths are configured. Set FLOW_ALLOWED_PATHS environment variable.');
    }
    
    const isAllowed = allowedPaths.some(allowedPath => {
      const resolvedAllowed = path.resolve(allowedPath);
      return resolvedPath.startsWith(resolvedAllowed);
    });
    
    if (!isAllowed) {
      throw new Error(`Access denied: Path '${filePath}' is not in allowed paths`);
    }
    
    return resolvedPath;
  }
  
  return {
    /**
     * Read file contents
     * @param {String} filePath - Path to file
     * @param {String} encoding - File encoding (default: 'utf8')
     * @returns {String|Buffer} File contents
     */
    async readFile(filePath, encoding = 'utf8') {
      const validPath = validatePath(filePath);
      
      // Check file size
      const stats = await fs.stat(validPath);
      if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`);
      }
      
      return await fs.readFile(validPath, encoding);
    },
    
    /**
     * Write file contents
     * @param {String} filePath - Path to file
     * @param {String|Buffer} data - Data to write
     * @param {String} encoding - File encoding (default: 'utf8')
     */
    async writeFile(filePath, data, encoding = 'utf8') {
      const validPath = validatePath(filePath);
      
      // Check data size
      const dataSize = Buffer.byteLength(data);
      if (dataSize > MAX_FILE_SIZE) {
        throw new Error(`Data too large: ${dataSize} bytes (max ${MAX_FILE_SIZE})`);
      }
      
      await fs.writeFile(validPath, data, encoding);
    },
    
    /**
     * Check if file exists
     * @param {String} filePath - Path to file
     * @returns {Boolean} True if file exists
     */
    async exists(filePath) {
      try {
        const validPath = validatePath(filePath);
        await fs.access(validPath);
        return true;
      } catch {
        return false;
      }
    },
    
    /**
     * List directory contents
     * @param {String} dirPath - Path to directory
     * @returns {Array} Array of file/directory names
     */
    async readdir(dirPath) {
      const validPath = validatePath(dirPath);
      return await fs.readdir(validPath);
    }
  };
}

/**
 * Execute JavaScript code in a sandbox
 * @param {String} code - JavaScript code to execute
 * @param {Object} context - Execution context
 * @param {Object} options - Execution options
 * @returns {Object} { result, logs, error }
 */
export async function executeScript(code, context = {}, options = {}) {
  const {
    app,
    flowId,
    nodeOutputs = new Map(),
    input = null,
    timeout = DEFAULT_TIMEOUT,
    allowedPaths = []
  } = options;
  
  if (!app) {
    throw new Error('App instance required for script execution');
  }
  
  if (!flowId) {
    throw new Error('Flow ID required for script execution');
  }
  
  // Validate timeout
  const execTimeout = Math.min(Math.max(timeout, 0), MAX_TIMEOUT);
  
  // Capture console logs
  const logs = [];
  const consoleProxy = {
    log: (...args) => logs.push({ level: 'log', args: args.map(String) }),
    info: (...args) => logs.push({ level: 'info', args: args.map(String) }),
    warn: (...args) => logs.push({ level: 'warn', args: args.map(String) }),
    error: (...args) => logs.push({ level: 'error', args: args.map(String) })
  };
  
  // Create sandbox context
  const sandbox = {
    console: consoleProxy,
    $input: input,
    $tags: createTagsAPI(app, flowId, nodeOutputs),
    $flow: createFlowAPI(app, flowId),
    $fs: createFilesystemAPI(app, allowedPaths),
    // Expose safe globals
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    // Block dangerous globals
    require: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
    Buffer: undefined,
    setImmediate: undefined,
    setInterval: undefined,
    setTimeout: undefined,
    clearImmediate: undefined,
    clearInterval: undefined,
    clearTimeout: undefined
  };
  
  try {
    // Create VM context
    const vmContext = vm.createContext(sandbox);
    
    // Wrap code in async function to support await
    const wrappedCode = `
      (async function() {
        ${code}
      })()
    `;
    
    // Execute with timeout
    const script = new vm.Script(wrappedCode);
    const result = await script.runInContext(vmContext, {
      timeout: execTimeout,
      displayErrors: true
    });
    
    return {
      result,
      logs,
      error: null
    };
    
  } catch (error) {
    return {
      result: null,
      logs,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    };
  }
}

/**
 * Parse allowed paths from environment variable
 * @returns {Array} Array of allowed paths
 */
export function getAllowedPaths() {
  const pathsEnv = process.env.FLOW_ALLOWED_PATHS || '';
  if (!pathsEnv) {
    return [];
  }
  
  return pathsEnv.split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => path.resolve(p));
}
