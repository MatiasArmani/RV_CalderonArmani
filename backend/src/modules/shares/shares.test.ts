import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'
import * as jwt from 'jsonwebtoken'
import { getConfig } from '../../common/config/index'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    share: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    version: {
      findUnique: jest.fn(),
    },
    asset: {
      findMany: jest.fn(),
    },
  },
}))

// Mock storage
jest.mock('../../lib/storage', () => ({
  getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://signed-url.com/file'),
}))

describe('Shares Endpoints', () => {
  const app = createApp()
  const config = getConfig()

  const mockCompanyId = 'company-123'
  const mockUserId = 'user-123'
  const mockVersionId = 'version-123'
  const mockShareId = 'share-123'
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

  describe('GET /api/shares', () => {
    it('should list shares for company', async () => {
      const mockShares = [
        {
          id: mockShareId,
          companyId: mockCompanyId,
          versionId: mockVersionId,
          token: mockToken,
          expiresAt: new Date('2030-01-01'),
          maxVisits: 100,
          visitCount: 5,
          revokedAt: null,
          createdAt: new Date(),
        },
      ]

      ;(prisma.share.findMany as jest.Mock).mockResolvedValue(mockShares)

      const response = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(1)
      // Token should be truncated in list
      expect(response.body[0].token).toBe('aaaaaaaa...')
    })

    it('should filter by versionId', async () => {
      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue({
        id: mockVersionId,
        companyId: mockCompanyId,
      })
      ;(prisma.share.findMany as jest.Mock).mockResolvedValue([])

      await request(app)
        .get(`/api/shares?versionId=${mockVersionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(prisma.share.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ versionId: mockVersionId }),
        })
      )
    })

    it('should reject invalid versionId from other tenant', async () => {
      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue({
        id: mockVersionId,
        companyId: 'other-company',
      })

      const response = await request(app)
        .get(`/api/shares?versionId=${mockVersionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/shares', () => {
    it('should create a share for a valid version with READY asset', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue({
        id: mockVersionId,
        companyId: mockCompanyId,
      })
      ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'asset-123',
          kind: 'SOURCE_GLB',
          status: 'READY',
          versionId: mockVersionId,
        },
      ])
      ;(prisma.share.create as jest.Mock).mockImplementation(async (data) => ({
        id: mockShareId,
        companyId: mockCompanyId,
        versionId: mockVersionId,
        token: data.data.token,
        expiresAt: data.data.expiresAt,
        maxVisits: data.data.maxVisits,
        visitCount: 0,
        revokedAt: null,
        createdAt: new Date(),
      }))

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId: mockVersionId,
          expiresAt: futureDate.toISOString(),
          maxVisits: 50,
        })
        .expect(201)

      expect(response.body.token).toHaveLength(64)
      expect(response.body.url).toContain('/experience/')
      expect(response.body.maxVisits).toBe(50)
    })

    it('should reject if version has no READY asset', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue({
        id: mockVersionId,
        companyId: mockCompanyId,
      })
      ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([])

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId: mockVersionId,
          expiresAt: futureDate.toISOString(),
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject expired date', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId: mockVersionId,
          expiresAt: pastDate.toISOString(),
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject version from other tenant', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue({
        id: mockVersionId,
        companyId: 'other-company',
      })

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId: mockVersionId,
          expiresAt: futureDate.toISOString(),
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/shares/:id/revoke', () => {
    it('should revoke a share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        revokedAt: null,
      })
      ;(prisma.share.update as jest.Mock).mockResolvedValue({
        id: mockShareId,
        revokedAt: new Date(),
      })

      const response = await request(app)
        .post(`/api/shares/${mockShareId}/revoke`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
    })

    it('should reject revoking already revoked share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
        revokedAt: new Date(),
      })

      const response = await request(app)
        .post(`/api/shares/${mockShareId}/revoke`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(409)

      expect(response.body.error.code).toBe('CONFLICT')
    })

    it('should reject revoking share from other tenant', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: 'other-company',
        revokedAt: null,
      })

      const response = await request(app)
        .post(`/api/shares/${mockShareId}/revoke`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('DELETE /api/shares/:id', () => {
    it('should delete a share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: mockCompanyId,
      })
      ;(prisma.share.delete as jest.Mock).mockResolvedValue({})

      const response = await request(app)
        .delete(`/api/shares/${mockShareId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
    })

    it('should reject deleting share from other tenant', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: mockShareId,
        companyId: 'other-company',
      })

      const response = await request(app)
        .delete(`/api/shares/${mockShareId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})

describe('Public Experience Endpoints', () => {
  const app = createApp()

  const mockToken = 'a'.repeat(64)
  const mockCompanyId = 'company-123'
  const mockVersionId = 'version-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/public/experience/:token', () => {
    it('should return experience data for valid token', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: 'share-123',
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: 100,
        visitCount: 5,
        revokedAt: null,
        version: {
          id: mockVersionId,
          label: 'v1.0',
          product: {
            name: 'Test Product',
          },
          assets: [
            {
              id: 'asset-123',
              kind: 'SOURCE_GLB',
              status: 'READY',
              storageKey: 'path/to/file.glb',
            },
            {
              id: 'asset-456',
              kind: 'THUMB',
              status: 'READY',
              storageKey: 'path/to/thumb.jpg',
            },
          ],
        },
      })
      ;(prisma.share.update as jest.Mock).mockResolvedValue({})

      const response = await request(app)
        .get(`/api/public/experience/${mockToken}`)
        .expect(200)

      expect(response.body.product.name).toBe('Test Product')
      expect(response.body.product.versionLabel).toBe('v1.0')
      expect(response.body.assets.glbUrl).toBeDefined()
      expect(response.body.assets.thumbUrl).toBeDefined()
      expect(response.body.share.remainingVisits).toBe(95)
    })

    it('should reject expired share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: 'share-123',
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2020-01-01'), // Past date
        maxVisits: 100,
        visitCount: 5,
        revokedAt: null,
        version: { assets: [] },
      })

      const response = await request(app)
        .get(`/api/public/experience/${mockToken}`)
        .expect(410)

      expect(response.body.error.code).toBe('SHARE_EXPIRED')
    })

    it('should reject revoked share', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: 'share-123',
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: 100,
        visitCount: 5,
        revokedAt: new Date(), // Revoked
        version: { assets: [] },
      })

      const response = await request(app)
        .get(`/api/public/experience/${mockToken}`)
        .expect(410)

      expect(response.body.error.code).toBe('SHARE_REVOKED')
    })

    it('should reject share with max visits reached', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue({
        id: 'share-123',
        companyId: mockCompanyId,
        token: mockToken,
        expiresAt: new Date('2030-01-01'),
        maxVisits: 10,
        visitCount: 10, // Max reached
        revokedAt: null,
        version: { assets: [] },
      })

      const response = await request(app)
        .get(`/api/public/experience/${mockToken}`)
        .expect(410)

      expect(response.body.error.code).toBe('SHARE_LIMIT_REACHED')
    })

    it('should reject invalid token format', async () => {
      const response = await request(app)
        .get('/api/public/experience/invalid-token')
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject non-existent token', async () => {
      ;(prisma.share.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .get(`/api/public/experience/${mockToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})
