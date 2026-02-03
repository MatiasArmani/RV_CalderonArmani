import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}))

describe('Health Endpoint', () => {
  const app = createApp()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/health', () => {
    it('should return 200 when database is connected', async () => {
      ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }])

      const response = await request(app)
        .get('/api/health')
        .expect(200)

      expect(response.body).toMatchObject({
        status: 'healthy',
        services: {
          database: 'connected',
        },
      })
      expect(response.body.timestamp).toBeDefined()
    })

    it('should return 503 when database is disconnected', async () => {
      ;(prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'))

      const response = await request(app)
        .get('/api/health')
        .expect(503)

      expect(response.body).toMatchObject({
        status: 'unhealthy',
        services: {
          database: 'disconnected',
        },
      })
    })
  })
})
