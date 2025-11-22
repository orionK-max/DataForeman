import { BaseNode } from '../base/BaseNode.js';
import { executeScript, getAllowedPaths } from '../../services/script-sandbox.js';

/**
 * JavaScriptNode - Execute custom JavaScript code in a sandboxed environment
 * 
 * Features:
 * - VM-based sandboxing for security
 * - Access to $input, $tags, $flow, $fs APIs
 * - Console logging support
 * - Configurable timeout
 * - Error handling (stop/continue)
 * - Async/await support
 * 
 * @extends BaseNode
 */
export class JavaScriptNode extends BaseNode {
  /**
   * Node description following Flow Studio convention
   */
  static description = {
    displayName: 'JavaScript',
    description: 'Execute custom JavaScript code with access to flow context and APIs',
    group: 'Logic & Math',
    version: 1,
    icon: '📜',
    color: '#F44336',
    
    inputs: {
      input: {
        displayName: 'Input',
        type: 'any',
        required: false,
        description: 'Optional input value (available as $input in script)'
      }
    },
    
    outputs: {
      value: {
        displayName: 'Result',
        type: 'any',
        description: 'Script execution result'
      },
      quality: {
        displayName: 'Quality',
        type: 'number',
        description: 'Inherited from input quality'
      },
      logs: {
        displayName: 'Logs',
        type: 'array',
        description: 'Console logs from script execution'
      }
    },
    
    properties: [
      {
        name: 'code',
        displayName: 'JavaScript Code',
        type: 'code',
        default: '// Write your code here\n// Access input via $input\n// Use console.log() for debugging\n\nreturn $input;',
        required: true,
        language: 'javascript',
        description: 'JavaScript code to execute'
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 10000,
        min: 100,
        max: 60000,
        description: 'Maximum execution time in milliseconds'
      },
      {
        name: 'onError',
        displayName: 'On Error',
        type: 'options',
        default: 'stop',
        options: [
          { value: 'stop', label: 'Stop Flow' },
          { value: 'continue', label: 'Continue (return null)' }
        ],
        description: 'How to handle script errors'
      }
    ]
  };

  /**
   * Validate node configuration
   * @param {Object} context - Node execution context
   * @returns {Array<string>} - Array of validation errors (empty if valid)
   */
  validate(context) {
    const errors = [];
    const { data } = context.node;

    // Validate code
    if (!data?.code || data.code.trim() === '') {
      errors.push('JavaScript code is required');
    }

    // Validate timeout
    if (data?.timeout !== undefined) {
      const timeout = Number(data.timeout);
      if (isNaN(timeout) || timeout < 100 || timeout > 60000) {
        errors.push('Timeout must be between 100 and 60000 milliseconds');
      }
    }

    // Validate onError
    if (data?.onError && !['stop', 'continue'].includes(data.onError)) {
      errors.push('Invalid onError value (must be "stop" or "continue")');
    }

    return errors;
  }

  /**
   * Execute JavaScript code in sandbox
   * @param {Object} context - Node execution context
   * @returns {Promise<Object>} - Execution result
   */
  async execute(context) {
    const { node, inputs, log, app, flowId, nodeOutputs } = context;
    const { code, timeout = 10000, onError = 'stop' } = node.data || {};

    // Get input value and quality
    let inputValue = null;
    let inputQuality = 192; // Good quality by default

    if (inputs.input !== undefined) {
      // Extract value if it's an object with value property
      if (inputs.input && typeof inputs.input === 'object' && 'value' in inputs.input) {
        inputValue = inputs.input.value;
        inputQuality = inputs.input.quality || 192;
      } else {
        inputValue = inputs.input;
      }
    }

    // Check if we have code
    if (!code || code.trim() === '') {
      log.warn('JavaScript node has no code to execute');
      return {
        value: null,
        quality: 0,
        logs: [],
        error: 'No code provided'
      };
    }

    // Get allowed filesystem paths
    const allowedPaths = getAllowedPaths();

    try {
      // Execute script in sandbox
      const scriptResult = await executeScript(code, {}, {
        app,
        flowId,
        nodeOutputs,
        input: inputValue,
        timeout: Number(timeout),
        allowedPaths
      });

      // Check for errors
      if (scriptResult.error) {
        log.error({
          error: scriptResult.error,
          logs: scriptResult.logs
        }, 'Script execution failed');

        // Handle error based on onError setting
        if (onError === 'stop') {
          throw new Error(`Script error: ${scriptResult.error.message}`);
        }

        // Continue with null result
        return {
          value: null,
          quality: 0,
          logs: scriptResult.logs,
          error: scriptResult.error.message
        };
      }

      // Success
      log.info({
        result: scriptResult.result,
        logs: scriptResult.logs
      }, 'Script executed successfully');

      return {
        value: scriptResult.result,
        quality: inputQuality, // Inherit input quality
        logs: scriptResult.logs,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      log.error({ error: error.message }, 'Script node execution error');
      
      // Re-throw if onError is 'stop'
      if (onError === 'stop') {
        throw error;
      }

      // Return null result if continuing
      return {
        value: null,
        quality: 0,
        logs: [],
        error: error.message
      };
    }
  }
}
