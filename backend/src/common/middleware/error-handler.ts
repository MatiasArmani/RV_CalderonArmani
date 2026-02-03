/**
 * Global error handler middleware
 * Converts errors to consistent API responses
 */

import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/index'
import { logger } from '../utils/logger'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle AppError (operational errors)
  if (err instanceof AppError) {
    if (!err.isOperational) {
      // Log non-operational errors (programming errors)
      logger.error('Non-operational error:', {
        code: err.code,
        message: err.message,
        stack: err.stack,
      })
    }

    res.status(err.statusCode).json(err.toJSON())
    return
  }

  // Handle unexpected errors
  logger.error('Unexpected error:', {
    message: err.message,
    stack: err.stack,
  })

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  })
}

// Async handler wrapper to catch promise rejections
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
