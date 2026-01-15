/**
 * Node Library Management Routes
 * API endpoints for managing installed node libraries
 */

import { LibraryManager } from '../nodes/base/LibraryManager.js';
import { NodeRegistry } from '../nodes/base/NodeRegistry.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function libraryRoutes(app) {
  const db = app.db;

  // Permission check helper
  async function checkPermission(userId, action, reply) {
    if (!userId || !(await app.permissions.can(userId, 'flows', action))) {
      reply.code(403).send({ error: 'forbidden' });
      return false;
    }
    return true;
  }

  /**
   * GET /api/flows/libraries
   * List all installed libraries
   * Requires 'flows:read' permission
   */
  app.get('/api/flows/libraries', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const libraries = LibraryManager.getAllLibraries(NodeRegistry).map(lib => ({
        libraryId: lib.libraryId,
        name: lib.name,
        version: lib.version,
        description: lib.description,
        author: lib.author,
        type: lib.type,
        uiExtensions: lib.uiExtensions || [],
        nodeCount: lib.nodeTypes?.length || 0,
        nodeTypes: lib.nodeTypes || [],
        loaded: true,
        lastLoadedAt: lib.loadedAt
      }));

      // Get library metadata from database for install info
      const dbLibraries = await db.query(
        `SELECT library_id, name, version, manifest, installed_at, installed_by, enabled, load_errors, last_loaded_at
         FROM node_libraries
         ORDER BY installed_at DESC`
      );

      // Merge runtime and database info
      const enrichedLibraries = libraries.map(lib => {
        const dbInfo = dbLibraries.rows.find(r => r.library_id === lib.libraryId);
        return {
          ...lib,
          installedAt: dbInfo?.installed_at,
          installedBy: dbInfo?.installed_by,
          enabled: dbInfo?.enabled ?? true,
          loadErrors: dbInfo?.load_errors
        };
      });

      // Include DB-installed libraries that are not currently loaded
      // (e.g., extensions that require restart to activate)
      for (const row of dbLibraries.rows) {
        const alreadyIncluded = enrichedLibraries.some(l => l.libraryId === row.library_id);
        if (alreadyIncluded) continue;

        const manifest = row.manifest || {};
        enrichedLibraries.push({
          libraryId: row.library_id,
          name: row.name || manifest.name,
          version: row.version || manifest.version,
          description: manifest.description,
          author: manifest.author,
          type: manifest.type,
          uiExtensions: manifest.uiExtensions || [],
          nodeCount: Array.isArray(manifest.nodeTypes) ? manifest.nodeTypes.length : 0,
          nodeTypes: manifest.nodeTypes || [],
          loaded: false,
          lastLoadedAt: row.last_loaded_at,
          installedAt: row.installed_at,
          installedBy: row.installed_by,
          enabled: row.enabled ?? true,
          loadErrors: row.load_errors
        });
      }

      reply.send({ libraries: enrichedLibraries });
    } catch (error) {
      req.log.error({ err: error }, 'Failed to list libraries');
      reply.code(500).send({ error: 'Failed to retrieve libraries' });
    }
  });

  /**
   * GET /api/flows/libraries/:libraryId
   * Get details for a specific library
   * Requires 'flows:read' permission
   */
  app.get('/api/flows/libraries/:libraryId', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const { libraryId } = req.params;
      
      if (!LibraryManager.hasLibrary(libraryId)) {
        return reply.code(404).send({ error: `Library '${libraryId}' not found` });
      }

      const library = LibraryManager.getLibrary(libraryId);
      
      // Get database metadata
      const dbResult = await db.query(
        `SELECT installed_at, installed_by, enabled, load_errors, manifest
         FROM node_libraries
         WHERE library_id = $1`,
        [libraryId]
      );

      const dbInfo = dbResult.rows[0];

      reply.send({
        libraryId: library.libraryId,
        name: library.name,
        version: library.version,
        description: library.description,
        author: library.author,
        nodeTypes: library.nodeTypes || [],
        requirements: library.requirements,
        installedAt: dbInfo?.installed_at,
        installedBy: dbInfo?.installed_by,
        enabled: dbInfo?.enabled ?? true,
        loadErrors: dbInfo?.load_errors,
        manifest: dbInfo?.manifest
      });
    } catch (error) {
      req.log.error({ err: error, libraryId: req.params.libraryId }, 'Failed to get library');
      reply.code(500).send({ error: 'Failed to retrieve library' });
    }
  });

  /**
   * POST /api/flows/libraries/upload
   * Upload and install a new library
   * Requires 'flows:update' permission (creation requires update)
   */
  app.post('/api/flows/libraries/upload', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    try {
      // Get uploaded file from multipart form data
      const data = await req.file();
      
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      // Validate file type
      if (!data.filename.endsWith('.zip')) {
        return reply.code(400).send({ error: 'Only .zip files are supported' });
      }

      // Save to temp file
      const tempDir = path.join(__dirname, '../../temp');
      await fs.mkdir(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, `library-${Date.now()}.zip`);
      
      const buffer = await data.toBuffer();
      await fs.writeFile(tempFile, buffer);

      try {
        // Extract and validate
        const zip = new AdmZip(tempFile);
        const entries = zip.getEntries();
        
        // Find manifest
        const manifestEntry = entries.find(e => e.entryName.endsWith('library.manifest.json'));
        if (!manifestEntry) {
          throw new Error('library.manifest.json not found in zip file');
        }

        const manifestContent = manifestEntry.getData().toString('utf8');
        const manifest = JSON.parse(manifestContent);

        // Validate manifest
        const validation = LibraryManager.validateManifest(manifest);
        if (!validation.valid) {
          return reply.code(400).send({ 
            error: 'Invalid manifest', 
            details: validation.errors 
          });
        }

        const { libraryId } = manifest;

        // Check if library already exists
        const existing = await db.query(
          'SELECT id FROM node_libraries WHERE library_id = $1',
          [libraryId]
        );

        if (existing.rows.length > 0) {
          return reply.code(409).send({ 
            error: `Library '${libraryId}' is already installed. Delete it first to reinstall.` 
          });
        }

        // Extract to libraries directory
        const librariesDir = path.join(__dirname, '../nodes/libraries');
        await fs.mkdir(librariesDir, { recursive: true });
        const libraryDir = path.join(librariesDir, libraryId);

        // Remove existing directory if present
        try {
          await fs.rm(libraryDir, { recursive: true, force: true });
        } catch (err) {
          // Ignore if doesn't exist
        }

        // Extract zip
        zip.extractAllTo(libraryDir, true);

        // Save to database
        await db.query(
          `INSERT INTO node_libraries 
           (library_id, name, version, manifest, installed_by, enabled)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [libraryId, manifest.name, manifest.version, manifest, userId]
        );

        // Extensions are installed immediately, but activated on restart.
        // Reason: Fastify route registration is safest during startup registration.
        if (manifest.type === 'extension') {
          req.log.info({ libraryId, version: manifest.version }, 'Extension installed; restart required to activate');
          return reply.code(201).send({
            message: 'Extension installed. Restart core to activate it.',
            libraryId,
            name: manifest.name,
            version: manifest.version,
            hotReload: false,
            requiresRestart: true
          });
        }

        // Node libraries: load immediately
        try {
          await LibraryManager.loadLibrary(libraryDir, NodeRegistry, { db });
          
          await db.query(
            `UPDATE node_libraries 
             SET last_loaded_at = NOW(), load_errors = NULL
             WHERE library_id = $1`,
            [libraryId]
          );

          req.log.info({ libraryId, version: manifest.version }, 'Library installed and loaded');

          reply.code(201).send({
            message: 'Library installed and hot-loaded. No restart required.',
            libraryId,
            name: manifest.name,
            version: manifest.version,
            nodeCount: manifest.nodeTypes?.length || 0,
            hotReload: true
          });
        } catch (loadError) {
          // Save load error but still return success
          await db.query(
            `UPDATE node_libraries 
             SET load_errors = $1
             WHERE library_id = $2`,
            [loadError.message, libraryId]
          );

          req.log.warn({ err: loadError, libraryId }, 'Library installed but failed to load');

          reply.code(201).send({
            message: 'Library installed but failed to load',
            libraryId,
            name: manifest.name,
            version: manifest.version,
            loadError: loadError.message
          });
        }
      } finally {
        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {});
      }
    } catch (error) {
      req.log.error({ err: error }, 'Failed to upload library');
      reply.code(500).send({ 
        error: 'Failed to upload library', 
        details: error.message 
      });
    }
  });

  /**
   * POST /api/flows/libraries/:libraryId/enable
   * Enable a disabled library
   * Requires 'flows:update' permission
   */
  app.post('/api/flows/libraries/:libraryId/enable', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    try {
      const { libraryId } = req.params;

      const result = await db.query(
        `UPDATE node_libraries 
         SET enabled = true, updated_at = NOW()
         WHERE library_id = $1
         RETURNING *`,
        [libraryId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Library not found' });
      }

      // Hot-load the library (add to NodeRegistry)
      try {
        const { rows: metaRows } = await db.query(
          'SELECT manifest FROM node_libraries WHERE library_id = $1',
          [libraryId]
        );
        const manifest = metaRows?.[0]?.manifest;
        if (manifest?.type === 'extension') {
          return reply.send({
            message: 'Extension enabled. Restart core to activate it.',
            libraryId,
            hotReload: false,
            requiresRestart: true
          });
        }

        const { NodeRegistry } = await import('../nodes/base/NodeRegistry.js');
        const { LibraryManager } = await import('../nodes/base/LibraryManager.js');
        const libraryPath = path.join(__dirname, '../nodes/libraries', libraryId);
        await LibraryManager.loadLibrary(libraryPath, NodeRegistry, { db: app.db });
        req.log.info({ libraryId }, 'Library hot-loaded into NodeRegistry');
        
        // Update last_loaded_at timestamp
        await db.query(
          'UPDATE node_libraries SET last_loaded_at = NOW() WHERE library_id = $1',
          [libraryId]
        );
      } catch (err) {
        req.log.error({ err, libraryId }, 'Failed to hot-load library');
        return reply.code(500).send({ 
          error: 'Library enabled in database but failed to load',
          details: err.message
        });
      }

      reply.send({ 
        message: 'Library enabled and hot-loaded. No restart required.',
        libraryId,
        hotReload: true
      });
    } catch (error) {
      req.log.error({ err: error, libraryId: req.params.libraryId }, 'Failed to enable library');
      reply.code(500).send({ error: 'Failed to enable library' });
    }
  });

  /**
   * POST /api/flows/libraries/:libraryId/disable
   * Disable a library (requires restart to unload)
   * Requires 'flows:update' permission
   */
  app.post('/api/flows/libraries/:libraryId/disable', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'update', reply))) return;

    try {
      const { libraryId } = req.params;

      const result = await db.query(
        `UPDATE node_libraries 
         SET enabled = false, updated_at = NOW()
         WHERE library_id = $1
         RETURNING *`,
        [libraryId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Library not found' });
      }

      // Hot-unload the library (remove from NodeRegistry)
      try {
        const { rows: metaRows } = await db.query(
          'SELECT manifest FROM node_libraries WHERE library_id = $1',
          [libraryId]
        );
        const manifest = metaRows?.[0]?.manifest;
        if (manifest?.type === 'extension') {
          return reply.send({
            message: 'Extension disabled. Restart core to fully unload it.',
            libraryId,
            hotReload: false,
            requiresRestart: true
          });
        }

        const { NodeRegistry } = await import('../nodes/base/NodeRegistry.js');
        const { LibraryManager } = await import('../nodes/base/LibraryManager.js');
        await LibraryManager.unloadLibrary(libraryId, NodeRegistry, { db });
        req.log.info({ libraryId }, 'Library hot-unloaded from NodeRegistry');
      } catch (err) {
        req.log.warn({ err, libraryId }, 'Failed to hot-unload library (may not be loaded)');
      }

      reply.send({ 
        message: 'Library disabled and hot-unloaded. No restart required.',
        libraryId,
        hotReload: true
      });
    } catch (error) {
      req.log.error({ err: error, libraryId: req.params.libraryId }, 'Failed to disable library');
      reply.code(500).send({ error: 'Failed to disable library' });
    }
  });

  /**
   * DELETE /api/flows/libraries/:libraryId
   * Delete (uninstall) a library
   * Requires 'flows:delete' permission
   */
  app.delete('/api/flows/libraries/:libraryId', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'delete', reply))) return;

    try {
      const { libraryId } = req.params;
      const { force } = req.query; // Allow force delete even if in use

      // Check if library exists
      const existing = await db.query(
        'SELECT id, name FROM node_libraries WHERE library_id = $1',
        [libraryId]
      );

      if (existing.rows.length === 0) {
        return reply.code(404).send({ error: 'Library not found' });
      }

      const library = existing.rows[0];

      // Check if library is in use by any flows
      const usageResult = await db.query(`
        SELECT 
          f.id,
          f.name,
          COUNT(DISTINCT fld.node_id) as node_count
        FROM flow_library_dependencies fld
        JOIN flows f ON f.id = fld.flow_id
        WHERE fld.library_id = $1
        GROUP BY f.id, f.name
        ORDER BY f.name
      `, [libraryId]);

      const flowsUsingLibrary = usageResult.rows;

      // If library is in use and not forced, return error with details
      if (flowsUsingLibrary.length > 0 && force !== 'true') {
        return reply.code(409).send({
          error: 'Library is in use',
          message: `Cannot delete library "${library.name}" because it is used by ${flowsUsingLibrary.length} flow(s)`,
          libraryId,
          libraryName: library.name,
          flowsUsing: flowsUsingLibrary,
          hint: 'Remove library nodes from these flows first, or use ?force=true to delete anyway (will break flows)'
        });
      }

      // Log warning if force deleting
      if (flowsUsingLibrary.length > 0 && force === 'true') {
        req.log.warn({
          libraryId,
          flowCount: flowsUsingLibrary.length,
          flows: flowsUsingLibrary
        }, 'Force deleting library that is in use by flows');
      }

      // Hot-unload the library (remove from NodeRegistry)
      try {
        const { NodeRegistry } = await import('../nodes/base/NodeRegistry.js');
        const { LibraryManager } = await import('../nodes/base/LibraryManager.js');
        await LibraryManager.unloadLibrary(libraryId, NodeRegistry, { db });
        req.log.info({ libraryId }, 'Library hot-unloaded from NodeRegistry');
      } catch (err) {
        req.log.warn({ err, libraryId }, 'Failed to hot-unload library (may not be loaded)');
      }

      // Delete library files
      await db.query('DELETE FROM node_libraries WHERE library_id = $1', [libraryId]);

      // Delete from filesystem
      const libraryDir = path.join(__dirname, '../nodes/libraries', libraryId);
      try {
        await fs.rm(libraryDir, { recursive: true, force: true });
      } catch (err) {
        req.log.warn({ err, libraryId }, 'Failed to delete library directory');
      }

      req.log.info({ 
        libraryId, 
        forced: force === 'true',
        affectedFlows: flowsUsingLibrary.length 
      }, 'Library deleted');

      reply.send({ 
        message: flowsUsingLibrary.length > 0
          ? `Library deleted and hot-unloaded (${flowsUsingLibrary.length} flow(s) will be affected). No restart required.`
          : 'Library deleted and hot-unloaded. No restart required.',
        libraryId,
        affectedFlows: flowsUsingLibrary.length,
        hotReload: true
      });
    } catch (error) {
      req.log.error({ err: error, libraryId: req.params.libraryId }, 'Failed to delete library');
      reply.code(500).send({ error: 'Failed to delete library' });
    }
  });

  /**
   * GET /api/flows/libraries/:libraryId/usage
   * Get flows that use this library
   * Requires 'flows:read' permission
   */
  app.get('/api/flows/libraries/:libraryId/usage', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;

    try {
      const { libraryId } = req.params;

      // Check if library exists
      const existing = await db.query(
        'SELECT id, name, version FROM node_libraries WHERE library_id = $1',
        [libraryId]
      );

      if (existing.rows.length === 0) {
        return reply.code(404).send({ error: 'Library not found' });
      }

      const library = existing.rows[0];

      // Get flows using this library with detailed node information
      const usageResult = await db.query(`
        SELECT 
          f.id as flow_id,
          f.name as flow_name,
          f.deployed,
          f.owner_user_id,
          u.email as owner_email,
          json_agg(
            json_build_object(
              'node_id', fld.node_id,
              'node_type', fld.node_type
            )
          ) as nodes
        FROM flow_library_dependencies fld
        JOIN flows f ON f.id = fld.flow_id
        LEFT JOIN users u ON u.id = f.owner_user_id
        WHERE fld.library_id = $1
        GROUP BY f.id, f.name, f.deployed, f.owner_user_id, u.email
        ORDER BY f.name
      `, [libraryId]);

      const flows = usageResult.rows.map(row => ({
        flowId: row.flow_id,
        flowName: row.flow_name,
        deployed: row.deployed,
        ownerEmail: row.owner_email,
        nodeCount: row.nodes.length,
        nodes: row.nodes
      }));

      reply.send({
        libraryId,
        libraryName: library.name,
        version: library.version,
        usedByFlows: flows.length,
        flows
      });
    } catch (error) {
      req.log.error({ err: error, libraryId: req.params.libraryId }, 'Failed to get library usage');
      reply.code(500).send({ error: 'Failed to get library usage' });
    }
  });

  /**
   * GET /api/extensions/:libraryId/assets/*
   * Serve static assets from an extension's dist folder
   * Requires authentication (assets may include paid feature code)
   */
  app.get('/api/extensions/:libraryId/assets/*', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // Require flows:read to access extension assets
    if (!(await checkPermission(userId, 'read', reply))) return;

    const { libraryId } = req.params;
    const assetPath = req.params['*'];
    const normalizedAssetPath = assetPath?.replace(/^dist[\\/]/, '');
    
    if (!LibraryManager.hasLibrary(libraryId)) {
      return reply.code(404).send({ error: 'Extension not found' });
    }

    const library = LibraryManager.getLibrary(libraryId);
    const fullPath = path.join(library.path, 'dist', normalizedAssetPath);

    // Security check: ensure the path is within the library's dist folder
    const distDir = path.join(library.path, 'dist');
    const relative = path.relative(distDir, fullPath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    
    if (!isSafe) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const content = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();

      // Cache behavior:
      // - If caller provides a version query param (e.g. ?v=1.2.3), treat as immutable.
      // - Otherwise, disable caching to avoid stale extension bundles in browsers.
      const hasVersionParam = typeof req.query?.v === 'string' && req.query.v.length > 0;
      if (hasVersionParam) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        reply.header('Cache-Control', 'no-store');
      }

      const mimeTypes = {
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.html': 'text/html',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf'
      };
      
      if (mimeTypes[ext]) {
        reply.type(mimeTypes[ext]);
      }
      
      return content;
    } catch (err) {
      return reply.code(404).send({ error: 'Asset not found' });
    }
  });
}
