/**
 * Register all nodes provided by the Advanced Math library.
 *
 * Called by LibraryManager with:
 *   registerNodes(NodeRegistry, { library: manifest, ...options })
 *
 * @param {import('../../base/NodeRegistry.js').NodeRegistryClass} registry
 * @param {Object} options
 * @param {Object} options.library - Library manifest object
 */
export async function registerNodes(registry, options = {}) {
  const library = options.library;
  const libraryId = library?.libraryId ?? 'advanced-math';

  // Dynamic imports so cache-busting from LibraryManager propagates to node files
  const cacheBuster = `?t=${Date.now()}`;
  const { RateOfChangeNode } = await import(`./nodes/RateOfChangeNode.js${cacheBuster}`);
  const { RollingAverageNode } = await import(`./nodes/RollingAverageNode.js${cacheBuster}`);

  registry.register(`${libraryId}:rate-of-change`, RateOfChangeNode, { library });
  registry.register(`${libraryId}:rolling-average`, RollingAverageNode, { library });

  console.log(`[${libraryId}] Registered 2 nodes: rate-of-change, rolling-average`);
}
