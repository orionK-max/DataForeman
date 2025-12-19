#!/usr/bin/env node

/**
 * Universal Node Test Generator
 * 
 * Automatically generates test files for Flow Studio nodes based on their schema.
 * 
 * Usage:
 *   node ops/generate-node-tests.js NodeName
 *   node ops/generate-node-tests.js --all
 *   node ops/generate-node-tests.js --library math
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help') {
  console.log(`
Universal Node Test Generator

Usage:
  node ops/generate-node-tests.js <NodeClassName>     Generate tests for single node
  node ops/generate-node-tests.js --all               Generate tests for all nodes
  node ops/generate-node-tests.js --library <name>    Generate tests for library folder
  node ops/generate-node-tests.js --validate-only     Validate existing tests

Examples:
  node ops/generate-node-tests.js MathNode
  node ops/generate-node-tests.js --library logic
  node ops/generate-node-tests.js --all
  `);
  process.exit(0);
}

// Find all node files
function findNodeFiles(libraryName = null) {
  const nodesDir = path.join(rootDir, 'core/src/nodes');
  const files = [];

  function scanDir(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && item !== 'base') {
        if (!libraryName || item === libraryName) {
          scanDir(fullPath);
        }
      } else if (item.endsWith('Node.js') && item !== 'BaseNode.js') {
        files.push(fullPath);
      }
    }
  }

  scanDir(nodesDir);
  return files;
}

// Load and parse node class
async function loadNodeClass(filePath) {
  try {
    const module = await import(filePath);
    const className = path.basename(filePath, '.js');
    const NodeClass = module[className];
    
    if (!NodeClass) {
      console.error(`Could not find class ${className} in ${filePath}`);
      return null;
    }

    const instance = new NodeClass();
    return {
      className,
      description: instance.description,
      filePath,
      relativePath: path.relative(path.join(rootDir, 'core/src/nodes'), filePath)
    };
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

// Generate test content
function generateTestContent(nodeInfo) {
  const { className, description, relativePath } = nodeInfo;
  const category = path.dirname(relativePath);
  const importPath = `../../../src/nodes/${relativePath.replace(/\\/g, '/')}`;
  
  let testContent = `/**
 * Auto-generated tests for ${className}
 * Generated: ${new Date().toISOString()}
 * 
 * Edit freely - this generator creates the skeleton, you add the assertions.
 */

import { ${className} } from '${importPath}';

describe('${className}', () => {
  let node;

  beforeEach(() => {
    node = new ${className}();
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
`;

  // Generate ioRules tests if applicable
  if (description.ioRules && description.ioRules.length > 0) {
    testContent += generateIoRulesTests(description);
  }

  // Generate operation tests if node has operations
  const operationProp = description.properties?.find(p => p.name === 'operation');
  if (operationProp && operationProp.options) {
    testContent += generateOperationTests(description, operationProp);
  }

  // Generate property tests
  if (description.properties && description.properties.length > 0) {
    testContent += generatePropertyTests(description);
  }

  // Generate edge case tests
  testContent += generateEdgeCaseTests(description);

  testContent += `});
`;

  return testContent;
}

// Generate ioRules validation tests
function generateIoRulesTests(description) {
  let content = `
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
`;

  // Test each rule
  description.ioRules.forEach((rule, index) => {
    if (rule.when) {
      const condition = Object.keys(rule.when)[0];
      const values = Array.isArray(rule.when[condition]) ? rule.when[condition] : [rule.when[condition]];
      
      values.forEach(value => {
        content += `
    test('rule for ${condition}=${value} provides correct I/O config', async () => {
      const mockNode = { data: { ${condition}: '${value}' } };
      // TODO: Add assertions for expected input/output counts
      // Expected: ${JSON.stringify(rule.inputs || rule.outputs)}
    });
`;
      });
    } else if (rule.inputs) {
      const config = rule.inputs;
      if (config.count !== undefined) {
        content += `
    test('default rule provides fixed ${config.count} input(s)', async () => {
      // TODO: Verify node initializes with ${config.count} inputs
    });
`;
      } else if (config.min !== undefined) {
        content += `
    test('default rule provides ${config.min}-${config.max} inputs', async () => {
      // TODO: Verify input range: min=${config.min}, max=${config.max}, default=${config.default}
    });
`;
      }
    }
  });

  content += `  });
`;

  return content;
}

// Generate operation-based tests
function generateOperationTests(description, operationProp) {
  let content = `
  describe('Operations', () => {
`;

  operationProp.options.forEach(option => {
    content += `
    describe('${option.name} (${option.value})', () => {
      test('executes without errors', async () => {
        const context = createMockContext({
          operation: '${option.value}'
        });
        
        const result = await node.execute(context);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('quality');
      });

      test('handles valid inputs', async () => {
        const context = createMockContext({
          operation: '${option.value}'
        }, [/* TODO: Add test inputs */]);
        
        const result = await node.execute(context);
        // TODO: Add specific assertions for this operation
        expect(result.quality).toBe(0); // Good quality
      });

      test('handles null inputs', async () => {
        const context = createMockContext({
          operation: '${option.value}'
        }, [null]);
        
        const result = await node.execute(context);
        // TODO: Verify null handling behavior
      });
    });
`;
  });

  content += `  });
