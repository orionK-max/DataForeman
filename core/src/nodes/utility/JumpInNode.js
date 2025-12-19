import { BaseNode } from '../base/BaseNode.js';
import { randomBytes } from 'crypto';

/**
 * Jump In Node
 * 
 * Virtual input connector for clean flow layout.
 * Acts as a "source" that receives data from a matching Jump Out node.
 * No visible edge is drawn between Jump Out and Jump In.
 * 
 * Use this when edges are too long, cross many nodes, or look cluttered.
 */
export class JumpInNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Jump In',
    name: 'jump-in',
    version: 1,
    description: 'Virtual input connector (pairs with Jump Out)',
    category: 'UTILITY',
    section: 'BASIC',
    icon: '📥',
    color: '#00BCD4',
    
    inputs: [], // No physical input - virtual connection only
    
    outputs: [
      {
        name: 'output',
        type: 'main',
        displayName: 'Output',
        description: 'Value received from Jump Out'
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
          title: 'Jump In',
          color: '#00BCD4',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '← {{jumpLabel}}',
          visible: '{{jumpLabel}}'
        }
      ],
      handles: {
        inputs: [], // No input handles - virtual connection
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
        name: 'jumpLabel',
        displayName: 'Jump Label',
        type: 'string',
        default: () => randomBytes(3).toString('hex').toUpperCase(),
        required: true,
        description: 'Unique identifier to receive from Jump Out node',
        userExposable: true
      },
      {
        name: 'defaultValue',
        displayName: 'Default Value',
        type: 'string',
        default: '',
        required: false,
        description: 'Value to use if Jump Out has not executed yet',
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
                label: 'Create Jump Out',
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
      description: 'Jump In acts as a virtual input connector that receives data from a matching Jump Out node without requiring a visible edge. This helps keep flows clean when edges would be too long or cluttered.',
      
      useCases: [
        'Receive data from distant Jump Out nodes',
        'Organize complex flows with many connections',
        'Reduce visual clutter in large flows',
        'Create virtual "tunnels" for data flow'
      ],
      
      properties: {
        jumpLabel: 'Unique identifier that must match the Jump Out node. Example: "SetpointA", "SensorData", "AlarmStatus"',
        defaultValue: 'Optional fallback value if Jump Out has not executed yet (useful during initialization)'
      },
      
      tips: [
        'Jump Label must exactly match the label on the corresponding Jump Out node',
        'Jump In will receive the value from the most recent Jump Out execution',
        'If Jump Out has not executed yet, Jump In will output the default value or null',
        'Multiple Jump Out nodes can send to the same Jump In (last value wins)',
        'No visual edge is drawn - documented in flow description if needed'
      ],
      
      examples: [
        {
          name: 'Setpoint Jump',
          description: 'Receive setpoint value from across the flow',
          config: {
            jumpLabel: 'SetpointA',
            defaultValue: '0'
          }
        },
        {
          name: 'Sensor Data Jump',
          description: 'Receive sensor data from distant location',
          config: {
            jumpLabel: 'TempSensor1',
            defaultValue: '25.0'
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
        return `Jump In: ${JSON.stringify(value)}`;
      },
      debug: (result) => {
        const value = result?.value !== undefined ? result.value : result;
        return `Jump In: ${JSON.stringify(value)}`;
      },
      error: (error) => `Jump In failed: ${error.message}`
    };
  }

  /**
   * Execute the jump in operation
   * Retrieves the value from the flow context stored by Jump Out
   * Acts as transparent pass-through - no data transformation
   */
  async execute(context) {
    const jumpLabel = this.getParameter(context.node, 'jumpLabel', '');
    const defaultValue = this.getParameter(context.node, 'defaultValue', '');
    
    // Validate jump label
    if (!jumpLabel || jumpLabel.trim() === '') {
      throw new Error('Jump Label is required');
    }
    
    // Retrieve the value from runtime state
    const jumpData = this.getJumpValue(context, jumpLabel);
    
    // If no data yet (Jump Out hasn't executed), use default value if provided
    if (jumpData === undefined) {
      if (defaultValue !== '') {
        return { value: defaultValue, quality: 0 };
      }
      return { value: null, quality: 64 };
    }
    
    // Return stored data as-is (transparent pass-through)
    return jumpData;
  }

  /**
   * Retrieve jump value from runtime state (persists across scan cycles)
   */
  getJumpValue(context, label) {
    const flowId = context.flow?.id;
    if (flowId && context.runtimeState?.getJumpValue) {
      return context.runtimeState.getJumpValue(flowId, label);
    }

    if (context.localJumpStore) {
      return context.localJumpStore.get(label);
    }

    return undefined;
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
      // Create a new Jump Out node with matching ID
      const jumpLabel = this.getParameter(context.node, 'jumpLabel', '');
      return {
        createNode: {
          type: 'jump-out',
          config: {
            jumpLabel: jumpLabel
          },
          position: {
            x: context.node.position.x - 300,
            y: context.node.position.y
          }
        }
      };
    }

    return null;
  }
}
