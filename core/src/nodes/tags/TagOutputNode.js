import { BaseNode } from '../base/BaseNode.js';

/**
 * Tag Output Node
 * 
 * Writes a value to an INTERNAL tag via NATS.
 * Only works with tags that have driver_type = 'INTERNAL'.
 */
export class TagOutputNode extends BaseNode {
  constructor() {
    super();
    // Cache for last values to implement write-on-change
    this._lastValues = new Map(); // tagId -> { value, quality, timestamp }
    // Cache for connection IDs to avoid repeated DB queries
    this._connectionIdCache = new Map(); // tagId -> connectionId
    // Cache for tag metadata to avoid repeated validation queries
    this._tagMetadataCache = new Map(); // tagId -> { tag_path, driver_type }
  }

  description = {
    schemaVersion: 1,
    displayName: 'Tag Output',
    name: 'tag-output',
    version: 1,
    description: 'Write value to a tag',
    category: 'TAG_OPERATIONS',
    section: 'BASIC',
    icon: '📤',
    color: '#FF9800',
    
    inputs: [], // Dynamic - type matches selected tag's data type via ioRules
    outputs: [], // No outputs - sink node writes to tag only
    
    ioRules: [
      {
        when: { dataType: ['BOOL', 'bool'] },
        inputs: { count: 1, types: ['boolean'] },
        outputs: { count: 0 }
      },
      {
        when: { dataType: ['DINT', 'Double', 'Int32', 'REAL', 'float', 'REAL8', 'INT', 'UINT', 'WORD', 'DWORD'] },
        inputs: { count: 1, types: ['number'] },
        outputs: { count: 0 }
      },
      {
        // Default rule when no dataType or unknown type
        inputs: { count: 1, types: ['main'] },
        outputs: { count: 0 }
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
          icon: '📤',
          title: 'Tag Output',
          color: '#FF9800',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{connectionName}}: {{tagName}}',
          visible: '{{tagName}}'
        },
        {
          type: 'values',
          items: [
            { label: 'Written', value: '{{runtime.value}}' },
            { label: 'Quality', value: '{{runtime.quality}}' }
          ],
          visible: '{{_showLiveValues}}'
        }
      ],
      handles: {
        inputs: [], // Dynamic - defined by ioRules based on tag data type
        outputs: [], // No outputs - sink node
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
        description: 'Select the internal tag to write to'
      },
      {
        displayName: 'Save to Database',
        name: 'saveToDatabase',
        type: 'boolean',
        default: true,
        description: 'Enable saving tag values to database for historical data'
      },
      {
        displayName: 'Save Strategy',
        name: 'saveStrategy',
        type: 'select',
        default: 'on-change',
        options: [
          { label: 'Always (every execution)', value: 'always' },
          { label: 'On Change Only', value: 'on-change' },
          { label: 'Never (flow-local only)', value: 'never' }
        ],
        description: 'Control when values are saved to database',
        displayOptions: {
          show: {
            saveToDatabase: [true]
          }
        }
      },
      {
        displayName: 'Deadband',
        name: 'deadband',
        type: 'number',
        default: 0,
        description: 'Minimum change required to save (0 = any change)',
        displayOptions: {
          show: {
            saveToDatabase: [true],
            saveStrategy: ['on-change']
          }
        }
      },
      {
        displayName: 'Deadband Type',
        name: 'deadbandType',
        type: 'select',
        default: 'absolute',
        options: [
          { label: 'Absolute', value: 'absolute' },
          { label: 'Percent', value: 'percent' }
        ],
        description: 'Absolute: fixed value difference. Percent: percentage of previous value',
        displayOptions: {
          show: {
            saveToDatabase: [true],
            saveStrategy: ['on-change']
          }
        }
      },
      {
        displayName: 'Heartbeat Interval (ms)',
        name: 'heartbeatMs',
        type: 'number',
        default: 60000,
        description: 'Force save after this interval even if unchanged (0 = disabled)',
        displayOptions: {
          show: {
            saveToDatabase: [true],
            saveStrategy: ['on-change']
          }
        }
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
        
        // Database saving configuration (only for internal tags)
        {
          type: 'conditional-group',
          title: 'Database Saving',
          showWhen: { source: ['internal'] },
          items: [
            {
              type: 'switch',
              property: 'saveToDatabase',
              label: 'Save to Database',
              default: true,
              helperText: 'Enable saving tag values to database for historical data'
            },
            {
              type: 'conditional-group',
              showWhen: { saveToDatabase: [true] },
              items: [
                {
                  type: 'select',
                  property: 'saveStrategy',
                  label: 'Save Strategy',
                  default: 'on-change',
                  options: [
                    { value: 'always', label: 'Always (every execution)' },
                    { value: 'on-change', label: 'On Change Only' },
                    { value: 'never', label: 'Never (flow-local only)' }
                  ],
                  helperText: 'Control when values are saved to database'
                },
                {
                  type: 'conditional-group',
                  showWhen: { saveStrategy: ['on-change'] },
                  nested: true,
                  title: 'On-Change Settings',
                  items: [
                    {
                      type: 'number',
                      property: 'deadband',
                      label: 'Deadband',
                      default: 0,
                      min: 0,
                      step: 0.1,
                      helperText: 'Minimum change required to save (0 = any change)'
                    },
                    {
                      type: 'select',
                      property: 'deadbandType',
                      label: 'Deadband Type',
                      default: 'absolute',
                      options: [
                        { value: 'absolute', label: 'Absolute' },
                        { value: 'percent', label: 'Percent' }
                      ],
                      helperText: 'Absolute: fixed value difference. Percent: percentage of previous value'
                    },
                    {
                      type: 'number',
                      property: 'heartbeatMs',
                      label: 'Heartbeat Interval (ms)',
                      default: 60000,
                      min: 0,
                      step: 1000,
                      helperText: 'Force save after this interval even if unchanged (0 = disabled)'
                    }
                  ]
                }
              ]
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
      errors.push('Tag output node requires a tagId parameter');
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
      info: (result) => result.writeSkipped 
        ? `Tag write skipped (${result.skipReason}): "${result.tagPath}" = ${result.value}`
        : `Wrote to tag "${result.tagPath}": ${result.value} (quality: ${result.quality})`,
      debug: (result) => `Tag write metadata: ${JSON.stringify(result.metadata || {})}`,
      error: (error) => `Failed to write tag: ${error.message}`
    };
  }

  /**
   * Check if value has changed enough to warrant saving
   */
  _hasValueChanged(tagId, newValue, newQuality, saveConfig) {
    const last = this._lastValues.get(tagId);
    
    // Always save on first write
    if (!last) return true;
    
    // Always save if quality changed
    if (last.quality !== newQuality) return true;
    
    // Check heartbeat interval
    if (saveConfig.heartbeatMs && saveConfig.heartbeatMs > 0) {
      const elapsed = Date.now() - last.timestamp;
      if (elapsed >= saveConfig.heartbeatMs) {
        return true;
      }
    }
    
    const oldValue = last.value;
    
    // Null/undefined handling
    if (oldValue == null || newValue == null) {
      return oldValue !== newValue;
    }
    
    // Numeric with deadband
    if (typeof newValue === 'number' && typeof oldValue === 'number') {
      const deadband = saveConfig.deadband ?? 0;
      
      if (deadband > 0) {
        if (saveConfig.deadbandType === 'percent') {
          // Percentage-based deadband
          const base = Math.abs(oldValue) || 1; // avoid division by zero
          const percentChange = Math.abs((newValue - oldValue) / base) * 100;
          return percentChange >= deadband;
        } else {
          // Absolute deadband
          const diff = Math.abs(newValue - oldValue);
          return diff >= deadband;
        }
      } else {
        // Exact match required
        return oldValue !== newValue;
      }
    }
    
    // Boolean, string, or other types - exact comparison
    return oldValue !== newValue;
  }

  /**
   * Update last value cache
   */
  _updateLastValue(tagId, value, quality) {
    this._lastValues.set(tagId, {
      value,
      quality,
      timestamp: Date.now()
    });
  }

  /**
   * Execute tag output - write value to internal tag via NATS
   */
  async execute(context) {
    const tagId = this.getParameter(context.node, 'tagId');
    
    if (!tagId) {
      throw new Error('Tag output node missing tagId');
    }

    // Get save configuration
    const saveToDatabase = this.getParameter(context.node, 'saveToDatabase') ?? true;
    const saveStrategy = this.getParameter(context.node, 'saveStrategy') || 'on-change';

    // Get input value from connected node
    const inputValue = context.getInputValue(0);
    
    if (!inputValue) {
      context.logWarn('No input connected to tag-output node');
      return { value: null, quality: 0 };
    }

    // Verify tag exists and is INTERNAL type (with caching)
    let tagMetadata = this._tagMetadataCache.get(tagId);
    
    if (!tagMetadata) {
      const tagResult = await context.query(
        'SELECT tag_id, tag_path, driver_type FROM tag_metadata WHERE tag_id = $1',
        [tagId]
      );

      if (tagResult.rows.length === 0) {
        throw new Error(`Tag ${tagId} not found`);
      }

      tagMetadata = {
        tag_path: tagResult.rows[0].tag_path,
        driver_type: tagResult.rows[0].driver_type
      };
      
      this._tagMetadataCache.set(tagId, tagMetadata);
    }
    
    const { tag_path: tagPath, driver_type: driverType } = tagMetadata;

    if (driverType !== 'INTERNAL') {
      throw new Error(`Tag ${tagId} is not an INTERNAL tag (driver_type: ${driverType}). Only INTERNAL tags can be written to by flows.`);
    }

    // Check if writes are disabled in test mode
    const testDisableWrites = context.params?.test_disable_writes || false;
    
    if (testDisableWrites) {
      context.logInfo(
        { tagId, tagPath, value: inputValue.value, quality: inputValue.quality },
        'Tag write skipped (test mode with writes disabled)'
      );
      
      // Return the value that would have been written
      return {
        value: inputValue.value,
        quality: inputValue.quality,
        tagPath,
        writeSkipped: true,
        skipReason: 'test_mode_writes_disabled'
      };
    }

    // Check if database saving is disabled
    if (!saveToDatabase || saveStrategy === 'never') {
      // Update local cache but don't publish to NATS
      this._updateLastValue(tagId, inputValue.value, inputValue.quality);
      
      return {
        value: inputValue.value,
        quality: inputValue.quality,
        tagPath,
        writeSkipped: true,
        skipReason: 'database_saving_disabled'
      };
    }

    // Check save strategy for on-change filtering
    if (saveStrategy === 'on-change') {
      const saveConfig = {
        deadband: this.getParameter(context.node, 'deadband') ?? 0,
        deadbandType: this.getParameter(context.node, 'deadbandType') || 'absolute',
        heartbeatMs: this.getParameter(context.node, 'heartbeatMs') ?? 60000
      };

      if (!this._hasValueChanged(tagId, inputValue.value, inputValue.quality, saveConfig)) {
        // Value hasn't changed enough - skip write
        return {
          value: inputValue.value,
          quality: inputValue.quality,
          tagPath,
          writeSkipped: true,
          skipReason: 'no_significant_change'
        };
      }
    }

    // Update last value cache immediately to prevent race conditions
    // Must be done before any async operations (DB query, NATS publish)
    this._updateLastValue(tagId, inputValue.value, inputValue.quality);

    // Get connection_id (with caching to avoid repeated DB queries)
    let connectionId = this._connectionIdCache.get(tagId);
    
    if (!connectionId) {
      const dbStart = performance.now();
      const connectionResult = await context.query(
        'SELECT connection_id FROM tag_metadata WHERE tag_id = $1',
        [tagId]
      );
      const dbDuration = performance.now() - dbStart;
      
      if (dbDuration > 100) {
        context.logWarn({ tagId, dbDuration: Math.round(dbDuration) }, 'Slow DB query for connection_id');
      }

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].connection_id) {
        throw new Error(`Cannot write to tag ${tagId}: no connection_id found`);
      }

      connectionId = connectionResult.rows[0].connection_id;
      this._connectionIdCache.set(tagId, connectionId);
    }

    // Publish to NATS telemetry.raw subject for ingestion
    // Fire-and-forget - don't await to prevent blocking
    const payload = {
      connection_id: connectionId,
      tag_id: tagId,
      ts: new Date().toISOString(),
      v: inputValue.value,
      q: inputValue.quality
    };

    // Publish without awaiting - NATS publish should be fire-and-forget
    context.publishToNats(`df.telemetry.raw.${connectionId}`, payload).catch(err => {
      context.logError({ err, tagId, tagPath }, 'NATS publish failed');
    });

    // Pass through the value
    return { 
      value: inputValue.value, 
      quality: inputValue.quality,
      tagPath,
      writeSkipped: false
    };
  }

