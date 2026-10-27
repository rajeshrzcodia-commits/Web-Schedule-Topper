const mongoose = require('mongoose');
const dns = require('dns');
const app = require('../src/app');

/**
 * Vercel is serverless: there is no long-running `app.listen()`.
 * Each invocation connects to MongoDB lazily (mongoose caches the
 * connection globally) and then delegates the request to the Express app.
 */

const CONNECT_TIMEOUT_MS = 30000;

const ensureSrvResolution = async (uri) => {
  if (!uri || !uri.startsWith('mongodb+srv://')) return;
  const host = uri.split('@')[1].split('/')[0].split('?')[0];
  const ok = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    dns.resolveSrv(`_mongodb._tcp.${host}`, (err) => {
      clearTimeout(timer);
      resolve(!err);
    });
  });
  if (!ok) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
};

const waitForConnection = async (timeoutMs = CONNECT_TIMEOUT_MS) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = mongoose.connection.readyState;
    if (state === 1) return true; // connected
    if (state === 2 || state === 3) {
      // connecting or disconnecting — wait a tick
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    // state 0 = disconnected — try to reconnect
    break;
  }
  return mongoose.connection.readyState === 1;
};

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[vercel] MONGODB_URI is not set');
    return;
  }

  try {
    await ensureSrvResolution(uri);
  } catch (err) {
    console.error('[vercel] SRV resolution failed:', err.message);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 25000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 25000,
      family: 4,
    });
  } catch (err) {
    console.error('[vercel] mongoose.connect error:', err.message);
  }

  const connected = await waitForConnection(CONNECT_TIMEOUT_MS);
  if (!connected) {
    console.error(
      `[vercel] MongoDB not connected after ${CONNECT_TIMEOUT_MS / 1000}s. readyState=${mongoose.connection.readyState}`
    );
  } else {
    console.log('[vercel] MongoDB connected.');
  }
};

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[vercel] MongoDB connect error:', err.message);
  }
  return app(req, res);
};
