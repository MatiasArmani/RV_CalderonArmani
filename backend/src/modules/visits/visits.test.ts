import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'
import * as jwt from 'jsonwebtoken'
import { getConfig } from '../../common/config/index'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    visit: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    share: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

describe('Visits Endpoints', () => {
  const app = createApp()
  const config = getConfig()

  // Use valid UUID v4 format (version 4 indicated by '4' in 3rd segment, variant 8/9/a/b in 4th)
  const mockCompanyId = '11111111-1111-4111-a111-111111111111'
  const mockUserId = '22222222-2222-4222-a222-222222222222'
  const mockShareId = '33333333-3333-4333-a333-333333333333'
  const mockVisitId = '44444444-4444-4444-a444-444444444444'
  const mockToken = 'a'.repeat(64)

  // Generate a valid JWT for testing
  const validToken = jwt.sign(
    { sub: mockUserId, companyId: mockCompanyId, role: 'ADMIN' },
    config.JWT_SECRET,
    { expiresIn: '15m' }
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC ENDPOINTS (No Auth)
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/public/visits/start', () => {
    it('should start a visit with valid share token', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: 100,
        visitCount: 5,
        revokedAt: null,
      })
      ;(prisma.visit.create as jest.Mock).mockResolvedValue({
        id: mockVisitId,
        companyId: mockCompanyId,
        shareId: mockShareId,
        startedAt: new Date(),
        endedAt: null,
        durationMs: null,
        usedAR: false,
        device: { ua: 'Test/1.0', os: 'TestOS', isMobile: true },
        createdAt: new Date(),
      })
      ;(prisma.share.update as jest.Mock).mockResolvedValue({})

      const response = await request(app)
        .post('/api/public/visits/start')
        .send({
          shareToken: mockToken,
          device: {
            ua: 'Test/1.0',
            os: 'TestOS',
            isMobile: true,
          },
        })
        .expect(201)

      expect(response.body.visitId).toBe(mockVisitId)
      expect(prisma.visit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: mockCompanyId,
            shareId: mockShareId,
          }),
        })
      )
      // Should increment visit count
      expect(prisma.share.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockShareId },
          data: { visitCount: { increment: 1 } },
        })
      )
    })

    it('should start visit with auto-detected device info from User-Agent', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: null,
        visitCount: 0,
        revokedAt: null,
      })
      ;(prisma.visit.create as jest.Mock).mockResolvedValue({
        id: mockVisitId,
        companyId: mockCompanyId,
        shareId: mockShareId,
        startedAt: new Date(),
        createdAt: new Date(),
      })
      ;(prisma.share.update as jest.Mock).mockResolvedValue({})

      const response = await request(app)
        .post('/api/public/visits/start')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')
        .send({
          shareToken: mockToken,
        })
        .expect(201)

      expect(response.body.visitId).toBe(mockVisitId)
      // Device should be auto-parsed from User-Agent
      expect(prisma.visit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            device: expect.objectContaining({
              os: 'iOS',
              isMobile: true,
            }),
          }),
        })
      )
    })

    it('should reject invalid share token format', async () => {
      const response = await request(app)
        .post('/api/public/visits/start')
        .send({
          shareToken: 'invalid-token',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject non-existent share token', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .post('/api/public/visits/start')
        .send({
          shareToken: mockToken,
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject expired share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2020-01-01'), // Past date
        maxVisits: 100,
        visitCount: 5,
        revokedAt: null,
      })

      const response = await request(app)
        .post('/api/public/visits/start')
        .send({
          shareToken: mockToken,
        })
        .expect(410)

      expect(response.body.error.code).toBe('SHARE_EXPIRED')
    })

    it('should reject revoked share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: 100,
        visitCount: 5,
        revokedAt: new Date(),
      })

      const response = await request(app)
        .post('/api/public/visits/start')
        .send({
          shareToken: mockToken,
        })
        .expect(410)

      expect(response.body.error.code).toBe('SHARE_REVOKED')
    })

    it('should reject share with max visits reached', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: 10,
        visitCount: 10, // Max reached
        revokedAt: null,
      })

      const response = await request(app)
        .post('/api/public/visits/start')
        .send({
          shareToken: mockToken,
        })
        .expect(410)

      expect(response.body.error.code).toBe('SHARE_LIMIT_REACHED')
    })
  })

  describe('POST /api/public/visits/end', () => {
    it('should end a visit with valid data', async () => {
      const startedAt = new Date()
      ;(prisma.visit.findUnique as jest.Mock).mockResolvedValue({
        id: mockVisitId,
        companyId: mockCompanyId,
        shareId: mockShareId,
        startedAt,
        endedAt: null,
        durationMs: null,
        usedAR: false,
      })
      ;(prisma.visit.update as jest.Mock).mockResolvedValue({
        id: mockVisitId,
        endedAt: new Date(),
        durationMs: 60000,
        usedAR: true,
      })

      const response = await request(app)
        .post('/api/public/visits/end')
        .send({
          visitId: mockVisitId,
          durationMs: 60000,
          usedAR: true,
        })

      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(prisma.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockVisitId },
          data: expect.objectContaining({
            durationMs: 60000,
            usedAR: true,
          }),
        })
      )
    })

    it('should reject non-existent visit', async () => {
      ;(prisma.visit.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .post('/api/public/visits/end')
        .send({
          visitId: mockVisitId,
          durationMs: 60000,
          usedAR: false,
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject negative durationMs', async () => {
      const response = await request(app)
        .post('/api/public/visits/end')
        .send({
          visitId: mockVisitId,
          durationMs: -1000,
          usedAR: false,
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject invalid visitId format', async () => {
      const response = await request(app)
        .post('/api/public/visits/end')
        .send({
          visitId: 'not-a-uuid',
          durationMs: 60000,
          usedAR: false,
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject non-boolean usedAR', async () => {
      const response = await request(app)
        .post('/api/public/visits/end')
        .send({
          visitId: mockVisitId,
          durationMs: 60000,
          usedAR: 'yes', // Not a boolean
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE ENDPOINTS (Requires Auth)
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/visits', () => {
    it('should list visits for company', async () => {
      const mockVisits = [
        {
          id: mockVisitId,
          companyId: mockCompanyId,
          shareId: mockShareId,
          startedAt: new Date(),
          endedAt: new Date(),
          durationMs: 120000,
          usedAR: true,
          device: { ua: 'Test/1.0', os: 'iOS', isMobile: true },
          createdAt: new Date(),
          share: {
            version: {
              label: 'v1.0',
              product: { name: 'Test Product' },
            },
          },
        },
      ]

      ;(prisma.visit.findMany as jest.Mock).mockResolvedValue(mockVisits)
      ;(prisma.visit.count as jest.Mock).mockResolvedValue(1)

      const response = await request(app)
        .get('/api/visits')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.visits).toHaveLength(1)
      expect(response.body.total).toBe(1)
      expect(response.body.visits[0].usedAR).toBe(true)
      expect(response.body.visits[0].productName).toBe('Test Product')
      expect(response.body.visits[0].versionLabel).toBe('v1.0')
    })

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/visits')
        .expect(401)

      expect(response.body.error.code).toBe('UNAUTHORIZED')
    })

    it('should support pagination', async () => {
      ;(prisma.visit.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.visit.count as jest.Mock).mockResolvedValue(50)

      await request(app)
        .get('/api/visits?limit=10&offset=20')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(prisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      )
    })

    it('should filter by shareId', async () => {
      ;(prisma.visit.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.visit.count as jest.Mock).mockResolvedValue(0)

      await request(app)
        .get(`/api/visits?shareId=${mockShareId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(prisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ shareId: mockShareId }),
        })
      )
    })
  })

  describe('GET /api/visits/:id', () => {
    it('should return a single visit', async () => {
      const mockVisit = {
        id: mockVisitId,
        companyId: mockCompanyId,
        shareId: mockShareId,
        startedAt: new Date(),
        endedAt: new Date(),
        durationMs: 60000,
        usedAR: false,
        device: { ua: 'Test/1.0', os: 'Android', isMobile: true },
        createdAt: new Date(),
      }

      ;(prisma.visit.findUnique as jest.Mock).mockResolvedValue(mockVisit)
      ;(prisma.visit.findMany as jest.Mock).mockResolvedValue([mockVisit])
      ;(prisma.visit.count as jest.Mock).mockResolvedValue(1)

      const response = await request(app)
        .get(`/api/visits/${mockVisitId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.id).toBe(mockVisitId)
      expect(response.body.usedAR).toBe(false)
    })

    it('should reject visit from other tenant', async () => {
      ;(prisma.visit.findUnique as jest.Mock).mockResolvedValue({
        id: mockVisitId,
        companyId: 'other-company',
      })

      const response = await request(app)
        .get(`/api/visits/${mockVisitId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject non-existent visit', async () => {
      ;(prisma.visit.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .get(`/api/visits/${mockVisitId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// DEVICE INFO PARSER TESTS
// ═══════════════════════════════════════════════════════════════

describe('Device Info Parser', () => {
  // Import the service to test the parser
  const { parseUserAgent } = require('./visits.service')

  it('should detect iOS', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
    )
    expect(result.os).toBe('iOS')
    expect(result.isMobile).toBe(true)
  })

  it('should detect Android', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36'
    )
    expect(result.os).toBe('Android')
    expect(result.isMobile).toBe(true)
  })

  it('should detect Windows', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    )
    expect(result.os).toBe('Windows')
    expect(result.isMobile).toBe(false)
  })

  it('should detect macOS', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    )
    expect(result.os).toBe('macOS')
    expect(result.isMobile).toBe(false)
  })

  it('should detect iPad as iOS mobile', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)'
    )
    expect(result.os).toBe('iOS')
    expect(result.isMobile).toBe(true)
  })
})
