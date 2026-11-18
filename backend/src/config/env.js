require('dotenv').config();

const warnMissing = (name) => {
  console.warn(`[env] Warning: ${name} is not set.`);
};

const getString = (name) => {
  const value = process.env[name];
  if (!value) {
    warnMissing(name);
  }
  return value;
};

const getNumber = (name) => {
  const raw = process.env[name];
  if (!raw) {
    warnMissing(name);
    return undefined;
  }
  const value = parseInt(raw, 10);
  if (Number.isNaN(value)) {
    warnMissing(name);
    return undefined;
  }
  return value;
};

const getBoolean = (name) => {
  const raw = process.env[name];
  if (!raw) {
    warnMissing(name);
    return undefined;
  }
  return ['true', '1', 'yes'].includes(String(raw).toLowerCase());
};

const config = {
  nodeEnv: getString('NODE_ENV'),
  port: getNumber('PORT'),
  logLevel: getString('LOG_LEVEL'),

  apiKey: getString('API_KEY'),

  mongodb: {
    uri: getString('MONGODB_URI'),
  },

  googleSheet: {
    csvUrl: getString('GOOGLE_SHEET_CSV_URL'),
  },

  scan: {
    intervalCron: getString('SCAN_INTERVAL_CRON'),
    timeoutMs: getNumber('SCAN_TIMEOUT_MS'),
    maxRetries: getNumber('MAX_RETRIES'),
    consecutiveFailureThreshold: getNumber('CONSECUTIVE_FAILURES_THRESHOLD'),
    concurrency: getNumber('SCAN_CONCURRENCY'),
    retentionDays: getNumber('SCAN_RETENTION_DAYS'),
  },

  smtp: {
    host: getString('SMTP_HOST'),
    port: getNumber('SMTP_PORT'),
    secure: getBoolean('SMTP_SECURE'),
    user: getString('SMTP_USER'),
    pass: getString('SMTP_PASS'),
    from: getString('ALERT_FROM'),
    to: getString('ALERT_TO'),
  },

  ecomm: {
    privateKeyPath: getString('ECOMM_PRIVATE_KEY_PATH'),
    privateKeyEnv: getString('ECOMM_PRIVATE_KEY'),
  },
};

// Production guard: API_KEY is required to protect API routes when running in production.
if (config.nodeEnv === 'production' && !config.apiKey) {
  const error = new Error(
    '[env] FATAL: API_KEY is not set in production mode. Refusing to start.'
  );
  console.error(error.message);
  throw error;
}

module.exports = { config };
