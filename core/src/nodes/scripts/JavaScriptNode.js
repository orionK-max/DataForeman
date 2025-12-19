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
  description = {
    schemaVersion: 1,
    displayName: 'JavaScript',
    name: 'script-js',
    version: 1,
    description: 'Execute custom JavaScript code with access to flow context and APIs',
    category: 'LOGIC_MATH',
    section: 'SCRIPTS',
    icon: '📜',
    color: '#F57C00',
    
    inputs: [
      {
        displayName: 'Input',
        type: 'main',
        required: false,
        description: 'Optional input value (available as $input in script)'
      }
    ],
    
    outputs: [
      {
        displayName: 'Result',
        type: 'main',
        description: 'Script execution result'
      }
    ],
    
    visual: {
      canvas: {
        minWidth: 180,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '📜',
          title: 'JavaScript',
          color: '#F57C00',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: 'Custom script'
        },
        {
          type: 'divider',
          color: '#e0e0e0',
          margin: 8,
          visible: '{{code}}'
        },
        {
          type: 'code',
          language: 'javascript',
          content: '{{code}}',
          maxLines: 3,
          showLineNumbers: false,
          visible: '{{code}}'
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
        type: 'select',
        default: 'stop',
        options: [
          { label: 'Stop Flow', value: 'stop' },
          { label: 'Continue (return null)', value: 'continue' }
        ],
        description: 'How to handle script errors'
      }
    ],
    
    // Config UI structure
    configUI: {
      sections: [
        // Code editor with autocomplete
        {
          type: 'code-editor',
          property: 'code',
          label: 'JavaScript Code',
          language: 'javascript',
          height: 300,
          defaultValue: '// Write your code here\n// Access input via $input\n// Use console.log() for debugging\n\nreturn $input;',
          autocomplete: [
            {
              label: '$input',
              kind: 'Variable',
              documentation: 'Input value from previous node',
              insertText: '$input'
            },
            {
              label: '$tags.get',
              kind: 'Method',
              documentation: 'Get current tag value: await $tags.get("tagPath") - Returns {value, quality, timestamp}',
              insertText: 'await $tags.get("${1:tagPath}")',
              isSnippet: true
            },
            {
              label: '$tags.history',
              kind: 'Method',
              documentation: 'Get tag history: await $tags.history("tagPath", "1h") - Returns array of {value, quality, timestamp}',
              insertText: 'await $tags.history("${1:tagPath}", "${2:1h}")',
              isSnippet: true
            },
            {
              label: '$flow.state.get',
              kind: 'Method',
              documentation: 'Get flow state: await $flow.state.get("key") - Returns stored value or entire state object',
              insertText: 'await $flow.state.get("${1:key}")',
              isSnippet: true
            },
            {
              label: '$flow.state.set',
              kind: 'Method',
              documentation: 'Set flow state: await $flow.state.set("key", value) - Persists state to database',
              insertText: 'await $flow.state.set("${1:key}", ${2:value})',
              isSnippet: true
            },
            {
              label: '$fs.readFile',
              kind: 'Method',
              documentation: 'Read file contents: await $fs.readFile("path", "utf8") - Max 10MB',
              insertText: 'await $fs.readFile("${1:path}", "${2:utf8}")',
              isSnippet: true
            },
            {
              label: '$fs.writeFile',
              kind: 'Method',
              documentation: 'Write file contents: await $fs.writeFile("path", data, "utf8") - Max 10MB',
              insertText: 'await $fs.writeFile("${1:path}", ${2:data}, "${3:utf8}")',
              isSnippet: true
            },
            {
              label: '$fs.exists',
              kind: 'Method',
              documentation: 'Check if file exists: await $fs.exists("path") - Returns boolean',
              insertText: 'await $fs.exists("${1:path}")',
              isSnippet: true
            },
            {
              label: '$fs.readdir',
              kind: 'Method',
              documentation: 'List directory contents: await $fs.readdir("dirPath") - Returns array of filenames',
              insertText: 'await $fs.readdir("${1:dirPath}")',
              isSnippet: true
            }
          ]
        },
        
        // Properties group for timeout and error handling
        {
          type: 'property-group',
          properties: ['timeout', 'onError']
        }
      ]
    }
  };

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        const resultPreview = typeof result.value === 'object' 
          ? JSON.stringify(result.value).substring(0, 100) 
          : String(result.value);
        return `Script returned: ${resultPreview}${result.logs?.length > 0 ? ` (${result.logs.length} console logs)` : ''}`;
      },
      debug: (result) => `Script execution time: ${result.executionTime}ms`,
      error: (error) => `Script execution failed: ${error.message}`
    };
  }

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
    const { node, log, app } = context;
    const flowId = context.flow?.id;
    const nodeOutputs = context.nodeOutputs;
    const { code, timeout = 10000, onError = 'stop' } = node.data || {};

    // Get input value and quality
    let inputValue = null;
    let inputQuality = 0; // Good quality by default

    const inputData = context.getInputValue(0);
    if (inputData !== undefined && inputData !== null) {
      // Extract value if it's an object with value property
      if (typeof inputData === 'object' && 'value' in inputData) {
        inputValue = inputData.value;
        inputQuality = inputData.quality || 192;
      } else {
        inputValue = inputData;
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

    const startTime = Date.now(); // Track execution start time

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
        executionTime: Date.now() - startTime,
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

  static get help() {
    return {
      overview: "Executes custom JavaScript code in a secure sandboxed environment with access to flow context, tags, and file system APIs. Supports async/await, console logging, and configurable error handling. Use for complex calculations and custom logic not available in standard nodes.",
      useCases: [
        "Implement custom mathematical formulas and statistical calculations",
        "Parse complex data structures or proprietary message formats",
        "Access external APIs or files using $fs API for advanced integrations",
        "Perform conditional logic with multiple branches and edge cases"
      ],
      examples: [
        {
          title: "Custom Calculation",
          config: { code: "return Math.sqrt($input * 2) + 10;" },
          input: { value: 8 },
          output: { value: 14, logs: [] }
        },
        {
          title: "Conditional Logic",
          config: { code: "if ($input > 100) return 'HIGH';\nelse if ($input > 50) return 'MEDIUM';\nelse return 'LOW';" },
          input: { value: 75 },
          output: { value: "MEDIUM", logs: [] }
        },
        {
          title: "Array Processing",
          config: { code: "const sum = $input.reduce((a,b) => a+b, 0);\nreturn sum / $input.length;" },
          input: { value: [10, 20, 30] },
          output: { value: 20, logs: [] }
        }
      ],
      tips: [
        "Use $input to access the input value from the connected node",
        "Access flow context with $flow.getVariable('name') and $flow.setVariable('name', value)",
        "Read tags using $tags.read('connectionName', 'tagPath')",
        "Console.log() output appears in execution logs for debugging",
        "Set timeout to prevent infinite loops (default: 5000ms)",
        "Return value becomes the node output - can be any JSON-serializable type",
        "Use async/await for asynchronous operations",
        "Error handling: 'stop' halts flow, 'continue' passes null and continues"
      ],
      relatedNodes: ["MathNode", "StringOpsNode", "TypeConvertNode"]
    };
  }
}
