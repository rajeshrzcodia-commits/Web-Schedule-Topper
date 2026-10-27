const mongoose = require('mongoose');
const dns = require('dns');
const app = require('../src/app');

const ensureSrvResolution = async (uri) => {
  if (!uri || !uri.startsWith('mongodb+srv://')) return;
  const host = uri.split('@')[1].split('/')[0].split('?')[0];
  const ok = await new Promise((resolve) => {
    dns.resolveSrv(`_mongodb._tcp.${host}`, (err) => resolve(!err));
  });
  if (!ok) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
};

/**
 * Vercel is serverless: there is no long-running `app.listen()`.
 * Each invocation connects to MongoDB lazily (mongoose caches the
 * connection globally) and then delegates the request to the Express app.
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  await ensureSrvResolution(uri);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
};

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[vercel] MongoDB connect error:', err.message);
  }
  return app(req, res);
};
