import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api';

/**
 * Hook to fetch and poll live cached tag values for a flow
 * 
 * Polls the backend every 2 seconds when enabled to get current
 * tag values from the memory layer (same as flow execution uses).
 * 
 * @param {string} flowId - Flow ID to fetch live data for
 * @param {boolean} enabled - Whether to poll for live data
 * @param {number} pollInterval - Polling interval in milliseconds (default: 2000)
 * @returns {Object} liveData - Map of nodeId -> { value, quality, timestamp, tagPath }
 */
export function useFlowLiveData(flowId, enabled = false, pollInterval = 2000) {
  const [liveData, setLiveData] = useState({});
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || !flowId) {
      setLiveData({});
      return;
    }

    // Fetch function
    const fetchLiveData = async () => {
      try {
        const data = await apiClient.get(`/flows/${flowId}/live-data`);
        if (mountedRef.current) {
          setLiveData(data || {});
        }
      } catch (error) {
        console.error('Failed to fetch live data:', error);
        // Don't clear data on error - keep showing last known values
      }
    };

    // Initial fetch
    fetchLiveData();

    // Set up polling
    intervalRef.current = setInterval(fetchLiveData, pollInterval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [flowId, enabled, pollInterval]);

  return liveData;
}
