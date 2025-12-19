import { describe, test, expect, beforeEach } from 'vitest';
import { RoundNode } from '../../../src/nodes/math/RoundNode.js';

describe('RoundNode', () => {
  let node;

  beforeEach(() => {
    node = new RoundNode();
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

  describe('Round Mode (default)', () => {
    test('rounds to integer by default', async () => {
      const context = createMockContext({}, [12.567]);
      const result = await node.execute(context);
      expect(result.value).toBe(13);
    });

    test('rounds down when < 0.5', async () => {
      const context = createMockContext({}, [12.4]);
      const result = await node.execute(context);
      expect(result.value).toBe(12);
    });

    test('rounds up when >= 0.5', async () => {
      const context = createMockContext({}, [12.5]);
      const result = await node.execute(context);
      expect(result.value).toBe(13);
    });

    test('rounds with precision=1', async () => {
      const context = createMockContext({ precision: 1 }, [12.567]);
      const result = await node.execute(context);
      expect(result.value).toBeCloseTo(12.6, 5);
    });

    test('rounds with precision=2', async () => {
      const context = createMockContext({ precision: 2 }, [12.567]);
      const result = await node.execute(context);
      expect(result.value).toBeCloseTo(12.57, 5);
    });

    test('rounds to tens with precision=-1', async () => {
      const context = createMockContext({ precision: -1 }, [123]);
      const result = await node.execute(context);
      expect(result.value).toBe(120);
    });

    test('rounds to hundreds with precision=-2', async () => {
      const context = createMockContext({ precision: -2 }, [567]);
      const result = await node.execute(context);
      expect(result.value).toBe(600);
    });
  });

  describe('Floor Mode', () => {
    test('floors positive number', async () => {
      const context = createMockContext({ mode: 'floor' }, [12.9]);
      const result = await node.execute(context);
      expect(result.value).toBe(12);
    });

    test('floors negative number toward negative infinity', async () => {
      const context = createMockContext({ mode: 'floor' }, [-12.1]);
      const result = await node.execute(context);
      expect(result.value).toBe(-13);
    });

    test('floors with precision', async () => {
      const context = createMockContext({ mode: 'floor', precision: 1 }, [12.99]);
      const result = await node.execute(context);
      expect(result.value).toBeCloseTo(12.9, 5);
    });
  });

  describe('Ceil Mode', () => {
    test('ceils positive number', async () => {
      const context = createMockContext({ mode: 'ceil' }, [12.1]);
      const result = await node.execute(context);
      expect(result.value).toBe(13);
    });

    test('ceils negative number toward positive infinity', async () => {
      const context = createMockContext({ mode: 'ceil' }, [-12.9]);
      const result = await node.execute(context);
      expect(result.value).toBe(-12);
    });

    test('ceils with precision', async () => {
      const context = createMockContext({ mode: 'ceil', precision: 1 }, [12.11]);
      const result = await node.execute(context);
      expect(result.value).toBeCloseTo(12.2, 5);
    });
  });

  describe('Truncate Mode', () => {
    test('truncates positive number', async () => {
      const context = createMockContext({ mode: 'trunc' }, [12.9]);
      const result = await node.execute(context);
      expect(result.value).toBe(12);
    });

    test('truncates negative number toward zero', async () => {
      const context = createMockContext({ mode: 'trunc' }, [-12.9]);
      const result = await node.execute(context);
      expect(result.value).toBe(-12);
    });

    test('truncates with precision', async () => {
      const context = createMockContext({ mode: 'trunc', precision: 1 }, [12.99]);
      const result = await node.execute(context);
      expect(result.value).toBeCloseTo(12.9, 5);
    });
  });

  describe('Error Handling', () => {
    test('handles no input', async () => {
      const context = createMockContext({}, []);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('handles NaN input', async () => {
      const context = createMockContext({}, [NaN]);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });

    test('handles string input', async () => {
      const context = createMockContext({}, ['not a number']);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('handles zero', async () => {
      const context = createMockContext({}, [0]);
      const result = await node.execute(context);
      expect(result.value).toBe(0);
    });

    test('handles very large numbers', async () => {
      const context = createMockContext({}, [1e15 + 0.7]);
      const result = await node.execute(context);
      expect(result.value).toBe(1e15 + 1);
    });

    test('handles very small numbers', async () => {
      const context = createMockContext({ precision: 5 }, [0.123456]);
      const result = await node.execute(context);
      expect(result.value).toBeCloseTo(0.12346, 5);
    });

    test('inherits input quality', async () => {
      const context = {
        node: { id: 'test-node', data: {} },
        getInputValue: () => ({ value: 12.5, quality: 64 }),
        getInputCount: () => 1
      };
      const result = await node.execute(context);
      expect(result.quality).toBe(64);
    });

    test('preserves original value', async () => {
      const context = createMockContext({}, [12.567]);
      const result = await node.execute(context);
      expect(result.originalValue).toBe(12.567);
      expect(result.value).toBe(13);
    });

    test('includes mode and precision in output', async () => {
      const context = createMockContext({ mode: 'floor', precision: 2 }, [12.567]);
      const result = await node.execute(context);
      expect(result.mode).toBe('floor');
      expect(result.precision).toBe(2);
    });
  });
});
