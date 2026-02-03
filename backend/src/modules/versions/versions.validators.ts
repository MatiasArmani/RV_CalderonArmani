/**
 * Versions validators
 * Express-validator chains for version endpoints
 */

import { body, param, query } from 'express-validator'

export const createVersionValidators = [
  body('productId')
    .isUUID()
    .withMessage('Invalid product ID'),

  body('label')
    .isString()
    .withMessage('Label must be a string')
    .trim()
    .notEmpty()
    .withMessage('Label is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Label must be between 1 and 50 characters'),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Notes must be a string')
    .isLength({ max: 1000 })
    .withMessage('Notes must be at most 1000 characters'),
]

export const updateVersionValidators = [
  param('id')
    .isUUID()
    .withMessage('Invalid version ID'),

  body('label')
    .optional()
    .isString()
    .withMessage('Label must be a string')
    .trim()
    .notEmpty()
    .withMessage('Label cannot be empty')
    .isLength({ min: 1, max: 50 })
    .withMessage('Label must be between 1 and 50 characters'),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Notes must be a string')
    .isLength({ max: 1000 })
    .withMessage('Notes must be at most 1000 characters'),
]

export const versionIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid version ID'),
]

export const listVersionsValidators = [
  query('productId')
    .optional()
    .isUUID()
    .withMessage('Invalid product ID'),
]
