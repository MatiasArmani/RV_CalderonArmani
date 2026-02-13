/**
 * Assets validators
 * Express-validator chains for asset endpoints
 */

import { body, param, query } from 'express-validator'
import { ALLOWED_CONTENT_TYPE, MAX_FILE_SIZE_BYTES } from './processing'

export const requestUploadUrlValidators = [
  body('versionId')
    .isUUID()
    .withMessage('Invalid version ID'),

  body('filename')
    .isString()
    .withMessage('Filename must be a string')
    .trim()
    .notEmpty()
    .withMessage('Filename is required')
    .isLength({ max: 255 })
    .withMessage('Filename must be at most 255 characters')
    .matches(/\.glb$/i)
    .withMessage('Filename must end with .glb'),

  body('contentType')
    .isString()
    .withMessage('Content type must be a string')
    .equals(ALLOWED_CONTENT_TYPE)
    .withMessage(`Content type must be ${ALLOWED_CONTENT_TYPE}`),

  body('sizeBytes')
    .custom((value: unknown) => {
      const num = Number(value)
      return Number.isInteger(num) && num >= 1 && num <= MAX_FILE_SIZE_BYTES
    })
    .withMessage(`File size must be between 1 byte and ${MAX_FILE_SIZE_BYTES} bytes (100MB)`),

  body('submodelId')
    .optional({ nullable: true })
    .isUUID()
    .withMessage('Invalid submodel ID'),
]

export const completeUploadValidators = [
  param('id')
    .isUUID()
    .withMessage('Invalid asset ID'),
]

export const assetIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid asset ID'),
]

export const listAssetsValidators = [
  query('versionId')
    .isUUID()
    .withMessage('Invalid version ID'),
]
