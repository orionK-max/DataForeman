import { BaseNode } from '../base/BaseNode.js';

/**
 * Delay Node
 * 
 * Delays the input value by a specified duration before passing it through.
 * Useful for debouncing, sequencing, and introducing timing delays in flows.
 * 
 * Note: In continuous flows, the delay is time-based. In manual flows, 
 * the delay happens synchronously (execution waits).
 */
export class DelayNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Delay',
    name: 'delay',
    version: 1,
    description: 'Delay value by specified duration (debouncing, sequencing)',
    category: 'UTILITY',
    section: 'BASIC',
    icon: '⏱️',
    color: '#9E9E9E',
    
    inputs: [
      {
        name: 'input',
        type: 'main',
        displayName: 'Input',
        description: 'Value to delay',
        required: true
      }
    ],
    
    outputs: [
      {
        name: 'output',
        type: 'main',
        displayName: 'Output',
        description: 'Delayed value'
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
          icon: '⏱️',
          title: 'Delay',
          color: '#9E9E9E',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{delayMs}}ms',
          visible: '{{delayMs}}'
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
        name: 'delayMs',
        displayName: 'Delay (ms)',
        type: 'number',
        default: 1000,
        required: true,
        description: 'Delay duration in milliseconds',
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
      description: 'Delays the input value by a specified duration before passing it through to the output.',
      
      useCases: [
        'Debouncing rapid changes in sensor values',
        'Sequencing operations with timing delays',
        'Creating time-based logic patterns',
        'Preventing rapid triggering of downstream nodes'
      ],
      
      properties: {
        delayMs: 'Duration in milliseconds to delay the value. Minimum 0ms.'
      },
      
      tips: [
        'In continuous flows, delayed values are queued and released after the specified time',
        'In manual flows, execution waits synchronously for the delay duration',
        'Use 0ms delay for pass-through behavior',
        'Combine with Gate node for conditional delays'
      ],
      
      examples: [
        {
          name: 'Debounce Sensor',
          description: 'Delay sensor reading by 500ms to filter out noise',
          config: {
            delayMs: 500
          }
        },
        {
          name: 'Sequence Timing',
          description: 'Wait 2 seconds before passing value to next operation',
          config: {
            delayMs: 2000
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
        // result is an object: { value, quality }
        return result?.value !== null ? `Delayed value: ${JSON.stringify(result.value)}` : 'No value released yet';
      },
      debug: (result) => {
        return `Delay node output: ${JSON.stringify(result)}`;
      },
      error: (error) => `Delay failed: ${error.message}`
    };
  }

  /**
   * Execute the delay operation
   */
  async execute(context) {
    const inputData = context.getInputValue(0);
    const delayMs = this.getParameter(context.node, 'delayMs', 1000);
    
    // Validate delay parameter
    if (typeof delayMs !== 'number' || delayMs < 0) {
      throw new Error('Delay must be a non-negative number');
    }
    
    // Check if this is continuous execution (has runtimeState)
    const isContinuous = !!context.runtimeState;
    
    if (isContinuous) {
      // CONTINUOUS MODE: Time-based delay without blocking
      // Store pending values in runtime state and release them after delay period
      
      const now = Date.now();
      const stateKey = `delay_${context.node.id}`;
      const lastOutputKey = `${stateKey}_lastOutput`;
      
      // Initialize or retrieve pending queue (runtimeState is a plain object)
      if (!context.runtimeState[stateKey]) {
        context.runtimeState[stateKey] = [];
      }
      const pendingQueue = context.runtimeState[stateKey];
      
      // Add new input to queue if present and valid (not null value)
      if (inputData !== null && inputData !== undefined) {
        const value = inputData.value !== undefined ? inputData.value : inputData;
        const quality = inputData.quality !== undefined ? inputData.quality : 0;
        
        // Only queue non-null values
        if (value !== null) {
          // Check if this is a new value (different from last queued)
          const lastQueued = pendingQueue[pendingQueue.length - 1];
          const isNewValue = !lastQueued || 
            lastQueued.value !== value || 
            lastQueued.quality !== quality;
          
          if (isNewValue) {
            pendingQueue.push({
              value,
              quality,
              timestamp: now,
              releaseTime: now + delayMs
            });
          }
        }
      }
      
      // Check if any values are ready to be released
      let outputValue = null;
      let outputQuality = 64; // Bad quality by default
      let hasNewOutput = false;
      
      while (pendingQueue.length > 0 && pendingQueue[0].releaseTime <= now) {
        const released = pendingQueue.shift();
        outputValue = released.value;
        outputQuality = released.quality;
        hasNewOutput = true;
      }
      
      // If we released a value, store it as last output
      if (hasNewOutput) {
        context.runtimeState[lastOutputKey] = { value: outputValue, quality: outputQuality };
      } else if (context.runtimeState[lastOutputKey]) {
        // No new output, maintain last known output
        const lastOutput = context.runtimeState[lastOutputKey];
        outputValue = lastOutput.value;
        outputQuality = lastOutput.quality;
      }
      
      // Return the output (either newly released, last known, or null)
      return {
        value: outputValue,
        quality: outputQuality
      };
      
    } else {
      // MANUAL MODE: Blocking delay (synchronous wait)
      // This is for single manual executions where blocking is acceptable
      
      // Handle null/undefined input
      if (inputData === null || inputData === undefined) {
        return { value: null, quality: 64 }; // Bad quality
      }
      
      // Extract value and quality
      const value = inputData.value ?? inputData;
      const quality = inputData.quality ?? 0;
      
      // Apply blocking delay
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      // Pass through the value after delay
      return {
        value,
        quality
      };
    }
  }
}
