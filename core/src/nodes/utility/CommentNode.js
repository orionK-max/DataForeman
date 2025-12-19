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
        type: 'select',
        default: 'medium',
        options: [
          {
            label: 'Small',
            value: 'small'
          },
          {
            label: 'Medium',
            value: 'medium'
          },
          {
            label: 'Large',
            value: 'large'
          }
        ],
        description: 'Size of the comment text'
      },
      {
        name: 'backgroundColor',
        displayName: 'Background Color',
        type: 'select',
        default: 'yellow',
        options: [
          {
            label: 'Yellow',
            value: 'yellow'
          },
          {
            label: 'Blue',
            value: 'blue'
          },
          {
            label: 'Green',
            value: 'green'
          },
          {
            label: 'Orange',
            value: 'orange'
          },
          {
            label: 'Pink',
            value: 'pink'
          },
          {
            label: 'Gray',
            value: 'gray'
          }
        ],
        description: 'Background color of the comment box'
      }
    ],
    
    extensions: {
      passive: true, // This node does not execute - it's for display only
      notes: 'Comment nodes are not executed and do not affect flow behavior'
    },

    // Config UI structure
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        }
      ]
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
  async execute(context) {
    // Comment nodes are passive and should be skipped during execution
    context.logger.debug({
      nodeId: context.node.id,
      nodeType: 'comment'
    }, 'Comment node skipped (passive)');
    
    return null;
  }

  static get help() {
    return {
      overview: "A passive documentation node that displays text comments in the flow editor. Does not execute or process data. Use for adding notes, explanations, and documentation directly in your flows.",
      useCases: [
        "Document complex calculation logic and business rules for team members",
        "Add TODO reminders for incomplete sections or future enhancements",
        "Mark different sections of large flows (e.g., 'Data Validation', 'Calculations')",
        "Explain unusual configurations or workarounds for future reference"
      ],
      examples: [
        {
          title: "Section Header",
          config: { text: "=== Temperature Monitoring ===", fontSize: "large" },
          input: {},
          output: {}
        },
        {
          title: "Calculation Note",
          config: { text: "Formula: (inlet + outlet) / 2\nUsed for average temp calculation", fontSize: "medium" },
          input: {},
          output: {}
        },
        {
          title: "TODO Reminder",
          config: { text: "TODO: Add alarm threshold when sensor is installed", backgroundColor: "yellow" },
          input: {},
          output: {}
        }
      ],
      tips: [
        "Comment nodes have no inputs or outputs - they are purely visual",
        "Resize comment nodes to fit your text content",
        "Use different background colors to categorize comments (warnings, info, etc.)",
        "Large flows benefit from section comments to improve navigation",
        "Comments are visible to all users viewing the flow - great for team collaboration"
      ],
      relatedNodes: []
    };
  }
}
