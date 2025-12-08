const API_BASE = '/api/flows/libraries';

/**
 * Get authentication headers
 */
function getHeaders() {
  const token = localStorage.getItem('df_token');
  return {
    'Authorization': `Bearer ${token}`
  };
}

const libraryApi = {
  /**
   * List all installed libraries
   */
  async list() {
    const response = await fetch(API_BASE, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list libraries');
    }

    return response.json();
  },

  /**
   * Get library details
   */
  async get(libraryId) {
    const response = await fetch(`${API_BASE}/${libraryId}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get library details');
    }

    return response.json();
  },

  /**
   * Upload a new library
   */
  async upload(file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('df_token');

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Failed to upload library');
    }

    return response.json();
  },

  /**
   * Enable a library
   */
  async enable(libraryId) {
    const response = await fetch(`${API_BASE}/${libraryId}/enable`, {
      method: 'POST',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to enable library');
    }

    return response.json();
  },

  /**
   * Disable a library
   */
  async disable(libraryId) {
    const response = await fetch(`${API_BASE}/${libraryId}/disable`, {
      method: 'POST',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to disable library');
    }

    return response.json();
  },

  /**
   * Delete a library
   */
  async delete(libraryId) {
    const response = await fetch(`${API_BASE}/${libraryId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete library');
    }

    return response.json();
  },
};

export default libraryApi;
