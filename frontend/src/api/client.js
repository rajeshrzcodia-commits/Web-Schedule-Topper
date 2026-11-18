/**
 * apiClient - Foundational HTTP client for the Web Schedule Topper frontend.
 *
 * Built on native fetch (no extra dependency). Provides:
 *   - Automatic `x-api-key` header on every request
 *   - Request timeout via AbortController
 *   - Normalized error objects with code/status/message
 *   - Centralized 401 handling (clears session and redirects to login)
 *   - JSON request/response serialization
 */

import { API_BASE_URL, REQUEST_TIMEOUT, API_KEY } from '../config/api';

/**
 * ApiError - Normalized error thrown by the client.
 *
 * @property {number} status   HTTP status code (0 for network/timeout errors)
 * @property {string} code     Machine-readable error code
 * @property {string} message  Human-readable message safe to show to users
 */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Callback invoked when a 401 response is received.
 * Default implementation clears localStorage session and reloads to login.
 */
let onUnauthorized = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('wst_user');
  } catch {}
  // Redirect to login page; the router will handle the route.
  window.location.href = '/';
};

/**
 * Allows the app (e.g. DashboardLayout or Login) to register a custom
 * 401 handler instead of the default redirect.
 */
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

/**
 * Parse JSON body safely, returning {} on failure.
 */
const parseJson = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text ? { message: text } : {};
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
};

/**
 * Normalize a non-ok response into a structured error object.
 */
const normalizeError = async (response) => {
  const body = await parseJson(response);
  return {
    status: response.status,
    code: body.code || `HTTP_${response.status}`,
    message:
      body.error ||
      body.message ||
      `Request failed with status ${response.status}`,
  };
};

/**
 * Create a fetch-based API client scoped to a base URL.
 */
const createClient = () => {
  const request = async (input, init = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    };

    // Attach the API key on every request so backend apiKeyAuth middleware accepts it.
    if (API_KEY) {
      headers['x-api-key'] = API_KEY;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${input}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Centralized 401 handling: notify handler, then throw normalized error.
      if (response.status === 401) {
        onUnauthorized();
        const err = await normalizeError(response);
        throw new ApiError(err.message, err.status, err.code);
      }

      if (!response.ok) {
        const err = await normalizeError(response);
        throw new ApiError(err.message, err.status, err.code);
      }

      // 204 No Content or empty body
      if (
        response.status === 204 ||
        response.headers.get('content-length') === '0'
      ) {
        return null;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw normalized ApiError as-is
      if (error instanceof ApiError) {
        throw error;
      }

      // Request timeout
      if (error.name === 'AbortError') {
        throw new ApiError(
          'The request timed out. Please try again.',
          408,
          'TIMEOUT'
        );
      }

      // Network failure (DNS, refused connection, offline, CORS preflight failure, etc.)
      if (!error.status && !error.code) {
        throw new ApiError(
          'Unable to connect to the server. Please check your internet connection.',
          0,
          'NETWORK_ERROR'
        );
      }

      throw new ApiError(
        error.message || 'An unexpected error occurred.',
        500,
        'UNKNOWN_ERROR'
      );
    }
  };

  return {
    /** GET request */
    get: (path, init = {}) =>
      request(path, { ...init, method: 'GET' }),

    /** POST request with JSON body */
    post: (path, body, init = {}) =>
      request(path, {
        ...init,
        method: 'POST',
        body: JSON.stringify(body),
      }),

    /** PUT request with JSON body */
    put: (path, body, init = {}) =>
      request(path, {
        ...init,
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    /** DELETE request */
    delete: (path, init = {}) =>
      request(path, { ...init, method: 'DELETE' }),
  };
};

export const apiClient = createClient();