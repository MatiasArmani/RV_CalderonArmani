/**
 * Request logging middleware
 * Logs incoming requests and response times
 */

import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  const { method, originalUrl, ip } = req

  res.on('finish', () => {
    const duration = Date.now() - start
    const { statusCode } = res

    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

    logger[logLevel](`${method} ${originalUrl}`, {
      method,
      url: originalUrl,
      statusCode,
      duration: `${duration}ms`,
      ip,
    })
  })

  next()
}
