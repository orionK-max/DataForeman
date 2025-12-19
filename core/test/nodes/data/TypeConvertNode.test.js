/**
 * Auto-generated tests for TypeConvertNode
 * Generated: 2025-12-14T17:03:57.828Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { TypeConvertNode } from '../../../src/nodes/data/TypeConvertNode.js';

describe('TypeConvertNode', () => {
  let node;

  beforeEach(() => {
    node = new TypeConvertNode();
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
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {}
      }
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

    describe('Target Type (targetType)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["number","string","boolean"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ targetType: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });

    describe('On Error (onError)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["null","original","default"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ onError: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });
  });

  describe('Edge Cases', () => {

    test('handles null input', async () => {
      const context = createMockContext({}, [null]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      // Check if quality indicates bad data
    });

    test('handles undefined input', async () => {
      const context = createMockContext({}, [undefined]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
  });
});
