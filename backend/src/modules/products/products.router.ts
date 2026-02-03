/**
 * Products router
 * REST endpoints for product CRUD
 */

import { Router } from 'express'
import { asyncHandler, validate } from '../../common/middleware/index'
import { authenticate, requireUser } from '../auth/auth.middleware'
import * as productsService from './products.service'
import {
  createProductValidators,
  updateProductValidators,
  productIdValidator,
  listProductsValidators,
} from './products.validators'

const router = Router()

// All routes require authentication
router.use(authenticate)
router.use(requireUser)

/**
 * GET /api/products?projectId=...
 * List all products for the authenticated user's company
 * Optionally filtered by projectId
 */
router.get(
  '/',
  validate(listProductsValidators),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId as string | undefined
    const products = await productsService.listProducts(req.user!.companyId, projectId)
    res.json(products)
  })
)

/**
 * GET /api/products/:id
 * Get a specific product by ID
 */
router.get(
  '/:id',
  validate(productIdValidator),
  asyncHandler(async (req, res) => {
    const product = await productsService.getProduct(req.params.id, req.user!.companyId)
    res.json(product)
  })
)

/**
 * POST /api/products
 * Create a new product
 */
router.post(
  '/',
  validate(createProductValidators),
  asyncHandler(async (req, res) => {
    const product = await productsService.createProduct(req.user!.companyId, {
      projectId: req.body.projectId,
      name: req.body.name,
      description: req.body.description,
    })
    res.status(201).json(product)
  })
)

/**
 * PATCH /api/products/:id
 * Update a product
 */
router.patch(
  '/:id',
  validate(updateProductValidators),
  asyncHandler(async (req, res) => {
    const product = await productsService.updateProduct(
      req.params.id,
      req.user!.companyId,
      {
        name: req.body.name,
        description: req.body.description,
      }
    )
    res.json(product)
  })
)

/**
 * DELETE /api/products/:id
 * Delete a product
 */
router.delete(
  '/:id',
  validate(productIdValidator),
  asyncHandler(async (req, res) => {
    await productsService.deleteProduct(req.params.id, req.user!.companyId)
    res.json({ ok: true })
  })
)

export { router as productsRouter }
