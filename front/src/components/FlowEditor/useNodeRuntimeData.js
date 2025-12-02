import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../services/api';

/**
 * useNodeRuntimeData - Poll for runtime data updates
 * 
 * For async nodes (file processing, downloads, etc.), polls the backend
 * for runtime status updates like progress, status messages, etc.
 * 
 * @param {string} nodeId - Node ID
 * @param {Object} runtimeConfig - Runtime configuration from visual definition
 * @param {boolean} isExecuting - Whether node is currently executing
 * @returns {Object} Runtime data object
 */
export const useNodeRuntimeData = (nodeId, runtimeConfig, isExecuting) => {
  const [runtimeData, setRuntimeData] = useState({});
  const intervalRef = useRef(null);

  useEffect(() => {
    // No runtime config or not enabled
    if (!runtimeConfig || !runtimeConfig.enabled) {
      return;
    }

    // Only poll while executing
    if (!isExecuting) {
      setRuntimeData({});
      return;
    }

    // Start polling
    const poll = async () => {
      try {
        // Replace {{nodeId}} in endpoint
        const endpoint = runtimeConfig.endpoint.replace('{{nodeId}}', nodeId);
        
        const data = await apiClient.get(endpoint);

        if (data) {
          setRuntimeData(data);
        }
      } catch (error) {
        console.warn('Failed to fetch runtime data:', error);
        // Don't clear data on error - keep showing last known state
      }
    };

    // Initial poll
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, runtimeConfig.updateInterval || 1000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [nodeId, runtimeConfig, isExecuting]);

  return runtimeData;
};
