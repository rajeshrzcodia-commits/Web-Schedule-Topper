const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ScanResult = require('../models/ScanResult');
const Target = require('../models/Target');
const { isDbConnected } = require('../config/mongoose');
const { config } = require('../config/env');
const { triggerManualScan, isRunning } = require('../services/scheduler');
const { validateTargetUrl } = require('../services/csvService');

const MAX_RESULT_LIMIT = 1000;
const DEFAULT_RESULT_LIMIT = 100;

const sendError = (res, status, message) => {
  const errorMessage =
    config.nodeEnv === 'production' && status === 500
      ? 'Internal server error'
      : message || 'Internal server error';

  res.status(status).json({ error: errorMessage });
};

const clampLimit = (raw) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RESULT_LIMIT;
  return Math.min(parsed, MAX_RESULT_LIMIT);
};

router.get('/', (req, res) => {
  res.status(200).json({
    service: 'Web Schedule Topper Backend',
    status: 'running',
    endpoints: {
      health: '/health',
      live: '/health/live',
      targets: '/api/targets',
      results: '/api/results',
      latest: '/api/results/latest',
      triggerScan: 'POST /api/scan',
      cron: 'POST /api/cron (requires x-vercel-cron: 1 header)',
      scanStatus: '/api/scan/status',
    },
  });
});

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
    const targets = await Target.find().sort({ createdAt: -1 }).lean();
    res.json({ count: targets.length, targets });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.get('/api/targets/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'Invalid target ID');
    }
    const target = await Target.findById(req.params.id).lean();
    if (!target) {
      return sendError(res, 404, 'Target not found');
    }
    res.json({ target });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.post('/api/targets', async (req, res) => {
  try {
    const { url, name, scheduleTime, frequency, alertEmail, expectedStatusCode, active } = req.body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return sendError(res, 400, 'URL is required');
    }

    const validation = validateTargetUrl(url);
    if (!validation.valid) {
      return sendError(res, 400, validation.reason || 'Invalid URL');
    }

    const derivedName = name && name.trim()
      ? name.trim()
      : validation.url
        ? new URL(validation.url).hostname || ''
        : '';

    const target = new Target({
      url: validation.url,
      name: derivedName,
      scheduleTime: scheduleTime && scheduleTime.trim() ? scheduleTime.trim() : '00:00',
      frequency: frequency && frequency.trim() ? frequency.trim() : '',
      alertEmail: alertEmail && alertEmail.trim() ? alertEmail.trim() : '',
      expectedStatusCode:
        expectedStatusCode !== undefined && expectedStatusCode !== null
          ? expectedStatusCode
          : 200,
      active: active !== undefined ? active : true,
    });

    await target.save();
    res.status(201).json({ target });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.put('/api/targets/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'Invalid target ID');
    }

    const { url, name, scheduleTime, frequency, alertEmail, expectedStatusCode, active } = req.body;
    const update = {};

    if (url !== undefined) {
      if (!url || typeof url !== 'string' || !url.trim()) {
        return sendError(res, 400, 'URL is required');
      }
      const validation = validateTargetUrl(url);
      if (!validation.valid) {
        return sendError(res, 400, validation.reason || 'Invalid URL');
      }
      update.url = validation.url;
      if (!name) {
        update.name = new URL(validation.url).hostname || '';
      }
    }

    if (name !== undefined) update.name = name.trim();
    if (scheduleTime !== undefined) update.scheduleTime = scheduleTime.trim() || '00:00';
    if (frequency !== undefined) update.frequency = frequency.trim();
    if (alertEmail !== undefined) update.alertEmail = alertEmail.trim();
    if (expectedStatusCode !== undefined) update.expectedStatusCode = expectedStatusCode;
    if (active !== undefined) update.active = active;

    const target = await Target.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!target) {
      return sendError(res, 404, 'Target not found');
    }
    res.json({ target });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.delete('/api/targets/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'Invalid target ID');
    }

    const target = await Target.findByIdAndDelete(req.params.id);
    if (!target) {
      return sendError(res, 404, 'Target not found');
    }
    res.json({ message: 'Target deleted', target });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.get('/api/results', async (req, res) => {
  try {
    const { url } = req.query;
    const limit = clampLimit(req.query.limit);
    const filter = url ? { url } : {};
    const results = await ScanResult.find(filter)
      .limit(limit)
      .lean();
    res.json({ count: results.length, results });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.get('/api/results/latest', async (req, res) => {
  try {
    const results = await ScanResult.getLatestPerUrl();
    res.json({ count: results.length, results });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.post('/api/scan', (req, res) => {
  if (isRunning()) {
    return res.status(409).json({ error: 'A scan cycle is already running.' });
  }

  triggerManualScan(config).catch((error) => {
    console.error('[api] Manual scan failed:', error.message);
  });

  return res.status(202).json({ status: 'scan triggered' });
});

router.post('/api/cron', (req, res) => {
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
