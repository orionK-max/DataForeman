import { BaseNode } from '../base/BaseNode.js';

/**
 * Manual Trigger Node
 * 
 * Starts flow execution manually via UI button click.
 * Has no inputs, only output.
 */
export class ManualTriggerNode extends BaseNode {
  description = {
    displayName: 'Manual Trigger',
    name: 'trigger-manual',
    version: 1,
    description: 'Start the flow manually from UI',
    category: 'TRIGGERS',
    
    // No inputs for trigger nodes
    inputs: [],
    
    // Single output
    outputs: [{ type: 'main', displayName: 'Output' }],
    
    // No configuration parameters needed
    properties: []
  };

  /**
   * Manual trigger always validates (no parameters to validate)
   */
  validate(node) {
    return { valid: true, errors: [] };
  }

  /**
   * Execute manual trigger
   * Simply passes through with trigger data
   */
  async execute(context) {
    context.logInfo('Manual trigger executed');
    
    return {
      value: true,
      quality: 192, // Good quality
      metadata: {
        triggeredAt: new Date().toISOString(),
        triggerType: 'manual'
      }
    };
  }
}
