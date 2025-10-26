#!/usr/bin/env node

/**
 * Permission Validation Script
 * 
 * Scans all route files in core/src/routes to verify that:
 * 1. Every route has appropriate permission checks
 * 2. Public endpoints are intentionally public
 * 3. All permission checks follow consistent patterns
 * 
 * Usage:
 *   node ops/validate-permissions.js                    # Validate permissions
 *   node ops/validate-permissions.js --verbose          # Detailed output
 *   node ops/validate-permissions.js --generate-docs    # Generate API documentation
 * 
 * NPM scripts:
 *   cd ops && npm run validate-permissions
 *   cd ops && npm run validate-permissions:verbose
 *   cd ops && npm run generate-api-docs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ROUTES_DIR = path.join(__dirname, '../core/src/routes');
const API_REGISTRY_PATH = path.join(__dirname, '../docs/api-registry.md');
const VERBOSE = process.argv.includes('--verbose');
const GENERATE_DOCS = process.argv.includes('--generate-docs');

// Known public endpoints that don't require permission checks
// OR endpoints with authentication but intentionally no explicit permission check
const PUBLIC_ENDPOINTS = [
  { file: 'auth.js', patterns: ['/login', '/refresh', '/dev-token', '/logout', '/me', '/sessions', '/demo-info', '/demo-credentials'] },
  { file: 'config.js', patterns: ['/'] }, // GET config is authenticated but no permission check
  { file: 'health.js', patterns: ['/'] }, // All health endpoints are public
  { file: 'metrics.js', patterns: ['/'] }, // Metrics endpoint is public
];

// Routes that use preHandler hooks for all endpoints
// NOTE: These files MUST check permissions based on HTTP method (GET=read, POST=create, PUT/PATCH=update, DELETE=delete)
// NOT just hardcoded 'read' for all operations!
const PREHANDLER_FILES = [
  'chartComposer.js',  // Read-only (only GET routes)
  'connectivity.js',   // Mixed CRUD - checks method-based operation
  'diag.js',           // Read-only (only GET routes)
  'jobs.js',           // Mixed CRUD - checks method-based operation
  'logs.js',           // Read-only (only GET routes)
  'units.js',          // Mixed CRUD - individual checks per route
];

// Files that use plugins or don't follow standard route patterns
const PLUGIN_FILES = [
  'metrics.js',  // Uses fastify-metrics plugin
  'health.js',   // May use plugin pattern
];

// Statistics
const stats = {
  filesScanned: 0,
  routesFound: 0,
  routesProtected: 0,
  routesPublic: 0,
  routesMissingCheck: 0,
  errors: [],
  warnings: [],
  routesByFile: {}, // For documentation generation
};

/**
 * Check if a file uses preHandler hook for all routes
 */
