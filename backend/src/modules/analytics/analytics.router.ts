/**
 * Analytics router (private)
 * Dashboard analytics endpoints
 * Requires authentication (ADMIN or USER)
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as analyticsService from './analytics.service'
import { dashboardValidator } from './analytics.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/analytics/dashboard
 * Get full analytics dashboard data
 * Supports date range filtering via ?from=&to=
 */
router.get(
  '/dashboard',
  validate(dashboardValidator),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId
    const { from, to } = req.query

    const dashboard = await analyticsService.getDashboard(companyId, {
      from: from as string | undefined,
      to: to as string | undefined,
    })

    res.json(dashboard)
  })
)

export { router as analyticsRouter }
