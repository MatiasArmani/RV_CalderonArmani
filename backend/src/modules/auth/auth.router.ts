/**
 * Auth router
 * Handles registration, login, refresh, logout, and me endpoints
 */

import { Router, Request, Response } from 'express'
import { getConfig } from '../../common/config/index'
import { asyncHandler, validate, loginLimiter, registerLimiter, refreshLimiter } from '../../common/middleware/index'
import { Errors } from '../../common/errors/index'
import { registerValidators, loginValidators } from './auth.validators'
import { authenticate } from './auth.middleware'
import {
  registerCompanyWithAdmin,
  loginUser,
  refreshTokens,
  logoutUser,
  findUserById,
  verifyAccessToken,
} from './auth.service'

const router = Router()

// Cookie configuration
function getRefreshCookieOptions(expiresAt: Date) {
  const config = getConfig()
  const isProduction = config.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/api/auth',
    expires: expiresAt,
  }
}

/**
 * POST /api/auth/register
 * Creates a new company with admin user
 */
router.post(
  '/register',
  registerLimiter,
  validate(registerValidators),
  asyncHandler(async (req: Request, res: Response) => {
    const { companyName, email, password } = req.body

    const { company, user } = await registerCompanyWithAdmin({
      companyName,
      email,
      password,
    })

    res.status(201).json({
      company: {
        id: company.id,
        name: company.name,
      },
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })
  })
)

/**
 * POST /api/auth/login
 * Returns accessToken in body and refreshToken in httpOnly cookie
 */
router.post(
  '/login',
  loginLimiter,
  validate(loginValidators),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body

    const { user, tokens, refreshExpiresAt } = await loginUser({ email, password })

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, getRefreshCookieOptions(refreshExpiresAt))

    res.json({
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        companyId: user.companyId,
        role: user.role,
      },
    })
  })
)

/**
 * POST /api/auth/refresh
 * Rotates tokens - requires refreshToken cookie and userId from old accessToken
 */
router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken
    const authHeader = req.headers.authorization

    if (!refreshToken) {
      throw Errors.unauthorized('No refresh token')
    }

    // Get userId from expired access token (we still decode it even if expired)
    let userId: string

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.split(' ')[1]
      try {
        // Try to verify normally first
        const payload = verifyAccessToken(accessToken!)
        userId = payload.sub
      } catch {
        // If expired, decode without verification to get userId
        const jwt = await import('jsonwebtoken')
        const decoded = jwt.decode(accessToken!) as { sub?: string } | null
        if (!decoded?.sub) {
          throw Errors.tokenInvalid('Invalid access token')
        }
        userId = decoded.sub
      }
    } else {
      throw Errors.unauthorized('No access token provided')
    }

    const { tokens, refreshExpiresAt } = await refreshTokens(refreshToken, userId)

    // Set new refresh token in cookie
    res.cookie('refreshToken', tokens.refreshToken, getRefreshCookieOptions(refreshExpiresAt))

    res.json({
      accessToken: tokens.accessToken,
    })
  })
)

/**
 * POST /api/auth/logout
 * Revokes refresh token and clears cookie
 */
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken
    const authHeader = req.headers.authorization

    // Try to revoke the session if we have both tokens
    if (refreshToken && authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.split(' ')[1]
      try {
        const payload = verifyAccessToken(accessToken!)
        await logoutUser(refreshToken, payload.sub)
      } catch {
        // Ignore errors - logout should always succeed
        // Try to decode expired token
        const jwt = await import('jsonwebtoken')
        const decoded = jwt.decode(accessToken!) as { sub?: string } | null
        if (decoded?.sub) {
          await logoutUser(refreshToken, decoded.sub)
        }
      }
    }

    // Clear the cookie regardless
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: getConfig().NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
    })

    res.json({ success: true })
  })
)

/**
 * GET /api/auth/me
 * Returns current user info
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await findUserById(req.user!.id)

    if (!user) {
      throw Errors.notFound('User')
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
      company: {
        id: user.company.id,
        name: user.company.name,
      },
    })
  })
)

export { router as authRouter }
