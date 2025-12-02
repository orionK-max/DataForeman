import { BaseNode } from '../base/BaseNode.js';

/**
 * Tag Output Node
 * 
 * Writes a value to an INTERNAL tag via NATS.
 * Only works with tags that have driver_type = 'INTERNAL'.
 */
export class TagOutputNode extends BaseNode {
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
    
    // Single input from upstream node
    inputs: [{ type: 'main', displayName: 'Input' }],
    
    // Single output (passes through the written value)
    outputs: [{ type: 'main', displayName: 'Output' }],
    
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
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        outputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
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
      }
    ]
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
      info: (result) => `Wrote to tag "${result.tagPath}": ${result.value} (quality: ${result.quality})`,
      debug: (result) => `Tag write metadata: ${JSON.stringify(result.metadata || {})}`,
      error: (error) => `Failed to write tag: ${error.message}`
    };
  }

  /**
   * Execute tag output - write value to internal tag via NATS
   */
  async execute(context) {
    const tagId = this.getParameter(context.node, 'tagId');
    
    if (!tagId) {
      throw new Error('Tag output node missing tagId');
    }

    // Get input value from connected node
    const inputValue = context.getInputValue(0);
    
    if (!inputValue) {
      context.logWarn('No input connected to tag-output node');
      return { value: null, quality: 0 };
    }

    // Verify tag exists and is INTERNAL type
    const tagResult = await context.query(
      'SELECT tag_id, tag_path, driver_type FROM tag_metadata WHERE tag_id = $1',
      [tagId]
    );

    if (tagResult.rows.length === 0) {
      throw new Error(`Tag ${tagId} not found`);
    }

    const { tag_path: tagPath, driver_type: driverType } = tagResult.rows[0];

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
        metadata: {
          tagId,
          tagPath,
          writeSkipped: true,
          reason: 'test_mode_writes_disabled'
        }
      };
    }

    // Get connection_id for the tag
    const connectionResult = await context.query(
      'SELECT connection_id FROM tag_metadata WHERE tag_id = $1',
      [tagId]
    );

    if (connectionResult.rows.length === 0 || !connectionResult.rows[0].connection_id) {
      throw new Error(`Cannot write to tag ${tagId}: no connection_id found`);
    }

    const connectionId = connectionResult.rows[0].connection_id;

    // Publish to NATS telemetry.raw subject for ingestion
    const payload = {
      connection_id: connectionId,
      tag_id: tagId,
      ts: new Date().toISOString(),
      v: inputValue.value,
      q: inputValue.quality
    };

    await context.publishToNats(`df.telemetry.raw.${connectionId}`, payload);

    // Pass through the value
    return { 
      value: inputValue.value, 
      quality: inputValue.quality,
      tagPath
    };
  }
}
