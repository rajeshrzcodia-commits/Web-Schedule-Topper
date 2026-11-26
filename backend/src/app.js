const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config/env');
const { createLogger } = require('./config/logger');
const { apiKeyAuth } = require('./middleware/auth');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const logger = createLogger('app');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : ['http://localhost:5001', 'https://web-schedule-topper-app.vercel.app'];
const frontendUrl = process.env.FRONTEND_URL;
if (frontendUrl && !corsOrigin.includes(frontendUrl)) {
  corsOrigin.push(frontendUrl);
}

app.use(cors({
  origin: corsOrigin,
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

const morganFormat =
  config.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

app.use(apiKeyAuth);

app.use('/api/auth', authRoutes);
app.use('/', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

module.exports = app;
