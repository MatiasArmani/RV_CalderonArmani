import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../../app'
import { prisma } from '../../lib/prisma'
import * as storage from '../../lib/storage'

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    version: {
      findUnique: jest.fn(),
    },
    asset: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
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

// Mock storage adapter
jest.mock('../../lib/storage', () => ({
  buildStorageKey: jest.fn((companyId, versionId, kind, filename) =>
    `${companyId}/versions/${versionId}/${kind}/${filename}`
  ),
  getPresignedUploadUrl: jest.fn(),
  getPresignedDownloadUrl: jest.fn(),
  getObjectMetadata: jest.fn(),
  downloadObject: jest.fn(),
  uploadObject: jest.fn(),
}))

// Mock canvas (for thumbnail generation)
jest.mock('canvas', () => ({
  createCanvas: jest.fn(() => ({
    getContext: jest.fn(() => ({
      createLinearGradient: jest.fn(() => ({
        addColorStop: jest.fn(),
      })),
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      stroke: jest.fn(),
      fillText: jest.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      font: '',
      textAlign: '',
    })),
    toBuffer: jest.fn(() => Buffer.from('mock-thumbnail')),
  })),
}))

describe('Assets Endpoints', () => {
  const app = createApp()

  // Use valid v4 UUIDs
  const companyId = '11111111-1111-4111-8111-111111111111'
  const otherCompanyId = '22222222-2222-4222-8222-222222222222'
  const userId = '33333333-3333-4333-8333-333333333333'
  const versionId = '44444444-4444-4444-8444-444444444444'
  const otherVersionId = '55555555-5555-4555-8555-555555555555'
  const assetId = '66666666-6666-4666-8666-666666666666'
  const newAssetId = '77777777-7777-4777-8777-777777777777'

  const validToken = jwt.sign(
    { sub: userId, companyId, role: 'ADMIN' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )

  const mockVersion = {
    id: versionId,
    companyId,
    productId: 'product-id',
    label: 'v1.0',
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  const mockAsset = {
    id: assetId,
    companyId,
    versionId,
    kind: 'SOURCE_GLB',
    status: 'READY',
    storageKey: `${companyId}/versions/${versionId}/source/model.glb`,
    contentType: 'model/gltf-binary',
    sizeBytes: 1024000,
    meta: { originalFilename: 'model.glb' },
    errorMessage: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/assets', () => {
    it('should list all assets for a version', async () => {
      const mockAssets = [mockAsset]

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)
      ;(prisma.asset.findMany as jest.Mock).mockResolvedValue(mockAssets)

      const response = await request(app)
        .get(`/api/assets?versionId=${versionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0]).toMatchObject({
        id: assetId,
        kind: 'SOURCE_GLB',
        status: 'READY',
      })
      // Should not expose companyId or storageKey
      expect(response.body[0].companyId).toBeUndefined()
      expect(response.body[0].storageKey).toBeUndefined()
    })

    it('should return 404 for version from another tenant', async () => {
      const otherVersion = {
        ...mockVersion,
        id: otherVersionId,
        companyId: otherCompanyId,
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(otherVersion)

      const response = await request(app)
        .get(`/api/assets?versionId=${otherVersionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should require versionId parameter', async () => {
      const response = await request(app)
        .get('/api/assets')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('GET /api/assets/:id', () => {
    it('should return an asset with signed URLs', async () => {
      ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(mockAsset)
      ;(storage.getPresignedDownloadUrl as jest.Mock).mockResolvedValue(
        'https://s3.example.com/signed-url'
      )

      const response = await request(app)
        .get(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: assetId,
        kind: 'SOURCE_GLB',
        status: 'READY',
      })
      expect(response.body.urls).toBeDefined()
      expect(response.body.urls.source).toBe('https://s3.example.com/signed-url')
    })

    it('should return 404 for asset from another tenant', async () => {
      const otherAsset = {
        ...mockAsset,
        companyId: otherCompanyId,
      }

      ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(otherAsset)

      const response = await request(app)
        .get(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/assets/upload-url', () => {
    it('should return a presigned upload URL', async () => {
      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)
      ;(prisma.asset.findFirst as jest.Mock).mockResolvedValue(null) // No existing asset
      ;(prisma.asset.create as jest.Mock).mockResolvedValue({
        ...mockAsset,
        id: newAssetId,
        status: 'PENDING_UPLOAD',
      })
      ;(storage.getPresignedUploadUrl as jest.Mock).mockResolvedValue({
        url: 'https://s3.example.com/upload-url',
        method: 'PUT',
        headers: { 'Content-Type': 'model/gltf-binary' },
      })

      const response = await request(app)
        .post('/api/assets/upload-url')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId,
          filename: 'model.glb',
          contentType: 'model/gltf-binary',
          sizeBytes: 1024000,
        })
        .expect(201)

      expect(response.body).toMatchObject({
        assetId: newAssetId,
        uploadUrl: 'https://s3.example.com/upload-url',
        method: 'PUT',
      })
    })

    it('should reject invalid content type', async () => {
      const response = await request(app)
        .post('/api/assets/upload-url')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId,
          filename: 'model.obj',
          contentType: 'model/obj',
          sizeBytes: 1024000,
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject file size over 100MB', async () => {
      const response = await request(app)
        .post('/api/assets/upload-url')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId,
          filename: 'huge.glb',
          contentType: 'model/gltf-binary',
          sizeBytes: 200000000, // 200MB
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject version from another tenant', async () => {
      const otherVersion = {
        ...mockVersion,
        id: otherVersionId,
        companyId: otherCompanyId,
      }

      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(otherVersion)

      const response = await request(app)
        .post('/api/assets/upload-url')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId: otherVersionId,
          filename: 'model.glb',
          contentType: 'model/gltf-binary',
          sizeBytes: 1024000,
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should reject if version already has a non-failed asset', async () => {
      ;(prisma.version.findUnique as jest.Mock).mockResolvedValue(mockVersion)
      ;(prisma.asset.findFirst as jest.Mock).mockResolvedValue({
        ...mockAsset,
        status: 'READY',
      })

      const response = await request(app)
        .post('/api/assets/upload-url')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          versionId,
          filename: 'model.glb',
          contentType: 'model/gltf-binary',
          sizeBytes: 1024000,
        })
        .expect(500) // Error thrown as 500 (could be 409 with custom error handling)

      expect(response.body.error.message).toContain('already has a source GLB asset')
    })
  })

  describe('POST /api/assets/:id/complete', () => {
    it('should complete upload and process asset', async () => {
      const pendingAsset = {
        ...mockAsset,
        status: 'PENDING_UPLOAD',
      }

      // Valid GLB header (magic bytes "glTF" + version 2 + length)
      const glbBuffer = Buffer.alloc(1000)
      glbBuffer.write('glTF', 0)
      glbBuffer.writeUInt32LE(2, 4) // version 2
      glbBuffer.writeUInt32LE(1000, 8) // total length

      ;(prisma.asset.findUnique as jest.Mock)
        .mockResolvedValueOnce(pendingAsset) // First call for validation
        .mockResolvedValueOnce({ ...pendingAsset, status: 'UPLOADED' }) // After UPLOADED transition
        .mockResolvedValueOnce({ ...pendingAsset, status: 'PROCESSING' }) // After PROCESSING
        .mockResolvedValueOnce({ ...pendingAsset, status: 'READY' }) // Final check
      ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([]) // No derived assets
      ;(prisma.asset.update as jest.Mock).mockImplementation((args) => {
        return Promise.resolve({
          ...pendingAsset,
          ...args.data,
        })
      })
      ;(prisma.asset.create as jest.Mock).mockResolvedValue({
        id: 'thumb-id',
        kind: 'THUMB',
        status: 'PENDING_UPLOAD',
      })
      ;(storage.getObjectMetadata as jest.Mock).mockResolvedValue({
        exists: true,
        sizeBytes: 1024000,
      })
      ;(storage.downloadObject as jest.Mock).mockResolvedValue(glbBuffer)
      ;(storage.uploadObject as jest.Mock).mockResolvedValue(undefined)

      const response = await request(app)
        .post(`/api/assets/${assetId}/complete`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.status).toBe('READY')
    })

    it('should return 404 for asset from another tenant', async () => {
      const otherAsset = {
        ...mockAsset,
        companyId: otherCompanyId,
      }

      ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(otherAsset)

      const response = await request(app)
        .post(`/api/assets/${assetId}/complete`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('DELETE /api/assets/:id', () => {
    it('should delete an asset', async () => {
      ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(mockAsset)
      ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([]) // No derived assets
      ;(prisma.asset.delete as jest.Mock).mockResolvedValue(mockAsset)

      const response = await request(app)
        .delete(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
    })

    it('should return 404 for asset from another tenant', async () => {
      const otherAsset = {
        ...mockAsset,
        companyId: otherCompanyId,
      }

      ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(otherAsset)

      const response = await request(app)
        .delete(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})
