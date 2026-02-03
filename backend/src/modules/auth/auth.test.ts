import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { hashPassword } from './auth.service'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    company: {
      create: jest.fn(),
    },
    refreshSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

describe('Auth Endpoints', () => {
  const app = createApp()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/auth/register', () => {
    it('should create company and admin user', async () => {
      const mockCompany = { id: 'company-123', name: 'Test Company' }
      const mockUser = {
        id: 'user-123',
        email: 'admin@test.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        companyId: 'company-123',
      }

      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback({
          company: { create: jest.fn().mockResolvedValue(mockCompany) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
        })
      })

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          companyName: 'Test Company',
          email: 'admin@test.com',
          password: 'password123',
        })
        .expect(201)

      expect(response.body.company).toMatchObject({
        id: 'company-123',
        name: 'Test Company',
      })
      expect(response.body.user).toMatchObject({
        id: 'user-123',
        email: 'admin@test.com',
        role: 'ADMIN',
      })
    })

    it('should reject duplicate email', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: 'admin@test.com',
      })

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          companyName: 'Test Company',
          email: 'admin@test.com',
          password: 'password123',
        })
        .expect(409)

      expect(response.body.error.code).toBe('CONFLICT')
    })

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          companyName: 'Test Company',
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          companyName: 'Test Company',
          email: 'admin@test.com',
          password: 'short',
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/auth/login', () => {
    it('should return accessToken and set httpOnly cookie', async () => {
      const passwordHash = await hashPassword('password123')
      const mockUser = {
        id: 'user-123',
        email: 'admin@test.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        companyId: 'company-123',
        company: { id: 'company-123', name: 'Test Company' },
      }

      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      ;(prisma.refreshSession.create as jest.Mock).mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
      })

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        })
        .expect(200)

      expect(response.body.accessToken).toBeDefined()
      expect(response.body.user).toMatchObject({
        id: 'user-123',
        companyId: 'company-123',
        role: 'ADMIN',
      })

      // Check for httpOnly cookie
      const cookies = response.headers['set-cookie']
      expect(cookies).toBeDefined()
      expect(cookies[0]).toContain('refreshToken=')
      expect(cookies[0]).toContain('HttpOnly')
      expect(cookies[0]).toContain('Path=/api/auth')
    })

    it('should reject invalid credentials', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        })
        .expect(401)

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('should reject wrong password', async () => {
      const passwordHash = await hashPassword('password123')
      const mockUser = {
        id: 'user-123',
        email: 'admin@test.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        companyId: 'company-123',
        company: { id: 'company-123', name: 'Test Company' },
      }

      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        })
        .expect(401)

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('should reject disabled user', async () => {
      const passwordHash = await hashPassword('password123')
      const mockUser = {
        id: 'user-123',
        email: 'admin@test.com',
        passwordHash,
        role: 'ADMIN',
        status: 'DISABLED',
        companyId: 'company-123',
        company: { id: 'company-123', name: 'Test Company' },
      }

      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        })
        .expect(403)

      expect(response.body.error.code).toBe('FORBIDDEN')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should clear refresh token cookie', async () => {
      ;(prisma.refreshSession.findMany as jest.Mock).mockResolvedValue([])

      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200)

      expect(response.body.success).toBe(true)

      // Check cookie is cleared
      const cookies = response.headers['set-cookie']
      expect(cookies).toBeDefined()
      expect(cookies[0]).toContain('refreshToken=;')
    })
  })

  describe('GET /api/auth/me', () => {
    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401)

      expect(response.body.error.code).toBe('UNAUTHORIZED')
    })

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body.error.code).toBe('TOKEN_INVALID')
    })
  })
})

describe('Auth Middleware', () => {
  const app = createApp()

  describe('authenticate', () => {
    it('should reject request without authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401)

      expect(response.body.error.code).toBe('UNAUTHORIZED')
    })

    it('should reject invalid authorization format', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token123')
        .expect(401)

      expect(response.body.error.code).toBe('UNAUTHORIZED')
    })

    it('should reject expired token', async () => {
      // Create an expired token manually
      const jwt = require('jsonwebtoken')
      const expiredToken = jwt.sign(
        { sub: 'user-123', companyId: 'company-123', role: 'ADMIN' },
        process.env.JWT_SECRET,
        { expiresIn: -1 } // Already expired
      )

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)

      expect(response.body.error.code).toBe('TOKEN_EXPIRED')
    })
  })
})
