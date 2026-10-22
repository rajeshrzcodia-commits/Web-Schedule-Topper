









const crypto = require('crypto');
const { config } = require('../config/env');
const { createLogger } = require('../config/logger');

const logger = createLogger('auth');

const PUBLIC_PATHS = new Set(['/health', '/health/live']);







const safeCompare = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};




const apiKeyAuth = (req, res, next) => {
  if (!config.apiKey) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  const provided = req.get('x-api-key') || req.query.api_key;
  if (provided && safeCompare(provided, config.apiKey)) return next();

  logger.warn(`Rejected unauthorized request to ${req.method} ${req.originalUrl}`);
  return res.status(401).json({ error: 'Unauthorized' });
};

module.exports = { apiKeyAuth, safeCompare, PUBLIC_PATHS };
