/**
 * Analytics validators
 * Request validation for analytics endpoints
 */

import { query } from 'express-validator'

/**
 * Validator for GET /api/analytics/dashboard
 */
export const dashboardValidator = [
  query('from')
    .optional()
    .isISO8601()
    .withMessage('from must be a valid ISO8601 date'),

  query('to')
    .optional()
    .isISO8601()
    .withMessage('to must be a valid ISO8601 date'),
]
