import { useState, useEffect, useRef } from 'react';
import { flowsApi } from '../services/api';

/**
 * Hook to fetch and poll flow resource usage data
 * @param {string} flowId - The flow ID to monitor
 * @param {boolean} enabled - Whether to enable polling
 * @param {number} interval - Polling interval in milliseconds (default: 5000)
 * @returns {Object} { data, loading, error, refetch }
 */
export function useFlowResources(flowId, enabled = false, interval = 5000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isFirstFetch = useRef(true);

  const fetchResources = async (showLoading = true) => {
    if (!flowId || !enabled) {
      return;
    }

    try {
      // Only show loading indicator on first fetch
      if (showLoading && isFirstFetch.current) {
        setLoading(true);
      }
      setError(null);

      // Fetch active flows and find this flow
      const response = await flowsApi.getActiveFlowResources();
      const flowData = response.flows.find(f => f.flowId === flowId);

      // Update data without triggering loading state (smooth updates)
      setData(flowData || null);
      isFirstFetch.current = false;
    } catch (err) {
      console.error('Failed to fetch flow resources:', err);
      setError(err.message || 'Failed to fetch resource data');
    } finally {
      if (showLoading && isFirstFetch.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled || !flowId) {
      setData(null);
      isFirstFetch.current = true;
      return;
    }

    // Initial fetch with loading indicator
    fetchResources(true);

    // Set up polling without loading indicator
    const intervalId = setInterval(() => fetchResources(false), interval);

    return () => {
      clearInterval(intervalId);
      isFirstFetch.current = true;
    };
  }, [flowId, enabled, interval]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchResources(true)
  };
}
