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
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

module.exports = logger;
