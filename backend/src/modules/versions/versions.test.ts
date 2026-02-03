import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: jest.fn(),
    },
    version: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    refreshSession: {
      findMany: jest.fn(),
    },
  },
}))

describe('Versions Endpoints', () => {
  const app = createApp()

  // Use valid v4 UUIDs
  const companyId = '11111111-1111-4111-8111-111111111111'
  const otherCompanyId = '22222222-2222-4222-8222-222222222222'
  const userId = '33333333-3333-4333-8333-333333333333'
  const projectId = '44444444-4444-4444-8444-444444444444'
  const productId = '55555555-5555-4555-8555-555555555555'
  const otherProductId = '66666666-6666-4666-8666-666666666666'
  const versionId = '77777777-7777-4777-8777-777777777777'
  const newVersionId = '88888888-8888-4888-8888-888888888888'

  const validToken = jwt.sign(
    { sub: userId, companyId, role: 'ADMIN' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )

  const mockProduct = {
    id: productId,
    companyId,
    projectId,
    name: 'Test Product',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/versions', () => {
    it('should list all versions for the company', async () => {
      const mockVersions = [
        {
          id: versionId,
          companyId,
          productId,
          label: 'v1.0',
          notes: 'Initial release',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]

      ;(prisma.version.findMany as jest.Mock).mockResolvedValue(mockVersions)

      const response = await request(app)
        .get('/api/versions')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0]).toMatchObject({
        id: versionId,
        label: 'v1.0',
        productId,
      })
      // Should not expose companyId
      expect(response.body[0].companyId).toBeUndefined()
    })

    it('should filter versions by productId', async () => {
      const mockVersions = [
        {
          id: versionId,
          companyId,
          productId,
          label: 'v1.0',
          notes: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)
      ;(prisma.version.findMany as jest.Mock).mockResolvedValue(mockVersions)

      const response = await request(app)
        .get(`/api/versions?productId=${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(1)
    })

    it('should return 404 for productId from another tenant', async () => {
      const otherProduct = {
        id: otherProductId,
        companyId: otherCompanyId,
        projectId: 'other-project',
        name: 'Other Product',
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(otherProduct)

      const response = await request(app)
        .get(`/api/versions?productId=${otherProductId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('GET /api/versions/:id', () => {
    it('should return a version by ID', async () => {
      const mockVersion = {
        id: versionId,
        companyId,
        productId,
        label: 'v1.0',
        notes: 'Initial release',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)

      const response = await request(app)
        .get(`/api/versions/${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: versionId,
        label: 'v1.0',
        productId,
      })
    })

    it('should return 404 for version from another tenant', async () => {
      const mockVersion = {
        id: versionId,
        companyId: otherCompanyId,
        productId: otherProductId,
        label: 'v1.0',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)

      const response = await request(app)
        .get(`/api/versions/${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/versions', () => {
    it('should create a new version with valid productId', async () => {
      const mockVersion = {
        id: newVersionId,
        companyId,
        productId,
        label: 'v2.0',
        notes: 'New release',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)
      ;(prisma.version.create as jest.Mock).mockResolvedValue(mockVersion)

      const response = await request(app)
        .post('/api/versions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          productId,
          label: 'v2.0',
          notes: 'New release',
        })
        .expect(201)

      expect(response.body).toMatchObject({
        id: newVersionId,
        label: 'v2.0',
        productId,
      })
    })

    it('should reject productId from another tenant', async () => {
      const otherProduct = {
        id: otherProductId,
        companyId: otherCompanyId,
        projectId: 'other-project',
        name: 'Other Product',
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(otherProduct)

      const response = await request(app)
        .post('/api/versions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          productId: otherProductId,
          label: 'v1.0',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject non-existent productId', async () => {
      const nonExistentId = '99999999-9999-4999-8999-999999999999'
      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .post('/api/versions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          productId: nonExistentId,
          label: 'v1.0',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject invalid productId format', async () => {
      const response = await request(app)
        .post('/api/versions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          productId: 'invalid-uuid',
          label: 'v1.0',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject empty label', async () => {
      const response = await request(app)
        .post('/api/versions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          productId,
          label: '',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('PATCH /api/versions/:id', () => {
    it('should update a version', async () => {
      const mockExisting = {
        id: versionId,
        companyId,
        productId,
        label: 'v1.0',
        notes: 'Old notes',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      const mockUpdated = {
        ...mockExisting,
        label: 'v1.1',
        updatedAt: new Date('2024-01-02'),
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockExisting)
      ;(prisma.version.update as jest.Mock).mockResolvedValue(mockUpdated)

      const response = await request(app)
        .patch(`/api/versions/${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          label: 'v1.1',
        })
        .expect(200)

      expect(response.body.label).toBe('v1.1')
    })

    it('should return 404 for version from another tenant', async () => {
      const mockExisting = {
        id: versionId,
        companyId: otherCompanyId,
        productId: otherProductId,
        label: 'v1.0',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockExisting)

      const response = await request(app)
        .patch(`/api/versions/${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          label: 'v1.1-hacked',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('DELETE /api/versions/:id', () => {
    it('should delete a version', async () => {
      const mockVersion = {
        id: versionId,
        companyId,
        productId,
        label: 'v1.0',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)
      ;(prisma.version.delete as jest.Mock).mockResolvedValue(mockVersion)

      const response = await request(app)
        .delete(`/api/versions/${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
    })

    it('should return 404 for version from another tenant', async () => {
      const mockVersion = {
        id: versionId,
        companyId: otherCompanyId,
        productId: otherProductId,
        label: 'v1.0',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)

      const response = await request(app)
        .delete(`/api/versions/${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})
