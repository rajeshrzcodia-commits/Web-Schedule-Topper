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

const stateCache = new Map();

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
      if (isDown && consecutiveFailures === threshold) return 'threshold';
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

const runScanCycle = async (config) => {
  if (isRunning) {
    logger.warn('Scan cycle already running; skipping this tick.');
    return;
  }
  isRunning = true;

  try {
    logger.info('Starting scan cycle...');

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
