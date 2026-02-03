/**
 * Auth middleware
 * authenticate: validates JWT and injects req.user
 * authorize: checks role permissions
 */

import { Request, Response, NextFunction } from 'express'
import { Role } from '@prisma/client'
import { verifyAccessToken, findUserById } from './auth.service'
import { Errors } from '../../common/errors/index'

/**
 * Authenticate middleware
 * Extracts and validates JWT from Authorization header
 * Injects req.user with { id, companyId, role }
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      throw Errors.unauthorized('No authorization header')
    }

    const parts = authHeader.split(' ')

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw Errors.unauthorized('Invalid authorization format')
    }

    const token = parts[1]

    if (!token) {
      throw Errors.unauthorized('No token provided')
    }

    const payload = verifyAccessToken(token)

    // Inject user into request
    req.user = {
      id: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    }

    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Authorize middleware
 * Checks if user has one of the required roles
 * Must be used after authenticate middleware
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.unauthorized('Not authenticated'))
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(Errors.forbidden('Insufficient permissions'))
    }

    next()
  }
}

/**
 * Optional authenticate middleware
 * Same as authenticate but doesn't fail if no token
 * Useful for endpoints that work with or without auth
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return next()
  }

  const parts = authHeader.split(' ')

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return next()
  }

  try {
    const payload = verifyAccessToken(parts[1])

    req.user = {
      id: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    }
  } catch {
    // Ignore errors for optional auth
  }

  next()
}

/**
 * Require admin middleware
 * Shortcut for authorize('ADMIN')
 */
export const requireAdmin = authorize('ADMIN')

/**
 * Require any authenticated user
 * Shortcut for authorize('ADMIN', 'USER')
 */
export const requireUser = authorize('ADMIN', 'USER')

/**
 * Validates that a resource belongs to the user's company
 * Returns 404 to avoid leaking resource existence
 */
export function validateTenantAccess<T extends { companyId: string }>(
  resource: T | null,
  userCompanyId: string
): T {
  if (!resource) {
    throw Errors.notFound()
  }

  if (resource.companyId !== userCompanyId) {
    // Return 404 instead of 403 to not leak resource existence
    throw Errors.notFound()
  }

  return resource
}
