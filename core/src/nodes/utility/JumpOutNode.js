import { BaseNode } from '../base/BaseNode.js';
import { randomBytes } from 'crypto';

/**
 * Jump Out Node
 * 
 * Virtual output connector for clean flow layout.
 * Acts as an "endpoint" that sends data to a matching Jump In node.
 * No visible edge is drawn between Jump Out and Jump In.
 * 
 * Use this when edges are too long, cross many nodes, or look cluttered.
 */
export class JumpOutNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Jump Out',
    name: 'jump-out',
    version: 1,
    description: 'Virtual output connector (pairs with Jump In)',
    category: 'UTILITY',
    section: 'BASIC',
    icon: '📤',
    color: '#00BCD4',
    
    inputs: [
      {
        name: 'input',
        type: 'main',
        displayName: 'Input',
        description: 'Value to send to Jump In',
        required: true
      }
    ],
    
    outputs: [], // No physical output - virtual connection only
    
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
          title: 'Jump Out',
          color: '#00BCD4',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '→ {{jumpLabel}}',
          visible: '{{jumpLabel}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        outputs: [], // No output handles - virtual connection
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
        name: 'jumpLabel',
        displayName: 'Jump Label',
        type: 'string',
        default: () => randomBytes(3).toString('hex').toUpperCase(),
        required: true,
        description: 'Unique identifier to connect to Jump In node',
        userExposable: true
      }
    ],
    
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        },
        {
          type: 'custom',
          content: {
            type: 'action-buttons',
            buttons: [
              {
                id: 'regenId',
                label: 'Regenerate ID',
                variant: 'outlined',
                color: 'primary'
              },
              {
                id: 'createSibling',
                label: 'Create Jump In',
                variant: 'contained',
                color: 'primary'
              }
            ]
          }
        }
      ]
    }
  };

  static get help() {
    return {
      description: 'Jump Out acts as a virtual output connector that sends data to a matching Jump In node without drawing a visible edge. This helps keep flows clean when edges would be too long or cluttered.',
      
      useCases: [
        'Clean up long edges that cross many nodes',
        'Organize complex flows with many connections',
        'Reduce visual clutter in large flows',
        'Create virtual "tunnels" for data flow'
      ],
      
      properties: {
        jumpLabel: 'Unique identifier that must match the Jump In node. Example: "SetpointA", "SensorData", "AlarmStatus"'
      },
      
      tips: [
        'Jump Label must exactly match the label on the corresponding Jump In node',
        'Use descriptive labels like "TempSetpoint" or "FlowRate" for clarity',
        'Jump connections are evaluated during flow execution',
        'Multiple Jump Out nodes can send to the same Jump In (last value wins)',
        'No visual edge is drawn - documented in flow description if needed'
      ],
      
      examples: [
        {
          name: 'Setpoint Jump',
          description: 'Send setpoint value across the flow',
          config: {
            jumpLabel: 'SetpointA'
          }
        },
        {
          name: 'Sensor Data Jump',
          description: 'Route sensor data to multiple locations',
          config: {
            jumpLabel: 'TempSensor1'
          }
        }
      ]
    };
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        const value = result?.value !== undefined ? result.value : result;
        return `Jump Out [${this.getParameter({ data: result }, 'jumpLabel', 'unknown')}]: ${JSON.stringify(value)}`;
      },
      debug: (result) => {
        const value = result?.value !== undefined ? result.value : result;
        return `Jump Out: ${JSON.stringify(value)}`;
      },
      error: (error) => `Jump Out failed: ${error.message}`
    };
  }

  /**
   * Execute the jump out operation
   * Stores the value in the flow context for the corresponding Jump In node
   * Acts as transparent pass-through - no data transformation
   */
  async execute(context) {
    const inputData = context.getInputValue(0);
    const jumpLabel = this.getParameter(context.node, 'jumpLabel', '');
    
    // Validate jump label
    if (!jumpLabel || jumpLabel.trim() === '') {
      throw new Error('Jump Label is required');
    }
    
    // Normalize to clean value/quality structure to avoid circular references
    // while maintaining transparent pass-through behavior
    const normalized = this.normalizeData(inputData);
    
    // Store normalized data for Jump In to retrieve
    this.storeJumpValue(context, jumpLabel, normalized);
    
    // Return normalized data
    return normalized;
  }

  /**
   * Normalize data to clean value/quality structure
   * Extracts essential fields to avoid circular references
   */
  normalizeData(data) {
    if (data === null || data === undefined) {
      return { value: null, quality: 64 };
    }
    
    // If already in value/quality format, extract just those fields
    if (typeof data === 'object' && 'value' in data) {
      return {
        value: data.value,
        quality: data.quality ?? 0,
        timestamp: data.timestamp
      };
    }
    
    // Otherwise treat as raw value
    return { value: data, quality: 0 };
  }

  /**
   * Store jump value in runtime state (persists across scan cycles)
   */
  storeJumpValue(context, label, data) {
    const flowId = context.flow?.id;
    if (flowId && context.runtimeState?.setJumpValue) {
      context.runtimeState.setJumpValue(flowId, label, data);
      return;
    }

    if (!context.localJumpStore) {
      context.localJumpStore = new Map();
    }

    context.localJumpStore.set(label, data);
  }

  /**
   * Handle node actions (Regen, Create sibling)
   */
  async handleAction(actionName, context) {
    if (actionName === 'regenId') {
      // Regenerate the jump ID
      const newId = randomBytes(3).toString('hex').toUpperCase();
      return {
        configUpdate: {
          jumpLabel: newId
        }
      };
    }

    if (actionName === 'createSibling') {
      // Create a new Jump In node with matching ID
      const jumpLabel = this.getParameter(context.node, 'jumpLabel', '');
      return {
        createNode: {
          type: 'jump-in',
          config: {
            jumpLabel: jumpLabel
          },
          position: {
            x: context.node.position.x + 300,
            y: context.node.position.y
          }
        }
      };
    }

    return null;
  }
}
