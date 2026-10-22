/**
 * auth.js
 * Optional API key authentication.
 *
 * When API_KEY is not configured the middleware is a no-op so local
 * development and the health probe keep working. When API_KEY is set, every
 * request except the health probes must send the same value in the
 * `X-API-Key` header (or an `api_key` query parameter).
 */

const crypto = require('crypto');
const { config } = require('../config/env');
const { createLogger } = require('../config/logger');

const logger = createLogger('auth');

const PUBLIC_PATHS = new Set(['/health', '/health/live']);

/**
 * Constant-time string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const safeCompare = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Express middleware enforcing the API key when one is configured.
 */
const apiKeyAuth = (req, res, next) => {
  if (!config.apiKey) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  const provided = req.get('x-api-key') || req.query.api_key;
  if (provided && safeCompare(provided, config.apiKey)) return next();

  logger.warn(`Rejected unauthorized request to ${req.method} ${req.originalUrl}`);
  return res.status(401).json({ error: 'Unauthorized' });
};

module.exports = { apiKeyAuth, safeCompare, PUBLIC_PATHS };
