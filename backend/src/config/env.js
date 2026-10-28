require('dotenv').config();

const warnMissing = (name) => {
  console.warn(`[env] Warning: ${name} is not set. Using default.`);
};

const getString = (name, fallback) => {
  const value = process.env[name];
  if (!value) {
    warnMissing(name);
    return fallback;
  }
  return value;
};

const getNumber = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) {
    warnMissing(name);
    return fallback;
  }
  const value = parseInt(raw, 10);
  if (Number.isNaN(value)) {
    warnMissing(name);
    return fallback;
  }
  return value;
};

const getBoolean = (name, fallback = false) => {
  const raw = process.env[name];
  if (!raw) {
    warnMissing(name);
    return fallback;
  }
  return ['true', '1', 'yes'].includes(String(raw).toLowerCase());
};

const config = {
  nodeEnv: getString('NODE_ENV', 'development'),
  port: getNumber('PORT', 3001),
  logLevel: getString('LOG_LEVEL', 'info'),

    apiKey: getString('API_KEY', ''),

  mongodb: {
    uri: getString('MONGODB_URI', 'mongodb://localhost:27017/monitoring_db'),
  },

  googleSheet: {
    csvUrl: getString('GOOGLE_SHEET_CSV_URL', ''),
  },

  scan: {
    intervalCron: getString('SCAN_INTERVAL_CRON', '0 */2 * * *'),
    timeoutMs: getNumber('SCAN_TIMEOUT_MS', 10000),
    maxRetries: getNumber('MAX_RETRIES', 3),
    consecutiveFailureThreshold: getNumber('CONSECUTIVE_FAILURES_THRESHOLD', 3),
        concurrency: getNumber('SCAN_CONCURRENCY', 10),
        retentionDays: getNumber('SCAN_RETENTION_DAYS', 30),
  },

  smtp: {
    host: getString('SMTP_HOST', 'localhost'),
    port: getNumber('SMTP_PORT', 587),
    secure: getBoolean('SMTP_SECURE', false),
    user: getString('SMTP_USER', ''),
    pass: getString('SMTP_PASS', ''),
    from: getString('ALERT_FROM', 'Uptime Monitor <alerts@localhost>'),
    to: getString('ALERT_TO', 'admin@localhost'),
  },
};

module.exports = { config };
