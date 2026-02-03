/**
 * Products validators
 * Express-validator chains for product endpoints
 */

import { body, param, query } from 'express-validator'

export const createProductValidators = [
  body('projectId')
    .isUUID()
    .withMessage('Invalid project ID'),

  body('name')
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Name must be between 1 and 200 characters'),

  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 1000 })
    .withMessage('Description must be at most 1000 characters'),
]

export const updateProductValidators = [
  param('id')
    .isUUID()
    .withMessage('Invalid product ID'),

  body('name')
    .optional()
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 1, max: 200 })
    .withMessage('Name must be between 1 and 200 characters'),

  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 1000 })
    .withMessage('Description must be at most 1000 characters'),
]

export const productIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid product ID'),
]

export const listProductsValidators = [
  query('projectId')
    .optional()
    .isUUID()
    .withMessage('Invalid project ID'),
]
