const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const csv = require('csv-parser');
const { createLogger } = require('../config/logger');

const logger = createLogger('csv');

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

const validateTargetUrl = (rawUrl) => {
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

      const isSingleLabel =
    !parsed.hostname.includes('.') &&
    parsed.hostname !== 'localhost' &&
    !IPV4_PATTERN.test(parsed.hostname) &&
    !parsed.hostname.includes(':');

  return {
    valid: true,
        url: candidate,
    reason: isSingleLabel
      ? `hostname "${parsed.hostname}" has no domain suffix`
      : '',
  };
};

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
    return null; 
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
