const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { createLogger } = require('../config/logger');
const { config } = require('../config/env');

const logger = createLogger('uptime');

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
        if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true;
        if (error.response && error.response.status >= 500) return true;
    return false;
  },
  shouldResetTimeout: true,
});

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
                        results[index] = { ...target, ...check };
      } catch (error) {
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