`;

  return content;
}

// Generate property combination tests
function generatePropertyTests(description) {
  const testableProps = description.properties.filter(p => 
    p.type === 'options' || p.type === 'boolean' || p.type === 'number'
  );

  if (testableProps.length === 0) return '';

  let content = `
  describe('Properties', () => {
`;

  testableProps.forEach(prop => {
    if (prop.type === 'options' && prop.options) {
      content += `
    describe('${prop.displayName} (${prop.name})', () => {
      test('accepts all valid options', async () => {
        const validOptions = ${JSON.stringify(prop.options.map(o => o.value))};
        
        for (const optionValue of validOptions) {
          const context = createMockContext({ ${prop.name}: optionValue });
          const result = await node.execute(context);
          expect(result).toBeDefined();
        }
      });
    });
`;
    } else if (prop.type === 'boolean') {
      content += `
    describe('${prop.displayName} (${prop.name})', () => {
      test('works with true', async () => {
        const context = createMockContext({ ${prop.name}: true });
        const result = await node.execute(context);
        // TODO: Verify behavior when ${prop.name} is true
      });

      test('works with false', async () => {
        const context = createMockContext({ ${prop.name}: false });
        const result = await node.execute(context);
        // TODO: Verify behavior when ${prop.name} is false
      });
    });
`;
    }
  });

  content += `  });
`;

  return content;
}

// Generate edge case tests
function generateEdgeCaseTests(description) {
  const hasInputs = description.inputs && description.inputs.length > 0;
  
  if (!hasInputs) {
    return `
  describe('Edge Cases', () => {
    test('executes with no inputs', async () => {
      const context = createMockContext({});
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
  });
`;
  }

  const inputTypes = description.inputs.map(i => i.type);
  
  let content = `
  describe('Edge Cases', () => {
`;

  if (inputTypes.includes('number')) {
    content += `
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

    test('handles NaN', async () => {
      const context = createMockContext({}, [NaN]);
      const result = await node.execute(context);
      // TODO: Verify NaN handling (should probably return bad quality)
    });

    test('handles Infinity', async () => {
      const context = createMockContext({}, [Infinity]);
      const result = await node.execute(context);
      // TODO: Verify Infinity handling
    });
`;
  }

  if (inputTypes.includes('string')) {
    content += `
    test('handles empty string', async () => {
      const context = createMockContext({}, ['']);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });

    test('handles very long string', async () => {
      const longString = 'a'.repeat(10000);
      const context = createMockContext({}, [longString]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });

    test('handles special characters', async () => {
      const context = createMockContext({}, ['\\n\\t\\r']);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
`;
  }

  if (inputTypes.includes('boolean')) {
    content += `
    test('handles boolean true', async () => {
      const context = createMockContext({}, [true]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });

    test('handles boolean false', async () => {
      const context = createMockContext({}, [false]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
`;
  }

  content += `
    test('handles null input', async () => {
      const context = createMockContext({}, [null]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
      // Check if quality indicates bad data
    });

    test('handles undefined input', async () => {
      const context = createMockContext({}, [undefined]);
      const result = await node.execute(context);
      expect(result).toBeDefined();
    });
  });
`;

  return content;
}

// Write test file
function writeTestFile(nodeInfo, testContent) {
  const category = path.dirname(nodeInfo.relativePath);
  const testDir = path.join(rootDir, 'core/test/nodes', category);
  const testFilePath = path.join(testDir, `${nodeInfo.className}.test.js`);

  // Create directory if it doesn't exist
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Check if test file already exists
  if (fs.existsSync(testFilePath)) {
    console.log(`⚠️  Test file exists: ${testFilePath}`);
    console.log('   Use --force to overwrite or manually merge changes');
    return false;
  }

  fs.writeFileSync(testFilePath, testContent);
  console.log(`✅ Generated: ${testFilePath}`);
  return true;
}

// Main execution
async function main() {
  console.log('🧪 Universal Node Test Generator\n');

  let nodeFiles = [];

  if (command === '--all') {
    console.log('Generating tests for all nodes...\n');
    nodeFiles = findNodeFiles();
  } else if (command === '--library') {
    const libraryName = args[1];
    if (!libraryName) {
      console.error('❌ Library name required: --library <name>');
      process.exit(1);
    }
    console.log(`Generating tests for ${libraryName} library...\n`);
    nodeFiles = findNodeFiles(libraryName);
  } else {
    // Single node
    const className = command;
    const allFiles = findNodeFiles();
    nodeFiles = allFiles.filter(f => path.basename(f) === `${className}.js`);
    
    if (nodeFiles.length === 0) {
      console.error(`❌ Node not found: ${className}`);
      console.log('\nAvailable nodes:');
      allFiles.forEach(f => {
        console.log(`  - ${path.basename(f, '.js')}`);
      });
      process.exit(1);
    }
  }

  if (nodeFiles.length === 0) {
    console.log('No node files found');
    process.exit(1);
  }

  console.log(`Found ${nodeFiles.length} node(s)\n`);

  let generated = 0;
  let skipped = 0;

  for (const filePath of nodeFiles) {
    const nodeInfo = await loadNodeClass(filePath);
    if (!nodeInfo) {
      skipped++;
      continue;
    }

    console.log(`\n📝 ${nodeInfo.className}`);
    const testContent = generateTestContent(nodeInfo);
    const written = writeTestFile(nodeInfo, testContent);
    
    if (written) {
      generated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Generated: ${generated}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Review generated tests in core/test/nodes/`);
  console.log(`   2. Fill in TODO assertions with expected values`);
  console.log(`   3. Run tests: npm test`);
  console.log(`   4. Add custom test cases as needed`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
