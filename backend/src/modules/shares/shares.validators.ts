/**
 * Shares validators
 * Express-validator chains for share endpoints
 */

import { body, param, query } from 'express-validator'

export const createShareValidators = [
  body('versionId')
    .isUUID()
    .withMessage('Invalid version ID'),

  body('expiresAt')
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO8601 date')
    .custom((value: string) => {
      const date = new Date(value)
      if (date <= new Date()) {
        throw new Error('Expiration date must be in the future')
      }
      return true
    }),

  body('maxVisits')
    .optional({ nullable: true })
    .custom((value: unknown) => {
      if (value === null || value === undefined) {
        return true
      }
      const num = Number(value)
      return Number.isInteger(num) && num >= 1
    })
    .withMessage('Max visits must be a positive integer or null'),
]

export const shareIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid share ID'),
]

export const listSharesValidators = [
  query('versionId')
    .optional()
    .isUUID()
    .withMessage('Invalid version ID'),
]
