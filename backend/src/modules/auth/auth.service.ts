/**
 * Auth service
 * Handles JWT generation, password hashing, and token validation
 */

import crypto from 'crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'
import { getConfig } from '../../common/config/index'
import { prisma } from '../../lib/prisma'
import { Errors } from '../../common/errors/index'

const BCRYPT_ROUNDS = 12
const REFRESH_TOKEN_BYTES = 32 // 64 hex chars

export interface JWTPayload {
  sub: string // userId
  companyId: string
  role: Role
  iat: number
  exp: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  companyId: string
  role: Role
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// JWT generation
export function generateAccessToken(user: AuthUser): string {
  const config = getConfig()
  const payload = {
    sub: user.id,
    companyId: user.companyId,
    role: user.role,
  }
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
  })
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
}

export async function hashRefreshToken(token: string): Promise<string> {
  return bcrypt.hash(token, BCRYPT_ROUNDS)
}

// JWT verification
export function verifyAccessToken(token: string): JWTPayload {
  const config = getConfig()
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload
    return payload
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw Errors.tokenExpired()
    }
    throw Errors.tokenInvalid()
  }
}

// Refresh session management
export async function createRefreshSession(
  userId: string,
  companyId: string,
  refreshToken: string
): Promise<Date> {
  const config = getConfig()
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000)
  const refreshTokenHash = await hashRefreshToken(refreshToken)

  await prisma.refreshSession.create({
    data: {
      userId,
      companyId,
      refreshTokenHash,
      expiresAt,
    },
  })

  return expiresAt
}

export async function validateRefreshToken(
  refreshToken: string,
  userId: string
): Promise<{ valid: boolean; sessionId?: string }> {
  // Find all active sessions for this user
  const sessions = await prisma.refreshSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  })

  // Check each session's hash
  for (const session of sessions) {
    const isValid = await bcrypt.compare(refreshToken, session.refreshTokenHash)
    if (isValid) {
      return { valid: true, sessionId: session.id }
    }
  }

  return { valid: false }
}

export async function revokeRefreshSession(sessionId: string): Promise<void> {
  await prisma.refreshSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

// User lookup
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { company: true },
  })
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { company: true },
  })
}

// Register flow
export interface RegisterInput {
  companyName: string
  email: string
  password: string
}

export async function registerCompanyWithAdmin(input: RegisterInput) {
  const { companyName, email, password } = input

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    throw Errors.conflict('Email already registered')
  }

  const passwordHash = await hashPassword(password)

  // Create company and admin user in transaction
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: companyName },
    })

    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    })

    return { company, user }
  })

  return result
}

// Login flow
export interface LoginInput {
  email: string
  password: string
}

export async function loginUser(input: LoginInput): Promise<{
  user: AuthUser
  tokens: TokenPair
  refreshExpiresAt: Date
}> {
  const { email, password } = input

  const user = await findUserByEmail(email)

  if (!user) {
    throw Errors.invalidCredentials()
  }

  if (user.status !== 'ACTIVE') {
    throw Errors.forbidden('Account is disabled')
  }

  const passwordValid = await verifyPassword(password, user.passwordHash)

  if (!passwordValid) {
    throw Errors.invalidCredentials()
  }

  const authUser: AuthUser = {
    id: user.id,
    companyId: user.companyId,
    role: user.role,
  }

  const accessToken = generateAccessToken(authUser)
  const refreshToken = generateRefreshToken()
  const refreshExpiresAt = await createRefreshSession(user.id, user.companyId, refreshToken)

  return {
    user: authUser,
    tokens: { accessToken, refreshToken },
    refreshExpiresAt,
  }
}

// Refresh flow
export async function refreshTokens(
  refreshToken: string,
  userId: string
): Promise<{
  tokens: TokenPair
  refreshExpiresAt: Date
}> {
  const validation = await validateRefreshToken(refreshToken, userId)

  if (!validation.valid || !validation.sessionId) {
    throw Errors.tokenInvalid('Invalid refresh token')
  }

  // Revoke old session (token rotation)
  await revokeRefreshSession(validation.sessionId)

  // Get user for new tokens
  const user = await findUserById(userId)

  if (!user || user.status !== 'ACTIVE') {
    throw Errors.forbidden('Account is disabled')
  }

  const authUser: AuthUser = {
    id: user.id,
    companyId: user.companyId,
    role: user.role,
  }

  // Generate new tokens
  const newAccessToken = generateAccessToken(authUser)
  const newRefreshToken = generateRefreshToken()
  const refreshExpiresAt = await createRefreshSession(user.id, user.companyId, newRefreshToken)

  return {
    tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    refreshExpiresAt,
  }
}

// Logout flow
export async function logoutUser(refreshToken: string, userId: string): Promise<void> {
  const validation = await validateRefreshToken(refreshToken, userId)

  if (validation.valid && validation.sessionId) {
    await revokeRefreshSession(validation.sessionId)
  }
  // If token is invalid, we don't throw - logout should always succeed
}
