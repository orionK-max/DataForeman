/**
 * Plugin Registry
 * 
 * Manages dynamically registered UI extensions from installed libraries.
 */

class PluginRegistryClass {
  constructor() {
    this._extensions = [];
    this._chartPlugins = new Map(); // id → chart plugin descriptor
    this._connectivityDriverForms = new Map(); // driverType → connection form descriptor
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
        // Include both version and updatedAt when available.
        // Version changes must always change the asset URL, even if the DB
        // updatedAt timestamp was not refreshed by a manual bundle swap.
        const cacheParams = new URLSearchParams();
        if (lib.version) cacheParams.set('v', lib.version);
        if (lib.updatedAt) cacheParams.set('cb', String(new Date(lib.updatedAt).getTime()));
        const cacheBuster = cacheParams.size ? `?${cacheParams.toString()}` : '';
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
          libraryVersion: lib.version || null,
        });
      }
    }

    // Auto-register connectivity driver connection-forms from uiExtensions
    // (installable-drivers framework, Phase 0 — see docs/library-system.md)
    this._connectivityDriverForms.clear();
    for (const lib of libraries) {
      if (lib.enabled === false || lib.loaded !== true) continue;
      for (const ext of (lib.uiExtensions || [])) {
        if (ext.type !== 'connectivity-driver-form') continue;
        const cacheParams = new URLSearchParams();
        if (lib.version) cacheParams.set('v', lib.version);
        if (lib.updatedAt) cacheParams.set('cb', String(new Date(lib.updatedAt).getTime()));
        const cacheBuster = cacheParams.size ? `?${cacheParams.toString()}` : '';
        const formComponentUrl = ext.formComponentUrl
          ? `/api/extensions/${lib.libraryId}/assets/${ext.formComponentUrl}${cacheBuster}`
          : null;

        this._connectivityDriverForms.set(ext.driverType, {
          driverType: ext.driverType,
          label: ext.label || ext.driverType,
          formComponentUrl,
          libraryId: lib.libraryId,
          libraryVersion: lib.version || null,
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
   * Get all registered connectivity driver connection-forms (installable drivers).
   * @returns {Array<{driverType, label, formComponentUrl, libraryId, libraryVersion}>}
   */
  getConnectivityDriverForms() {
    return [...this._connectivityDriverForms.values()];
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
