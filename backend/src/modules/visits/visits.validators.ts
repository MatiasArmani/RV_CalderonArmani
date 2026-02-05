/**
 * Visits validators
 * Request validation for visit tracking endpoints
 */

import { body, param, query } from 'express-validator'

/**
 * Validator for POST /api/public/visits/start
 */
export const startVisitValidator = [
  body('shareToken')
    .isString()
    .withMessage('shareToken must be a string')
    .isLength({ min: 64, max: 64 })
    .withMessage('shareToken must be 64 characters')
    .matches(/^[a-f0-9]+$/)
    .withMessage('shareToken must be hexadecimal'),

  body('device')
    .optional()
    .isObject()
    .withMessage('device must be an object'),

  body('device.ua')
    .optional()
    .isString()
    .withMessage('device.ua must be a string')
    .isLength({ max: 500 })
    .withMessage('device.ua must be at most 500 characters'),

  body('device.os')
    .optional()
    .isString()
    .withMessage('device.os must be a string')
    .isLength({ max: 50 })
    .withMessage('device.os must be at most 50 characters'),

  body('device.isMobile')
    .optional()
    .isBoolean()
    .withMessage('device.isMobile must be a boolean'),
]

/**
 * Validator for POST /api/public/visits/end
 */
export const endVisitValidator = [
  body('visitId')
    .isString()
    .withMessage('visitId must be a string')
    .isUUID()
    .withMessage('visitId must be a valid UUID'),

  body('durationMs')
    .isInt({ min: 0 })
    .withMessage('durationMs must be a non-negative integer'),

  body('usedAR')
    .isBoolean()
    .withMessage('usedAR must be a boolean'),
]

/**
 * Validator for GET /api/visits (admin)
 */
export const listVisitsValidator = [
  query('shareId')
    .optional()
    .isUUID()
    .withMessage('shareId must be a valid UUID'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be a non-negative integer'),
]

/**
 * Validator for GET /api/visits/:id (admin)
 */
export const getVisitValidator = [
  param('id')
    .isUUID()
    .withMessage('id must be a valid UUID'),
]
