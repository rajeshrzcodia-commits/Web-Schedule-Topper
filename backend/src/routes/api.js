const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ScanResult = require('../models/ScanResult');
const EmailLog = require('../models/EmailLog');
const Target = require('../models/Target');
const { isDbConnected } = require('../config/mongoose');
const { config } = require('../config/env');
const { triggerManualScan, isRunning } = require('../services/scheduler');
const { validateTargetUrl } = require('../services/csvService');
const { createLogger } = require('../config/logger');
const { sendConfirmation } = require('../services/emailService');
const { requireAuth } = require('../middleware/authMiddleware');

const logger = createLogger('api');

const MAX_RESULT_LIMIT = 1000;
const DEFAULT_RESULT_LIMIT = 100;
const CONFIRMATION_EMAIL_TIMEOUT_MS = 20000;

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

router.get('/api/targets', requireAuth, async (req, res) => {
  try {
    const targets = await Target.find().sort({ createdAt: -1 }).lean();
    res.json({ count: targets.length, targets });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.get('/api/targets/:id', requireAuth, async (req, res) => {
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

router.post('/api/targets', requireAuth, async (req, res) => {
  try {
    const { url, name, scheduleTime, frequency, alertEmail, expectedStatusCode, active } = req.body;
    if (alertEmail !== undefined && alertEmail !== null && typeof alertEmail !== 'string') {
      return sendError(res, 400, 'alertEmail must be a string');
    }
    const targetAlertEmail = typeof alertEmail === 'string' ? alertEmail.trim() : '';
    if (targetAlertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetAlertEmail)) {
      return sendError(res, 400, 'alertEmail must be a valid email address');
    }

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
      alertEmail: targetAlertEmail,
      expectedStatusCode:
        expectedStatusCode !== undefined && expectedStatusCode !== null
          ? expectedStatusCode
          : 200,
      active: active !== undefined ? active : true,
    });

    await target.save();

    // Non-blocking initial scan so the new target shows live status
    // immediately on Live Monitor instead of "Not scanned yet".
    triggerManualScan(config).catch((scanErr) => {
      logger.error(`Initial scan failed for ${target.url}: ${scanErr.message}`);
    });

    const fallbackTo = config.smtp.to || '';
    const effectiveTo = targetAlertEmail || fallbackTo;

    const confirmationEmail = {
      status: effectiveTo ? 'failed' : 'skipped',
      to: effectiveTo,
      ...(effectiveTo ? {} : { error: 'No alert email was configured.' }),
    };

    if (effectiveTo) {
      const targetSmtpConfig = { ...config.smtp, to: effectiveTo };
      let timeoutId;
      try {
        await Promise.race([
          sendConfirmation(targetSmtpConfig, effectiveTo, target),
          new Promise((resolve, reject) => {
            timeoutId = setTimeout(
              () => reject(Object.assign(
                new Error('Confirmation email timed out.'),
                { code: 'ETIMEDOUT' }
              )),
              CONFIRMATION_EMAIL_TIMEOUT_MS
            );
          }),
        ]);
        confirmationEmail.status = 'sent';
        delete confirmationEmail.error;
      } catch (mailError) {
        let safeMessage = mailError.message || 'SMTP delivery failed.';
        for (const secret of [config.smtp.user, config.smtp.pass]) {
          if (secret) safeMessage = safeMessage.replaceAll(secret, '[REDACTED]');
        }
        confirmationEmail.error = safeMessage;
        logger.error(`Confirmation email failed for ${target.url}: ${safeMessage}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    res.status(201).json({ target, confirmationEmail });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.put('/api/targets/:id', requireAuth, async (req, res) => {
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

router.delete('/api/targets/:id', requireAuth, async (req, res) => {
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

router.get('/api/results', requireAuth, async (req, res) => {
  try {
    if (!isDbConnected()) return sendError(res, 503, 'Database is unavailable; scan results cannot be loaded.');
    const { url, status } = req.query;
    const limit = clampLimit(req.query.limit);
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const filter = {
      ...(url ? { url } : {}),
      ...(status ? { status } : {}),
    };
    if (status && !['up', 'down'].includes(status)) {
      return sendError(res, 400, 'status must be up or down');
    }
    const totalCount = await ScanResult.countDocuments(filter);
    const results = await ScanResult.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json({ count: results.length, totalCount, skip, limit, results });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.get('/api/history', requireAuth, async (req, res) => {
  try {
    if (!isDbConnected()) return sendError(res, 503, 'Database is unavailable; history cannot be loaded.');
    try {
      await EmailLog.createCollection();
    } catch (collectionError) {
      if (collectionError.codeName !== 'NamespaceExists') throw collectionError;
    }
    const limit = clampLimit(req.query.limit);
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const search = String(req.query.search || '').trim();
    const scanMatch = search
      ? { $or: ['name', 'url', 'error'].map((field) => ({ [field]: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) }
      : null;
    const emailMatch = search
      ? { $or: ['targetName', 'targetUrl', 'error', 'eventType', 'alertType', 'status'].map((field) => ({ [field]: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) }
      : null;
    const pipeline = [
      ...(scanMatch ? [{ $match: scanMatch }] : []),
      { $project: { _id: { $toString: '$_id' }, recordType: { $literal: 'scan' }, timestamp: 1, url: 1, name: 1, status: 1, statusCode: 1, responseTimeMs: 1, error: 1, errorMessage: '$error', consecutiveFailures: 1, eventType: { $literal: null }, emailStatus: { $literal: null }, alertType: { $literal: null }, recipientCount: { $literal: null } } },
      { $unionWith: { coll: EmailLog.collection.name, pipeline: [
        ...(emailMatch ? [{ $match: emailMatch }] : []),
        { $project: { _id: { $toString: '$_id' }, recordType: { $literal: 'email' }, timestamp: 1, url: '$targetUrl', name: '$targetName', status: '$status', statusCode: { $literal: null }, responseTimeMs: { $literal: null }, error: 1, errorMessage: '$error', consecutiveFailures: { $literal: null }, eventType: 1, emailStatus: '$status', alertType: 1, recipientCount: 1 } },
      ] } },
      { $sort: { timestamp: -1, _id: -1 } },
      { $facet: { entries: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } },
    ];
    const [page] = await ScanResult.aggregate(pipeline).allowDiskUse(true);
    const entries = page ? page.entries : [];
    const totalCount = page && page.total.length ? page.total[0].count : 0;
    res.json({ count: entries.length, totalCount, skip, limit, entries });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.delete('/api/results/down', requireAuth, async (req, res) => {
  try {
    if (!isDbConnected()) return sendError(res, 503, 'Database is unavailable; down logs were not cleared.');
    let deletedCount = 0;
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const downResults = await ScanResult.find({ status: 'down' })
            .select('_id')
            .session(session)
            .lean();
          const ids = downResults.map((result) => result._id);
          if (ids.length) await EmailLog.deleteMany({ scanResultId: { $in: ids } }, { session });
          const deletion = await ScanResult.deleteMany({ status: 'down' }, { session });
          deletedCount = deletion.deletedCount || 0;
        });
      } finally {
        await session.endSession();
      }
    } catch (txError) {
      // Fall back to non-transactional deletion when transactions are unsupported (e.g. standalone MongoDB).
      logger.warn(`Transactional down-logs clear failed, falling back to non-transactional delete: ${txError.message}`);
      try {
        const downResults = await ScanResult.find({ status: 'down' }).select('_id').lean();
        const ids = downResults.map((result) => result._id);
        if (ids.length) await EmailLog.deleteMany({ scanResultId: { $in: ids } });
        const deletion = await ScanResult.deleteMany({ status: 'down' });
        deletedCount = deletion.deletedCount || 0;
      } catch (fallbackError) {
        return sendError(res, 500, fallbackError.message || 'Failed to clear down logs from the database.');
      }
    }
    res.json({ message: 'Down logs cleared from the database.', deletedCount });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.delete('/api/results/:id', requireAuth, async (req, res) => {
  try {
    if (!isDbConnected()) return sendError(res, 503, 'Database is unavailable; the down log was not deleted.');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return sendError(res, 400, 'Invalid result ID');
    let notFound = false;
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const result = await ScanResult.findOne({ _id: req.params.id, status: 'down' })
            .session(session)
            .lean();
          if (!result) {
            notFound = true;
            return;
          }
          await EmailLog.deleteMany({ scanResultId: result._id }, { session });
          await ScanResult.deleteOne({ _id: result._id, status: 'down' }, { session });
        });
      } finally {
        await session.endSession();
      }
    } catch (txError) {
      // Fall back to non-transactional deletion when transactions are unsupported (e.g. standalone MongoDB).
      logger.warn(`Transactional down-log delete failed, falling back to non-transactional delete: ${txError.message}`);
      try {
        const result = await ScanResult.findOne({ _id: req.params.id, status: 'down' }).lean();
        if (!result) {
          notFound = true;
        } else {
          await EmailLog.deleteMany({ scanResultId: result._id });
          await ScanResult.deleteOne({ _id: result._id, status: 'down' });
        }
      } catch (fallbackError) {
        return sendError(res, 500, fallbackError.message || 'Failed to delete down log from the database.');
      }
    }
    if (notFound) return sendError(res, 404, 'Down log not found');
    res.json({ message: 'Down log deleted from the database.', deletedCount: 1 });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.get('/api/results/latest', requireAuth, async (req, res) => {
  try {
    const results = await ScanResult.getLatestPerUrl();
    res.json({ count: results.length, results });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

router.post('/api/scan', requireAuth, (req, res) => {
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

router.get('/api/scan/status', requireAuth, (req, res) => {
  res.json({
    running: isRunning(),
    intervalCron: config.scan.intervalCron,
  });
});

module.exports = router;