function usesPreHandler(content, filename) {
  if (PREHANDLER_FILES.includes(filename)) {
    // Verify it actually has the preHandler
    const hasPreHandler = content.includes('addHook(\'preHandler\'') || 
                          content.includes('addHook("preHandler"');
    
    if (hasPreHandler) {
      log(`  ✓ Uses preHandler hook for all routes`, 'verbose');
      return true;
    } else {
      stats.warnings.push(`${filename}: Expected preHandler hook but not found`);
      return false;
    }
  }
  
  // Also check for global preHandler hooks (not in PREHANDLER_FILES list)
  // These are added at file level before any routes
  const hasGlobalPreHandler = content.includes('app.addHook(\'preHandler\'') || 
                               content.includes('app.addHook("preHandler"');
  
  if (hasGlobalPreHandler) {
    // Make sure it's not inside a specific route handler
    const preHandlerIndex = content.search(/app\.addHook\(['"]preHandler['"]/);
    const firstRouteIndex = content.search(/app\.(get|post|put|delete|patch)\s*\(/);
    
    // If preHandler comes before first route, it's global
    if (preHandlerIndex !== -1 && (firstRouteIndex === -1 || preHandlerIndex < firstRouteIndex)) {
      log(`  ✓ Uses global preHandler hook`, 'verbose');
      return true;
    }
  }
  
  return false;
}

/**
 * Check if an endpoint is intentionally public
 */
function isPublicEndpoint(filename, endpoint) {
  const publicConfig = PUBLIC_ENDPOINTS.find(p => p.file === filename);
  if (!publicConfig) return false;
  
  return publicConfig.patterns.some(pattern => {
    if (pattern === '/') return true;
    return endpoint.includes(pattern);
  });
}

/**
 * Extract routes from file content
 */
function extractRoutes(content, filename) {
  const routes = [];
  
  // Match: app.get('/path', async (req, reply) => {
  // Also matches: app.post, app.put, app.delete, app.patch
  const routeRegex = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const position = match.index;
    
    // Get the line number
    const lineNumber = content.substring(0, position).split('\n').length;
    
    routes.push({
      method,
      path,
      lineNumber,
      position,
    });
  }
  
  return routes;
}

/**
 * Check if a route has permission check
 */
function hasPermissionCheck(content, route) {
  // Get content from route definition to next route or end of function
  const routeStart = route.position;
  const nextRouteMatch = content.substring(routeStart + 1).search(/app\.(get|post|put|delete|patch)\s*\(/);
  const routeEnd = nextRouteMatch === -1 ? content.length : routeStart + nextRouteMatch + 1;
  
  const routeContent = content.substring(routeStart, routeEnd);
  
  // Check for permission patterns
  const patterns = [
    /app\.permissions\.can\s*\(/,                    // app.permissions.can(
    /checkPermission\s*\(/,                          // checkPermission(
    /await\s+checkPermission/,                       // await checkPermission
    /permissions\.can\s*\(/,                         // permissions.can(
    /\.can\s*\(\s*userId/,                          // .can(userId
    /\{\s*preHandler:\s*\w+\s*\}/,                  // { preHandler: handler }
    /preHandler:\s*async\s*\(/,                     // preHandler: async (req, reply) =>
    /preHandler:\s*\[/,                             // preHandler: [middleware]
  ];
  
  return patterns.some(pattern => pattern.test(routeContent));
}

/**
 * Extract the handler function content for a route
 */
function getRouteHandler(content, route) {
  const routeStart = route.position;
  let braceCount = 0;
  let inHandler = false;
  let handlerStart = -1;
  
  for (let i = routeStart; i < content.length; i++) {
    if (content[i] === '{') {
      if (!inHandler) {
        inHandler = true;
        handlerStart = i;
      }
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0 && inHandler) {
        return content.substring(handlerStart, i + 1);
      }
    }
  }
  
  return '';
}

/**
 * Extract permission feature and operation from route handler
 */
function extractPermission(content, route) {
  const handler = getRouteHandler(content, route);
  
  // Pattern: app.permissions.can(userId, 'feature', 'operation')
  const canMatch = handler.match(/\.can\s*\([^,]+,\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
  if (canMatch) {
    return { feature: canMatch[1], operation: canMatch[2] };
  }
  
  // Pattern: checkPermission(req, 'feature', 'operation')
  const checkMatch = handler.match(/checkPermission\s*\([^,]+,\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
  if (checkMatch) {
    return { feature: checkMatch[1], operation: checkMatch[2] };
  }
  
  return null;
}

/**
 * Determine base path for a route file
 */
function getBasePath(filename) {
  const basePathMap = {
    'auth.js': '/api/auth',
    'dashboards.js': '/api/dashboards',
    'charts.js': '/api/charts',
    'chartComposer.js': '/api/chart-composer',
    'folders.js': '/api/folders',
    'connectivity.js': '/api/connectivity',
    'units.js': '/api/units',
    'jobs.js': '/api/jobs',
    'logs.js': '/api/logs',
    'diag.js': '/api/diag',
    'config.js': '/api/config',
    'health.js': '/api/health',
    'metrics.js': '/api/metrics',
  };
  return basePathMap[filename] || '/api';
}

/**
 * Analyze a single route file
 */
function analyzeFile(filename) {
  const filePath = path.join(ROUTES_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    stats.errors.push(`File not found: ${filename}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  stats.filesScanned++;
  
  log(`\n📄 ${filename}`, 'always');
  
  // Initialize route collection for this file
  if (GENERATE_DOCS) {
    stats.routesByFile[filename] = [];
  }
  
  // Check if file uses preHandler for all routes
  const usesPreHandlerHook = usesPreHandler(content, filename);
  
  // Extract and check individual routes
  const routes = extractRoutes(content, filename);
  stats.routesFound += routes.length;
  
  if (routes.length === 0) {
    // Check if this is a known plugin-based file
    if (PLUGIN_FILES.includes(filename)) {
      log(`  ℹ️  Uses plugin pattern (no standard routes)`, 'always');
      return;
    }
    
    stats.warnings.push(`${filename}: No routes found`);
    log(`  ⚠️  No routes found`, 'always');
    return;
  }
  
  if (usesPreHandlerHook) {
    stats.routesProtected += routes.length;
    log(`  ✓ All ${routes.length} routes protected via preHandler`, 'always');
  } else {
    log(`  Found ${routes.length} route(s)`, 'verbose');
  }
  
  // Check each route
  routes.forEach(route => {
    const routeSignature = `${route.method} ${route.path}`;
    const isPublic = isPublicEndpoint(filename, route.path);
    const hasCheck = usesPreHandlerHook || hasPermissionCheck(content, route);
    
    // Extract permission info for documentation
    let permission = null;
    if (GENERATE_DOCS && !isPublic) {
      permission = extractPermission(content, route);
    }
    
    // Store route info for documentation
    if (GENERATE_DOCS) {
      stats.routesByFile[filename].push({
        method: route.method,
        path: route.path,
        fullPath: getBasePath(filename) + route.path,
        isPublic,
        hasCheck,
        permission,
        usesPreHandler: usesPreHandlerHook,
      });
    }
    
    // Check if intentionally public
    if (isPublic) {
      stats.routesPublic++;
      log(`  ✓ ${routeSignature} (line ${route.lineNumber}) - Public endpoint`, 'verbose');
      return;
    }
    
    // Check for permission check
    if (hasCheck) {
      stats.routesProtected++;
      log(`  ✓ ${routeSignature} (line ${route.lineNumber}) - Protected`, 'verbose');
    } else {
      stats.routesMissingCheck++;
      const issue = `${filename}:${route.lineNumber} - ${routeSignature} - Missing permission check`;
      stats.errors.push(issue);
      log(`  ❌ ${routeSignature} (line ${route.lineNumber}) - MISSING PERMISSION CHECK`, 'always');
    }
  });
}

/**
 * Generate API documentation markdown
 */
function generateApiDocs() {
  console.log('\n📝 Generating API documentation...');
  
  const now = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const day = String(new Date().getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  
  let markdown = `# API Registry

**Version:** 1.0  
**Last Updated:** ${formattedDate} (Auto-generated)  
**Purpose:** Complete reference of all API endpoints with authentication and permission requirements

> ⚠️ **This file is auto-generated.** Run \`node ops/validate-permissions.js --generate-docs\` to update.

---

## 📋 Table of Contents

`;

  // Build table of contents
  const sections = Object.keys(stats.routesByFile).sort();
  sections.forEach((filename, index) => {
    const sectionName = filename.replace('.js', '').replace(/([A-Z])/g, ' $1').trim();
    const title = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
    markdown += `${index + 1}. [${title} Routes](#${title.toLowerCase().replace(/ /g, '-')}-routes)\n`;
  });
  
  markdown += `\n---\n\n## Overview\n\n`;
  markdown += `This registry documents all HTTP endpoints in the DataForeman API.\n\n`;
  markdown += `### Authentication\n\n`;
  markdown += `Most endpoints require:\n`;
  markdown += `1. **Valid JWT token** in \`Authorization: Bearer <token>\` header\n`;
  markdown += `2. **Appropriate permission** for the feature and operation\n\n`;
  markdown += `Public endpoints (login, health checks, metrics) do not require authentication.\n\n`;
  markdown += `### Permission Format\n\n`;
  markdown += `Permissions follow the pattern: \`feature:operation\`\n\n`;
  markdown += `**Operations:**\n`;
  markdown += `- \`read\` - View/list resources\n`;
  markdown += `- \`create\` - Create new resources\n`;
  markdown += `- \`update\` - Modify existing resources\n`;
  markdown += `- \`delete\` - Remove resources\n\n`;
  markdown += `---\n\n`;
  
  // Generate sections for each route file
  sections.forEach(filename => {
    const routes = stats.routesByFile[filename];
    if (routes.length === 0) return;
    
    const sectionName = filename.replace('.js', '').replace(/([A-Z])/g, ' $1').trim();
    const title = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
    const basePath = getBasePath(filename);
    
    markdown += `## ${title} Routes\n\n`;
    markdown += `**Base Path:** \`${basePath}\`\n\n`;
    
    // Check if all routes use preHandler
    const allUsePreHandler = routes.every(r => r.usesPreHandler);
    if (allUsePreHandler) {
      markdown += `> All routes in this file use a preHandler hook for permission checks.\n\n`;
    }
    
    // Create table
    markdown += `| Method | Endpoint | Auth | Permission | Description |\n`;
    markdown += `|--------|----------|------|------------|-------------|\n`;
    
    routes.forEach(route => {
      const method = route.method.toUpperCase();
      const path = route.path;
      const auth = route.isPublic ? 'No' : 'Yes';
      let permission = '-';
      
      if (route.permission) {
        permission = `\`${route.permission.feature}:${route.permission.operation}\``;
      } else if (!route.isPublic && route.usesPreHandler) {
        permission = `*Via preHandler*`;
      } else if (!route.isPublic) {
        permission = `*Check required*`;
      }
      
      // Try to infer description from route path
      const description = inferDescription(method, path, route.permission);
      
      markdown += `| ${method} | \`${path}\` | ${auth} | ${permission} | ${description} |\n`;
    });
    
    markdown += `\n`;
  });
  
  // Add footer
  markdown += `---\n\n`;
  markdown += `## Validation\n\n`;
  markdown += `This registry is automatically generated from route files.\n\n`;
  markdown += `**To regenerate this file:**\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `node ops/validate-permissions.js --generate-docs\n`;
  markdown += `\`\`\`\n\n`;
  markdown += `**To validate permission coverage:**\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `node ops/validate-permissions.js\n`;
  markdown += `node ops/validate-permissions.js --verbose\n`;
  markdown += `\`\`\`\n\n`;
  markdown += `---\n\n`;
  markdown += `## Statistics\n\n`;
  markdown += `- **Total Endpoints:** ${stats.routesFound}\n`;
  markdown += `- **Protected:** ${stats.routesProtected}\n`;
  markdown += `- **Public:** ${stats.routesPublic}\n`;
  markdown += `- **Coverage:** ${percentage(stats.routesProtected + stats.routesPublic, stats.routesFound)}%\n\n`;
  markdown += `*Generated on ${formattedDate}*\n`;
  
  return markdown;
}

/**
 * Infer description from route details
 */
function inferDescription(method, path, permission) {
  const segments = path.split('/').filter(s => s);
  const lastSegment = segments[segments.length - 1] || '';
  const hasParam = path.includes(':');
  
  // Common patterns
  if (method === 'GET' && !hasParam) return 'List resources';
  if (method === 'GET' && hasParam) return 'Get single resource';
  if (method === 'POST' && !hasParam) return 'Create resource';
  if (method === 'PUT' && hasParam) return 'Update resource';
  if (method === 'DELETE' && hasParam) return 'Delete resource';
  if (method === 'POST' && path.includes('/login')) return 'User login';
  if (method === 'POST' && path.includes('/logout')) return 'User logout';
  if (method === 'POST' && path.includes('/refresh')) return 'Refresh token';
  if (method === 'GET' && path.includes('/me')) return 'Get current user';
  if (method === 'GET' && path.includes('/health')) return 'Health check';
  if (method === 'GET' && path.includes('/metrics')) return 'System metrics';
  
  return 'API endpoint';
}

/**
 * Write documentation to file
 */
function writeApiDocs(content) {
  try {
    fs.writeFileSync(API_REGISTRY_PATH, content, 'utf8');
    console.log(`✅ API documentation written to: ${API_REGISTRY_PATH}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to write documentation: ${err.message}`);
    return false;
  }
}

/**
 * Get all route files
 */
function getRouteFiles() {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error(`❌ Routes directory not found: ${ROUTES_DIR}`);
    process.exit(1);
  }
  
  return fs.readdirSync(ROUTES_DIR)
    .filter(file => file.endsWith('.js'))
    .sort();
}

/**
 * Logging helper
 */
function log(message, level = 'verbose') {
  if (level === 'always' || (level === 'verbose' && VERBOSE)) {
    console.log(message);
  }
}

/**
 * Print summary report
 */
function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(70));
  
  console.log(`\n📁 Files Scanned:        ${stats.filesScanned}`);
  console.log(`🔍 Routes Found:         ${stats.routesFound}`);
  console.log(`✅ Routes Protected:     ${stats.routesProtected} (${percentage(stats.routesProtected, stats.routesFound)}%)`);
  console.log(`🌐 Public Endpoints:     ${stats.routesPublic} (${percentage(stats.routesPublic, stats.routesFound)}%)`);
  console.log(`❌ Missing Checks:       ${stats.routesMissingCheck} (${percentage(stats.routesMissingCheck, stats.routesFound)}%)`);
  
  if (stats.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    stats.warnings.forEach(warning => console.log(`   ${warning}`));
  }
  
  if (stats.errors.length > 0) {
    console.log('\n❌ ERRORS - Routes Missing Permission Checks:');
    stats.errors.forEach(error => console.log(`   ${error}`));
  }
  
  console.log('\n' + '='.repeat(70));
  
  // Overall status
  if (stats.routesMissingCheck === 0 && stats.errors.length === 0) {
    console.log('✅ SUCCESS: All routes are properly protected!');
    console.log('='.repeat(70) + '\n');
    return true;
  } else {
    console.log('❌ FAILURE: Some routes are missing permission checks!');
    console.log('='.repeat(70) + '\n');
    return false;
  }
}

/**
 * Calculate percentage
 */
function percentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 DataForeman Permission Validation Script');
  console.log('='.repeat(70));
  console.log(`Scanning: ${ROUTES_DIR}`);
  console.log(`Verbose:  ${VERBOSE ? 'ON' : 'OFF'}`);
  console.log(`Generate Docs: ${GENERATE_DOCS ? 'ON' : 'OFF'}`);
  
  const routeFiles = getRouteFiles();
  console.log(`Found ${routeFiles.length} route file(s)\n`);
  
  // Analyze each file
  routeFiles.forEach(analyzeFile);
  
  // Generate documentation if requested
  if (GENERATE_DOCS) {
    const docs = generateApiDocs();
    const written = writeApiDocs(docs);
    if (!written) {
      process.exit(1);
    }
  }
  
  // Print summary and exit with appropriate code
  const success = printSummary();
  process.exit(success ? 0 : 1);
}

// Run the script
main();

export { analyzeFile, extractRoutes, hasPermissionCheck };
