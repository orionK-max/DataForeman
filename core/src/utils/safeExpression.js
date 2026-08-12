import { parse } from 'acorn';

/**
 * Thrown when an expression contains syntax or operations that are not on
 * the evaluator's whitelist.
 */
export class ExpressionError extends Error {}

const MAX_EXPRESSION_LENGTH = 2000;

// Math functions that may be called as Math.xxx(...)
const ALLOWED_MATH_FUNCTIONS = new Set([
  'abs', 'ceil', 'floor', 'round', 'sqrt', 'cbrt', 'pow', 'min', 'max',
  'sign', 'trunc', 'exp', 'log', 'log2', 'log10', 'hypot'
]);

// Bare global functions, e.g. parseFloat(payload)
const ALLOWED_GLOBAL_FUNCTIONS = {
  parseFloat, parseInt, Number, String, Boolean, isNaN, isFinite
};

// Instance methods allowed on strings/arrays/numbers, e.g. payload.split(',')
// Deliberately excludes callback-based methods (map/filter/reduce/forEach)
// since evaluating an arbitrary callback body is out of scope for this
// evaluator.
const ALLOWED_INSTANCE_METHODS = new Set([
  'split', 'slice', 'substring', 'substr', 'indexOf', 'lastIndexOf',
  'replace', 'replaceAll', 'trim', 'trimStart', 'trimEnd',
  'toUpperCase', 'toLowerCase', 'charAt', 'charCodeAt', 'includes',
  'startsWith', 'endsWith', 'concat', 'padStart', 'padEnd', 'repeat',
  'match', 'toFixed', 'toString',
  'join', 'reverse', 'at', 'flat'
]);

/**
 * Safely evaluates a restricted, JavaScript-like expression against a fixed
 * scope of variables.
 *
 * The expression is parsed into an AST with acorn and walked node-by-node,
 * allowing only a whitelisted set of literals, operators, variable lookups,
 * and built-in string/number/array/Math operations. There is no access to
 * globals, `require`, `Function`/`eval`, constructors, assignment, loops, or
 * any identifier not explicitly present in `scope` — so unlike `new
 * Function(...)` or `eval(...)`, user-supplied expressions cannot escape
 * into the surrounding process.
 *
 * @param {string} expression - The expression source text
 * @param {Record<string, any>} [scope] - Variables available to the expression
 * @param {{ extraFunctions?: Record<string, Function> }} [options] - Additional bare-name functions to allow (e.g. formula-specific aliases)
 * @returns {any}
 */
