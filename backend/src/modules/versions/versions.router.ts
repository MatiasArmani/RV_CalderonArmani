/**
 * Versions router
 * REST endpoints for version CRUD
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as versionsService from './versions.service'
import {
  createVersionValidators,
  updateVersionValidators,
  versionIdValidator,
  listVersionsValidators,
} from './versions.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/versions?productId=...
 * List all versions for the authenticated user's company
 * Optionally filtered by productId
 */
router.get(
  '/',
  validate(listVersionsValidators),
  asyncHandler(async (req, res) => {
    const productId = req.query.productId as string | undefined
    const versions = await versionsService.listVersions(req.user!.companyId, productId)
    res.json(versions)
  })
)

/**
 * GET /api/versions/:id
 * Get a specific version by ID
 */
router.get(
  '/:id',
  validate(versionIdValidator),
  asyncHandler(async (req, res) => {
    const version = await versionsService.getVersion(req.params.id, req.user!.companyId)
    res.json(version)
  })
)

/**
 * POST /api/versions
 * Create a new version
 */
router.post(
  '/',
  validate(createVersionValidators),
  asyncHandler(async (req, res) => {
    const version = await versionsService.createVersion(req.user!.companyId, {
      productId: req.body.productId,
      label: req.body.label,
      notes: req.body.notes,
    })
    res.status(201).json(version)
  })
)

/**
 * PATCH /api/versions/:id
 * Update a version
 */
router.patch(
  '/:id',
  validate(updateVersionValidators),
  asyncHandler(async (req, res) => {
    const version = await versionsService.updateVersion(
      req.params.id,
      req.user!.companyId,
      {
        label: req.body.label,
        notes: req.body.notes,
      }
    )
    res.json(version)
  })
)

/**
 * DELETE /api/versions/:id
 * Delete a version
 */
router.delete(
  '/:id',
  validate(versionIdValidator),
  asyncHandler(async (req, res) => {
    await versionsService.deleteVersion(req.params.id, req.user!.companyId)
    res.json({ ok: true })
  })
)

export { router as versionsRouter }
