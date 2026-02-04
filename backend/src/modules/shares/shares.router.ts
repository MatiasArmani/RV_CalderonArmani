/**
 * Shares router
 * REST endpoints for share management
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as sharesService from './shares.service'
import {
  createShareValidators,
  shareIdValidator,
  listSharesValidators,
} from './shares.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/shares?versionId=...
 * List all shares for the authenticated user's company
 * Optionally filtered by versionId
 */
router.get(
  '/',
  validate(listSharesValidators),
  asyncHandler(async (req, res) => {
    const versionId = req.query.versionId as string | undefined
    const shares = await sharesService.listShares(req.user!.companyId, versionId)
    res.json(shares)
  })
)

/**
 * GET /api/shares/:id
 * Get a specific share by ID
 */
router.get(
  '/:id',
  validate(shareIdValidator),
  asyncHandler(async (req, res) => {
    const share = await sharesService.getShare(req.params.id as string, req.user!.companyId)
    res.json(share)
  })
)

/**
 * POST /api/shares
 * Create a new share for a version
 */
router.post(
  '/',
  validate(createShareValidators),
  asyncHandler(async (req, res) => {
    const share = await sharesService.createShare(req.user!.companyId, {
      versionId: req.body.versionId,
      expiresAt: new Date(req.body.expiresAt),
      maxVisits: req.body.maxVisits,
    })
    res.status(201).json(share)
  })
)

/**
 * POST /api/shares/:id/revoke
 * Revoke a share (marks it as revoked but keeps the record)
 */
router.post(
  '/:id/revoke',
  validate(shareIdValidator),
  asyncHandler(async (req, res) => {
    await sharesService.revokeShare(req.params.id as string, req.user!.companyId)
    res.json({ ok: true })
  })
)

/**
 * DELETE /api/shares/:id
 * Delete a share
 */
router.delete(
  '/:id',
  validate(shareIdValidator),
  asyncHandler(async (req, res) => {
    await sharesService.deleteShare(req.params.id as string, req.user!.companyId)
    res.json({ ok: true })
  })
)

export { router as sharesRouter }
