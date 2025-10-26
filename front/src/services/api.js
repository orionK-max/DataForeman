// API service
// Centralized API client for making HTTP requests to the backend

// In development, use relative URLs so Vite proxy handles them
// In production (when served by nginx), also use relative URLs
const API_BASE_URL = '/api';

// Callback to handle unauthorized responses (will be set by AuthContext)
let onUnauthorized = null;
let onTokenRefreshed = null;

// Track if a refresh is in progress to avoid multiple simultaneous refreshes
let refreshPromise = null;

/**
 * Set the unauthorized handler
 * @param {Function} handler - Function to call on 401 responses
 */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * Set the token refreshed handler
 * @param {Function} handler - Function to call when tokens are refreshed (access, refresh)
 */
export function setTokenRefreshedHandler(handler) {
  onTokenRefreshed = handler;
}

/**
 * Get authentication token from localStorage
 * @returns {string|null} JWT token or null
 */
function getToken() {
  return localStorage.getItem('df_token');
}

/**
 * Get refresh token from localStorage
 * @returns {string|null} Refresh token or null
 */
function getRefreshToken() {
  return localStorage.getItem('df_refresh_token');
}

/**
 * Attempt to refresh the access token using the refresh token
 * @returns {Promise<boolean>} True if refresh succeeded, false otherwise
 */
async function attemptTokenRefresh() {
  // If already refreshing, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      if (data.token && data.refresh && onTokenRefreshed) {
        onTokenRefreshed(data.token, data.refresh);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Handle API response and errors
 * @param {Response} response - Fetch response object
 * @param {string} endpoint - Original endpoint for retry
 * @param {Object} fetchOptions - Original fetch options for retry
 * @returns {Promise<any>} Parsed JSON data
 * @throws {Error} If response is not ok
 */
async function handleResponse(response, endpoint, fetchOptions) {
  if (!response.ok) {
    // Handle 401 Unauthorized - attempt token refresh before logging out
    if (response.status === 401 && !endpoint.includes('/auth/')) {
      const refreshSucceeded = await attemptTokenRefresh();
      
      if (refreshSucceeded) {
        // Retry the original request with the new token
        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...fetchOptions,
          headers: getHeaders(fetchOptions.headers),
        });
        
        if (retryResponse.ok) {
          if (retryResponse.status === 204) {
            return null;
          }
          return retryResponse.json();
        }
      }
      
      // Refresh failed or retry failed - trigger logout
      if (onUnauthorized) {
        onUnauthorized();
      }
      throw new Error('Unauthorized');
    }
    
    // Handle 403 Forbidden
    if (response.status === 403) {
      const error = await response.json().catch(() => ({}));
      if (error.error === 'forbidden') {
        const feature = error.feature || 'this feature';
        const operation = error.operation || 'this action';
        throw new Error(`Permission denied: You don't have permission to ${operation} ${feature}. Please contact your administrator.`);
      }
      const errorMessage = error.message || error.error || 'Access forbidden';
      throw new Error(errorMessage);
    }
    
    const error = await response.json().catch(() => ({}));
    const errorMessage = error.message || error.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }
  
  // Handle 204 No Content (e.g., DELETE responses)
  if (response.status === 204) {
    return null;
  }
  
  return response.json();
}

/**
 * Get default headers including authentication
 * @param {Object} additionalHeaders - Additional headers to merge
 * @returns {Object} Headers object
 */
function getHeaders(additionalHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };
  
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  return headers;
}

export const apiClient = {
  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  get: async (endpoint, options = {}) => {
    const fetchOptions = {
      method: 'GET',
      headers: getHeaders(options.headers),
      ...options,
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    return handleResponse(response, endpoint, fetchOptions);
  },

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {any} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  post: async (endpoint, data, options = {}) => {
    const fetchOptions = {
      method: 'POST',
      headers: getHeaders(options.headers),
      body: JSON.stringify(data),
      ...options,
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    return handleResponse(response, endpoint, fetchOptions);
  },

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {any} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  put: async (endpoint, data, options = {}) => {
    const fetchOptions = {
      method: 'PUT',
      headers: getHeaders(options.headers),
      body: JSON.stringify(data),
      ...options,
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    return handleResponse(response, endpoint, fetchOptions);
  },

  /**
   * PATCH request
   * @param {string} endpoint - API endpoint
   * @param {any} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  patch: async (endpoint, data, options = {}) => {
    const fetchOptions = {
      method: 'PATCH',
      headers: getHeaders(options.headers),
      body: JSON.stringify(data),
      ...options,
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    return handleResponse(response, endpoint, fetchOptions);
  },

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  delete: async (endpoint, options = {}) => {
    const fetchOptions = {
      method: 'DELETE',
      headers: getHeaders(options.headers),
      ...options,
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    return handleResponse(response, endpoint, fetchOptions);
  },
};

export default apiClient;
