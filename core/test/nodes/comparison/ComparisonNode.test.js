/**
 * Auto-generated tests for ComparisonNode
 * Generated: 2025-12-14T17:03:57.827Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { ComparisonNode } from '../../../src/nodes/comparison/ComparisonNode.js';

describe('ComparisonNode', () => {
  let node;

  beforeEach(() => {
    node = new ComparisonNode();
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
        return value !== undefined ? { value, quality: 0 } : null;
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

  describe('Operations', () => {

    describe('Greater Than (In1 > In2) (gt)', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: 'gt'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        // Test: 5 > 3 should be true
        let context = createMockContext({ operation: 'gt' }, [5, 3]);
        let result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 3 > 5 should be false
        context = createMockContext({ operation: 'gt' }, [3, 5]);
        result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(false);
        
        // Test: 5 > 5 should be false
        context = createMockContext({ operation: 'gt' }, [5, 5]);
        result = await node.execute(context);
        expect(result.value).toBe(false);
      });

      test('handles null inputs', async () => {
        const context = createMockContext({ operation: 'gt' }, [null, 5]);
        const result = await node.execute(context);
        expect(result.quality).toBe(0); // null converts to 0
        expect(result.value).toBe(false); // 0 > 5 = false
      });
    });

    describe('Less Than (In1 < In2) (lt)', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: 'lt'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        // Test: 3 < 5 should be true
        let context = createMockContext({ operation: 'lt' }, [3, 5]);
        let result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 5 < 3 should be false
        context = createMockContext({ operation: 'lt' }, [5, 3]);
        result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(false);
        
        // Test: 5 < 5 should be false
        context = createMockContext({ operation: 'lt' }, [5, 5]);
        result = await node.execute(context);
        expect(result.value).toBe(false);
      });

      test('handles null inputs', async () => {
        const context = createMockContext({ operation: 'lt' }, [null, 5]);
        const result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true); // 0 < 5 = true
      });
    });

    describe('Greater or Equal (In1 >= In2) (gte)', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: 'gte'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        // Test: 5 >= 3 should be true
        let context = createMockContext({ operation: 'gte' }, [5, 3]);
        let result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 5 >= 5 should be true
        context = createMockContext({ operation: 'gte' }, [5, 5]);
        result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 3 >= 5 should be false
        context = createMockContext({ operation: 'gte' }, [3, 5]);
        result = await node.execute(context);
        expect(result.value).toBe(false);
      });

      test('handles null inputs', async () => {
        const context = createMockContext({ operation: 'gte' }, [null, 5]);
        const result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(false); // 0 >= 5 = false
      });
    });

    describe('Less or Equal (In1 <= In2) (lte)', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: 'lte'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        // Test: 3 <= 5 should be true
        let context = createMockContext({ operation: 'lte' }, [3, 5]);
        let result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 5 <= 5 should be true
        context = createMockContext({ operation: 'lte' }, [5, 5]);
        result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 5 <= 3 should be false
        context = createMockContext({ operation: 'lte' }, [5, 3]);
        result = await node.execute(context);
        expect(result.value).toBe(false);
      });

      test('handles null inputs', async () => {
        const context = createMockContext({ operation: 'lte' }, [null, 5]);
        const result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true); // 0 <= 5 = true
      });
    });

    describe('Equal (In1 == In2) (eq)', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: 'eq'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        // Test: 5 == 5 should be true
        let context = createMockContext({ operation: 'eq' }, [5, 5]);
        let result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 5 == 3 should be false
        context = createMockContext({ operation: 'eq' }, [5, 3]);
        result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(false);
        
        // Test: 0 == 0 should be true
        context = createMockContext({ operation: 'eq' }, [0, 0]);
        result = await node.execute(context);
        expect(result.value).toBe(true);
      });

      test('handles null inputs', async () => {
        const context = createMockContext({ operation: 'eq' }, [null, 5]);
        const result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(false); // 0 == 5 = false
      });
    });

    describe('Not Equal (In1 != In2) (neq)', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: 'neq'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        // Test: 5 != 3 should be true
        let context = createMockContext({ operation: 'neq' }, [5, 3]);
        let result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true);
        
        // Test: 5 != 5 should be false
        context = createMockContext({ operation: 'neq' }, [5, 5]);
        result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(false);
        
        // Test: 0 != 1 should be true
        context = createMockContext({ operation: 'neq' }, [0, 1]);
        result = await node.execute(context);
        expect(result.value).toBe(true);
      });

      test('handles null inputs', async () => {
        const context = createMockContext({ operation: 'neq' }, [null, 5]);
        const result = await node.execute(context);
        expect(result.quality).toBe(0);
        expect(result.value).toBe(true); // 0 != 5 = true
      });
    });
  });

  describe('Properties', () => {

    describe('Operation (operation)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["gt","lt","gte","lte","eq","neq"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ operation: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });
  });

  describe('Edge Cases', () => {

    test('handles zero values', async () => {
      const context = createMockContext({ operation: 'eq' }, [0, 0]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(true);
    });

    test('handles negative numbers', async () => {
      const context = createMockContext({ operation: 'lt' }, [-5, -1]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(true);
    });

    test('handles large numbers', async () => {
      const context = createMockContext({ operation: 'gt' }, [999999, 100]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(true);
    });

    test('handles NaN', async () => {
      const context = createMockContext({ operation: 'eq' }, [NaN, NaN]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      // NaN comparisons should result in bad quality or specific handling
    });

    test('handles Infinity', async () => {
      const context = createMockContext({ operation: 'gt' }, [Infinity, 999]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(true);
    });

    test('handles null input', async () => {
      const context = createMockContext({ operation: 'eq' }, [null, 5]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.quality).toBe(0); // null converts to 0
      expect(result.value).toBe(false); // 0 > 5 = false
    });

    test('handles undefined input', async () => {
      const context = createMockContext({ operation: 'eq' }, [undefined, 5]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.value).toBe(false);
    });
  });
});
