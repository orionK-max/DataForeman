/**
 * Auto-generated tests for RangeCheckNode
 * Generated: 2025-12-14T17:03:57.831Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { RangeCheckNode } from '../../../src/nodes/logic/RangeCheckNode.js';

describe('RangeCheckNode', () => {
  let node;

  beforeEach(() => {
    node = new RangeCheckNode();
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

    describe('Range Mode (rangeMode)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["inclusive","exclusive","minInclusive","maxInclusive"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ rangeMode: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });

    describe('Output Mode (outputMode)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["boolean","both"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ outputMode: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });
  });

  describe('Edge Cases', () => {

    test('handles zero values', async () => {
      const context = createMockContext({}, [0]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });

    test('handles negative numbers', async () => {
      const context = createMockContext({}, [-1]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });

    test('handles large numbers', async () => {
      const context = createMockContext({}, [999999]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });

    test('handles NaN', async () => {
      const context = createMockContext({}, [NaN]);
      const result = await node.execute(context);
      // TODO: Verify NaN handling (should probably return bad quality)
    });

    test('handles Infinity', async () => {
      const context = createMockContext({}, [Infinity]);
      const result = await node.execute(context);
      // TODO: Verify Infinity handling
    });

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
