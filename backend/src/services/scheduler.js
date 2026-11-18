const schedule = require('node-schedule');
const ScanResult = require('../models/ScanResult');
const Target = require('../models/Target');
const { isDbConnected } = require('../config/mongoose');
const { createLogger } = require('../config/logger');
const { fetchTargetsFromCsv } = require('./csvService');
const { checkTargets } = require('./uptimeService');
const { sendAlert } = require('./emailService');

const logger = createLogger('scheduler');

let scheduledJob = null;
let isRunning = false;

const stateCache = new Map();

const FREQUENCY_MINUTES = {
  'Every 15 Mins': 15,
  'Every 30 Mins': 30,
  'Every Hour': 60,
  'Every 6 Hours': 360,
  'Every 12 Hours': 720,
  Daily: 1440,
};

const DEFAULT_FREQUENCY_MINUTES = 1440; // Daily

const parseScheduleTime = (scheduleTime = '00:00') => {
  const match = String(scheduleTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 0, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, parseInt(match[1], 10))),
    minute: Math.min(59, Math.max(0, parseInt(match[2], 10))),
  };
};

const isTargetDue = (target, now) => {
  const intervalMinutes =
    FREQUENCY_MINUTES[target.frequency] !== undefined
      ? FREQUENCY_MINUTES[target.frequency]
      : DEFAULT_FREQUENCY_MINUTES;
  const { hour, minute } = parseScheduleTime(target.scheduleTime);
  const last = stateCache.get(target.url);
  const lastScanTime = last ? new Date(last.timestamp) : null;

  // Never scanned before: always due on first run.
  if (!lastScanTime) return true;

  const intervalMs = intervalMinutes * 60 * 1000;
  let nextDue = new Date(lastScanTime.getTime() + intervalMs);

  // Respect the configured time of day: never run before today's scheduleTime.
  const todayScheduled = new Date(now);
  todayScheduled.setHours(hour, minute, 0, 0);
  if (nextDue < todayScheduled) nextDue = todayScheduled;

  return now >= nextDue;
};

// Cooldown to prevent threshold-alert spam while still re-alerting at/above threshold.
const ALERT_THRESHOLD_COOLDOWN_MS = 15 * 60 * 1000;
const thresholdAlertTimestamps = new Map();

const pickNewer = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const aTime = new Date(a.timestamp || 0).getTime();
  const bTime = new Date(b.timestamp || 0).getTime();
  return aTime >= bTime ? a : b;
};

const getPreviousState = async (url) => {
  if (isDbConnected()) {
    try {
      const doc = await ScanResult.getLastResult(url);
      return pickNewer(doc, stateCache.get(url));
    } catch (error) {
      logger.warn(
        `Could not read previous state for ${url} from MongoDB (${error.message}); using in-memory state.`
      );
    }
  }
  return stateCache.get(url) || null;
};

const computeConsecutiveFailures = (previousState, status) => {
  if (!previousState) return status === 'down' ? 1 : 0;
  if (status === 'down') return (previousState.consecutiveFailures || 0) + 1;
  return 0; 
};

const determineAlertType = (
  result,
  previousResult,
  consecutiveFailures,
  threshold
) => {
  const wasUp = !previousResult || previousResult.status === 'up';
  const isDown = result.status === 'down';

    if (wasUp && isDown) return 'down';
    if (!wasUp && !isDown) return 'recovered';
      if (isDown && consecutiveFailures >= threshold) return 'threshold';
  return null;
};

const persistResult = async (result, consecutiveFailures) => {
  if (!isDbConnected()) {
    logger.warn(
      'MongoDB is unavailable; skipping persistence for this result. Alerts are still delivered.'
    );
    return;
  }
  try {
    const scanDoc = new ScanResult({
      url: result.url,
      name: result.name,
      status: result.status,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
      consecutiveFailures,
    });
    await scanDoc.save();
  } catch (error) {
    logger.warn(
      `Could not persist scan result for ${result.url}: ${error.message}`
    );
  }
};

