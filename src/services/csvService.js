/**
 * csvService.js
 * Fetches target URLs from a publicly shared Google Sheet via its CSV export
 * URL and parses the rows into clean JSON objects using csv-parser.
 *
 * Expected sheet columns (minimum): url
 * Recommended columns: name, url, expectedStatusCode
 */

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const csv = require('csv-parser');
const { createLogger } = require('../config/logger');

const logger = createLogger('csv');

/**
 * Dedicated client so the CSV fetch has its own retry policy and is not
 * affected by the uptime check configuration.
 */
const client = axios.create({
  headers: {
    Accept: 'text/csv, application/csv, */*',
    'User-Agent': 'uptime-monitor/1.0',
  },
  timeout: 15000,
});

axiosRetry(client, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error),
});

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Validate a target URL and return a canonical form.
 * @param {string} rawUrl
 * @returns {{valid: boolean, url: string, reason: string}}
 */
const validateTargetUrl = (rawUrl) => {
  // Detect an explicit scheme first so unsupported protocols are rejected
  // instead of being rewritten into a bogus http URL.
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rawUrl);
  let candidate;

  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return {
        valid: false,
        url: '',
        reason: `unsupported protocol "${scheme}:" (only http and https are allowed)`,
      };
    }
    candidate = rawUrl;
  } else {
    candidate = `http://${rawUrl}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    return { valid: false, url: '', reason: `not a valid URL (${error.message})` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      url: '',
      reason: `unsupported protocol "${parsed.protocol}" (only http/https are allowed)`,
    };
  }

  if (!parsed.hostname) {
    return { valid: false, url: '', reason: 'missing hostname' };
  }

  // Single-label hosts (e.g. a Docker service name) are allowed, but they are
  // almost always typos, so warn about them.
  const isSingleLabel =
    !parsed.hostname.includes('.') &&
    parsed.hostname !== 'localhost' &&
    !IPV4_PATTERN.test(parsed.hostname) &&
    !parsed.hostname.includes(':');

  return {
    valid: true,
    // Return the scheme-qualified URL so the HTTP client can always use it.
    url: candidate,
    reason: isSingleLabel
      ? `hostname "${parsed.hostname}" has no domain suffix`
      : '',
  };
};

/**
 * Normalize a parsed CSV row into a clean target object.
 * @param {Object} row - Raw csv-parser row object.
 * @returns {Object|null} { name, url, expectedStatusCode }
 */
const normalizeRow = (row) => {
  const keys = Object.keys(row || {});
  const get = (candidates) => {
    for (const c of candidates) {
      const match = keys.find(
        (k) => String(k).trim().toLowerCase() === String(c).trim().toLowerCase()
      );
      if (match) return String(row[match] || '').trim();
    }
    return '';
  };

  const url = get(['url', 'target_url', 'target', 'endpoint']);
  const name = get(['name', 'target_name', 'label', 'description']);
  const expectedStatusCodeRaw = get([
    'expected_status_code',
    'expectedstatuscode',
    'status_code',
  ]);
  const expectedStatusCode = expectedStatusCodeRaw
    ? parseInt(expectedStatusCodeRaw, 10)
    : undefined;

  if (!url) {
    return null; // Skip rows without a URL.
  }

  const validation = validateTargetUrl(url);
  if (!validation.valid) {
    logger.warn(`Skipping row "${name || url}": ${validation.reason}.`);
    return null;
  }
  if (validation.reason) {
    logger.warn(`Target "${url}": ${validation.reason}.`);
  }

  return {
    name,
    url: validation.url,
    expectedStatusCode: Number.isNaN(expectedStatusCode)
      ? undefined
      : expectedStatusCode,
  };
};

/**
 * Fetch and parse the Google Sheet CSV into an array of target objects.
 * @param {string} csvUrl - Google Sheet /export?format=csv URL.
 * @param {number} timeoutMs - Request timeout in ms.
 * @returns {Promise<Array<{name, url, expectedStatusCode?}>>}
 */
const fetchTargetsFromCsv = async (csvUrl, timeoutMs = 15000) => {
  if (!csvUrl || !String(csvUrl).trim()) {
    throw new Error(
      'GOOGLE_SHEET_CSV_URL is not configured. Set it to a published Google Sheet CSV export URL.'
    );
  }

  const response = await client.get(csvUrl, {
    responseType: 'stream',
    timeout: timeoutMs,
  });

  const contentType = String(response.headers['content-type'] || '');
  if (contentType && !/csv|text\/plain/i.test(contentType)) {
    throw new Error(
      `The CSV URL did not return CSV data (content-type: ${contentType}). Check that the sheet is shared publicly and the URL points to /export?format=csv.`
    );
  }

  const targets = [];

  return new Promise((resolve, reject) => {
    response.data
      .pipe(csv())
      .on('data', (row) => {
        const normalized = normalizeRow(row);
        if (normalized) {
          targets.push(normalized);
        }
      })
      .on('end', () => {
        // Deduplicate by URL (keep first occurrence).
        const seen = new Set();
        const unique = targets.filter((t) => {
          if (seen.has(t.url)) return false;
          seen.add(t.url);
          return true;
        });
        resolve(unique);
      })
      .on('error', reject);
  });
};

module.exports = { fetchTargetsFromCsv, normalizeRow, validateTargetUrl };
