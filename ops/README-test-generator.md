# Universal Node Test Generator

Automatically generates comprehensive test skeletons for Flow Studio nodes based on their schema.

## Features

- **Metadata validation** - Tests schema version, required fields
- **ioRules testing** - Validates I/O configurations and operation-dependent rules
- **Operation tests** - Creates test suites for each operation value
- **Property tests** - Tests all property options and combinations
- **Edge case tests** - Handles null, undefined, NaN, Infinity, empty values
- **Mock helpers** - Includes createMockContext helper function

## Usage

### Generate tests for a single node

```bash
node ops/generate-node-tests.js MathNode
```

### Generate tests for all nodes

```bash
node ops/generate-node-tests.js --all
```

### Generate tests for a specific library/category

```bash
node ops/generate-node-tests.js --library logic
node ops/generate-node-tests.js --library math
```

### Show help

```bash
node ops/generate-node-tests.js --help
```

## What Gets Generated

### 1. Metadata Tests
Validates basic node structure:
- Schema version is 1
- All required fields present
- Inputs/outputs arrays defined
- Properties array defined

### 2. ioRules Tests (if applicable)
For nodes with dynamic I/O:
- Rules are well-formed
- Each operation has correct I/O config
- Boundary values (min/max) specified
- Default input counts correct

### 3. Operation Tests
For each operation option:
- Executes without errors
- Handles valid inputs
- Handles null inputs
- Returns proper result structure

### 4. Property Tests
For each testable property:
- Accepts all valid options
- Boolean properties work with true/false
- Number properties work with valid ranges

### 5. Edge Case Tests
Based on input types:
- **Numbers:** 0, negative, large, NaN, Infinity
- **Strings:** empty, long, special characters
- **Booleans:** true, false
- **All:** null, undefined

### 6. Helper Functions
Includes createMockContext helper:
```javascript
function createMockContext(nodeData = {}, inputValues = []) {
  return {
    node: { id: 'test-node', data: nodeData },
    getInputValue: (index) => { /* ... */ },
    getInputCount: () => inputValues.length,
    logger: { info: () => {}, debug: () => {}, error: () => {} }
  };
}
```

## Generated File Structure

```
core/test/nodes/
├── logic/
│   ├── BooleanLogicNode.test.js
│   ├── GateNode.test.js
│   └── SwitchNode.test.js
├── math/
│   └── MathNode.test.js
├── data/
│   └── StringOpsNode.test.js
└── [category]/
    └── [NodeName].test.js
```

## Next Steps After Generation

1. **Review generated tests** - Check that structure makes sense
2. **Fill in TODOs** - Add specific assertions for expected values
3. **Add test data** - Replace `/* TODO: Add test inputs */` with actual values
4. **Run tests** - `npm test` or `npm test MathNode`
5. **Add custom tests** - Supplement with node-specific test cases

## Example: Filling in TODOs

### Before (Generated)
```javascript
test('handles valid inputs', () => {
  const context = createMockContext({
    operation: 'add'
  }, [/* TODO: Add test inputs */]);
  
  const result = node.execute(context);
  // TODO: Add specific assertions for this operation
  expect(result.quality).toBe(0);
});
```

### After (Completed)
```javascript
test('handles valid inputs', () => {
  const context = createMockContext({
    operation: 'add'
  }, [5, 3]);
  
  const result = node.execute(context);
  expect(result.value).toBe(8);
  expect(result.quality).toBe(0);
});
```

## Handling Existing Tests

If a test file already exists, the generator will skip it:

```
⚠️  Test file exists: /path/to/MathNode.test.js
   Use --force to overwrite or manually merge changes
```

**Options:**
1. Delete the old test file and regenerate
2. Manually merge new test cases into existing file
3. Keep existing tests as-is

## What Gets Automatically Tested

### Always Tested
- Schema structure validation
- Required fields present
- Execute method exists
- Result structure (value, quality)
- Null/undefined handling

### Conditionally Tested
- **ioRules** - If node has ioRules array
- **Operations** - If node has operation property
- **Properties** - If node has testable properties
- **Type-specific edge cases** - Based on input types

## Limitations

The generator creates **test structure**, not **complete tests**. You must:

- Add expected values for assertions
- Provide realistic test input data
- Verify business logic correctness
- Add node-specific test cases

**The generator handles the repetitive work, you add the intelligence.**

## Tips

### Test Data Strategy
```javascript
// Good: Explicit, meaningful test data
const context = createMockContext({ operation: 'add' }, [5, 3]);

// Bad: Generic, unclear expectations
const context = createMockContext({ operation: 'add' }, [1, 2]);
```

### Assertion Strategy
```javascript
// Good: Test the what, not the how
expect(result.value).toBe(8);
expect(result.quality).toBe(0);

// Bad: Testing implementation details
expect(result.inputs).toHaveLength(2);
expect(result.operation).toBe('add');
```

### Focus on Behavior
```javascript
// Good: Tests observable behavior
test('add returns sum of inputs', () => {
  expect(execute([5, 3]).value).toBe(8);
});

// Bad: Tests internal structure
test('add sets result.computed to true', () => {
  expect(execute([5, 3]).computed).toBe(true);
});
```

## Performance

- Generates ~200-400 lines per node
- Processes all 14 nodes in < 1 second
- Test files ready to run immediately (with TODOs)

## Integration with CI/CD

Add to package.json scripts:

```json
{
  "scripts": {
    "test": "jest",
    "test:generate": "node ops/generate-node-tests.js --all",
    "test:validate": "npm test -- --coverage"
  }
}
```

Add to CI pipeline:

```yaml
- name: Validate tests exist
  run: |
    for node in core/src/nodes/**/*Node.js; do
      testfile="core/test/nodes/$(basename $node .js).test.js"
      if [ ! -f "$testfile" ]; then
        echo "Missing test: $testfile"
        exit 1
      fi
    done
```

## Future Enhancements

Planned features:
- `--force` flag to overwrite existing tests
- `--update` flag to merge new tests into existing files
- Custom test templates per category
- Property-based test generation
- Visual test generation
- Performance benchmark generation

## Troubleshooting

### "Node not found"
Check that:
- Node file exists in `core/src/nodes/`
- Filename matches pattern `*Node.js`
- Class name matches filename

### "Could not find class"
Ensure:
- Node exports class with same name as file
- Node extends BaseNode
- No syntax errors in node file

### Generated tests don't run
- Check import paths are correct
- Ensure Node.js modules are ES6
- Run `npm install` if dependencies missing

## Contributing

When adding new test generation features:
1. Update generator in `ops/generate-node-tests.js`
2. Test with sample nodes
3. Update this README
4. Regenerate tests for all nodes to verify

---

**Generated tests are a starting point, not the finish line.**
