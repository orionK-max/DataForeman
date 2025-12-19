import { describe, test, expect, beforeEach } from 'vitest';
import { MergeNode } from '../../../src/nodes/logic/MergeNode.js';

describe('MergeNode', () => {
  let node;

  beforeEach(() => {
    node = new MergeNode();
  });

  // Helper function to create mock execution context
  function createMockContext(nodeData = {}, inputValues = []) {
    return {
      node: { 
        id: 'test-node',
        data: nodeData 
      },
      getInputValue: (index) => {
        return inputValues[index] !== undefined ? inputValues[index] : null;
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

  describe('First Valid Strategy', () => {
    test('returns first input with good quality', async () => {
      const context = createMockContext({ strategy: 'first-valid' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
      expect(result.sourceIndex).toBe(0);
    });

    test('skips bad quality inputs', async () => {
      const context = createMockContext({ strategy: 'first-valid' }, [
        { value: 10, quality: 1 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
      expect(result.sourceIndex).toBe(1);
    });

    test('skips null inputs', async () => {
      const context = createMockContext({ strategy: 'first-valid' }, [
        { value: null, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
      expect(result.sourceIndex).toBe(1);
    });

    test('falls back to first non-null if no valid inputs', async () => {
      const context = createMockContext({ strategy: 'first-valid' }, [
        { value: 10, quality: 1 },
        { value: 20, quality: 1 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
      expect(result.quality).toBe(1);
    });
  });

  describe('First Non-Null Strategy', () => {
    test('returns first non-null input', async () => {
      const context = createMockContext({ strategy: 'first-non-null' }, [
        { value: 10, quality: 1 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
      expect(result.quality).toBe(1);
    });

    test('skips null inputs', async () => {
      const context = createMockContext({ strategy: 'first-non-null' }, [
        { value: null, quality: 0 },
        { value: 20, quality: 1 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
    });
  });

  describe('Highest Quality Strategy', () => {
    test('returns input with best quality', async () => {
      const context = createMockContext({ strategy: 'highest-quality' }, [
        { value: 10, quality: 1 },
        { value: 20, quality: 0 },
        { value: 30, quality: 64 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
      expect(result.quality).toBe(0);
    });

    test('returns first input if all same quality', async () => {
      const context = createMockContext({ strategy: 'highest-quality' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
    });
  });

  describe('Latest Strategy', () => {
    test('returns most recent input', async () => {
      const context = createMockContext({ strategy: 'latest' }, [
        { value: 10, quality: 0, timestamp: 1000 },
        { value: 20, quality: 0, timestamp: 2000 },
        { value: 30, quality: 0, timestamp: 1500 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
      expect(result.sourceIndex).toBe(1);
    });
  });

  describe('Min Strategy', () => {
    test('returns input with minimum value', async () => {
      const context = createMockContext({ strategy: 'min' }, [
        { value: 30, quality: 0 },
        { value: 10, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
      expect(result.sourceIndex).toBe(1);
    });

    test('handles negative numbers', async () => {
      const context = createMockContext({ strategy: 'min' }, [
        { value: 10, quality: 0 },
        { value: -5, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(-5);
    });

    test('returns null for non-numeric inputs', async () => {
      const context = createMockContext({ strategy: 'min' }, [
        { value: 'text', quality: 0 },
        { value: 'more text', quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('ignores non-numeric values', async () => {
      const context = createMockContext({ strategy: 'min' }, [
        { value: 'text', quality: 0 },
        { value: 10, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10);
    });
  });

  describe('Max Strategy', () => {
    test('returns input with maximum value', async () => {
      const context = createMockContext({ strategy: 'max' }, [
        { value: 10, quality: 0 },
        { value: 30, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(30);
      expect(result.sourceIndex).toBe(1);
    });

    test('handles negative numbers', async () => {
      const context = createMockContext({ strategy: 'max' }, [
        { value: -10, quality: 0 },
        { value: -5, quality: 0 },
        { value: -20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(-5);
    });
  });

  describe('Average Strategy', () => {
    test('returns average of all numeric inputs', async () => {
      const context = createMockContext({ strategy: 'average' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 0 },
        { value: 30, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(20);
      expect(result.sourceIndex).toBe(-1); // Calculated
    });

    test('ignores non-numeric values', async () => {
      const context = createMockContext({ strategy: 'average' }, [
        { value: 10, quality: 0 },
        { value: 'text', quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(15);
    });

    test('inherits worst quality', async () => {
      const context = createMockContext({ strategy: 'average' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 1 },
        { value: 30, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.quality).toBe(1);
    });
  });

  describe('Sum Strategy', () => {
    test('returns sum of all numeric inputs', async () => {
      const context = createMockContext({ strategy: 'sum' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 0 },
        { value: 30, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(60);
      expect(result.sourceIndex).toBe(-1); // Calculated
    });

    test('ignores non-numeric values', async () => {
      const context = createMockContext({ strategy: 'sum' }, [
        { value: 10, quality: 0 },
        { value: 'text', quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(30);
    });

    test('inherits worst quality', async () => {
      const context = createMockContext({ strategy: 'sum' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 64 },
        { value: 30, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.quality).toBe(64);
    });
  });

  describe('Error Handling', () => {
    test('handles no inputs', async () => {
      const context = createMockContext({}, []);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('uses default strategy if not specified', async () => {
      const context = createMockContext({}, [
        { value: 10, quality: 0 },
        { value: 20, quality: 1 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(10); // first-valid is default
    });
  });

  describe('Edge Cases', () => {
    test('includes metadata in output', async () => {
      const context = createMockContext({ strategy: 'max' }, [
        { value: 10, quality: 0 },
        { value: 20, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.strategy).toBe('max');
      expect(result.inputCount).toBe(2);
    });

    test('handles single input', async () => {
      const context = createMockContext({}, [
        { value: 42, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(42);
    });

    test('handles all null inputs', async () => {
      const context = createMockContext({}, [
        { value: null, quality: 0 },
        { value: null, quality: 0 }
      ]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });
  });
});
