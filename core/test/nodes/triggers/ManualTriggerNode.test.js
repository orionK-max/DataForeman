/**
 * Auto-generated tests for ManualTriggerNode
 * Generated: 2025-12-14T17:03:57.835Z
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { ManualTriggerNode } from '../../../src/nodes/triggers/ManualTriggerNode.js';

describe('ManualTriggerNode', () => {
  let node;

  beforeEach(() => {
    node = new ManualTriggerNode();
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

  describe('Edge Cases', () => {
    test('executes with no inputs', async () => {
      const context = createMockContext({});
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
  });
});
