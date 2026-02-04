/**
 * Shares service
 * Business logic for share creation, validation, and management
 */

import { randomBytes } from 'crypto'
import { validateTenantAccess } from '../auth/auth.middleware'
import { Errors } from '../../common/errors/index'
import * as sharesRepo from './shares.repository'
import * as versionsRepo from '../versions/versions.repository'
import * as assetsRepo from '../assets/assets.repository'
import { getConfig } from '../../common/config/index'

// Token length: 32 bytes = 64 hex characters
const TOKEN_BYTES = 32

export interface ShareDTO {
  id: string
  versionId: string
  token: string
  expiresAt: string
  maxVisits: number | null
  visitCount: number
  revokedAt: string | null
  createdAt: string
}

export interface CreateShareInput {
  versionId: string
  expiresAt: Date
  maxVisits?: number | null
}

export interface CreateShareResponse extends ShareDTO {
  url: string
}

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex')
}

/**
 * Transform share to DTO
 * Truncates token for list responses (only first 8 chars)
 */
function toDTO(
  share: {
    id: string
    versionId: string
    token: string
    expiresAt: Date
    maxVisits: number | null
    visitCount: number
    revokedAt: Date | null
    createdAt: Date
  },
  truncateToken = false
): ShareDTO {
  return {
    id: share.id,
    versionId: share.versionId,
    token: truncateToken ? `${share.token.slice(0, 8)}...` : share.token,
    expiresAt: share.expiresAt.toISOString(),
    maxVisits: share.maxVisits,
    visitCount: share.visitCount,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    createdAt: share.createdAt.toISOString(),
  }
}

/**
 * Validate that a version belongs to the tenant
 */
async function validateVersionAccess(versionId: string, companyId: string): Promise<void> {
  const version = await versionsRepo.findById(versionId)
  validateTenantAccess(version, companyId)
}

/**
 * Build the public share URL
 */
function buildShareUrl(token: string): string {
  const config = getConfig()
  return `${config.FRONTEND_URL}/experience/${token}`
}

/**
 * List all shares for a version
 */
export async function listShares(
  companyId: string,
  versionId?: string
): Promise<ShareDTO[]> {
  // If versionId provided, validate it belongs to tenant
  if (versionId) {
    await validateVersionAccess(versionId, companyId)
  }

  const shares = await sharesRepo.findAllByCompany(companyId, versionId)
  // Truncate tokens in list view for security
  return shares.map((s) => toDTO(s, true))
}

/**
 * Get a single share
 */
export async function getShare(id: string, companyId: string): Promise<ShareDTO> {
  const share = await sharesRepo.findById(id)
  if (!share) {
    throw Errors.notFound('Share')
  }
  validateTenantAccess(share, companyId)
  return toDTO(share, true)
}

/**
 * Create a new share for a version
 * Validates that the version has at least one READY asset
 */
export async function createShare(
  companyId: string,
  data: CreateShareInput
): Promise<CreateShareResponse> {
  // Validate version access
  await validateVersionAccess(data.versionId, companyId)

  // Validate version has at least one READY SOURCE_GLB asset
  const assets = await assetsRepo.findAllByCompany(companyId, data.versionId)
  const readyGlb = assets.find((a) => a.kind === 'SOURCE_GLB' && a.status === 'READY')
  if (!readyGlb) {
    throw Errors.validation([
      { field: 'versionId', message: 'La versión debe tener un modelo 3D listo para compartir' },
    ])
  }

  // Validate expiration is in the future
  if (data.expiresAt <= new Date()) {
    throw Errors.validation([
      { field: 'expiresAt', message: 'La fecha de expiración debe ser en el futuro' },
    ])
  }

  // Generate secure token
  const token = generateToken()

  // Create share
  const share = await sharesRepo.create({
    companyId,
    versionId: data.versionId,
    token,
    expiresAt: data.expiresAt,
    maxVisits: data.maxVisits ?? null,
  })

  return {
    ...toDTO(share, false), // Full token in create response
    url: buildShareUrl(token),
  }
}

/**
 * Revoke a share
 */
export async function revokeShare(id: string, companyId: string): Promise<void> {
  const share = await sharesRepo.findById(id)
  if (!share) {
    throw Errors.notFound('Share')
  }
  validateTenantAccess(share, companyId)

  // Check if already revoked
  if (share.revokedAt) {
    throw Errors.conflict('Este enlace ya fue revocado')
  }

  await sharesRepo.revoke(id)
}

/**
 * Delete a share
 */
export async function deleteShare(id: string, companyId: string): Promise<void> {
  const share = await sharesRepo.findById(id)
  if (!share) {
    throw Errors.notFound('Share')
  }
  validateTenantAccess(share, companyId)

  await sharesRepo.remove(id)
}

/**
 * Validate a share token for public access
 * Throws specific errors for expired, revoked, or limit-reached shares
 */
export function validateShareAccess(share: {
  expiresAt: Date
  revokedAt: Date | null
  maxVisits: number | null
  visitCount: number
}): void {
  // Check if expired
  if (share.expiresAt < new Date()) {
    throw Errors.shareExpired()
  }

  // Check if revoked
  if (share.revokedAt) {
    throw Errors.shareRevoked()
  }

  // Check visit limit
  if (share.maxVisits !== null && share.visitCount >= share.maxVisits) {
    throw Errors.shareLimitReached()
  }
}
