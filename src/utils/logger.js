import winston from 'winston';
import 'dotenv/config';

const { combine, timestamp, colorize, printf, errors } = winston.format;

// Custom log format: [2026-03-24 08:00:00] INFO: message
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),  // captures full stack traces on errors
    logFormat
  ),
  transports: [
    // Console output — always on
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),

    // File output — errors only, so you can review failures later
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),

    // File output — everything
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

export default logger;
export { logger };
