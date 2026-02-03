/**
 * Rate limiting middleware
 * Configured per endpoint as per security spec
 */

import rateLimit from 'express-rate-limit'
import { Request } from 'express'
import { logger } from '../utils/logger'

// Rate limit response format
const rateLimitMessage = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests, please try again later',
  },
}

// Helper to get key generator based on auth status
function getKeyGenerator(useUserId: boolean) {
  return (req: Request): string => {
    if (useUserId && req.user?.id) {
      return req.user.id
    }
    return req.ip ?? 'unknown'
  }
}

// Log when rate limit is hit
function onLimitReached(req: Request) {
  const identifier = req.user?.id ?? req.ip
  logger.warn('Rate limit hit', {
    endpoint: req.originalUrl,
    identifier,
    method: req.method,
  })
}

// Auth endpoints (public, by IP)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKeyGenerator(false),
  handler: (req, res) => {
    onLimitReached(req)
    res.status(429).json(rateLimitMessage)
  },
})

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKeyGenerator(false),
  handler: (req, res) => {
    onLimitReached(req)
    res.status(429).json(rateLimitMessage)
  },
})

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKeyGenerator(false),
  handler: (req, res) => {
    onLimitReached(req)
    res.status(429).json(rateLimitMessage)
  },
})

// Share endpoints (private, by userId)
export const createShareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKeyGenerator(true),
  handler: (req, res) => {
    onLimitReached(req)
    res.status(429).json(rateLimitMessage)
  },
})

// Public experience endpoints (public, by IP)
export const publicExperienceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKeyGenerator(false),
  handler: (req, res) => {
    onLimitReached(req)
    res.status(429).json(rateLimitMessage)
  },
})

// Asset upload endpoints (private, by userId)
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKeyGenerator(true),
  handler: (req, res) => {
    onLimitReached(req)
    res.status(429).json(rateLimitMessage)
  },
})
