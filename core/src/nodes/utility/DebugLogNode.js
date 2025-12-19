import { BaseNode } from '../base/BaseNode.js';

/**
 * Debug/Log Node
 * 
 * Outputs values to the execution log for troubleshooting and debugging flows.
 * Values pass through unchanged, but are logged at the specified level.
 * Supports custom message formatting with value interpolation.
 */
export class DebugLogNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Debug Log',
    name: 'debug-log',
    version: 1,
    description: 'Log values to execution log (info level) for troubleshooting',
    category: 'UTILITY',
    section: 'BASIC',
    icon: '🐛',
    color: '#FF9800',
    
    inputs: [
      {
        name: 'input',
        type: 'main',
        displayName: 'Input',
        description: 'Value to log and pass through',
        required: true
      }
    ],
    
    outputs: [
      {
        name: 'output',
        type: 'main',
        displayName: 'Output',
        description: 'Input value (unchanged)'
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
          icon: '🐛',
          title: 'Debug Log',
          color: '#FF9800',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: 'Info Level'
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
    
    properties: [
      {
        name: 'message',
        displayName: 'Message Template',
        type: 'string',
        default: 'Value: {{value}}',
        required: false,
        description: 'Custom message (use {{value}} for interpolation)',
        userExposable: true
      }
    ],
    
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        }
      ]
    }
  };

  static get help() {
    return {
      description: 'Logs input values to the execution log (at info level) for troubleshooting, then passes them through unchanged. Use this node to inspect values at any point in your flow without affecting the data.',
      
      useCases: [
        'Debug flow execution by logging intermediate values',
        'Monitor specific values during testing',
        'Verify data is flowing correctly through the flow',
        'Troubleshoot unexpected behavior'
      ],
      
      properties: {
        message: 'Custom message template. Use {{value}} to insert the actual value. Always logged at info level.'
      },
      
      tips: [
        'Use multiple Debug Log nodes at different points to trace data flow',
        'All messages are logged at info level',
        'Message template example: "Temperature reading: {{value}}°C"',
        'Values pass through unchanged - safe to use in production flows',
        'View logs in the Log Panel during flow execution'
      ],
      
      examples: [
        {
          name: 'Simple Value Logging',
          description: 'Log the input value with default message',
          config: {
            message: 'Value: {{value}}'
          }
        },
        {
          name: 'Custom Message',
          description: 'Log with custom formatted message',
          config: {
            message: 'Temperature sensor reading: {{value}}°C'
          }
        },
        {
          name: 'Checkpoint Message',
          description: 'Add descriptive checkpoint message',
          config: {
            message: 'Checkpoint: Processing value {{value}}'
          }
        }
      ]
    };
  }

  /**
   * Declarative log messages
   * Debug Log node handles ALL its own logging, so disable automatic logging
   */
  getLogMessages() {
    return {
      info: () => null,  // Suppress automatic logging
      debug: () => null, // Suppress automatic logging
      warn: () => null,  // Suppress automatic logging
      error: (error) => `Debug Log node failed: ${error.message}` // Only log actual errors
    };
  }

  /**
   * Execute the debug log operation
   */
  async execute(context) {
    const inputData = context.getInputValue(0);
    const messageTemplate = this.getParameter(context.node, 'message', 'Value: {{value}}');
    
    // Handle null/undefined input
    if (inputData === null || inputData === undefined) {
      const formattedMessage = messageTemplate.replace(/\{\{value\}\}/g, 'null');
      
      // Always log at info level
      context.logInfo(formattedMessage);
      
      return { value: null, quality: 64 }; // Bad quality
    }
    
    // Extract value, quality, and timestamp
    const value = inputData.value ?? inputData;
    const quality = inputData.quality ?? 0;
    const timestamp = inputData.timestamp ?? Date.now();
    
    // Format the message with value interpolation
    const formattedMessage = messageTemplate.replace(/\{\{value\}\}/g, String(value));
    
    // Always log at info level
    context.logInfo(formattedMessage);
    
    // Pass through the value unchanged
    return {
      value,
      quality
    };
  }

}
