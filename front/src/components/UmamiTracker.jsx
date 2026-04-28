import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/analytics';

const ANALYTICS_SCRIPT_URL = import.meta.env.VITE_ANALYTICS_SCRIPT_URL || '';
const ANALYTICS_SITE_ID = import.meta.env.VITE_ANALYTICS_SITE_ID || '';

/**
 * Injects the analytics script tag once and tracks page views on route changes.
 * Controlled entirely by VITE_ANALYTICS_SCRIPT_URL and VITE_ANALYTICS_SITE_ID
 * in .env. Set both to empty strings to disable tracking completely.
 */
export const UmamiTracker = () => {
  const location = useLocation();

  useEffect(() => {
    if (!ANALYTICS_SCRIPT_URL || !ANALYTICS_SITE_ID) return;
    if (document.querySelector('script[data-analytics-injected]')) return;
    const script = document.createElement('script');
    script.defer = true;
    script.src = ANALYTICS_SCRIPT_URL;
    script.setAttribute('data-website-id', ANALYTICS_SITE_ID);
    script.setAttribute('data-analytics-injected', 'true');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ANALYTICS_SCRIPT_URL || !ANALYTICS_SITE_ID) return;
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
};
