const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const resolveLevel = () => {
  const configured = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, configured)
    ? configured
    : 'info';
};

const createLogger = (scope) => {
  let level = resolveLevel();

  const write = (levelName, method, message) => {
    if (LEVELS[levelName] > LEVELS[level]) return;
    const stamp = new Date().toISOString();
    console[method](`[${stamp}] [${scope}] [${levelName.toUpperCase()}] ${message}`);
  };

  return {
    setLevel(next) {
      if (Object.prototype.hasOwnProperty.call(LEVELS, next)) level = next;
    },
    error: (message) => write('error', 'error', message),
    warn: (message) => write('warn', 'warn', message),
    info: (message) => write('info', 'log', message),
    debug: (message) => write('debug', 'log', message),
  };
};

module.exports = { createLogger, LEVELS };
