/**
 * scheduler.js
 * Orchestrates periodic scanning using node-schedule.
 * On each tick: fetch targets from Google Sheet CSV -> run uptime checks ->
 * compute consecutive failures -> persist results -> send email alerts.
 *
 * Persistence and alerting are deliberately independent: if MongoDB is
 * unavailable the cycle still runs and still sends alerts, using an in-memory
 * state cache to track consecutive failures. Persistence resumes automatically
 * once the database reconnects.
 */

const schedule = require('node-schedule');
const ScanResult = require('../models/ScanResult');
const { isDbConnected } = require('../config/mongoose');
const { createLogger } = require('../config/logger');
const { fetchTargetsFromCsv } = require('./csvService');
const { checkTargets } = require('./uptimeService');
const { sendAlert } = require('./emailService');

const logger = createLogger('scheduler');

let scheduledJob = null;
let isRunning = false;

/**
 * In-memory mirror of the last known state per URL. Used as a fallback when
 * MongoDB is unreachable so consecutive-failure counting and alerting keep
 * working.
 * @type {Map<string, {status: string, consecutiveFailures: number, timestamp: Date}>}
 */
const stateCache = new Map();

/**
 * Return whichever of the two states is more recent.
 * @param {Object|null} a
 * @param {Object|null} b
 * @returns {Object|null}
 */
const pickNewer = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const aTime = new Date(a.timestamp || 0).getTime();
  const bTime = new Date(b.timestamp || 0).getTime();
  return aTime >= bTime ? a : b;
};

/**
 * Read the previous state for a URL.
 * Falls back to the in-memory cache whenever MongoDB is unavailable.
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
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

/**
 * Compute consecutive failures from the previous state.
 * @param {Object|null} previousState
 * @param {string} status - 'up' or 'down' of current result.
 * @returns {number}
 */
const computeConsecutiveFailures = (previousState, status) => {
  if (!previousState) return status === 'down' ? 1 : 0;
  if (status === 'down') return (previousState.consecutiveFailures || 0) + 1;
  return 0; // Recovered: reset counter.
};

/**
 * Determine the alert type for a single result.
 * @param {Object} result
 * @param {Object|null} previousResult
 * @param {number} consecutiveFailures
 * @param {number} threshold
 * @returns {string|null} 'down' | 'threshold' | 'recovered' | null
 */
const determineAlertType = (
  result,
  previousResult,
  consecutiveFailures,
  threshold
) => {
  const wasUp = !previousResult || previousResult.status === 'up';
  const isDown = result.status === 'down';

  // Transition: up -> down
  if (wasUp && isDown) return 'down';
  // Transition: down -> up (recovery)
  if (!wasUp && !isDown) return 'recovered';
  // Threshold crossed while still down. Fires exactly once, when the counter
  // reaches the configured threshold.
  if (isDown && consecutiveFailures === threshold) return 'threshold';
  return null;
};

/**
 * Persist a single scan result. Never throws.
 * @param {Object} result
 * @param {number} consecutiveFailures
 */
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

/**
 * Execute one full scanning cycle.
 * @param {Object} config
 * @returns {Promise<void>}
 */
const runScanCycle = async (config) => {
  if (isRunning) {
    logger.warn('Scan cycle already running; skipping this tick.');
    return;
  }
  isRunning = true;

  try {
    logger.info('Starting scan cycle...');

    // 1. Fetch targets from Google Sheet CSV.
    if (!config.googleSheet || !config.googleSheet.csvUrl) {
      logger.error(
        'GOOGLE_SHEET_CSV_URL is not configured. Set it to a published Google Sheet CSV export URL. Skipping this cycle.'
      );
      return;
    }

    let targets;
    try {
      targets = await fetchTargetsFromCsv(config.googleSheet.csvUrl, 15000);
    } catch (error) {
      logger.error(`Could not fetch targets from the CSV: ${error.message}`);
      return;
    }
    logger.info(`Fetched ${targets.length} target(s) from CSV.`);

    if (targets.length === 0) {
      logger.warn('No valid targets found in CSV; nothing to scan.');
      return;
    }

    // 2. Run uptime checks against all targets.
    const results = await checkTargets(targets, {
      timeoutMs: config.scan.timeoutMs,
      maxRetries: config.scan.maxRetries,
      concurrency: config.scan.concurrency,
    });
    logger.info(`Completed ${results.length} uptime check(s).`);

    const threshold = config.scan.consecutiveFailureThreshold;

    // 3. Persist results and send alerts.
    for (const result of results) {
      try {
        const previousResult = await getPreviousState(result.url);
        const consecutiveFailures = computeConsecutiveFailures(
          previousResult,
          result.status
        );

        await persistResult(result, consecutiveFailures);

        // Always update the in-memory state, even if persistence failed.
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

        if (alertType) {
          try {
            await sendAlert(config.smtp, {
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
            // A failed email must never stop the remaining targets.
            logger.error(
              `Failed to send "${alertType}" alert for ${
                result.name || result.url
              }: ${error.message}`
            );
          }
        }
      } catch (error) {
        // A failure on one target must never abort the whole cycle.
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

/**
 * Start the scheduled scanning job.
 * @param {Object} config
 * @returns {Object|null} job reference
 */
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

  // Run one cycle immediately on startup, then on the cron schedule.
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

/**
 * Stop the scheduled scanning job.
 */
const stopScheduler = () => {
  if (scheduledJob) {
    scheduledJob.cancel();
    scheduledJob = null;
    logger.info('Scheduler stopped.');
  }
};

/**
 * Trigger a manual on-demand scan cycle.
 * @param {Object} config
 * @returns {Promise<void>}
 */
const triggerManualScan = (config) => {
  return runScanCycle(config);
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
