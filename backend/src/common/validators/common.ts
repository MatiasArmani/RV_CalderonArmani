/**
 * Common validators using express-validator
 * Reusable validation chains
 */

import { body, param, query } from 'express-validator'

// UUID validator
export const uuidParam = (field: string) =>
  param(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`)

export const uuidBody = (field: string) =>
  body(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`)

// String validators with length limits
export const requiredString = (field: string, maxLength = 255) =>
  body(field)
    .isString()
    .withMessage(`${field} must be a string`)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .isLength({ max: maxLength })
    .withMessage(`${field} must be at most ${maxLength} characters`)

export const optionalString = (field: string, maxLength = 2000) =>
  body(field)
    .optional({ values: 'null' })
    .isString()
    .withMessage(`${field} must be a string`)
    .trim()
    .isLength({ max: maxLength })
    .withMessage(`${field} must be at most ${maxLength} characters`)

// Email validator
export const emailValidator = body('email')
  .isEmail()
  .withMessage('Must be a valid email address')
  .normalizeEmail()
  .isLength({ max: 255 })
  .withMessage('Email must be at most 255 characters')

// Password validator (for registration/login)
export const passwordValidator = body('password')
  .isString()
  .withMessage('Password must be a string')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be between 8 and 128 characters')

// Pagination validators
export const paginationValidators = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
]

// Date validators
export const dateValidator = (field: string) =>
  body(field)
    .isISO8601()
    .withMessage(`${field} must be a valid ISO8601 date`)
    .toDate()

export const optionalDateValidator = (field: string) =>
  body(field)
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage(`${field} must be a valid ISO8601 date`)
    .toDate()

// Positive integer validator
export const positiveInt = (field: string) =>
  body(field)
    .isInt({ min: 1 })
    .withMessage(`${field} must be a positive integer`)
    .toInt()

export const optionalPositiveInt = (field: string) =>
  body(field)
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage(`${field} must be a positive integer`)
    .toInt()
