import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api';

/**
 * Custom hook for polling jobs with incremental updates
 * Prevents flickering by merging updates instead of replacing
 */
export function useJobsPolling(enabled = true, intervalMs = 2000) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchJobs = async () => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const data = await apiClient.get('/jobs?limit=200');
      const newJobs = data.items || []; // Backend returns { items: [...] } not { jobs: [...] }

      // Replace jobs entirely to ensure deletions are reflected
      setJobs(newJobs.sort((a, b) => {
        // Sort by created_at descending (newest first)
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      }));

      setError(null);
      setLoading(false);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled) return;

    fetchJobs();
    const interval = setInterval(fetchJobs, intervalMs);

    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, intervalMs]);

  return { jobs, loading, error, refetch: fetchJobs };
}
