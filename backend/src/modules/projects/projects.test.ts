import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    project: {
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

describe('Projects Endpoints', () => {
  const app = createApp()

  // Use valid v4 UUIDs
  const companyId = '11111111-1111-4111-8111-111111111111'
  const otherCompanyId = '22222222-2222-4222-8222-222222222222'
  const userId = '33333333-3333-4333-8333-333333333333'
  const projectId = '44444444-4444-4444-8444-444444444444'
  const projectId2 = '55555555-5555-4555-8555-555555555555'
  const newProjectId = '66666666-6666-4666-8666-666666666666'

  const validToken = jwt.sign(
    { sub: userId, companyId, role: 'ADMIN' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/projects', () => {
    it('should list all projects for the company', async () => {
      const mockProjects = [
        {
          id: projectId,
          companyId,
          name: 'Project 1',
          description: 'Description 1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: projectId2,
          companyId,
          name: 'Project 2',
          description: null,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ]

      ;(prisma.project.findMany as jest.Mock).mockResolvedValue(mockProjects)

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(2)
      expect(response.body[0]).toMatchObject({
        id: projectId,
        name: 'Project 1',
        description: 'Description 1',
      })
      // Should not expose companyId
      expect(response.body[0].companyId).toBeUndefined()
    })

    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(401)

      expect(response.body.error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('GET /api/projects/:id', () => {
    it('should return a project by ID', async () => {
      const mockProject = {
        id: projectId,
        companyId,
        name: 'Project 1',
        description: 'Description 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject)

      const response = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: projectId,
        name: 'Project 1',
      })
    })

    it('should return 404 for non-existent project', async () => {
      const nonExistentId = '99999999-9999-4999-8999-999999999999'
      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .get(`/api/projects/${nonExistentId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should return 404 for project from another tenant', async () => {
      const mockProject = {
        id: projectId,
        companyId: otherCompanyId, // Different company
        name: 'Project 1',
        description: 'Description 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject)

      const response = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .get('/api/projects/invalid-uuid')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const mockProject = {
        id: newProjectId,
        companyId,
        name: 'New Project',
        description: 'New Description',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.create as jest.Mock).mockResolvedValue(mockProject)

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'New Project',
          description: 'New Description',
        })
        .expect(201)

      expect(response.body).toMatchObject({
        id: newProjectId,
        name: 'New Project',
        description: 'New Description',
      })
    })

    it('should create project with null description', async () => {
      const mockProject = {
        id: newProjectId,
        companyId,
        name: 'New Project',
        description: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.create as jest.Mock).mockResolvedValue(mockProject)

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'New Project',
        })
        .expect(201)

      expect(response.body.description).toBeNull()
    })

    it('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: '',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          description: 'Only description',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('PATCH /api/projects/:id', () => {
    it('should update a project', async () => {
      const mockExisting = {
        id: projectId,
        companyId,
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

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockExisting)
      ;(prisma.project.update as jest.Mock).mockResolvedValue(mockUpdated)

      const response = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Updated Name',
        })
        .expect(200)

      expect(response.body.name).toBe('Updated Name')
    })

    it('should return 404 for project from another tenant', async () => {
      const mockExisting = {
        id: projectId,
        companyId: otherCompanyId,
        name: 'Other Company Project',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockExisting)

      const response = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Hacked Name',
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('DELETE /api/projects/:id', () => {
    it('should delete a project', async () => {
      const mockProject = {
        id: projectId,
        companyId,
        name: 'Project 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject)
      ;(prisma.project.delete as jest.Mock).mockResolvedValue(mockProject)

      const response = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
    })

    it('should return 404 for project from another tenant', async () => {
      const mockProject = {
        id: projectId,
        companyId: otherCompanyId,
        name: 'Other Company Project',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      ;(prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject)

      const response = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})
