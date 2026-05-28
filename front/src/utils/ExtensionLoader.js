/**
 * Extension Component Loader (F1)
 *
 * Dynamically imports React components from extension asset URLs served by
 * /api/extensions/{id}/assets/{file}. Results are cached per URL so each
 * module is only fetched once per page session.
 *
 * Extension component files must be plain ES modules that reference host
 * globals via window.__DF instead of bundling their own React/MUI copies.
 *
 * Note: We fetch the JS manually and import a blob URL instead of using
 * import(url) directly. In Vite dev mode, import() appends ?import to the URL
 * which causes Vite's dev server to return JSON module metadata instead of
 * proxying the request to the backend API.
 */

const _cache = new Map(); // url → Promise<ComponentClass>

/**
 * Load a React component from a URL.
 * Returns the default export of the module.
 * @param {string} url
 * @returns {Promise<React.ComponentType>}
 */
export async function loadExtensionComponent(url) {
  if (_cache.has(url)) return _cache.get(url);

  const promise = (async () => {
    const token = localStorage.getItem('df_token');
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`Failed to load extension asset (${res.status}): ${url}`);
    const code = await res.text();
    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      const mod = await import(/* @vite-ignore */ blobUrl);
      if (!mod.default) throw new Error(`Extension module at ${url} has no default export`);
      return mod.default;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  })();

  _cache.set(url, promise);
  return promise;
}

/**
 * Eagerly kick off a component fetch without waiting for the result.
 * Useful for preloading extension assets when the library list is first loaded.
 * @param {string} url
 */
export function preloadExtensionComponent(url) {
  loadExtensionComponent(url).catch(() => {
    // Preload failures are non-fatal; the component will retry on first render.
    _cache.delete(url);
  });
}
