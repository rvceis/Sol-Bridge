const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.logging.level,
  transport: config.logging.format === 'json'
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
          singleLine: true,
        },
      },
});

module.exports = logger;
