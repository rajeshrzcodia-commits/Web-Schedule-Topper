/**
 * API endpoints for the Web Schedule Topper frontend.
 *
 * Each function returns a promise that resolves to the parsed JSON body
 * or rejects with an ApiError (see src/api/client.js).
 *
 * Paths are relative to API_BASE_URL. In development API_BASE_URL is empty
 * and Vite's proxy forwards /api and /health to the backend. In production
 * set VITE_API_BASE_URL to your backend origin.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Health / readiness
// ---------------------------------------------------------------------------

/** Liveness probe (always 200 when backend is up). */
export const fetchLiveness = () => apiClient.get('/health/live');

/** Readiness probe (200 if DB connected, 503 if degraded). */
export const fetchReadiness = () => apiClient.get('/health');

// ---------------------------------------------------------------------------
// Targets / schedules
// ---------------------------------------------------------------------------

/** List distinct monitored URLs. */
export const fetchTargets = () => apiClient.get('/api/targets');

/** Create a new monitoring target/schedule. */
export const createTarget = (payload) => apiClient.post('/api/targets', payload);

/** Update an existing target/schedule (partial fields). */
export const updateTarget = (id, payload) => apiClient.put(`/api/targets/${id}`, payload);

/** Delete a target/schedule by ID. */
export const deleteTarget = (id) => apiClient.delete(`/api/targets/${id}`);

// ---------------------------------------------------------------------------
// Scan results
// ---------------------------------------------------------------------------

/**
 * List scan results.
 * @param {Object} params
 * @param {string} [params.url]   Filter by target URL
 * @param {number} [params.limit] Max number of results (clamped by backend)
 */
export const fetchResults = (params = {}) => {
  const query = new URLSearchParams();
  if (params.url) query.set('url', params.url);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiClient.get(`/api/results${qs}`);
};

/** Get the latest result per monitored URL. */
export const fetchLatestResults = () => apiClient.get('/api/results/latest');

// ---------------------------------------------------------------------------
// Scan control
// ---------------------------------------------------------------------------

/** Trigger a manual scan cycle (returns 202 immediately; scan runs async). */
export const triggerScan = () => apiClient.post('/api/scan');

/** Get current scan status (running / interval cron). */
export const getScanStatus = () => apiClient.get('/api/scan/status');