export function evaluateSafeExpression(expression, scope = {}, options = {}) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new ExpressionError('Expression must be a non-empty string');
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH}`);
  }

  const extraFunctions = options.extraFunctions || {};

  let expr;
  try {
    const program = parse(expression, { ecmaVersion: 2020 });
    if (program.body.length !== 1 || program.body[0].type !== 'ExpressionStatement') {
      throw new Error('Expression must be a single JS expression');
    }
    expr = program.body[0].expression;
  } catch (err) {
    throw new ExpressionError(`Invalid expression syntax: ${err.message}`);
  }

  function evalNode(node) {
    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'Identifier':
        if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
          return scope[node.name];
        }
        throw new ExpressionError(`Disallowed identifier: ${node.name}`);

      case 'ArrayExpression':
        return node.elements.map((el) => (el ? evalNode(el) : undefined));

      case 'UnaryExpression': {
        if (!['+', '-', '!'].includes(node.operator)) {
          throw new ExpressionError(`Disallowed unary operator: ${node.operator}`);
        }
        const val = evalNode(node.argument);
        if (node.operator === '+') return +val;
        if (node.operator === '-') return -val;
        return !val;
      }

      case 'BinaryExpression': {
        const allowedOps = ['+', '-', '*', '/', '%', '**', '==', '===', '!=', '!==', '<', '<=', '>', '>='];
        if (!allowedOps.includes(node.operator)) {
          throw new ExpressionError(`Disallowed operator: ${node.operator}`);
        }
        const l = evalNode(node.left);
        const r = evalNode(node.right);
        switch (node.operator) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '%': return l % r;
          case '**': return l ** r;
          case '==': return l == r; // eslint-disable-line eqeqeq
          case '===': return l === r;
          case '!=': return l != r; // eslint-disable-line eqeqeq
          case '!==': return l !== r;
          case '<': return l < r;
          case '<=': return l <= r;
          case '>': return l > r;
          case '>=': return l >= r;
          default: throw new ExpressionError(`Disallowed operator: ${node.operator}`);
        }
      }

      case 'LogicalExpression': {
        if (node.operator === '&&') {
          const l = evalNode(node.left);
          return l ? evalNode(node.right) : l;
        }
        if (node.operator === '||') {
          const l = evalNode(node.left);
          return l ? l : evalNode(node.right);
        }
        throw new ExpressionError(`Disallowed operator: ${node.operator}`);
      }

      case 'ConditionalExpression':
        return evalNode(node.test) ? evalNode(node.consequent) : evalNode(node.alternate);

      case 'MemberExpression': {
        // Math.PI / Math.E (Math functions are handled in CallExpression)
        if (node.object.type === 'Identifier' && node.object.name === 'Math' && !node.computed) {
          const prop = node.property.name;
          if (prop === 'PI' || prop === 'E') return Math[prop];
          throw new ExpressionError(`Disallowed Math property: ${prop}`);
        }

        const obj = evalNode(node.object);
        const prop = node.computed ? evalNode(node.property) : node.property.name;

        if (!node.computed && prop === 'length' && (typeof obj === 'string' || Array.isArray(obj))) {
          return obj.length;
        }
        if (node.computed && (typeof obj === 'string' || Array.isArray(obj)) && Number.isInteger(prop)) {
          return obj[prop];
        }
        throw new ExpressionError(`Disallowed property access: ${String(prop)}`);
      }

      case 'CallExpression': {
        const callee = node.callee;
        const args = node.arguments.map((a) => evalNode(a));

        // Math.func(...)
        if (callee.type === 'MemberExpression' && !callee.computed &&
            callee.object.type === 'Identifier' && callee.object.name === 'Math') {
          const fn = callee.property.name;
          if (!ALLOWED_MATH_FUNCTIONS.has(fn) || typeof Math[fn] !== 'function') {
            throw new ExpressionError(`Disallowed Math function: ${fn}`);
          }
          return Math[fn](...args);
        }

        // obj.method(...) — only whitelisted methods on strings/numbers/arrays
        if (callee.type === 'MemberExpression' && !callee.computed) {
          const obj = evalNode(callee.object);
          const methodName = callee.property.name;
          if ((typeof obj === 'string' || typeof obj === 'number' || Array.isArray(obj)) &&
              ALLOWED_INSTANCE_METHODS.has(methodName) &&
              typeof obj[methodName] === 'function') {
            return obj[methodName](...args);
          }
          throw new ExpressionError(`Disallowed method call: ${methodName}`);
        }

        // Bare function call: caller-supplied helpers or whitelisted globals
        if (callee.type === 'Identifier') {
          if (Object.prototype.hasOwnProperty.call(extraFunctions, callee.name)) {
            return extraFunctions[callee.name](...args);
          }
          if (Object.prototype.hasOwnProperty.call(ALLOWED_GLOBAL_FUNCTIONS, callee.name)) {
            return ALLOWED_GLOBAL_FUNCTIONS[callee.name](...args);
          }
          throw new ExpressionError(`Disallowed function call: ${callee.name}`);
        }

        throw new ExpressionError('Disallowed call expression');
      }

      default:
        throw new ExpressionError(`Disallowed syntax: ${node.type}`);
    }
  }

  return evalNode(expr);
}
