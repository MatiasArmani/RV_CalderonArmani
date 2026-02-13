/**
 * Express application setup
 * Configured with security middleware per specification
 */

import express, { Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import { getConfig } from './common/config/index'
import { errorHandler, requestLogger } from './common/middleware/index'
import { healthRouter } from './modules/health/index'
import { authRouter } from './modules/auth/index'
import { projectsRouter } from './modules/projects/index'
import { productsRouter } from './modules/products/index'
import { versionsRouter } from './modules/versions/index'
import { assetsRouter } from './modules/assets/index'
import { sharesRouter } from './modules/shares/index'
import { publicRouter } from './modules/public/index'
import { visitsRouter } from './modules/visits/index'
import { submodelsRouter } from './modules/submodels/index'

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
  // In development, allow any origin (IP changes with each network)
  // In production, restrict to FRONTEND_URL
  const isDev = config.NODE_ENV !== 'production'

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true)
        if (isDev) return callback(null, true)
        // Production: only allow the configured frontend URL
        if (origin === config.FRONTEND_URL) {
          callback(null, true)
        } else {
          callback(new Error(`Not allowed by CORS: ${origin}`))
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // Cookie parsing (for refresh tokens)
  app.use(cookieParser())

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Request logging
  app.use(requestLogger)

  // Routes
  app.use('/api/health', healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/versions', versionsRouter)
  app.use('/api/assets', assetsRouter)
  app.use('/api/shares', sharesRouter)
  app.use('/api/submodels', submodelsRouter)
  app.use('/api/visits', visitsRouter)
  app.use('/api/public', publicRouter)

  // Global error handler (must be last)
  app.use(errorHandler)

  return app
}
