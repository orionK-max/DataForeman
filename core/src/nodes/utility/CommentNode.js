import { BaseNode } from '../base/BaseNode.js';

/**
 * Comment Node - Documentation and Annotations
 * 
 * A passive node that displays text comments in the flow editor.
 * Does not execute or process data - purely for documentation purposes.
 * 
 * Use cases:
 * - Document flow logic and business rules
 * - Add notes and explanations for other users
 * - Mark sections of complex flows
 * - Add TODO reminders
 */
export class CommentNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Comment',
    name: 'comment',
    version: 1,
    description: 'Add text comments and documentation to flows',
    category: 'UTILITY',
    section: 'BASIC',
    icon: '💬',
    color: '#FFC107',
    
    inputs: [], // No inputs - passive documentation node
    outputs: [], // No outputs - does not process data
    
    visual: {
      canvas: {
        minWidth: 200,
        minHeight: 80,
        shape: 'rectangle',
        borderRadius: 0,
        resizable: true
      },
      layout: [
        {
          type: 'text',
          content: '{{text}}',
          fontSize: 14,
          align: 'left'
        }
      ],
      handles: {
        inputs: [],
        outputs: []
      },
      status: {
        execution: { enabled: false },
        pinned: { enabled: false },
        executionOrder: { enabled: false }
      },
      runtime: {
        enabled: false
      }
    },
    
    properties: [
      {
        name: 'text',
        displayName: 'Comment Text',
        type: 'string',
        default: 'Add your comment here...',
        required: true,
        description: 'Text content of the comment'
      },
      {
        name: 'fontSize',
        displayName: 'Font Size',
        type: 'options',
        default: 'medium',
        options: [
          {
            name: 'Small',
            value: 'small'
          },
          {
            name: 'Medium',
            value: 'medium'
          },
          {
            name: 'Large',
            value: 'large'
          }
        ],
        description: 'Size of the comment text'
      },
      {
        name: 'backgroundColor',
        displayName: 'Background Color',
        type: 'options',
        default: 'yellow',
        options: [
          {
            name: 'Yellow',
            value: 'yellow'
          },
          {
            name: 'Blue',
            value: 'blue'
          },
          {
            name: 'Green',
            value: 'green'
          },
          {
            name: 'Orange',
            value: 'orange'
          },
          {
            name: 'Pink',
            value: 'pink'
          },
          {
            name: 'Gray',
            value: 'gray'
          }
        ],
        description: 'Background color of the comment box'
      }
    ],
    
    extensions: {
      passive: true, // This node does not execute - it's for display only
      notes: 'Comment nodes are not executed and do not affect flow behavior'
    }
  };

  /**
   * Validate comment configuration
   */
  validate(node) {
    const errors = [];
    
    const text = this.getParameter(node, 'text');
    if (!text || text.trim().length === 0) {
      errors.push('Comment text cannot be empty');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Declarative log messages
   * Comments don't execute, so this shouldn't be called
   */
  getLogMessages() {
    return {
      info: () => 'Comment node (passive)',
      debug: () => 'Comment node does not execute',
      error: (error) => `Comment validation failed: ${error.message}`
    };
  }

  /**
   * Execute method - should never be called since comment nodes are passive
   * If called, just return null to indicate no processing
   */
  async execute(node, nodeInputs, context) {
    // Comment nodes are passive and should be skipped during execution
    context.logger.debug({
      nodeId: node.id,
      nodeType: node.type
    }, 'Comment node skipped (passive)');
    
    return null;
  }
}
