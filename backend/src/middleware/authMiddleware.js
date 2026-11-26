const crypto = require('crypto');
const { config } = require('../config/env');
const User = require('../models/User');
const { createLogger } = require('../config/logger');

const logger = createLogger('authMiddleware');

// Safe local fallback so local/dev never crashes when AUTH_SECRET is unset.
// In production, AUTH_SECRET must be set via environment variable.
const AUTH_SECRET = config.auth.secret || 'wst-dev-fallback-secret-do-not-use-in-production';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const safeCompare = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Generate an HMAC-SHA256 signed JWT-like token with expiry.
 * Format: base64url(header.payload.signature) where payload includes userId and exp.
 */
const generateToken = (userId, tokenVersion = 0) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, ver: tokenVersion, iat: now, exp: now + TOKEN_EXPIRY_MS })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
};

/**
 * Verify and decode a token. Returns { userId } or throws.
 */
const verifyToken = (token) => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  if (Date.now() > payload.exp) {
    throw new Error('Token expired');
  }

  return { userId: payload.sub, tokenVersion: payload.ver || 0 };
};

/**
 * Hash a password using Node.js built-in crypto.scryptSync.
 */
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
};

/**
 * Verify a password against a stored hash.
 */
const verifyPassword = (password, storedHash) => {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return safeCompare(derivedKey.toString('hex'), key);
};

/**
 * requireAuth middleware: verifies Authorization: Bearer <token>,
 * loads the user from MongoDB, attaches req.user.
 * Returns 503 if DB is disconnected, 401 if token is missing/invalid/expired.
 */
const requireAuth = async (req, res, next) => {
  // Allow CORS preflight to pass through.
  if (req.method === 'OPTIONS') return next();

  const authHeader = req.get('Authorization') || req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7).trim();
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!config.mongodb.uri) {
    return res.status(503).json({ error: 'Database is unavailable; authentication cannot proceed.' });
  }

  try {
    const user = await User.findById(decoded.userId).lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      authProvider: user.authProvider,
      hasPassword: Boolean(user.passwordHash),
    };
    return next();
  } catch (error) {
    logger.error(`requireAuth DB error: ${error.message}`);
    return res.status(503).json({ error: 'Database is unavailable; authentication cannot proceed.' });
  }
};

module.exports = {
  requireAuth,
  generateToken,
  hashPassword,
  verifyPassword,
  verifyToken,
  AUTH_SECRET,
};
