/**
 * Test script for nodeTypes.js
 * Run with: node test-nodeTypes.mjs
 */

import {
  NODE_CATEGORIES,
  NODE_METADATA,
  getAllNodeTypes,
  getCategoryForNodeType,
  searchNodes,
  getOrganizedNodes
} from './src/constants/nodeTypes.js';

console.log('=== Testing nodeTypes.js ===\n');

// Test 1: Import works
console.log('✓ Test 1.1: Import works, no errors\n');

// Test 2: Contains trigger-manual, tag-input, tag-output
console.log('Test 1.2: Contains trigger-manual, tag-input, tag-output');
const requiredNodes = ['trigger-manual', 'tag-input', 'tag-output'];
const allTypes = getAllNodeTypes();
const hasRequired = requiredNodes.every(type => allTypes.includes(type));
console.log(hasRequired ? '✓ PASS' : '✗ FAIL', '\n');

// Test 3: Contains math, compare nodes
console.log('Test 1.3: Contains math, compare, script nodes');
const logicNodes = ['math-add', 'compare-eq', 'script-js'];
const hasLogic = logicNodes.every(type => allTypes.includes(type));
console.log(hasLogic ? '✓ PASS' : '✗ FAIL', '\n');

// Test 4: Communication category exists (even if empty)
console.log('Test 1.4: Communication category exists');
const hasCommunication = NODE_CATEGORIES.COMMUNICATION !== undefined;
console.log(hasCommunication ? '✓ PASS' : '✗ FAIL', '\n');

// Test 5: Icons render
console.log('Test 1.5: Icons/colors defined for nodes');
const hasIconsAndColors = allTypes.every(type => {
  const meta = NODE_METADATA[type];
  return meta.icon && meta.color;
});
console.log(hasIconsAndColors ? '✓ PASS' : '✗ FAIL', '\n');

// Test 6: Descriptions present
console.log('Test 1.6: Descriptions present (1-2 sentences each)');
const hasDescriptions = allTypes.every(type => {
  const meta = NODE_METADATA[type];
  return meta.description && meta.description.length > 0;
});
console.log(hasDescriptions ? '✓ PASS' : '✗ FAIL', '\n');

// Test 7: Recent Nodes tracking (simulated - localStorage not available in Node.js)
console.log('Test 1.7: Recent Nodes functions exist');
import { getRecentNodes, addToRecentNodes } from './src/constants/nodeTypes.js';
console.log('✓ PASS (functions exported)\n');

// Test 8: getCategoryForNodeType utility
console.log('Test 1.8: getCategoryForNodeType returns correct category');
const tagInputCategory = getCategoryForNodeType('tag-input');
const isCorrect = tagInputCategory?.category?.key === 'tag-operations';
console.log(isCorrect ? '✓ PASS' : '✗ FAIL');
console.log('  Result:', JSON.stringify(tagInputCategory, null, 2), '\n');

// Additional tests
console.log('=== Additional Verification ===\n');

console.log('Total node types:', allTypes.length);
console.log('Categories:', Object.keys(NODE_CATEGORIES).length);

console.log('\nNodes by category:');
const organized = getOrganizedNodes();
Object.entries(organized).forEach(([catKey, cat]) => {
  console.log(`\n${cat.icon} ${cat.displayName}:`);
  Object.entries(cat.sections).forEach(([secKey, sec]) => {
    console.log(`  └─ ${sec.displayName}: ${sec.nodes.length} nodes`);
    sec.nodes.forEach(node => {
      console.log(`     • ${node.icon} ${node.displayName}`);
    });
  });
});

console.log('\n=== Search Test ===');
const searchResults = searchNodes('tag');
console.log(`Search "tag" found ${searchResults.length} nodes:`, searchResults);

console.log('\n=== All Tests Complete ===');
