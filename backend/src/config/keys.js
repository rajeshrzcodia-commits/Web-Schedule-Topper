const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('./logger');

const logger = createLogger('keys');

/**
 * Load the ecomm.pem RSA private key.
 *
 * Resolution order (production-safe):
 *   1. ECOMM_PRIVATE_KEY env var — raw PEM content or base64-encoded PEM.
 *      Preferred for production: no private key file ever touches the container filesystem.
 *   2. ECOMM_PRIVATE_KEY_PATH env var — filesystem path to a .pem file.
 *      Convenient for local development.
 *
 * The loaded key is validated with crypto.createPrivateKey() before being returned.
 */
function loadPrivateKey() {
  const keyEnv = process.env.ECOMM_PRIVATE_KEY;
  const keyPath = process.env.ECOMM_PRIVATE_KEY_PATH;

  let pem = null;
  let source = 'none';

  // --- Source 1: Environment variable (production) ---
  if (keyEnv) {
    try {
      let candidate = keyEnv.trim();

      // Detect base64-encoded PEM (single line, no PEM headers/footers)
      if (
        !candidate.includes('BEGIN ') &&
        /^[A-Za-z0-9+/=\s]+$/.test(candidate)
      ) {
        candidate = Buffer.from(candidate, 'base64').toString('utf8');
      }

      pem = candidate;
      source = 'ECOMM_PRIVATE_KEY environment variable';
    } catch (err) {
      logger.warn(`Failed to parse ECOMM_PRIVATE_KEY env var: ${err.message}`);
    }
  }

  // --- Source 2: Filesystem path (development) ---
  if (!pem && keyPath) {
    try {
      const resolvedPath = path.resolve(keyPath);
      pem = fs.readFileSync(resolvedPath, 'utf8');
      source = `file ${resolvedPath}`;
    } catch (err) {
      logger.warn(
        `Failed to read private key from ${keyPath}: ${err.message}`
      );
    }
  }

  if (!pem) {
    logger.warn(
      'No ecomm private key configured. Set ECOMM_PRIVATE_KEY (production) or '
      + 'ECOMM_PRIVATE_KEY_PATH (development) before starting the server.'
    );
    return null;
  }

  // --- Validate that the PEM is a loadable private key ---
  let keyObject = null;
  try {
    keyObject = crypto.createPrivateKey(pem);
    logger.info(`Ecomm private key loaded successfully from ${source}.`);
  } catch (err) {
    logger.error(
      `Invalid private key format from ${source}: ${err.message}`
    );
    return null;
  }

  return {
    pem,              // Raw PEM string
    keyObject,        // crypto.KeyObject for sign/verify/decrypt operations
    source,           // Human-readable source for logging
  };
}

const privateKey = loadPrivateKey();

module.exports = {
  /**
   * Returns the loaded private key object { pem, keyObject, source } or null
   * if no key could be loaded.
   */
  getPrivateKey: () => privateKey,

  /**
   * Returns true if a valid private key was loaded.
   */
  hasPrivateKey: () => privateKey !== null,

  /**
   * Returns the raw PEM string or null.
   */
  getPrivateKeyPem: () => (privateKey ? privateKey.pem : null),

  /**
   * Returns the crypto.KeyObject or null.
   */
  getPrivateKeyObject: () => (privateKey ? privateKey.keyObject : null),
};
