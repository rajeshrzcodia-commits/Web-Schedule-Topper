/**
 * server.js
 * Application entry point.
 * Sequence: load config -> connect MongoDB -> start Express server ->
 * initialize scheduler -> handle graceful shutdown.
 */

const app = require('./app');
const { config } = require('./config/env');
const { createLogger } = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/mongoose');
const { startScheduler, stopScheduler } = require('./services/scheduler');

const logger = createLogger('server');

const PORT = config.port;
const SHUTDOWN_TIMEOUT_MS = 10000;

let server = null;

const start = async () => {
  // 1. Connect to MongoDB (non-fatal; background retries if unavailable).
  try {
    const connected = await connectDB(config.mongodb.uri);
    if (!connected) {
      logger.warn(
        'Starting without MongoDB. Results will not be persisted until the database becomes reachable.'
      );
    }
  } catch (error) {
    logger.warn(
      `MongoDB connection setup failed: ${error.message}. Running without persistence.`
    );
  }

  // 2. Start HTTP server (try configured port, then fallback).
  const startServer = async (port) => {
    return new Promise((resolve, reject) => {
      const s = app.listen(port, () => {
        logger.info(`Listening on port ${port} (env: ${config.nodeEnv})`);
        logger.info('Backend monitoring system is running.');
        resolve(s);
      });
      s.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  };

  try {
    server = await startServer(PORT);
  } catch (error) {
    logger.warn(`${error.message}. Trying alternate port ${PORT + 1}...`);
    try {
      server = await startServer(PORT + 1);
    } catch (altError) {
      logger.error(
        `Cannot start HTTP server: ${altError.message}. The API will not be available.`
      );
    }
  }

  // 3. Start the periodic scheduler (non-fatal).
  try {
    startScheduler(config);
  } catch (error) {
    logger.error(`Scheduler failed to start: ${error.message}`);
  }

  if (!config.googleSheet.csvUrl) {
    logger.warn(
      'GOOGLE_SHEET_CSV_URL is not set. Every scan cycle will be skipped until it is configured.'
    );
  }
};

/**
 * Close the HTTP server, forcing it down if it does not drain in time.
 * @returns {Promise<void>}
 */
const closeServer = () =>
  new Promise((resolve) => {
    if (!server) return resolve();

    const forceTimer = setTimeout(() => {
      logger.warn('HTTP server did not close in time; forcing shutdown.');
      server.closeAllConnections?.();
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    if (forceTimer.unref) forceTimer.unref();

    server.close(() => {
      clearTimeout(forceTimer);
      logger.info('HTTP server closed.');
      resolve();
    });
  });

// Graceful shutdown handler.
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  try {
    stopScheduler();
  } catch (error) {
    logger.error(`Error stopping scheduler: ${error.message}`);
  }

  await closeServer();

  try {
    await disconnectDB();
  } catch (error) {
    logger.error(`Error disconnecting DB: ${error.message}`);
  }

  logger.info('Shutdown complete.');
  process.exit(0);
};

let shuttingDown = false;
process.on('SIGTERM', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdown('SIGINT');
});

// Catch unhandled promise rejections to avoid silent crashes.
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

// Start the application.
start();

module.exports = { app, start };
