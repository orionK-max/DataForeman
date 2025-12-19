/**
 * Auto-generated tests for CommentNode
 * Generated: 2025-12-14T17:03:57.836Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { CommentNode } from '../../../src/nodes/utility/CommentNode.js';

describe('CommentNode', () => {
  let node;

  beforeEach(() => {
    node = new CommentNode();
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

    describe('Font Size (fontSize)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["small","medium","large"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ fontSize: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });

    describe('Background Color (backgroundColor)', () => {
      test('accepts all valid options', async () => {
        const validOptions = ["yellow","blue","green","orange","pink","gray"];
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ backgroundColor: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });
  });

  describe('Edge Cases', () => {
    test('executes with no inputs', async () => {
      const context = createMockContext({});
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
  });
});
