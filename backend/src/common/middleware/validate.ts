/**
 * Validation middleware using express-validator
 * Centralizes validation error handling
 */

import { Request, Response, NextFunction } from 'express'
import { validationResult, ValidationChain } from 'express-validator'
import { Errors } from '../errors/index'

export function validate(validations: ValidationChain[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)))

    // Check for errors
    const errors = validationResult(req)
    if (errors.isEmpty()) {
      return next()
    }

    // Map errors to our format
    const details = errors.array().map((err) => {
      if (err.type === 'field') {
        return {
          field: err.path,
          message: err.msg,
        }
      }
      return {
        message: err.msg,
      }
    })

    return next(Errors.validation(details))
  }
}
