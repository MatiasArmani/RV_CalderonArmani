/**
 * Submodels validators
 * Express-validator chains for submodel endpoints
 */

import { body, param, query } from 'express-validator'

export const createSubmodelValidators = [
  body('versionId')
    .isUUID()
    .withMessage('Invalid version ID'),

  body('name')
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('sortOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
]

export const updateSubmodelValidators = [
  param('id')
    .isUUID()
    .withMessage('Invalid submodel ID'),

  body('name')
    .optional()
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('sortOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
]

export const submodelIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid submodel ID'),
]

export const listSubmodelsValidators = [
  query('versionId')
    .isUUID()
    .withMessage('versionId is required and must be a valid UUID'),
]
