





const express = require('express');
const router = express.Router();
const ScanResult = require('../models/ScanResult');
const { isDbConnected } = require('../config/mongoose');
const { config } = require('../config/env');
const { triggerManualScan, isRunning } = require('../services/scheduler');

const MAX_RESULT_LIMIT = 1000;
const DEFAULT_RESULT_LIMIT = 100;






const sendError = (res, error) => {
  res.status(500).json({
    error:
      config.nodeEnv === 'production' ? 'Internal server error' : error.message,
  });
};






const clampLimit = (raw) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RESULT_LIMIT;
  return Math.min(parsed, MAX_RESULT_LIMIT);
};

router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

router.get('/health', (req, res) => {
  const dbReady = isDbConnected();
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbReady ? 'connected' : 'disconnected',
  });
});

router.get('/api/targets', async (req, res) => {
  try {
    const targets = await ScanResult.distinct('url');
    res.json({ targets });
  } catch (error) {
    sendError(res, error);
  }
});

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

router.get('/api/results/latest', async (req, res) => {
  try {
    const results = await ScanResult.getLatestPerUrl();
    res.json({ count: results.length, results });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/scan', (req, res) => {
  if (isRunning()) {
    return res
      .status(409)
      .json({ error: 'A scan cycle is already running.' });
  }

  triggerManualScan(config).catch((error) => {
        console.error('[api] Manual scan failed:', error.message);
  });

  return res.status(202).json({ status: 'scan triggered' });
});

router.post('/api/cron', (req, res) => {
  // Only allow invocations from Vercel Cron.
  if (req.get('x-vercel-cron') !== '1') {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }

  if (isRunning()) {
    return res.status(409).json({ error: 'A scan cycle is already running.' });
  }

  triggerManualScan(config).catch((error) => {
    console.error('[cron] Scan cycle failed:', error.message);
  });

  return res.status(202).json({ status: 'cron scan triggered' });
});

router.get('/api/scan/status', (req, res) => {
  res.json({
    running: isRunning(),
    intervalCron: config.scan.intervalCron,
  });
});

module.exports = router;