  static get help() {
    return {
      overview: "Writes values to INTERNAL tags via NATS messaging. Only works with tags that have driver_type = 'INTERNAL'. Supports write-on-change mode to minimize unnecessary writes. Sink node with no outputs.",
      useCases: [
        "Write calculated setpoints back to control system",
        "Store computed metrics and KPIs for dashboards",
        "Update status flags based on complex logic conditions",
        "Record alarm states and acknowledgments"
      ],
      examples: [
        {
          title: "Write Calculated Setpoint",
          config: { tagId: "tag-setpoint-123", writeOnChange: true },
          input: { value: 75.5, quality: 0 },
          output: { writeSkipped: false, tagPath: "Setpoints/Temperature" }
        },
        {
          title: "Update Status Flag",
          config: { tagId: "tag-status-456", writeOnChange: false },
          input: { value: true, quality: 0 },
          output: { writeSkipped: false, tagPath: "Status/AlarmActive" }
        },
        {
          title: "Skip Duplicate Write",
          config: { tagId: "tag-count-789", writeOnChange: true },
          input: { value: 100, quality: 0 },
          output: { writeSkipped: true, tagPath: "Counters/Production" }
        }
      ],
      tips: [
        "Only works with INTERNAL tags - cannot write to device tags directly",
        "Enable 'Write on Change' to avoid unnecessary writes when value hasn't changed",
        "Input type automatically matches tag data type (boolean, number, etc.)",
        "Tag Output nodes are sink nodes - they have no outputs",
        "Writes are published via NATS and handled asynchronously by ingestor service",
        "Quality value is passed through from input to maintain data integrity",
        "Use after calculations to store results or update virtual tags"
      ],
      relatedNodes: ["TagInputNode", "MathNode", "GateNode"]
    };
  }
}