const runScanCycle = async (config, options = {}) => {
  const { manual = false } = options;

  if (isRunning) {
    logger.warn('Scan cycle already running; skipping this tick.');
    return;
  }
  isRunning = true;

  try {
    logger.info('Starting scan cycle...');

    let csvTargets = [];
    let csvError = null;

        if (!config.googleSheet || !config.googleSheet.csvUrl) {
      logger.warn(
        'GOOGLE_SHEET_CSV_URL is not configured. The cycle will continue with database targets only.'
      );
    } else {
      try {
        csvTargets = await fetchTargetsFromCsv(config.googleSheet.csvUrl, config.scan.timeoutMs || 15000);
        logger.info(`Fetched ${csvTargets.length} target(s) from CSV.`);
      } catch (error) {
        csvError = error.message;
        logger.error(`Could not fetch targets from the CSV: ${csvError}`);
      }
    }

    // --- Fetch active targets from the Target/Schedule database collection ---
    let dbTargets = [];
    try {
      const activeTargets = await Target.find({ active: true }).lean();
      dbTargets = activeTargets.map((t) => ({
        url: t.url,
        name: t.name || '',
        expectedStatusCode: t.expectedStatusCode,
        alertEmail: t.alertEmail || '',
        scheduleTime: t.scheduleTime || '00:00',
        frequency: t.frequency || '',
        _id: t._id.toString(),
      }));
      logger.info(`Fetched ${dbTargets.length} active target(s) from database.`);
    } catch (error) {
      logger.warn(`Could not fetch active targets from database: ${error.message}`);
    }

    // --- Combine CSV and database targets, deduplicating by URL ---
    const allTargets = [...csvTargets, ...dbTargets];
    const seen = new Set();
    const uniqueTargets = allTargets.filter((t) => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    });

    if (uniqueTargets.length === 0) {
      if (csvError) {
        logger.warn('No valid targets found in CSV and no active database targets; nothing to scan.');
      } else {
        logger.warn('No valid targets found in CSV; nothing to scan.');
      }
      return;
    }

    const now = new Date();
    const targets = manual
      ? uniqueTargets
      : uniqueTargets.filter((t) => isTargetDue(t, now));

        const results = await checkTargets(targets, {
      timeoutMs: config.scan.timeoutMs,
      maxRetries: config.scan.maxRetries,
      concurrency: config.scan.concurrency,
    });
    logger.info(`Completed ${results.length} uptime check(s).`);

    const threshold = config.scan.consecutiveFailureThreshold;

        for (const result of results) {
      try {
        const previousResult = await getPreviousState(result.url);
        const consecutiveFailures = computeConsecutiveFailures(
          previousResult,
          result.status
        );

        await persistResult(result, consecutiveFailures);

                stateCache.set(result.url, {
          status: result.status,
          consecutiveFailures,
          timestamp: new Date(),
        });

        const alertType = determineAlertType(
          result,
          previousResult,
          consecutiveFailures,
          threshold
        );

        let shouldSendAlert = true;
        if (alertType === 'threshold') {
          const nowMs = Date.now();
          const lastSent = thresholdAlertTimestamps.get(result.url) || 0;
          if (nowMs - lastSent < ALERT_THRESHOLD_COOLDOWN_MS) {
            shouldSendAlert = false;
          } else {
            thresholdAlertTimestamps.set(result.url, nowMs);
          }
        }

        if (alertType && shouldSendAlert) {
          try {
            // Per-target alert email falls back to the global SMTP ALERT_TO when omitted.
            const targetAlertEmail = result.alertEmail || config.smtp.to;
            const targetSmtpConfig = { ...config.smtp, to: targetAlertEmail };

            await sendAlert(targetSmtpConfig, {
              type: alertType,
              target: result,
              result,
              previousResult,
              consecutiveFailures,
            });
            logger.info(
              `Alert sent (${alertType}) for ${result.name || result.url}`
            );
          } catch (error) {
                        logger.error(
              `Failed to send "${alertType}" alert for ${
                result.name || result.url
              }: ${error.message}`
            );
          }
        }
      } catch (error) {
                logger.error(
          `Error while processing ${result.url}: ${error.message}`
        );
      }
    }

    logger.info('Scan cycle completed.');
  } catch (error) {
    logger.error(`Scan cycle failed: ${error.message}`);
  } finally {
    isRunning = false;
  }
};

const startScheduler = (config) => {
  if (scheduledJob) {
    logger.warn('Scheduler already running.');
    return scheduledJob;
  }

  if (!config.googleSheet || !config.googleSheet.csvUrl) {
    logger.error(
      'GOOGLE_SHEET_CSV_URL is not configured. The scheduler will start but every cycle will be skipped until it is set.'
    );
  }
  if (!config.smtp || !config.smtp.user || !config.smtp.pass) {
    logger.warn(
      'SMTP_USER / SMTP_PASS are not configured. Email alerts are disabled until they are set.'
    );
  }

    runScanCycle(config);

  scheduledJob = schedule.scheduleJob(
    config.scan.intervalCron,
    () => runScanCycle(config)
  );

  if (!scheduledJob) {
    logger.error(
      `Invalid cron expression "${config.scan.intervalCron}". The scheduler was not started.`
    );
    return null;
  }

  logger.info(
    `Scheduler started with cron: ${config.scan.intervalCron}`
  );
  return scheduledJob;
};

const stopScheduler = () => {
  if (scheduledJob) {
    scheduledJob.cancel();
    scheduledJob = null;
    logger.info('Scheduler stopped.');
  }
};

const triggerManualScan = (config) => {
  return runScanCycle(config, { manual: true });
};

module.exports = {
  startScheduler,
  stopScheduler,
  triggerManualScan,
  runScanCycle,
  determineAlertType,
  computeConsecutiveFailures,
  isRunning: () => isRunning,
  getStateCache: () => stateCache,
};
