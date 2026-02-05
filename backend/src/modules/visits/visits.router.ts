/**
 * Visits router (private)
 * Admin endpoints for viewing visit analytics
 * Requires authentication
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as visitsService from './visits.service'
import { listVisitsValidator, getVisitValidator } from './visits.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/visits
 * List all visits for the authenticated company
 * Supports filtering by shareId
 */
router.get(
  '/',
  validate(listVisitsValidator),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId
    const { shareId, limit, offset } = req.query

    const result = await visitsService.listVisits(companyId, {
      shareId: shareId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    })

    res.json(result)
  })
)

/**
 * GET /api/visits/:id
 * Get a single visit by ID
 */
router.get(
  '/:id',
  validate(getVisitValidator),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId
    const id = req.params.id as string

    const visit = await visitsService.getVisit(id, companyId)
    res.json(visit)
  })
)

export { router as visitsRouter }
