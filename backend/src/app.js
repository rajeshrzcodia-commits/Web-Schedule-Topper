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

app.set('trust proxy', 1);

app.use(helmet());

app.use(cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

const morganFormat =
  config.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

app.use(apiKeyAuth);

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
