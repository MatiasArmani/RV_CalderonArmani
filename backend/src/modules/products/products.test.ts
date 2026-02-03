import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    product: {
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

describe('Products Endpoints', () => {
  const app = createApp()

  // Use valid v4 UUIDs
  const companyId = '11111111-1111-4111-8111-111111111111'
  const otherCompanyId = '22222222-2222-4222-8222-222222222222'
  const userId = '33333333-3333-4333-8333-333333333333'
  const projectId = '44444444-4444-4444-8444-444444444444'
  const otherProjectId = '55555555-5555-4555-8555-555555555555'
  const productId = '66666666-6666-4666-8666-666666666666'
  const newProductId = '77777777-7777-4777-8777-777777777777'

  const validToken = jwt.sign(
    { sub: userId, companyId, role: 'ADMIN' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )

  const mockProject = {
    id: projectId,
    companyId,
    name: 'Test Project',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/products', () => {
    it('should list all products for the company', async () => {
      const mockProducts = [
        {
          id: productId,
          companyId,
          projectId,
          name: 'Product 1',
          description: 'Description 1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]

      ;(prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts)

      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0]).toMatchObject({
        id: productId,
        name: 'Product 1',
        projectId,
      })
      // Should not expose companyId
      expect(response.body[0].companyId).toBeUndefined()
    })

    it('should filter products by projectId', async () => {
      const mockProducts = [
        {
          id: productId,
          companyId,
          projectId,
          name: 'Product 1',
          description: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject)
      ;(prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts)

      const response = await request(app)
        .get(`/api/products?projectId=${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(1)
    })

    it('should return 404 for projectId from another tenant', async () => {
      const otherProject = {
        id: otherProjectId,
        companyId: otherCompanyId,
        name: 'Other Project',
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(otherProject)

      const response = await request(app)
        .get(`/api/products?projectId=${otherProjectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('GET /api/products/:id', () => {
    it('should return a product by ID', async () => {
      const mockProduct = {
        id: productId,
        companyId,
        projectId,
        name: 'Product 1',
        description: 'Description 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)

      const response = await request(app)
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: productId,
        name: 'Product 1',
        projectId,
      })
    })

    it('should return 404 for product from another tenant', async () => {
      const mockProduct = {
        id: productId,
        companyId: otherCompanyId,
        projectId: otherProjectId,
        name: 'Product 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)

      const response = await request(app)
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/products', () => {
    it('should create a new product with valid projectId', async () => {
      const mockProduct = {
        id: newProductId,
        companyId,
        projectId,
        name: 'New Product',
        description: 'New Description',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject)
      ;(prisma.product.create as jest.Mock).mockResolvedValue(mockProduct)

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          projectId,
          name: 'New Product',
          description: 'New Description',
        })
        .expect(201)

      expect(response.body).toMatchObject({
        id: newProductId,
        name: 'New Product',
        projectId,
      })
    })

    it('should reject projectId from another tenant', async () => {
      const otherProject = {
        id: otherProjectId,
        companyId: otherCompanyId,
        name: 'Other Project',
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(otherProject)

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          projectId: otherProjectId,
          name: 'New Product',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject non-existent projectId', async () => {
      const nonExistentId = '99999999-9999-4999-8999-999999999999'
      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          projectId: nonExistentId,
          name: 'New Product',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject invalid projectId format', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          projectId: 'invalid-uuid',
          name: 'New Product',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          projectId,
          name: '',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('PATCH /api/products/:id', () => {
    it('should update a product', async () => {
      const mockExisting = {
        id: productId,
        companyId,
        projectId,
        name: 'Old Name',
        description: 'Old Description',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      const mockUpdated = {
        ...mockExisting,
        name: 'Updated Name',
        updatedAt: new Date('2024-01-02'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockExisting)
      ;(prisma.product.update as jest.Mock).mockResolvedValue(mockUpdated)

      const response = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Updated Name',
        })
        .expect(200)

      expect(response.body.name).toBe('Updated Name')
    })

    it('should return 404 for product from another tenant', async () => {
      const mockExisting = {
        id: productId,
        companyId: otherCompanyId,
        projectId: otherProjectId,
        name: 'Other Company Product',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockExisting)

      const response = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Hacked Name',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('DELETE /api/products/:id', () => {
    it('should delete a product', async () => {
      const mockProduct = {
        id: productId,
        companyId,
        projectId,
        name: 'Product 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)
      ;(prisma.product.delete as jest.Mock).mockResolvedValue(mockProduct)

      const response = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
    })

    it('should return 404 for product from another tenant', async () => {
      const mockProduct = {
        id: productId,
        companyId: otherCompanyId,
        projectId: otherProjectId,
        name: 'Other Company Product',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)

      const response = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})
