/**
 * Express application setup
 * Configured with security middleware per specification
 */

import express, { Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'

import { getConfig } from './common/config/index'
import { errorHandler, requestLogger } from './common/middleware/index'
import { healthRouter } from './modules/health/index'

export function createApp(): Express {
  const app = express()
  const config = getConfig()

  // Trust proxy (for rate limiting and secure cookies behind load balancer)
  app.set('trust proxy', 1)

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://*.amazonaws.com'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  )

  // CORS configuration
  const allowedOrigins = [
    config.FRONTEND_URL,
    'http://localhost:3000',
  ]

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Request logging
  app.use(requestLogger)

  // Routes
  app.use('/api/health', healthRouter)

  // TODO: Add module routes here as they are implemented
  // app.use('/api/auth', authRouter)
  // app.use('/api/projects', projectsRouter)
  // app.use('/api/products', productsRouter)
  // app.use('/api/versions', versionsRouter)
  // app.use('/api/assets', assetsRouter)
  // app.use('/api/shares', sharesRouter)
  // app.use('/api/public', publicRouter)

  // Global error handler (must be last)
  app.use(errorHandler)

  return app
}
