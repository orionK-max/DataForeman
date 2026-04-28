/**
 * Umami Analytics Utility
 * Provides functions to track page views and custom events
 */

/**
 * Track a page view
 * @param {string} url - The URL to track (defaults to current location)
 * @param {string} referrer - The referrer URL
 */
export const trackPageView = (url, referrer) => {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(props => ({
      ...props,
      url: url || window.location.pathname + window.location.search,
      referrer: referrer || document.referrer
    }));
  }
};

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {object} eventData - Additional data to track with the event
 */
export const trackEvent = (eventName, eventData = {}) => {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(eventName, eventData);
  }
};

/**
 * Track a custom event with a value
 * @param {string} eventName - Name of the event
 * @param {string} eventValue - Value associated with the event
 */
export const trackEventValue = (eventName, eventValue) => {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(eventName, { value: eventValue });
  }
};
