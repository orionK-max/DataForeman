/**
 * Auto-generated tests for TagOutputNode
 * Generated: 2025-12-14T17:03:57.835Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { TagOutputNode } from '../../../src/nodes/tags/TagOutputNode.js';

describe('TagOutputNode', () => {
  let node;

  beforeEach(() => {
    node = new TagOutputNode();
  });

  // Helper function to create mock execution context
  function createMockContext(nodeData = {}, inputValues = [42]) { // Default input value
    return {
      node: { 
        id: 'test-node',
        data: { tagId: 'test-tag', ...nodeData } // Always include tagId
      },
      getInputValue: (index) => {
        const value = inputValues[index];
        return value !== undefined ? { value, quality: 0 } : null;
      },
      getInputCount: () => inputValues.length,
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {}
      },
      logWarn: () => {},
      logError: () => {},
      query: async (sql) => {
        // Return different results based on query
        if (sql.includes('connection_id')) {
          return { rows: [{ connection_id: 'test-connection' }] };
        }
        return { rows: [{ tag_id: 'test-tag', tag_path: 'test.tag', driver_type: 'INTERNAL' }] };
      },
      publishToNats: async () => {}, // Mock NATS publish
      nats: {
        publish: () => {}
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

    describe('Save to Database (saveToDatabase)', () => {
      test('works with true', async () => {
        const context = createMockContext({ saveToDatabase: true });
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result.value).toBe(42); // Pass through input value
      });

      test('works with false', async () => {
        const context = createMockContext({ saveToDatabase: false });
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result.value).toBe(42); // Pass through input value
      });
    });

    describe('Save Strategy (saveStrategy)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["always","on-change","never"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ saveStrategy: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
          expect(result.value).toBe(42); // Pass through input
        }
      });
    });

    describe('Deadband Type (deadbandType)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["absolute","percent"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ deadbandType: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
          expect(result.value).toBe(42); // Pass through input
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
      expect(result.quality).toBe(0); // Pass through input quality (0 = good from mock)
    });

    test('handles undefined input', async () => {
      const context = createMockContext({}, [undefined]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      expect(result.value).toBe(null);
      expect(result.quality).toBe(0); // Quality 0 when no input connected
    });
  });
});
