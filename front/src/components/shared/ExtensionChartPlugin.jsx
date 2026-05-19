import React from 'react';
import { loadExtensionComponent } from '../../utils/ExtensionLoader.js';

/**
 * Lazy-renders a chart plugin's toolbar component.
 *
 * The component is loaded on first render from the extension asset URL and
 * receives all chart context it needs via props. The `onSeriesChange` callback
 * lets the plugin push ECharts series data back up to ChartRenderer.
 */
export default function ExtensionChartPlugin({ plugin, toolbarProps }) {
  const [Component, setComponent] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!plugin.toolbarComponentUrl) return;
    loadExtensionComponent(plugin.toolbarComponentUrl)
      .then(Component => setComponent(() => Component))
      .catch((err) => {
        console.error(`[ExtensionChartPlugin] Failed to load ${plugin.id}:`, err);
        setError(err.message);
      });
  }, [plugin.toolbarComponentUrl, plugin.id]);

  if (error) return null;
  if (!Component) return null;

  return <Component {...toolbarProps} />;
}
