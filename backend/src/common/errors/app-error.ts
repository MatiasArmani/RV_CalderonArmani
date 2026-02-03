/**
 * Application error classes
 * Consistent error handling across the API
 */

export type ErrorCode =
  // Auth errors
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  // Validation errors
  | 'VALIDATION_ERROR'
  // Resource errors
  | 'NOT_FOUND'
  | 'CONFLICT'
  // Share errors
  | 'SHARE_EXPIRED'
  | 'SHARE_REVOKED'
  | 'SHARE_LIMIT_REACHED'
  // Rate limiting
  | 'RATE_LIMITED'
  // Server errors
  | 'INTERNAL_ERROR'
  // Asset errors
  | 'ASSET_PROCESSING_FAILED'
  | 'INVALID_STATE_TRANSITION'

export interface ErrorDetails {
  field?: string
  message?: string
  [key: string]: unknown
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: ErrorDetails[]
  public readonly isOperational: boolean

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: ErrorDetails[],
    isOperational = true
  ) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.isOperational = isOperational

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor)
    Object.setPrototypeOf(this, AppError.prototype)
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    }
  }
}

// Factory functions for common errors
export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    new AppError('UNAUTHORIZED', message, 401),

  forbidden: (message = 'Access denied') =>
    new AppError('FORBIDDEN', message, 403),

  invalidCredentials: (message = 'Invalid email or password') =>
    new AppError('INVALID_CREDENTIALS', message, 401),

  tokenExpired: (message = 'Token has expired') =>
    new AppError('TOKEN_EXPIRED', message, 401),

  tokenInvalid: (message = 'Invalid token') =>
    new AppError('TOKEN_INVALID', message, 401),

  validation: (details: ErrorDetails[], message = 'Validation failed') =>
    new AppError('VALIDATION_ERROR', message, 400, details),

  notFound: (resource = 'Resource', message?: string) =>
    new AppError('NOT_FOUND', message ?? `${resource} not found`, 404),

  conflict: (message: string) =>
    new AppError('CONFLICT', message, 409),

  shareExpired: () =>
    new AppError('SHARE_EXPIRED', 'This link has expired', 410),

  shareRevoked: () =>
    new AppError('SHARE_REVOKED', 'This link has been revoked', 410),

  shareLimitReached: () =>
    new AppError('SHARE_LIMIT_REACHED', 'Maximum visits reached', 410),

  rateLimited: (message = 'Too many requests, please try again later') =>
    new AppError('RATE_LIMITED', message, 429),

  internal: (message = 'Internal server error') =>
    new AppError('INTERNAL_ERROR', message, 500, undefined, false),

  assetProcessingFailed: (message: string) =>
    new AppError('ASSET_PROCESSING_FAILED', message, 500),

  invalidStateTransition: (from: string, to: string) =>
    new AppError('INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`, 400),
}
