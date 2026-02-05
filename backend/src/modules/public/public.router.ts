/**
 * Public router
 * Endpoints for public access to shared experiences
 * No authentication required
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import * as publicService from './public.service'
import * as visitsService from '../visits/visits.service'
import { experienceTokenValidator } from './public.validators'
import { startVisitValidator, endVisitValidator } from '../visits/visits.validators'

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

    // Note: Visit tracking is now handled by explicit start/end calls
    // The client calls POST /api/public/visits/start after loading

    res.json(experience)
  })
)

/**
 * POST /api/public/visits/start
 * Start tracking a visit
 * Called when user loads the experience page
 */
router.post(
  '/visits/start',
  validate(startVisitValidator),
  asyncHandler(async (req, res) => {
    const { shareToken, device } = req.body

    // If device info not provided in body, try to extract from User-Agent
    const deviceInfo = device ?? visitsService.createDeviceInfo(req.headers['user-agent'])

    const result = await visitsService.startVisit({
      shareToken,
      device: deviceInfo ?? undefined,
    })

    res.status(201).json(result)
  })
)

/**
 * POST /api/public/visits/end
 * End tracking a visit
 * Called when user leaves the experience page
 */
router.post(
  '/visits/end',
  validate(endVisitValidator),
  asyncHandler(async (req, res) => {
    const { visitId, durationMs, usedAR } = req.body

    const result = await visitsService.endVisit({
      visitId,
      durationMs,
      usedAR,
    })

    res.json(result)
  })
)

export { router as publicRouter }
