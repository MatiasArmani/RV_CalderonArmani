/**
 * Public experience validators
 * Express-validator chains for public endpoints
 */

import { param } from 'express-validator'

// Token is 64 hex characters
export const experienceTokenValidator = [
  param('token')
    .isString()
    .withMessage('Token is required')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid token format')
    .matches(/^[a-f0-9]+$/i)
    .withMessage('Invalid token format'),
]
