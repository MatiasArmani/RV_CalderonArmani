/**
 * Public router
 * Endpoints for public access to shared experiences
 * No authentication required
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import * as publicService from './public.service'
import { experienceTokenValidator } from './public.validators'

const router = Router()

/**
 * GET /api/public/experience/:token
 * Get experience data for a shared version
 * Validates token and returns signed URLs for assets
 */
router.get(
  '/experience/:token',
  validate(experienceTokenValidator),
  asyncHandler(async (req, res) => {
    const token = req.params.token as string
    const experience = await publicService.getExperience(token)

    // Record visit asynchronously (don't await - fire and forget)
    publicService.recordVisit(token).catch(() => {
      // Silently ignore visit recording errors
    })

    res.json(experience)
  })
)

export { router as publicRouter }
