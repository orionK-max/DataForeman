/**
 * Tests for ClampNode
 */

import { ClampNode } from '../../../src/nodes/math/ClampNode.js';

describe('ClampNode', () => {
  let node;

  beforeEach(() => {
    node = new ClampNode();
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
      getInputCount: () => inputValues.length
    };
  }

  describe('Metadata', () => {
    test('has valid schema', () => {
      expect(node.description).toBeDefined();
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

  describe('Clamping Operations', () => {
    test('returns value unchanged when within range', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [50]);
      const result = await node.execute(context);
      expect(result.value).toBe(50);
      expect(result.quality).toBe(0);
      expect(result.clamped).toBe(false);
    });

    test('clamps to minimum when below range', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [-10]);
      const result = await node.execute(context);
      expect(result.value).toBe(0);
      expect(result.quality).toBe(0);
      expect(result.clamped).toBe(true);
      expect(result.originalValue).toBe(-10);
    });

    test('clamps to maximum when above range', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [150]);
      const result = await node.execute(context);
      expect(result.value).toBe(100);
      expect(result.quality).toBe(0);
      expect(result.clamped).toBe(true);
      expect(result.originalValue).toBe(150);
    });

    test('handles value exactly at minimum', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [0]);
      const result = await node.execute(context);
      expect(result.value).toBe(0);
      expect(result.clamped).toBe(false);
    });

    test('handles value exactly at maximum', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [100]);
      const result = await node.execute(context);
      expect(result.value).toBe(100);
      expect(result.clamped).toBe(false);
    });
  });

  describe('Properties', () => {
    test('uses custom min/max range', async () => {
      const context = createMockContext({ min: 10, max: 20 }, [25]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
      expect(result.clamped).toBe(true);
    });

    test('works with negative ranges', async () => {
      const context = createMockContext({ min: -50, max: -10 }, [-30]);
      const result = await node.execute(context);
      expect(result.value).toBe(-30);
      expect(result.clamped).toBe(false);
    });

    test('works with fractional ranges', async () => {
      const context = createMockContext({ min: 0.5, max: 1.5 }, [1.8]);
      const result = await node.execute(context);
      expect(result.value).toBe(1.5);
      expect(result.clamped).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('handles no input', async () => {
      const context = createMockContext({ min: 0, max: 100 }, []);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('handles null input', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [null]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
      expect(result.error).toBeDefined();
    });

    test('handles undefined input', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [undefined]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('handles NaN input', async () => {
      const context = createMockContext({ min: 0, max: 100 }, [NaN]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
      expect(result.error).toBe('Input must be a number');
    });

    test('handles string input', async () => {
      const context = createMockContext({ min: 0, max: 100 }, ['not a number']);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
      expect(result.error).toBe('Input must be a number');
    });

    test('rejects invalid range (min > max)', async () => {
      const context = createMockContext({ min: 100, max: 0 }, [50]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
      expect(result.error).toMatch(/Invalid range/);
    });
  });

  describe('Edge Cases', () => {
    test('handles very large numbers', async () => {
      const context = createMockContext({ min: 0, max: 1e10 }, [1e15]);
      const result = await node.execute(context);
      expect(result.value).toBe(1e10);
      expect(result.clamped).toBe(true);
    });

    test('handles very small numbers', async () => {
      const context = createMockContext({ min: -1e10, max: 0 }, [-1e15]);
      const result = await node.execute(context);
      expect(result.value).toBe(-1e10);
      expect(result.clamped).toBe(true);
    });

    test('handles zero range (min === max)', async () => {
      const context = createMockContext({ min: 42, max: 42 }, [100]);
      const result = await node.execute(context);
      expect(result.value).toBe(42);
      expect(result.clamped).toBe(true);
    });

    test('inherits input quality', async () => {
      const contextWithBadQuality = {
        node: { id: 'test-node', data: { min: 0, max: 100 } },
        getInputValue: () => ({ value: 50, quality: 1 }), // Bad quality
        getInputCount: () => 1
      };
      const result = await node.execute(contextWithBadQuality);
      expect(result.value).toBe(50);
      expect(result.quality).toBe(1); // Quality inherited
    });
  });
});
