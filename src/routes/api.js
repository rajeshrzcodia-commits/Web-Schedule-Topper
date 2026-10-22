/**
 * api.js
 * Express routes for health checks, target listing, scan results, and
 * on-demand scan triggering.
 */

const express = require('express');
const router = express.Router();
const ScanResult = require('../models/ScanResult');
const { isDbConnected } = require('../config/mongoose');
const { config } = require('../config/env');
const { triggerManualScan, isRunning } = require('../services/scheduler');

const MAX_RESULT_LIMIT = 1000;
const DEFAULT_RESULT_LIMIT = 100;

/**
 * Send an error response without leaking internal details in production.
 * @param {Object} res
 * @param {Error} error
 */
const sendError = (res, error) => {
  res.status(500).json({
    error:
      config.nodeEnv === 'production' ? 'Internal server error' : error.message,
  });
};

/**
 * Clamp a user supplied limit into a safe range.
 * @param {*} raw
 * @returns {number}
 */
const clampLimit = (raw) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RESULT_LIMIT;
  return Math.min(parsed, MAX_RESULT_LIMIT);
};

// GET /health/live - liveness probe. Always 200 while the process is running.
router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// GET /health - readiness probe. 503 when MongoDB is not connected, so the
// container is not reported healthy while results cannot be persisted.
router.get('/health', (req, res) => {
  const dbReady = isDbConnected();
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbReady ? 'connected' : 'disconnected',
  });
});

// GET /api/targets - return the distinct monitored target URLs.
router.get('/api/targets', async (req, res) => {
  try {
    const targets = await ScanResult.distinct('url');
    res.json({ targets });
  } catch (error) {
    sendError(res, error);
  }
});

// GET /api/results - return recent scan results.
// Query: ?url=<url>&limit=<n>
router.get('/api/results', async (req, res) => {
  try {
    const { url } = req.query;
    const limit = clampLimit(req.query.limit);
    const filter = url ? { url } : {};
    const results = await ScanResult.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json({ count: results.length, results });
  } catch (error) {
    sendError(res, error);
  }
});

// GET /api/results/latest - return the latest result per distinct URL.
router.get('/api/results/latest', async (req, res) => {
  try {
    const results = await ScanResult.getLatestPerUrl();
    res.json({ count: results.length, results });
  } catch (error) {
    sendError(res, error);
  }
});

// POST /api/scan - trigger an on-demand scan cycle. Returns immediately; the
// cycle runs in the background so the request never times out.
router.post('/api/scan', (req, res) => {
  if (isRunning()) {
    return res
      .status(409)
      .json({ error: 'A scan cycle is already running.' });
  }

  triggerManualScan(config).catch((error) => {
    // runScanCycle handles its own errors; this is a safety net.
    console.error('[api] Manual scan failed:', error.message);
  });

  return res.status(202).json({ status: 'scan triggered' });
});

// GET /api/scan/status - scan scheduler status.
router.get('/api/scan/status', (req, res) => {
  res.json({
    running: isRunning(),
    intervalCron: config.scan.intervalCron,
  });
});

module.exports = router;
