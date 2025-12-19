import { describe, test, expect, beforeEach } from 'vitest';
import { JSONOpsNode } from '../../../src/nodes/data/JSONOpsNode.js';

describe('JSONOpsNode', () => {
  let node;

  beforeEach(() => {
    node = new JSONOpsNode();
  });

  // Helper function to create mock execution context
  function createMockContext(nodeData = {}, inputValue, paramValue = undefined) {
    return {
      node: { 
        id: 'test-node',
        data: nodeData 
      },
      getInputValue: (index) => {
        if (index === 0) return inputValue !== undefined ? { value: inputValue, quality: 0 } : null;
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

  describe('Parse Operation', () => {
    test('parses valid JSON string', async () => {
      const context = createMockContext({ operation: 'parse' }, '{"name":"John","age":30}');
      const result = await node.execute(context);
      expect(result.value).toEqual({ name: 'John', age: 30 });
    });

    test('parses JSON array', async () => {
      const context = createMockContext({ operation: 'parse' }, '[1,2,3]');
      const result = await node.execute(context);
      expect(result.value).toEqual([1, 2, 3]);
    });

    test('parses JSON primitives', async () => {
      const context = createMockContext({ operation: 'parse' }, '"hello"');
      const result = await node.execute(context);
      expect(result.value).toBe('hello');
    });

    test('returns error for invalid JSON', async () => {
      const context = createMockContext({ operation: 'parse' }, '{invalid json}');
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
      expect(result.quality).toBe(1);
    });

    test('returns error for non-string input', async () => {
      const context = createMockContext({ operation: 'parse' }, 123);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });
  });

  describe('Stringify Operation', () => {
    test('stringifies object', async () => {
      const context = createMockContext({ operation: 'stringify' }, { name: 'John', age: 30 });
      const result = await node.execute(context);
      expect(result.value).toBe('{"name":"John","age":30}');
    });

    test('stringifies array', async () => {
      const context = createMockContext({ operation: 'stringify' }, [1, 2, 3]);
      const result = await node.execute(context);
      expect(result.value).toBe('[1,2,3]');
    });

    test('stringifies with indentation', async () => {
      const context = createMockContext({ operation: 'stringify', indent: 2 }, { name: 'John' });
      const result = await node.execute(context);
      expect(result.value).toContain('\n');
      expect(result.value).toContain('  ');
    });

    test('stringifies primitives', async () => {
      const context = createMockContext({ operation: 'stringify' }, 'hello');
      const result = await node.execute(context);
      expect(result.value).toBe('"hello"');
    });

    test('stringifies null', async () => {
      const context = createMockContext({ operation: 'stringify' }, null);
      const result = await node.execute(context);
      expect(result.value).toBe('null');
    });
  });

  describe('Get Property Operation', () => {
    test('gets top-level property', async () => {
      const obj = { name: 'John', age: 30 };
      const context = createMockContext({ operation: 'get-property', path: 'name' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe('John');
    });

    test('gets nested property', async () => {
      const obj = { user: { name: 'John', address: { city: 'NYC' } } };
      const context = createMockContext({ operation: 'get-property', path: 'user.address.city' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe('NYC');
    });

    test('uses parameter input for path', async () => {
      const obj = { name: 'John', age: 30 };
      const context = createMockContext({ operation: 'get-property' }, obj, 'age');
      const result = await node.execute(context);
      expect(result.value).toBe(30);
    });

    test('returns error for non-existent property', async () => {
      const obj = { name: 'John' };
      const context = createMockContext({ operation: 'get-property', path: 'nonexistent' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });

    test('returns error for non-object input', async () => {
      const context = createMockContext({ operation: 'get-property', path: 'name' }, 'not an object');
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });

    test('returns error for missing path', async () => {
      const obj = { name: 'John' };
      const context = createMockContext({ operation: 'get-property' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });

    test('handles array indices in path', async () => {
      const obj = { users: [{ name: 'John' }, { name: 'Jane' }] };
      const context = createMockContext({ operation: 'get-property', path: 'users.0.name' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe('John');
    });
  });

  describe('Has Property Operation', () => {
    test('returns true for existing property', async () => {
      const obj = { name: 'John', age: 30 };
      const context = createMockContext({ operation: 'has-property', path: 'name' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe(true);
    });

    test('returns false for non-existent property', async () => {
      const obj = { name: 'John' };
      const context = createMockContext({ operation: 'has-property', path: 'age' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe(false);
    });

    test('checks nested properties', async () => {
      const obj = { user: { name: 'John' } };
      const context = createMockContext({ operation: 'has-property', path: 'user.name' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe(true);
    });

    test('returns false for non-object input', async () => {
      const context = createMockContext({ operation: 'has-property', path: 'name' }, 'not an object');
      const result = await node.execute(context);
      expect(result.value).toBe(false);
    });

    test('uses parameter input for path', async () => {
      const obj = { name: 'John', age: 30 };
      const context = createMockContext({ operation: 'has-property' }, obj, 'age');
      const result = await node.execute(context);
      expect(result.value).toBe(true);
    });
  });

  describe('Keys Operation', () => {
    test('returns object keys', async () => {
      const obj = { name: 'John', age: 30, city: 'NYC' };
      const context = createMockContext({ operation: 'keys' }, obj);
      const result = await node.execute(context);
      expect(result.value).toEqual(['name', 'age', 'city']);
    });

    test('returns empty array for empty object', async () => {
      const context = createMockContext({ operation: 'keys' }, {});
      const result = await node.execute(context);
      expect(result.value).toEqual([]);
    });

    test('returns error for non-object input', async () => {
      const context = createMockContext({ operation: 'keys' }, 'not an object');
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });

    test('works with arrays', async () => {
      const context = createMockContext({ operation: 'keys' }, ['a', 'b', 'c']);
      const result = await node.execute(context);
      expect(result.value).toEqual(['0', '1', '2']);
    });
  });

  describe('Values Operation', () => {
    test('returns object values', async () => {
      const obj = { name: 'John', age: 30, city: 'NYC' };
      const context = createMockContext({ operation: 'values' }, obj);
      const result = await node.execute(context);
      expect(result.value).toEqual(['John', 30, 'NYC']);
    });

    test('returns empty array for empty object', async () => {
      const context = createMockContext({ operation: 'values' }, {});
      const result = await node.execute(context);
      expect(result.value).toEqual([]);
    });

    test('returns error for non-object input', async () => {
      const context = createMockContext({ operation: 'values' }, 'not an object');
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.error).toBeDefined();
    });

    test('works with arrays', async () => {
      const context = createMockContext({ operation: 'values' }, ['a', 'b', 'c']);
      const result = await node.execute(context);
      expect(result.value).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Error Handling', () => {
    test('handles no input', async () => {
      const context = createMockContext({ operation: 'parse' }, undefined);
      const result = await node.execute(context);
      expect(result.value).toBe(null);
      expect(result.quality).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('includes metadata in output', async () => {
      const context = createMockContext({ operation: 'keys' }, { name: 'John' });
      const result = await node.execute(context);
      expect(result.operation).toBe('keys');
    });

    test('inherits input quality', async () => {
      const context = {
        node: { id: 'test-node', data: { operation: 'stringify' } },
        getInputValue: (index) => {
          if (index === 0) return { value: { name: 'John' }, quality: 64 };
          return null;
        },
        getInputCount: () => 1
      };
      const result = await node.execute(context);
      expect(result.quality).toBe(64);
    });

    test('handles deeply nested objects', async () => {
      const obj = { a: { b: { c: { d: { e: 'deep' } } } } };
      const context = createMockContext({ operation: 'get-property', path: 'a.b.c.d.e' }, obj);
      const result = await node.execute(context);
      expect(result.value).toBe('deep');
    });

    test('round-trip parse and stringify', async () => {
      const original = { name: 'John', age: 30, active: true };
      
      const stringifyContext = createMockContext({ operation: 'stringify' }, original);
      const stringified = await node.execute(stringifyContext);
      
      const parseContext = createMockContext({ operation: 'parse' }, stringified.value);
      const parsed = await node.execute(parseContext);
      
      expect(parsed.value).toEqual(original);
    });
  });
});
