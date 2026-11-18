/**
 * API configuration constants loaded from Vite environment variables.
 *
 * Vite exposes variables prefixed with VITE_ to the client code.
 * Values are baked in at build time; for runtime configuration use a proxy
 * or a runtime config endpoint instead.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const REQUEST_TIMEOUT = parseInt(
  import.meta.env.VITE_REQUEST_TIMEOUT || '15000',
  10
);

export const API_KEY = import.meta.env.VITE_API_KEY || '';

export const isProduction = import.meta.env.PROD === 'true';