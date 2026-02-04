/**
 * Assets router
 * REST endpoints for asset upload, processing, and retrieval
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as assetsService from './assets.service'
import {
  requestUploadUrlValidators,
  completeUploadValidators,
  assetIdValidator,
  listAssetsValidators,
} from './assets.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/assets?versionId=...
 * List all assets for a version
 */
router.get(
  '/',
  validate(listAssetsValidators),
  asyncHandler(async (req, res) => {
    const versionId = req.query.versionId as string
    const assets = await assetsService.listAssets(req.user!.companyId, versionId)
    res.json(assets)
  })
)

/**
 * GET /api/assets/:id
 * Get a specific asset by ID with signed URLs
 */
router.get(
  '/:id',
  validate(assetIdValidator),
  asyncHandler(async (req, res) => {
    const asset = await assetsService.getAsset(req.params.id as string, req.user!.companyId)
    res.json(asset)
  })
)

/**
 * POST /api/assets/upload-url
 * Request a presigned URL for uploading a new asset
 * Creates asset in PENDING_UPLOAD state
 */
router.post(
  '/upload-url',
  validate(requestUploadUrlValidators),
  asyncHandler(async (req, res) => {
    const result = await assetsService.requestUploadUrl(
      req.user!.companyId,
      req.body.versionId,
      req.body.filename,
      req.body.contentType,
      req.body.sizeBytes
    )
    res.status(201).json(result)
  })
)

/**
 * POST /api/assets/:id/complete
 * Mark upload as complete and start processing
 * Transitions: PENDING_UPLOAD → UPLOADED → PROCESSING → READY/FAILED
 */
router.post(
  '/:id/complete',
  validate(completeUploadValidators),
  asyncHandler(async (req, res) => {
    const asset = await assetsService.completeUpload(req.params.id as string, req.user!.companyId)
    res.json(asset)
  })
)

/**
 * DELETE /api/assets/:id
 * Delete an asset and its derived assets
 */
router.delete(
  '/:id',
  validate(assetIdValidator),
  asyncHandler(async (req, res) => {
    await assetsService.deleteAsset(req.params.id as string, req.user!.companyId)
    res.json({ ok: true })
  })
)

export { router as assetsRouter }
