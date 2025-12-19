/**
 * Auto-generated tests for JavaScriptNode
 * Generated: 2025-12-14T17:03:57.833Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { JavaScriptNode } from '../../../src/nodes/scripts/JavaScriptNode.js';

describe('JavaScriptNode', () => {
  let node;

  beforeEach(() => {
    node = new JavaScriptNode();
  });

  // Helper function to create mock execution context
  function createMockContext(nodeData = {}, inputValues = []) {
    return {
      node: { 
        id: 'test-node',
        data: nodeData 
      },
      getInputValue: (index) => {
        const value = inputValues[index];
        return value !== undefined ? { value } : null;
      },
      getInputCount: () => inputValues.length,
      log: {
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {}
      },
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {}
      },
      app: {}, // Mock app instance for script execution
      flow: { id: 'test-flow-id' } // Required for script execution
    };
  }

  describe('Metadata', () => {
    test('has valid schema', () => {
      expect(node.description).toBeDefined();
      expect(node.description.schemaVersion).toBe(1);
      expect(node.description.displayName).toBeDefined();
      expect(node.description.name).toBeDefined();
      expect(node.description.category).toBeDefined();
    });

    test('has inputs and outputs defined', () => {
      expect(Array.isArray(node.description.inputs)).toBe(true);
      expect(Array.isArray(node.description.outputs)).toBe(true);
    });

    test('has properties array', () => {
      expect(Array.isArray(node.description.properties)).toBe(true);
    });
  });

  describe('Properties', () => {

    describe('On Error (onError)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["stop","continue"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ onError: optionValue, code: 'return 42;' });
          const result = await node.execute(context);
          expect(result).toBeDefined();
          expect(result.value).toBe(42);
          expect(result.quality).toBe(0); // Good quality
        }
      });
    });
  });

  describe('Edge Cases', () => {

    test('handles null input', async () => {
      const context = createMockContext({}, [null]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(null);
      expect(result.quality).toBe(0); // Quality 0 when no code
      expect(result.error).toBe('No code provided');
    });

    test('handles undefined input', async () => {
      const context = createMockContext({}, [undefined]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(null);
      expect(result.quality).toBe(0); // Quality 0 when no code
      expect(result.error).toBe('No code provided');
    });
  });
});
