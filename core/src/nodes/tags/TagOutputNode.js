import { BaseNode } from '../base/BaseNode.js';

/**
 * Tag Output Node
 * 
 * Writes a value to an INTERNAL tag via NATS.
 * Only works with tags that have driver_type = 'INTERNAL'.
 */
export class TagOutputNode extends BaseNode {
  description = {
    displayName: 'Tag Output',
    name: 'tag-output',
    version: 1,
    description: 'Write value to a tag',
    category: 'TAG_OPERATIONS',
    
    // Single input from upstream node
    inputs: [{ type: 'main', displayName: 'Input' }],
    
    // Single output (passes through the written value)
    outputs: [{ type: 'main', displayName: 'Output' }],
    
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

    // Publish to NATS for tag update
    const payload = {
      tag_id: tagId,
      tag_path: tagPath,
      value: inputValue.value,
      quality: inputValue.quality,
      timestamp: new Date().toISOString(),
      source: 'flow_engine'
    };

    await context.publishToNats(`df.tag.update.${tagId}`, payload);
    
    context.logInfo(
      { tagId, tagPath, value: inputValue.value, quality: inputValue.quality }, 
      'Published tag update'
    );

    // Pass through the value
    return { 
      value: inputValue.value, 
      quality: inputValue.quality,
      tagPath
    };
  }
}
