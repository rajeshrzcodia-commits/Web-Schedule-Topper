/**
 * uptimeService.js
 * Resilient HTTP/HTTPS uptime checks using axios + axios-retry.
 *
 * A dedicated axios instance is used so the uptime retry policy never leaks
 * into other HTTP consumers (for example the Google Sheet CSV fetch).
 *
 * Retry behaviour:
 *  - network errors and 5xx responses are retried with exponential backoff;
 *  - request timeouts are NOT retried, so a single target can never consume
 *    timeoutMs multiplied by the retry count.
 *
 * Targets are checked with bounded concurrency so a cycle finishes well
 * inside its cron interval.
 */

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { createLogger } = require('../config/logger');
const { config } = require('../config/env');

const logger = createLogger('uptime');

/**
 * Dedicated client. 5xx responses are rejected so axios-retry can treat them
 * as transient failures; every other status is resolved and evaluated here.
 */
const client = axios.create({
  headers: {
    'User-Agent': 'uptime-monitor/1.0',
    Accept: '*/*',
  },
  validateStatus: (status) => status < 500,
  maxRedirects: 5,
});

axiosRetry(client, {
  retries: config.scan.maxRetries,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Covers network errors and 5xx responses for idempotent methods.
    if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true;
    // Explicit 5xx check (defensive, in case a custom method is used).
    if (error.response && error.response.status >= 500) return true;
    return false;
  },
  shouldResetTimeout: true,
});

/**
 * Perform a single uptime check against a URL.
 * @param {string} url - Target URL.
 * @param {Object} options - { timeoutMs, maxRetries, expectedStatusCode }
 * @returns {Promise<{status, statusCode, responseTimeMs, error}>}
 */
const checkUrl = async (url, options = {}) => {
  const {
    timeoutMs = config.scan.timeoutMs,
    maxRetries = config.scan.maxRetries,
    expectedStatusCode,
  } = options;
  const startTime = process.hrtime.bigint();

  try {
    const response = await client.get(url, {
      timeout: timeoutMs,
      'axios-retry': { retries: maxRetries },
    });

    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1_000_000;
    const statusCode = response.status;

    // Determine up/down based on expected status code (default: 2xx).
    const isSuccess =
      expectedStatusCode !== undefined && expectedStatusCode !== null
        ? statusCode === expectedStatusCode
        : statusCode >= 200 && statusCode < 300;

    return {
      status: isSuccess ? 'up' : 'down',
      statusCode,
      responseTimeMs: Math.round(responseTimeMs),
      error: isSuccess ? null : `Unexpected status code: ${statusCode}`,
    };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1_000_000;
    const statusCode = error.response ? error.response.status : null;

    let message;
    if (statusCode !== null) {
      message = `Unexpected status code: ${statusCode}`;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      message = 'Request timed out';
    } else {
      message = error.message || 'Request failed';
    }

    return {
      status: 'down',
      statusCode,
      responseTimeMs: Math.round(responseTimeMs),
      error: message,
    };
  }
};

/**
 * Run uptime checks against an array of targets using bounded concurrency.
 * @param {Array<{name, url, expectedStatusCode?}>} targets
 * @param {Object} options - { timeoutMs, maxRetries, concurrency }
 * @returns {Promise<Array>} results in the same order as `targets`
 */
const checkTargets = async (targets, options = {}) => {
  const {
    timeoutMs = config.scan.timeoutMs,
    maxRetries = config.scan.maxRetries,
    concurrency = config.scan.concurrency,
  } = options;

  if (!Array.isArray(targets) || targets.length === 0) return [];

  const results = new Array(targets.length);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= targets.length) return;
      const target = targets[index];
      try {
        const check = await checkUrl(target.url, {
          timeoutMs,
          maxRetries,
          expectedStatusCode: target.expectedStatusCode,
        });
        // Keep the target identity (url, name, expectedStatusCode) alongside
        // the check outcome.
        results[index] = { ...target, ...check };
      } catch (error) {
        // checkUrl handles its own failures; this is a last-resort guard so a
        // single bad target cannot abort the whole cycle.
        logger.error(
          `Unexpected error while checking ${target.url}: ${error.message}`
        );
        results[index] = {
          ...target,
          status: 'down',
          statusCode: null,
          responseTimeMs: null,
          error: error.message || 'Request failed',
        };
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, targets.length));
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return results;
};

module.exports = { checkUrl, checkTargets };
