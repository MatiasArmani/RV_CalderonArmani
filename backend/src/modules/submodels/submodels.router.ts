/**
 * Submodels router
 * REST endpoints for submodel CRUD
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as submodelsService from './submodels.service'
import {
  createSubmodelValidators,
  updateSubmodelValidators,
  submodelIdValidator,
  listSubmodelsValidators,
} from './submodels.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/submodels?versionId=...
 * List all submodels for a version
 */
router.get(
  '/',
  validate(listSubmodelsValidators),
  asyncHandler(async (req, res) => {
    const versionId = req.query.versionId as string
    const submodels = await submodelsService.listSubmodels(req.user!.companyId, versionId)
    res.json(submodels)
  })
)

/**
 * GET /api/submodels/:id
 * Get a specific submodel by ID
 */
router.get(
  '/:id',
  validate(submodelIdValidator),
  asyncHandler(async (req, res) => {
    const submodel = await submodelsService.getSubmodel(req.params.id as string, req.user!.companyId)
    res.json(submodel)
  })
)

/**
 * POST /api/submodels
 * Create a new submodel
 */
router.post(
  '/',
  validate(createSubmodelValidators),
  asyncHandler(async (req, res) => {
    const submodel = await submodelsService.createSubmodel(req.user!.companyId, {
      versionId: req.body.versionId,
      name: req.body.name,
      sortOrder: req.body.sortOrder,
    })
    res.status(201).json(submodel)
  })
)

/**
 * PATCH /api/submodels/:id
 * Update a submodel
 */
router.patch(
  '/:id',
  validate(updateSubmodelValidators),
  asyncHandler(async (req, res) => {
    const submodel = await submodelsService.updateSubmodel(
      req.params.id as string,
      req.user!.companyId,
      {
        name: req.body.name,
        sortOrder: req.body.sortOrder,
      }
    )
    res.json(submodel)
  })
)

/**
 * DELETE /api/submodels/:id
 * Delete a submodel
 */
router.delete(
  '/:id',
  validate(submodelIdValidator),
  asyncHandler(async (req, res) => {
    await submodelsService.deleteSubmodel(req.params.id as string, req.user!.companyId)
    res.json({ ok: true })
  })
)

export { router as submodelsRouter }
