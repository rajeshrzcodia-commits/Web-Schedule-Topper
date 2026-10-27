









const mongoose = require('mongoose');
const { createLogger } = require('./logger');

const logger = createLogger('mongoose');

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;
const BACKGROUND_RETRY_DELAY_MS = 5000;

let backgroundReconnectTimer = null;
let reconnecting = false;
let currentUri = null;

const connectionOptions = {
  serverSelectionTimeoutMS: 25000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 25000,
  family: 4,
};

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connection established.');
});
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost.');
  if (currentUri) startBackgroundReconnect(currentUri);
});
mongoose.connection.on('error', (error) => {
  logger.error(`MongoDB connection error: ${error.message}`);
});
mongoose.connection.on('reconnecting', () => {
  logger.warn('MongoDB reconnecting...');
});
mongoose.connection.on('reconnectFailed', () => {
  logger.error('MongoDB reconnect failed.');
});






const attemptConnect = async (uri) => {
  try {
    await mongoose.connect(uri, connectionOptions);
    logger.info(`Connected to MongoDB at ${mongoose.connection.name}`);
    return true;
  } catch (error) {
    logger.error(`Connection failed: ${error.message}`);
    return false;
  }
};





const startBackgroundReconnect = (uri) => {
  if (backgroundReconnectTimer || reconnecting) return;

  reconnecting = true;
  const tick = async () => {
    if (mongoose.connection.readyState === 1) {
      reconnecting = false;
      backgroundReconnectTimer = null;
      logger.info('Background reconnection succeeded; persistence resumed.');
      return;
    }
    const ok = await attemptConnect(uri);
    if (ok) {
      reconnecting = false;
      backgroundReconnectTimer = null;
      logger.info('Background reconnection succeeded; persistence resumed.');
      return;
    }
    logger.warn(
      `MongoDB still unreachable; retrying in ${BACKGROUND_RETRY_DELAY_MS}ms.`
    );
    backgroundReconnectTimer = setTimeout(tick, BACKGROUND_RETRY_DELAY_MS);
  };

  backgroundReconnectTimer = setTimeout(tick, BACKGROUND_RETRY_DELAY_MS);
  if (backgroundReconnectTimer.unref) backgroundReconnectTimer.unref();
};






const connectDB = async (uri) => {
  currentUri = uri;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (await attemptConnect(uri)) {
      return true;
    }
    if (attempt < MAX_RETRIES) {
      logger.warn(
        `Retrying MongoDB connection (${attempt}/${MAX_RETRIES}) in ${RETRY_DELAY_MS}ms.`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  logger.error(
    `MongoDB unreachable after ${MAX_RETRIES} attempts. The service will run with in-memory state and keep retrying in the background.`
  );
  startBackgroundReconnect(uri);
  return false;
};




const isDbConnected = () => mongoose.connection.readyState === 1;

const disconnectDB = async () => {
  if (backgroundReconnectTimer) {
    clearTimeout(backgroundReconnectTimer);
    backgroundReconnectTimer = null;
  }
  reconnecting = false;
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error(`Error closing connection: ${error.message}`);
  }
};

module.exports = { connectDB, disconnectDB, isDbConnected };
