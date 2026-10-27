const mongoose = require('mongoose');
const app = require('../src/app');

/**
 * Vercel is serverless: there is no long-running `app.listen()`.
 * Each invocation connects to MongoDB lazily (mongoose caches the
 * connection globally) and then delegates the request to the Express app.
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
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
