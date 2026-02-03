/**
 * Application entry point
 * Starts the Express server
 */

import { createApp } from './app'
import { getConfig } from './common/config/index'
import { logger } from './common/utils/index'
import { prisma } from './lib/prisma'

async function main() {
  try {
    // Validate config at startup (fails fast if invalid)
    const config = getConfig()

    // Connect to database
    await prisma.$connect()
    logger.info('Database connected')

    // Create and start server
    const app = createApp()

    const server = app.listen(config.PORT, () => {
      logger.info(`Server started`, {
        port: config.PORT,
        env: config.NODE_ENV,
        url: `http://localhost:${config.PORT}`,
      })
    })

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`)

      server.close(async () => {
        logger.info('HTTP server closed')

        await prisma.$disconnect()
        logger.info('Database disconnected')

        process.exit(0)
      })

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    logger.error('Failed to start server', { error })
    process.exit(1)
  }
}

main()
