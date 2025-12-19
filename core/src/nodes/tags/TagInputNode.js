import { BaseNode } from '../base/BaseNode.js';

/**
 * Tag Input Node
 * 
 * Reads the latest value from a tag in the system.
 * Queries tag_metadata for tag info and tag_values for the latest value.
 */
export class TagInputNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Tag Input',
    name: 'tag-input',
    version: 1,
    description: 'Read value from a tag',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
    icon: '📥',
    color: '#4CAF50',
    
    // No inputs - reads from database
    inputs: [],
    outputs: [], // Output type defined by ioRules based on tag data type
    
    ioRules: [
      {
        when: { dataType: ['BOOL', 'bool'] },
        inputs: { count: 0 },
        outputs: { count: 1, types: ['boolean'] }
      },
      {
        when: { dataType: ['DINT', 'Double', 'Int32', 'REAL', 'float', 'REAL8', 'INT', 'UINT', 'WORD', 'DWORD'] },
        inputs: { count: 0 },
        outputs: { count: 1, types: ['number'] }
      },
      {
        // Default rule when no dataType or unknown type
        inputs: { count: 0 },
        outputs: { count: 1, types: ['main'] }
      }
    ],
    
    visual: {
      canvas: {
        minWidth: 160,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '📥',
          title: 'Tag Input',
          color: '#4CAF50',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{connectionName}}: {{tagName}}',
          visible: '{{tagName}}'
        }
      ],
      handles: {
        inputs: [],
        outputs: [], // Dynamic - defined by ioRules based on tag data type
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff'
      },
      status: {
        execution: {
          enabled: true,
          position: 'top-left',
          offset: { x: -10, y: -10 }
        },
        pinned: {
          enabled: true,
          position: 'top-right',
          offset: { x: -8, y: -8 }
        },
        executionOrder: {
          enabled: true,
          position: 'header'
        }
      },
      runtime: {
        enabled: false
      }
    },
    
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
    ],
    
    // Config UI structure
    configUI: {
      sections: [
        // Tag selection
        {
          type: 'tag-selector',
          property: 'tagId',
          label: 'Tag Selection',
          required: true,
          showInfo: true,
          infoProperties: ['dataType', 'source', 'connectionName'],
          onSelect: {
            tagId: 'tag_id',
            tagPath: 'tag_path',
            tagName: 'tag_name',
            dataType: 'data_type',
            source: 'source',
            driverType: 'driver_type',
            connectionId: 'connectionId',
            connectionName: 'connectionName'
          }
        },
        
        // Maximum data age configuration
        {
          type: 'conditional-group',
          items: [
            {
              type: 'number',
              property: 'maxDataAge',
              label: 'Maximum Data Age (seconds)',
              default: -1,
              helperText: '-1 = any age (cached), 0 = live only (1s tolerance), >0 = custom max age',
              placeholder: 'e.g., 5 for 5 seconds'
            }
          ]
        }
      ]
    }
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
        const tagName = result.tagName || result.tagPath;
        if (result.stale) {
          return `Tag "${tagName}": stale data (${result.ageSeconds}s old, max ${result.maxDataAge || 0}s)`;
        }
        return `Read tag "${tagName}": ${result.value} (quality: ${result.quality})`;
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

    // Try to read from in-memory cache first (zero latency)
    if (context.runtimeState) {
      const cached = context.runtimeState.getTagValue(tagId);
      if (cached) {
        // Check data age if maxDataAge is set
        if (maxDataAge >= 0) {
          const ageSeconds = (Date.now() - new Date(cached.timestamp).getTime()) / 1000;
          // Treat 0 as "live data only" with 1 second tolerance
          const effectiveMaxAge = maxDataAge === 0 ? 1 : maxDataAge;
          if (ageSeconds > effectiveMaxAge) {
            context.logWarn({ tagId, ageSeconds, maxDataAge }, 'Cached data too old, falling back to DB');
            // Fall through to DB query below
          } else {
            // Cache hit with acceptable age - get tag name for logging
            const metaResult = await context.query(
              'SELECT tag_name FROM tag_metadata WHERE tag_id = $1',
              [tagId]
            );
            const tagName = metaResult.rows.length > 0 ? metaResult.rows[0].tag_name : cached.tagPath;
            
            return {
              value: cached.value,
              quality: cached.quality,
              tagPath: cached.tagPath,
              tagName,
              timestamp: cached.timestamp,
              fromCache: true
            };
          }
        } else {
          // No age restriction, use cached value - get tag name for logging
          const metaResult = await context.query(
            'SELECT tag_name FROM tag_metadata WHERE tag_id = $1',
            [tagId]
          );
          const tagName = metaResult.rows.length > 0 ? metaResult.rows[0].tag_name : cached.tagPath;
          
          return {
            value: cached.value,
            quality: cached.quality,
            tagPath: cached.tagPath,
            tagName,
            timestamp: cached.timestamp,
            fromCache: true
          };
        }
      }
    }

    // Fallback to database query if cache miss or data too old
    // Get tag metadata from postgres
    const metaResult = await context.query(
      'SELECT tag_path, tag_name, data_type, connection_id, driver_type FROM tag_metadata WHERE tag_id = $1',
      [tagId]
    );

    if (metaResult.rows.length === 0) {
      throw new Error(`Tag ${tagId} not found`);
    }

    const { tag_path: tagPath, tag_name: tagName, connection_id: connectionId, driver_type: driverType } = metaResult.rows[0];

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
        return { value: null, quality: 0, tagPath, tagName };
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
            tagName,
            stale: true,
            ageSeconds: Math.round(ageSeconds)
          };
        }
      }
      
      return {
        value: row.v_num != null ? Number(row.v_num) : null,
        quality: 0, // System metrics always have good quality (OPC UA standard)
        tagPath,
        tagName,
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
        tagPath,
        tagName 
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
          tagName,
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
      tagName,
      timestamp: row.ts
    };
  }

  static get help() {
    return {
      overview: "Reads the latest value from a configured tag in the system. Automatically determines output type based on the tag's data type. Essential for bringing real-time data from devices and sensors into flows.",
      useCases: [
        "Read temperature sensor values for monitoring and control logic",
        "Fetch equipment status flags from PLCs for alarm processing",
        "Retrieve production counters for calculating efficiency metrics",
        "Pull setpoint values from devices for comparison and validation"
      ],
      examples: [
        {
          title: "Temperature Sensor",
          config: { tagId: "tag-123" },
          input: {},
          output: { value: 72.5, quality: 0, tagPath: "Temperature/Sensor01" }
        },
        {
          title: "Motor Running Status",
          config: { tagId: "tag-456" },
          input: {},
          output: { value: true, quality: 0, tagPath: "Motors/M001/Running" }
        },
        {
          title: "Production Count",
          config: { tagId: "tag-789" },
          input: {},
          output: { value: 1542, quality: 0, tagPath: "Production/Counter01" }
        }
      ],
      tips: [
        "Tag Input nodes have no inputs - they read directly from the database",
        "Output type automatically matches tag data type (boolean, number, etc.)",
        "Quality value follows OPC UA standard: 0 = Good, 192 = Bad",
        "Use in continuous flows to read live values on each scan cycle",
        "Check tag quality before using value in critical calculations",
        "Connection and tag name shown in node subtitle for easy identification"
      ],
      relatedNodes: ["TagOutputNode", "GateNode", "ComparisonNode"]
    };
  }
}
