/**
 * Library Manager
 * 
 * Manages dynamic loading of node libraries from the filesystem.
 * Scans, validates, and registers external node packages.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LibraryManagerClass {
  constructor() {
    /**
     * Map of libraryId -> library metadata
     * @private
     */
    this._libraries = new Map();
    
    /**
     * Base path for libraries directory
     * @private
     */
    this._librariesPath = path.join(__dirname, '..', 'libraries');
  }

  /**
   * Set custom libraries path (for testing)
   * @param {string} librariesPath - Absolute path to libraries directory
   */
  setLibrariesPath(librariesPath) {
    this._librariesPath = librariesPath;
  }

  /**
   * Get libraries path
   * @returns {string} Absolute path to libraries directory
   */
  getLibrariesPath() {
    return this._librariesPath;
  }

  /**
   * Scan and load all libraries from the libraries directory
   * @param {Object} NodeRegistry - Node registry instance
   * @param {Object} options - Loading options
   * @param {Object} options.db - Database connection (optional, if provided, checks enabled status)
   * @returns {Promise<Object>} Summary of loaded libraries
   */
  async loadAllLibraries(NodeRegistry, options = {}) {
    const { db } = options;
    const summary = {
      loaded: [],
      failed: [],
      skipped: []
    };

    try {
      // Get enabled libraries from database if db connection is provided
      let enabledLibraries = null;
      if (db) {
        try {
          const result = await db.query(
            'SELECT library_id FROM node_libraries WHERE enabled = true'
          );
          enabledLibraries = new Set(result.rows.map(r => r.library_id));
          console.log(`[LibraryManager] Found ${enabledLibraries.size} enabled libraries in database`);
        } catch (error) {
          console.warn('[LibraryManager] Failed to query database for enabled libraries, loading all:', error.message);
          enabledLibraries = null; // Fall back to loading all if query fails
        }
      }

      // Ensure libraries directory exists
      await fs.mkdir(this._librariesPath, { recursive: true });

      // Read directory contents
      const entries = await fs.readdir(this._librariesPath, { withFileTypes: true });
      
      // Filter for directories only
      const libraryDirs = entries.filter(entry => entry.isDirectory());

      console.log(`[LibraryManager] Found ${libraryDirs.length} potential libraries`);

      // Load each library
      for (const dir of libraryDirs) {
        const libraryPath = path.join(this._librariesPath, dir.name);
        
        // Skip if library is disabled in database
        if (enabledLibraries !== null && !enabledLibraries.has(dir.name)) {
          console.log(`[LibraryManager] Skipping disabled library: ${dir.name}`);
          summary.skipped.push({
            id: dir.name,
            reason: 'Library is disabled'
          });
          continue;
        }
        
        try {
          const result = await this.loadLibrary(libraryPath, NodeRegistry, { ...options, db });
          
          if (result.success) {
            summary.loaded.push({
              id: result.library.libraryId,
              name: result.library.name,
              version: result.library.version,
              nodeCount: result.library.provides?.nodeTypes?.length || 0
            });
            
            // Update last_loaded_at in database if available
            if (db) {
              try {
                await db.query(
                  'UPDATE node_libraries SET last_loaded_at = NOW(), load_errors = NULL WHERE library_id = $1',
                  [result.library.libraryId]
                );
              } catch (error) {
                console.warn(`[LibraryManager] Failed to update last_loaded_at for ${result.library.libraryId}:`, error.message);
              }
            }
          } else {
            summary.skipped.push({
              id: dir.name,
              reason: result.reason
            });
          }
        } catch (error) {
          console.error(`[LibraryManager] Failed to load library from ${dir.name}:`, error.message);
          summary.failed.push({
            id: dir.name,
            error: error.message
          });
          
          // Save load error to database if available
          if (db) {
            try {
              await db.query(
                'UPDATE node_libraries SET load_errors = $1 WHERE library_id = $2',
                [error.message, dir.name]
              );
            } catch (dbError) {
              console.warn(`[LibraryManager] Failed to save load error for ${dir.name}:`, dbError.message);
            }
          }
        }
      }

      console.log(`[LibraryManager] Loaded ${summary.loaded.length} libraries, ${summary.failed.length} failed, ${summary.skipped.length} skipped`);
      
      return summary;
    } catch (error) {
      console.error('[LibraryManager] Failed to scan libraries directory:', error);
      throw error;
    }
  }

  /**
   * Load a single library from a directory
   * @param {string} libraryPath - Absolute path to library directory
   * @param {Object} NodeRegistry - Node registry instance
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} Load result
   */
  async loadLibrary(libraryPath, NodeRegistry, options = {}) {
    const manifestPath = path.join(libraryPath, 'library.manifest.json');
    const indexPath = path.join(libraryPath, 'index.js');

    // Check if manifest exists
    try {
      await fs.access(manifestPath);
    } catch {
      return { success: false, reason: 'No library.manifest.json found' };
    }

    // Read and parse manifest
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    // Validate manifest
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
    }

    const isExtension = manifest.type === 'extension';

    // Check if already loaded
    if (this._libraries.has(manifest.libraryId)) {
      return { success: false, reason: 'Library already loaded' };
    }

    // Check if index.js exists (required for node-library, optional for extension)
    let hasIndex = false;
    try {
      await fs.access(indexPath);
      hasIndex = true;
    } catch {
      if (!isExtension) {
        throw new Error('Missing index.js entry point');
      }
    }

    // Check version compatibility
    if (manifest.requirements?.dataforemanVersion) {
      // TODO: Implement semver checking
      // For now, just log the requirement
      console.log(`[LibraryManager] ${manifest.libraryId} requires DataForeman ${manifest.requirements.dataforemanVersion}`);
    }

    // Load nodes if index.js exists
    if (hasIndex) {
      // Dynamic import of library (with cache busting to handle updates)
      const cacheBuster = `?t=${Date.now()}`;
      const indexUrl = `file://${indexPath}${cacheBuster}`;
      const library = await import(indexUrl);

      if (typeof library.registerNodes !== 'function') {
        throw new Error('Library must export a registerNodes function');
      }

      // Register nodes
      const registrationOptions = {
        library: manifest,
        ...options
      };

      await library.registerNodes(NodeRegistry, registrationOptions);

      // Register categories/sections from library nodes (if db is available)
      if (options.db) {
        const { CategoryService } = await import('../../services/CategoryService.js');
        const libraryNodes = NodeRegistry.getNodesByLibrary(manifest.libraryId);
        
        for (const node of libraryNodes) {
          const description = NodeRegistry.getDescription(node.type);
          if (description && description.category && description.section) {
            await CategoryService.registerCategorySection(
              options.db,
              description.category,
              description.section,
              description
            );
          }
        }
      }
    }

    // Load extension routes if it's an extension
    if (isExtension && options.app) {
      const routesPath = path.join(libraryPath, 'extension', 'routes.js');
      try {
        await fs.access(routesPath);
        const cacheBuster = `?t=${Date.now()}`;
        const routesUrl = `file://${routesPath}${cacheBuster}`;
        const extensionModule = await import(routesUrl);
        
        if (typeof extensionModule.default === 'function') {
          console.log(`[LibraryManager] Registering extension routes for: ${manifest.libraryId}`);
          await options.app.register(extensionModule.default, { 
            prefix: `/api/extensions/${manifest.libraryId}`,
            library: manifest,
            db: options.db
          });
        } else {
          console.warn(`[LibraryManager] Extension ${manifest.libraryId} has routes.js but no default export function`);
        }
      } catch (err) {
        // routes.js is optional even for extensions
        if (err.code !== 'ENOENT') {
          console.error(`[LibraryManager] Failed to load extension routes for ${manifest.libraryId}:`, err.message);
        }
      }
    }

    // Store library metadata
    this._libraries.set(manifest.libraryId, {
      manifest,
      path: libraryPath,
      loadedAt: new Date()
    });

    const typeStr = isExtension ? 'extension' : 'library';
    const nodeCount = manifest.provides?.nodeTypes?.length || 0;
    console.log(`[LibraryManager] Loaded ${typeStr}: ${manifest.name} v${manifest.version} (${nodeCount} nodes)`);

    return { 
      success: true, 
      library: manifest 
    };
  }

  /**
   * Unload a library (hot-unload without restart)
   * Removes nodes from NodeRegistry and clears library metadata
   * @param {string} libraryId - Library identifier
   * @param {Object} NodeRegistry - Node registry instance
   * @param {Object} options - Options including db for cleanup
   * @returns {Object} Unload result with unregistered nodes count
   */
  async unloadLibrary(libraryId, NodeRegistry, options = {}) {
    console.log(`[LibraryManager] Unloading library: ${libraryId}`);

    // Unregister all nodes from this library
    const unregisteredNodes = NodeRegistry.unregisterLibraryNodes(libraryId);

    // Remove from libraries map
    this._libraries.delete(libraryId);

    // Clean up unused library categories/sections
    if (options.db) {
      const { CategoryService } = await import('../../services/CategoryService.js');
      await CategoryService.cleanupUnusedLibraryCategories(options.db, NodeRegistry);
    }

    console.log(`[LibraryManager] Unloaded library: ${libraryId} (${unregisteredNodes.length} nodes removed)`);

    return {
      success: true,
      libraryId,
      nodesRemoved: unregisteredNodes.length,
      nodes: unregisteredNodes
    };
  }

  /**
   * Reload a library (hot-reload without restart)
   * Unloads the library and loads it again from filesystem
   * @param {string} libraryId - Library identifier
   * @param {Object} NodeRegistry - Node registry instance
   * @param {Object} options - Loading options
   * @returns {Object} Reload result
   */
  async reloadLibrary(libraryId, NodeRegistry, options = {}) {
    console.log(`[LibraryManager] Reloading library: ${libraryId}`);

    // First unload
    await this.unloadLibrary(libraryId, NodeRegistry);

    // Then load again
    const libraryPath = path.join(this._librariesPath, libraryId);
    const loadResult = await this.loadLibrary(libraryPath, NodeRegistry, options);

    console.log(`[LibraryManager] Reloaded library: ${libraryId}`);

    return {
      success: true,
      libraryId,
      ...loadResult
    };
  }

  /**
   * Validate library manifest structure
   * @param {Object} manifest - Parsed manifest object
   * @returns {Object} Validation result with valid flag and errors array
   */
  validateManifest(manifest) {
    const errors = [];

    // Required fields
    if (!manifest.libraryId) {
      errors.push('libraryId is required');
    } else if (!/^[a-z0-9-]+$/.test(manifest.libraryId)) {
      errors.push('libraryId must contain only lowercase letters, numbers, and hyphens');
    }

    if (!manifest.name) {
      errors.push('name is required');
    }

    if (!manifest.version) {
      errors.push('version is required');
    } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push('version must follow semantic versioning (e.g., 1.0.0)');
    }

    if (!manifest.schemaVersion) {
      errors.push('schemaVersion is required');
    } else if (manifest.schemaVersion !== 1) {
      errors.push('Only schemaVersion 1 is currently supported');
    }

    // Optional type field (defaults to node-library)
    if (manifest.type && !['node-library', 'extension'].includes(manifest.type)) {
      errors.push('type must be either "node-library" or "extension"');
    }

    // Validate provides section
    if (manifest.provides) {
      if (manifest.provides.nodeTypes && !Array.isArray(manifest.provides.nodeTypes)) {
        errors.push('provides.nodeTypes must be an array');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get metadata for a loaded library
   * @param {string} libraryId - Library identifier
   * @returns {Object|undefined} Library metadata or undefined
   */
  getLibrary(libraryId) {
    return this._libraries.get(libraryId);
  }

  /**
   * Get all loaded libraries with their registered node types
   * @param {Object} NodeRegistry - Optional NodeRegistry to get actual registered nodes
   * @returns {Array<Object>} Array of library metadata
   */
  getAllLibraries(NodeRegistry = null) {
    return Array.from(this._libraries.entries()).map(([id, data]) => {
      // Get actual registered node types from NodeRegistry if provided
      let nodeTypes = [];
      if (NodeRegistry) {
        nodeTypes = NodeRegistry.getNodesByLibrary(id);
      }
      
      return {
        libraryId: id,
        name: data.manifest.name,
        version: data.manifest.version,
        type: data.manifest.type || 'node-library',
        description: data.manifest.description,
        author: data.manifest.author,
        nodeTypes: nodeTypes.map(nt => nt.type),
        uiExtensions: data.manifest.uiExtensions || [],
        loadedAt: data.loadedAt,
        path: data.path
      };
    });
  }

  /**
   * Check if a library is loaded
   * @param {string} libraryId - Library identifier
   * @returns {boolean} True if library is loaded
   */
  hasLibrary(libraryId) {
    return this._libraries.has(libraryId);
  }

  /**
   * Get count of loaded libraries
   * @returns {number} Number of loaded libraries
   */
  count() {
    return this._libraries.size;
  }

  /**
   * Unload a library (mainly for testing)
   * Note: This does not unregister nodes from NodeRegistry
   * @param {string} libraryId - Library identifier
   * @returns {boolean} True if library was loaded and removed
   */
  unload(libraryId) {
    return this._libraries.delete(libraryId);
  }

  /**
   * Clear all loaded libraries (mainly for testing)
   */
  clear() {
    this._libraries.clear();
  }
}

// Create singleton instance
const LibraryManager = new LibraryManagerClass();

// Export singleton
export { LibraryManager };
export default LibraryManager;
