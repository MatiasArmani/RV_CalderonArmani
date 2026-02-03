/**
 * Structured logging with Winston
 * JSON format for parsing, timestamp ISO8601
 */

import winston from 'winston'

const { combine, timestamp, json, errors, printf, colorize } = winston.format

// Custom format for development (readable)
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
  return `${timestamp} [${level}]: ${message} ${metaStr}`
})

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

export const logger = winston.createLogger({
  level: isTest ? 'error' : 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    errors({ stack: true }),
    isDevelopment ? combine(colorize(), devFormat) : json()
  ),
  defaultMeta: { service: 'rv-calderon-armani-api' },
  transports: [
    new winston.transports.Console({
      silent: isTest,
    }),
  ],
})

// Export typed logger interface
export type Logger = typeof logger
