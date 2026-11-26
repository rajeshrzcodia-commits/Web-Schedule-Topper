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
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.skip !== undefined) query.set('skip', String(params.skip));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiClient.get(`/api/results${qs}`);
};

/** List paginated scan and email event history. */
export const fetchHistory = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.skip !== undefined) query.set('skip', String(params.skip));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiClient.get(`/api/history${qs}`);
};

/** Permanently delete down scan records and their linked email logs. */
export const deleteDownResult = (id) => apiClient.delete(`/api/results/${id}`);
export const clearDownResults = () => apiClient.delete('/api/results/down');

/** Get the latest result per monitored URL. */
export const fetchLatestResults = () => apiClient.get('/api/results/latest');

// ---------------------------------------------------------------------------
// Scan control
// ---------------------------------------------------------------------------

/** Trigger a manual scan cycle (returns 202 immediately; scan runs async). */
export const triggerScan = () => apiClient.post('/api/scan');

/** Get current scan status (running / interval cron). */
export const getScanStatus = () => apiClient.get('/api/scan/status');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Register a new user (email/password). */
export const registerUser = (payload) => apiClient.post('/api/auth/register', payload);

/** Login with email/password. */
export const loginUser = (payload) => apiClient.post('/api/auth/login', payload);

/** Login with Google ID token (credential). */
export const loginWithGoogle = (payload) => apiClient.post('/api/auth/google', payload);

/** Get current authenticated user (protected). */
export const fetchCurrentUser = () => apiClient.get('/api/auth/me');

/** Update user profile (protected). */
export const updateUserProfile = (payload) => apiClient.put('/api/auth/profile', payload);

/** Logout (clears session on server). */
export const logoutUser = () => apiClient.post('/api/auth/logout');
