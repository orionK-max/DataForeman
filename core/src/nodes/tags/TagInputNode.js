import { BaseNode } from '../base/BaseNode.js';

/**
 * Tag Input Node
 * 
 * Reads the latest value from a tag in the system.
 * Queries tag_metadata for tag info and tag_values for the latest value.
 */
export class TagInputNode extends BaseNode {
  description = {
    displayName: 'Tag Input',
    name: 'tag-input',
    version: 1,
    description: 'Read value from a tag',
    category: 'TAG_OPERATIONS',
    
    // No inputs - reads from database
    inputs: [],
    
    // Single output with the tag value
    outputs: [{ type: 'main', displayName: 'Output' }],
    
    // Configuration parameters
    properties: [
      {
        displayName: 'Tag',
        name: 'tagId',
        type: 'tag',
        required: true,
        description: 'Select the tag to read from'
      },
      {
        displayName: 'Maximum Data Age',
        name: 'maxDataAge',
        type: 'number',
        default: -1,
        description: 'Maximum age of data in seconds. -1 = any age (uses cached value), 0 = live data only (1s tolerance), >0 = custom max age.',
        placeholder: 'e.g., 5 for 5 seconds, 0 for live, -1 for any age'
      }
    ]
  };

  /**
   * Validate that tagId is provided
   */
  validate(node) {
    const errors = [];
    
    if (!node.data?.tagId) {
      errors.push('Tag input node requires a tagId parameter');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        if (result.stale) {
          return `Tag "${result.tagPath}": stale data (${result.ageSeconds}s old, max ${result.maxDataAge || 0}s)`;
        }
        return `Read tag "${result.tagPath}": ${result.value} (quality: ${result.quality})`;
      },
      debug: (result) => `Tag ID: ${result.tagPath}, timestamp: ${result.timestamp}`,
      error: (error) => `Failed to read tag: ${error.message}`
    };
  }

  /**
   * Execute tag input - read latest value from database
   */
  async execute(context) {
    const tagId = this.getParameter(context.node, 'tagId');
    const maxDataAge = this.getParameter(context.node, 'maxDataAge', -1);
    
    if (!tagId) {
      throw new Error('Tag input node missing tagId');
    }

    // Get tag metadata from postgres
    const metaResult = await context.query(
      'SELECT tag_path, data_type, connection_id, driver_type FROM tag_metadata WHERE tag_id = $1',
      [tagId]
    );

    if (metaResult.rows.length === 0) {
      throw new Error(`Tag ${tagId} not found`);
    }

    const { tag_path: tagPath, connection_id: connectionId, driver_type: driverType } = metaResult.rows[0];

    // System tags use system_metrics table, others use tag_values
    let valueResult;
    if (driverType === 'SYSTEM') {
      // System metrics are stored separately
      const tsdb = context.app.tsdb || context.app.db;
      valueResult = await tsdb.query(
        `SELECT ts, v_num FROM system_metrics WHERE tag_id = $1 ORDER BY ts DESC LIMIT 1`,
        [tagId]
      );
      
      if (valueResult.rows.length === 0) {
        context.logWarn({ tagId, tagPath }, 'No system metrics found');
        return { value: null, quality: 0, tagPath };
      }
      
      const row = valueResult.rows[0];
      
      // Check data age if maxDataAge is set
      if (maxDataAge >= 0) {
        const ageSeconds = (Date.now() - new Date(row.ts).getTime()) / 1000;
        // Treat 0 as "live data only" with 1 second tolerance
        const effectiveMaxAge = maxDataAge === 0 ? 1 : maxDataAge;
        if (ageSeconds > effectiveMaxAge) {
          context.logWarn({ tagId, tagPath, ageSeconds, maxDataAge }, 'Data too old');
          return { 
            value: null, 
            quality: 0, 
            tagPath,
            stale: true,
            ageSeconds: Math.round(ageSeconds)
          };
        }
      }
      
      return {
        value: row.v_num != null ? Number(row.v_num) : null,
        quality: 192, // System metrics always have good quality
        tagPath,
        timestamp: row.ts
      };
    }

    // Get latest value from timescale DB (EIP, OPCUA, S7, INTERNAL tags)
    const tsdb = context.app.tsdb || context.app.db;
    valueResult = await tsdb.query(
      `SELECT ts, quality, v_num, v_text, v_json
       FROM tag_values
       WHERE connection_id = $1 AND tag_id = $2
       ORDER BY ts DESC
       LIMIT 1`,
      [connectionId, tagId]
    );

    // No data yet - return null with bad quality
    if (valueResult.rows.length === 0) {
      context.logWarn({ tagId, tagPath }, 'No tag values found in cache');
      return { 
        value: null, 
        quality: 0, 
        tagPath 
      };
    }

    // Extract value with precedence: v_json -> v_num -> v_text
    const row = valueResult.rows[0];
    
    // Check data age if maxDataAge is set
    if (maxDataAge >= 0) {
      const ageSeconds = (Date.now() - new Date(row.ts).getTime()) / 1000;
      // Treat 0 as "live data only" with 1 second tolerance
      const effectiveMaxAge = maxDataAge === 0 ? 1 : maxDataAge;
      if (ageSeconds > effectiveMaxAge) {
        context.logWarn({ tagId, tagPath, ageSeconds, maxDataAge }, 'Data too old');
        return { 
          value: null, 
          quality: 0, 
          tagPath,
          stale: true,
          ageSeconds: Math.round(ageSeconds)
        };
      }
    }
    
    const value = row.v_json != null ? row.v_json : 
                  (row.v_num != null ? Number(row.v_num) : 
                  (row.v_text != null ? row.v_text : null));
    const quality = row.quality != null ? row.quality : 192;

    return { 
      value, 
      quality, 
      tagPath,
      timestamp: row.ts
    };
  }
}
