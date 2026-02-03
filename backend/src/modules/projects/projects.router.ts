/**
 * Projects router
 * REST endpoints for project CRUD
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as projectsService from './projects.service'
import {
  createProjectValidators,
  updateProjectValidators,
  projectIdValidator,
} from './projects.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/projects
 * List all projects for the authenticated user's company
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const projects = await projectsService.listProjects(req.user!.companyId)
    res.json(projects)
  })
)

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
router.get(
  '/:id',
  validate(projectIdValidator),
  asyncHandler(async (req, res) => {
    const project = await projectsService.getProject(req.params.id, req.user!.companyId)
    res.json(project)
  })
)

/**
 * POST /api/projects
 * Create a new project
 */
router.post(
  '/',
  validate(createProjectValidators),
  asyncHandler(async (req, res) => {
    const project = await projectsService.createProject(req.user!.companyId, {
      name: req.body.name,
      description: req.body.description,
    })
    res.status(201).json(project)
  })
)

/**
 * PATCH /api/projects/:id
 * Update a project
 */
router.patch(
  '/:id',
  validate(updateProjectValidators),
  asyncHandler(async (req, res) => {
    const project = await projectsService.updateProject(
      req.params.id,
      req.user!.companyId,
      {
        name: req.body.name,
        description: req.body.description,
      }
    )
    res.json(project)
  })
)

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete(
  '/:id',
  validate(projectIdValidator),
  asyncHandler(async (req, res) => {
    await projectsService.deleteProject(req.params.id, req.user!.companyId)
    res.json({ ok: true })
  })
)

export { router as projectsRouter }
