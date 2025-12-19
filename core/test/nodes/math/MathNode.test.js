/**
 * Auto-generated tests for MathNode
 * Generated: 2025-12-14T17:03:57.832Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { MathNode } from '../../../src/nodes/math/MathNode.js';

describe('MathNode', () => {
  let node;

  beforeEach(() => {
    node = new MathNode();
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

  describe('ioRules Configuration', () => {
    test('ioRules are well-formed', () => {
      const rules = node.description.ioRules;
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);

      rules.forEach((rule, index) => {
        // Each rule should have inputs and/or outputs
        expect(rule.inputs || rule.outputs).toBeDefined();
      });
    });

    test('default rule provides 2-10 inputs', async () => {
      // TODO: Verify input range: min=2, max=10, default=2
    });
  });

  describe('Operations', () => {

    describe('Add All (add)', () => {
      test('adds two positive numbers', async () => {
        const context = createMockContext({
          operation: 'add'
        }, [5, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(8);
        expect(result.quality).toBe(0); // Good quality
      });

      test('adds multiple numbers', async () => {
        const context = createMockContext({
          operation: 'add'
        }, [1, 2, 3, 4]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(10);
        expect(result.quality).toBe(0);
      });

      test('handles negative numbers', async () => {
        const context = createMockContext({
          operation: 'add'
        }, [10, -5, -3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(2);
        expect(result.quality).toBe(0);
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'add'
        }, [5, null, 3]);
        
        // MathNode throws errors for invalid inputs (fail-fast design)
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Subtract (First - Rest) (subtract)', () => {
      test('subtracts two numbers', async () => {
        const context = createMockContext({
          operation: 'subtract'
        }, [10, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(7);
        expect(result.quality).toBe(0);
      });

      test('subtracts multiple numbers (chain)', async () => {
        const context = createMockContext({
          operation: 'subtract'
        }, [20, 5, 3, 2]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(10); // 20 - 5 - 3 - 2
        expect(result.quality).toBe(0);
      });

      test('produces negative result', async () => {
        const context = createMockContext({
          operation: 'subtract'
        }, [5, 10]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(-5);
        expect(result.quality).toBe(0);
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'subtract'
        }, [10, null, 2]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Multiply All (multiply)', () => {
      test('multiplies two numbers', async () => {
        const context = createMockContext({
          operation: 'multiply'
        }, [4, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(12);
        expect(result.quality).toBe(0);
      });

      test('multiplies multiple numbers', async () => {
        const context = createMockContext({
          operation: 'multiply'
        }, [2, 3, 4]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(24);
        expect(result.quality).toBe(0);
      });

      test('handles zero (result is zero)', async () => {
        const context = createMockContext({
          operation: 'multiply'
        }, [5, 0, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(0);
        expect(result.quality).toBe(0);
      });

      test('handles negative numbers', async () => {
        const context = createMockContext({
          operation: 'multiply'
        }, [2, -3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(-6);
        expect(result.quality).toBe(0);
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'multiply'
        }, [5, null]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Divide (First / Rest) (divide)', () => {
      test('divides two numbers', async () => {
        const context = createMockContext({
          operation: 'divide'
        }, [20, 4]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(5);
        expect(result.quality).toBe(0);
      });

      test('divides with decimal result', async () => {
        const context = createMockContext({
          operation: 'divide'
        }, [10, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBeCloseTo(3.333, 2); // ~3.33
        expect(result.quality).toBe(0);
      });

      test('chain division (first / second / third)', async () => {
        const context = createMockContext({
          operation: 'divide'
        }, [100, 5, 2]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(10); // 100 / 5 / 2 = 10
        expect(result.quality).toBe(0);
      });

      test('throws error when dividing by zero', async () => {
        const context = createMockContext({
          operation: 'divide'
        }, [10, 0]);
        
        await expect(node.execute(context)).rejects.toThrow('divide by zero');
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'divide'
        }, [10, null]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Average (average)', () => {
      test('calculates average of two numbers', async () => {
        const context = createMockContext({
          operation: 'average'
        }, [10, 20]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(15);
        expect(result.quality).toBe(0);
      });

      test('calculates average of multiple numbers', async () => {
        const context = createMockContext({
          operation: 'average'
        }, [10, 20, 30, 40]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(25); // (10+20+30+40)/4
        expect(result.quality).toBe(0);
      });

      test('handles negative numbers', async () => {
        const context = createMockContext({
          operation: 'average'
        }, [-10, 10]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(0);
        expect(result.quality).toBe(0);
      });

      test('handles decimal result', async () => {
        const context = createMockContext({
          operation: 'average'
        }, [1, 2, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(2); // (1+2+3)/3
        expect(result.quality).toBe(0);
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'average'
        }, [10, null, 30]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Minimum (min)', () => {
      test('finds minimum of two numbers', async () => {
        const context = createMockContext({
          operation: 'min'
        }, [10, 5]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(5);
        expect(result.quality).toBe(0);
      });

      test('finds minimum of multiple numbers', async () => {
        const context = createMockContext({
          operation: 'min'
        }, [50, 10, 30, 5, 20]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(5);
        expect(result.quality).toBe(0);
      });

      test('handles negative numbers', async () => {
        const context = createMockContext({
          operation: 'min'
        }, [5, -10, 3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(-10);
        expect(result.quality).toBe(0);
      });

      test('handles all equal values', async () => {
        const context = createMockContext({
          operation: 'min'
        }, [7, 7, 7]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(7);
        expect(result.quality).toBe(0);
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'min'
        }, [10, null, 5]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Maximum (max)', () => {
      test('finds maximum of two numbers', async () => {
        const context = createMockContext({
          operation: 'max'
        }, [10, 5]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(10);
        expect(result.quality).toBe(0);
      });

      test('finds maximum of multiple numbers', async () => {
        const context = createMockContext({
          operation: 'max'
        }, [50, 10, 100, 30, 20]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(100);
        expect(result.quality).toBe(0);
      });

      test('handles negative numbers', async () => {
        const context = createMockContext({
          operation: 'max'
        }, [-5, -10, -3]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(-3);
        expect(result.quality).toBe(0);
      });

      test('handles all equal values', async () => {
        const context = createMockContext({
          operation: 'max'
        }, [7, 7, 7]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(7);
        expect(result.quality).toBe(0);
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'max'
        }, [10, null, 5]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });

    describe('Custom Formula (formula)', () => {
      test('evaluates simple formula with input0', async () => {
        const context = createMockContext({
          operation: 'formula',
          formula: 'input0 * 2' // Double the input
        }, [5]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(10);
        expect(result.quality).toBe(0);
      });

      test('evaluates formula with multiple inputs', async () => {
        const context = createMockContext({
          operation: 'formula',
          formula: 'input0 + input1 * input2' // First + (second * third)
        }, [10, 5, 2]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(20); // 10 + (5 * 2)
        expect(result.quality).toBe(0);
      });

      test('evaluates formula with operations', async () => {
        const context = createMockContext({
          operation: 'formula',
          formula: 'input0 * input0' // Square using multiplication
        }, [4]);
        
        const result = await node.execute(context);
        expect(result.value).toBe(16);
        expect(result.quality).toBe(0);
      });

      test('throws error with invalid formula', async () => {
        const context = createMockContext({
          operation: 'formula',
          formula: 'invalid syntax here!' // Invalid
        }, [5]);
        
        await expect(node.execute(context)).rejects.toThrow('invalid characters');
      });

      test('throws error with null input', async () => {
        const context = createMockContext({
          operation: 'formula',
          formula: 'input0 * 2'
        }, [null]);
        
        await expect(node.execute(context)).rejects.toThrow('not a valid number');
      });
    });
  });

  describe('Properties', () => {

    describe('Operation (operation)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["add","subtract","multiply","divide","average","min","max"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ operation: optionValue }, [5, 3]);
          const result = await node.execute(context);
          expect(result).toBeDefined();
          expect(result.value).toBeDefined();
        }
      });

      test('formula operation with valid formula', async () => {
        const context = createMockContext({ 
          operation: 'formula',
          formula: 'input0 + input1'
        }, [5, 3]);
        const result = await node.execute(context);
        expect(result.value).toBe(8);
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

    test('throws error for NaN input', async () => {
      const context = createMockContext({ operation: 'add' }, [NaN, 5]);
      await expect(node.execute(context)).rejects.toThrow('not a valid number');
    });

    test('throws error for Infinity input', async () => {
      const context = createMockContext({ operation: 'add' }, [Infinity, 5]);
      await expect(node.execute(context)).rejects.toThrow('not a valid number');
    });

    test('throws error for null input', async () => {
      const context = createMockContext({ operation: 'add' }, [null]);
      await expect(node.execute(context)).rejects.toThrow('not a valid number');
    });

    test('throws error for undefined input', async () => {
      const context = createMockContext({ operation: 'add' }, [undefined]);
      await expect(node.execute(context)).rejects.toThrow('empty');
    });

    test('throws error for boolean input', async () => {
      const context = createMockContext({ operation: 'add' }, [true, 5]);
      await expect(node.execute(context)).rejects.toThrow('boolean');
    });
  });
});
