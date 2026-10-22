/**
 * app.js
 * Express application setup with middleware, logging, and route mounting.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config/env');
const { createLogger } = require('./config/logger');
const { apiKeyAuth } = require('./middleware/auth');
const apiRoutes = require('./routes/api');

const logger = createLogger('app');

const app = express();

// Trust proxy (useful behind reverse proxies / load balancers).
app.set('trust proxy', 1);

// Security headers.
app.use(helmet());

// CORS - restrict in production via env if needed.
app.use(cors());

// Body parsing.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// HTTP request logging.
const morganFormat =
  config.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

// Optional API key authentication (no-op when API_KEY is not configured).
app.use(apiKeyAuth);

// Mount API routes.
app.use('/', apiRoutes);

// 404 handler.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler.
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

module.exports = app;
