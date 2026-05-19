/**
 * Plugin Registry
 * 
 * Manages dynamically registered UI extensions from installed libraries.
 */

class PluginRegistryClass {
  constructor() {
    this._extensions = [];
    this._chartPlugins = new Map(); // id → chart plugin descriptor
    this._listeners = new Set();
  }

  /**
   * Register extensions from the backend
   * @param {Array} libraries - List of libraries from /api/flows/libraries
   */
  setExtensionsFromLibraries(libraries) {
    this._extensions = libraries
      .filter(lib => lib.enabled !== false)
      .filter(lib => lib.loaded === true)
      .filter(lib => lib.uiExtensions && lib.uiExtensions.length > 0)
      .flatMap(lib => lib.uiExtensions.map(ext => ({
        ...ext,
        libraryId: lib.libraryId,
        libraryVersion: lib.version,
        // Resolve component URL if it's relative
        componentUrl: ext.componentUrl?.startsWith('http') 
          ? ext.componentUrl 
          : `/api/extensions/${lib.libraryId}/assets/${ext.componentUrl}${lib.version ? `?v=${encodeURIComponent(lib.version)}` : ''}`
      })));

    // Auto-register chart plugins from uiExtensions
    this._chartPlugins.clear();
    for (const lib of libraries) {
      if (lib.enabled === false || lib.loaded !== true) continue;
      for (const ext of (lib.uiExtensions || [])) {
        if (ext.type !== 'chart-plugin') continue;
        // Use updatedAt as cache buster so any update (even same version) refreshes assets.
        // Falls back to version, then no param (no-store headers will apply).
        const cacheBuster = lib.updatedAt
          ? `?cb=${new Date(lib.updatedAt).getTime()}`
          : lib.version ? `?v=${encodeURIComponent(lib.version)}` : '';
        const resolveAssetUrl = (filename) =>
          filename ? `/api/extensions/${lib.libraryId}/assets/${filename}${cacheBuster}` : null;

        this._chartPlugins.set(ext.id, {
          id: ext.id,
          configKey: ext.configKey || ext.id,
          toolbarComponentUrl: resolveAssetUrl(ext.toolbarComponentUrl),
          configTabUrl: resolveAssetUrl(ext.configTabUrl),
          configTabLabel: ext.configTabLabel || ext.id,
          configTabIcon: ext.configTabIcon || null,
          toolbarSlot: ext.toolbarSlot || 'data',
          libraryId: lib.libraryId,
        });
      }
    }

    this._notify();
  }

  /**
   * Get all registered chart plugins.
   * @returns {Array<{id, configKey, toolbarComponentUrl, configTabUrl, configTabLabel, configTabIcon, libraryId}>}
   */
  getChartPlugins() {
    return [...this._chartPlugins.values()];
  }

  /**
   * Get all registered sidebar items
   */
  getSidebarItems() {
    return this._extensions
      .filter(ext => ext.type === 'sidebar-item')
      .map(ext => ({
        text: ext.title,
        path: ext.path,
        icon: ext.icon, // This might need to be mapped to an actual MUI icon component
        // Default to an existing feature key so sidebar permission checks work.
        // Extensions should provide a real feature key (recommended: 'extensions.<id>').
        feature: ext.feature || 'flows',
        isExtension: true,
        libraryId: ext.libraryId
      }));
  }

  /**
   * Get all registered routes
   */
  getRoutes() {
    return this._extensions
      .filter(ext => ext.type === 'route' || ext.type === 'sidebar-item')
      .map(ext => ({
        path: ext.path,
        componentUrl: ext.componentUrl,
        libraryId: ext.libraryId
      }));
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    this._listeners.forEach(listener => listener(this._extensions));
  }
}

export const PluginRegistry = new PluginRegistryClass();
export default PluginRegistry;
