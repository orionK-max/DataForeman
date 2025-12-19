import { describe, test, expect, beforeEach } from 'vitest';
import { ArrayOpsNode } from '../../../src/nodes/data/ArrayOpsNode.js';

describe('ArrayOpsNode', () => {
  let node;

  beforeEach(() => {
    node = new ArrayOpsNode();
  });

  // Helper function to create mock execution context
  function createMockContext(nodeData = {}, arrayValue, paramValue = undefined) {
    return {
      node: { 
        id: 'test-node',
        data: nodeData 
      },
      getInputValue: (index) => {
        if (index === 0) return arrayValue ? { value: arrayValue, quality: 0 } : null;
        if (index === 1 && paramValue !== undefined) return { value: paramValue, quality: 0 };
        return null;
      },
      getInputCount: () => paramValue !== undefined ? 2 : 1
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

  describe('Get Element Operation', () => {
    test('gets element at index', async () => {
      const context = createMockContext({ operation: 'get-element', index: 1 }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
    });

    test('gets element at index 0', async () => {
      const context = createMockContext({ operation: 'get-element', index: 0 }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
    });

    test('supports negative indexing', async () => {
      const context = createMockContext({ operation: 'get-element', index: -1 }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(30);
    });

    test('supports negative indexing -2', async () => {
      const context = createMockContext({ operation: 'get-element', index: -2 }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
    });

    test('uses parameter input over property', async () => {
      const context = createMockContext({ operation: 'get-element', index: 0 }, [10, 20, 30], 2);
      const result = await node.execute(context);
      expect(result.value).toBe(30);
    });

    test('returns error for out of bounds index', async () => {
      const context = createMockContext({ operation: 'get-element', index: 5 }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });

    test('returns error for invalid index', async () => {
      const context = createMockContext({ operation: 'get-element' }, [10, 20, 30], 'not a number');
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });
  });

  describe('Length Operation', () => {
    test('returns array length', async () => {
      const context = createMockContext({ operation: 'length' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(3);
    });

    test('returns 0 for empty array', async () => {
      const context = createMockContext({ operation: 'length' }, []);
      const result = await node.execute(context);
      expect(result.value).toBe(0);
    });
  });

  describe('First Operation', () => {
    test('returns first element', async () => {
      const context = createMockContext({ operation: 'first' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
    });

    test('returns null for empty array', async () => {
      const context = createMockContext({ operation: 'first' }, []);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
    });
  });

  describe('Last Operation', () => {
    test('returns last element', async () => {
      const context = createMockContext({ operation: 'last' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(30);
    });

    test('returns null for empty array', async () => {
      const context = createMockContext({ operation: 'last' }, []);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
    });
  });

  describe('Join Operation', () => {
    test('joins with default separator', async () => {
      const context = createMockContext({ operation: 'join' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe('10,20,30');
    });

    test('joins with custom separator', async () => {
      const context = createMockContext({ operation: 'join', separator: ' | ' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe('10 | 20 | 30');
    });

    test('joins empty array', async () => {
      const context = createMockContext({ operation: 'join' }, []);
      const result = await node.execute(context);
      expect(result.value).toBe('');
    });

    test('joins mixed types', async () => {
      const context = createMockContext({ operation: 'join', separator: '-' }, ['a', 1, true]);
      const result = await node.execute(context);
      expect(result.value).toBe('a-1-true');
    });
  });

  describe('Slice Operation', () => {
    test('slices from start', async () => {
      const context = createMockContext({ operation: 'slice', start: 1 }, [10, 20, 30, 40]);
      const result = await node.execute(context);
      expect(result.value).toEqual([20, 30, 40]);
    });

    test('slices with start and end', async () => {
      const context = createMockContext({ operation: 'slice', start: 1, end: 3 }, [10, 20, 30, 40]);
      const result = await node.execute(context);
      expect(result.value).toEqual([20, 30]);
    });

    test('slices with negative indices', async () => {
      const context = createMockContext({ operation: 'slice', start: -2 }, [10, 20, 30, 40]);
      const result = await node.execute(context);
      expect(result.value).toEqual([30, 40]);
    });

    test('slices entire array with start 0', async () => {
      const context = createMockContext({ operation: 'slice', start: 0 }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toEqual([10, 20, 30]);
    });
  });

  describe('Includes Operation', () => {
    test('returns true when value exists', async () => {
      const context = createMockContext({ operation: 'includes' }, [10, 20, 30], 20);
      const result = await node.execute(context);
      expect(result.value).toBe(true);
    });

    test('returns false when value does not exist', async () => {
      const context = createMockContext({ operation: 'includes' }, [10, 20, 30], 99);
      const result = await node.execute(context);
      expect(result.value).toBe(false);
    });

    test('works with strings', async () => {
      const context = createMockContext({ operation: 'includes' }, ['a', 'b', 'c'], 'b');
      const result = await node.execute(context);
      expect(result.value).toBe(true);
    });

    test('requires parameter input', async () => {
      const context = createMockContext({ operation: 'includes' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });
  });

  describe('Index Of Operation', () => {
    test('returns index when value exists', async () => {
      const context = createMockContext({ operation: 'index-of' }, [10, 20, 30], 20);
      const result = await node.execute(context);
      expect(result.value).toBe(1);
    });

    test('returns -1 when value does not exist', async () => {
      const context = createMockContext({ operation: 'index-of' }, [10, 20, 30], 99);
      const result = await node.execute(context);
      expect(result.value).toBe(-1);
    });

    test('returns first occurrence', async () => {
      const context = createMockContext({ operation: 'index-of' }, [10, 20, 10, 30], 10);
      const result = await node.execute(context);
      expect(result.value).toBe(0);
    });

    test('requires parameter input', async () => {
      const context = createMockContext({ operation: 'index-of' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('handles no input', async () => {
      const context = createMockContext({ operation: 'length' }, null);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('handles non-array input', async () => {
      const context = createMockContext({ operation: 'length' }, 'not an array');
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
      expect(result.error).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    test('includes metadata in output', async () => {
      const context = createMockContext({ operation: 'length' }, [10, 20, 30]);
      const result = await node.execute(context);
      expect(result.operation).toBe('length');
      expect(result.arrayLength).toBe(3);
    });

    test('inherits input quality', async () => {
      const context = {
        node: { id: 'test-node', data: { operation: 'length' } },
        getInputValue: (index) => {
          if (index === 0) return { value: [10, 20], quality: 64 };
          return null;
        },
        getInputCount: () => 1
      };
      const result = await node.execute(context);
      expect(result.quality).toBe(64);
    });

    test('handles array with single element', async () => {
      const context = createMockContext({ operation: 'first' }, [42]);
      const result = await node.execute(context);
      expect(result.value).toBe(42);
    });

    test('handles array with null/undefined elements', async () => {
      const context = createMockContext({ operation: 'get-element', index: 1 }, [10, null, 30]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
    });
  });
});
