/**
 * Visits service
 * Business logic for visit tracking
 */

import { Errors } from '../../common/errors/index'
import { validateTenantAccess } from '../auth/auth.middleware'
import * as visitsRepo from './visits.repository'
import * as sharesRepo from '../shares/shares.repository'
import { validateShareAccess } from '../shares/shares.service'

export interface DeviceInfo {
  ua: string
  os: string
  isMobile: boolean
}

export interface VisitDTO {
  id: string
  shareId: string
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  usedAR: boolean
  device: DeviceInfo | null
  createdAt: string
  // Extended info for admin view
  productName?: string
  versionLabel?: string
}

export interface StartVisitInput {
  shareToken: string
  device?: DeviceInfo
}

export interface EndVisitInput {
  visitId: string
  durationMs: number
  usedAR: boolean
}

/**
 * Parse User-Agent string to extract OS and mobile status
 */
export function parseUserAgent(ua: string): { os: string; isMobile: boolean } {
  const uaLower = ua.toLowerCase()

  // Detect mobile first
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)

  // Detect OS
  let os = 'Unknown'

  if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS'
  } else if (/android/i.test(ua)) {
    os = 'Android'
  } else if (/windows phone/i.test(ua)) {
    os = 'Windows Phone'
  } else if (/windows/i.test(ua)) {
    os = 'Windows'
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS'
  } else if (/linux/i.test(ua)) {
    os = 'Linux'
  } else if (/cros/i.test(ua)) {
    os = 'Chrome OS'
  }

  return { os, isMobile }
}

/**
 * Create device info from User-Agent header
 */
export function createDeviceInfo(userAgent: string | undefined): DeviceInfo | null {
  if (!userAgent) {
    return null
  }

  const { os, isMobile } = parseUserAgent(userAgent)

  return {
    ua: userAgent.substring(0, 500), // Limit UA string length
    os,
    isMobile,
  }
}

/**
 * Transform visit to DTO
 */
function toDTO(visit: {
  id: string
  shareId: string
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  usedAR: boolean
  device: unknown
  createdAt: Date
  share?: {
    version: {
      label: string
      product: {
        name: string
      }
    }
  }
}): VisitDTO {
  const device = visit.device as DeviceInfo | null

  return {
    id: visit.id,
    shareId: visit.shareId,
    startedAt: visit.startedAt.toISOString(),
    endedAt: visit.endedAt?.toISOString() ?? null,
    durationMs: visit.durationMs,
    usedAR: visit.usedAR,
    device,
    createdAt: visit.createdAt.toISOString(),
    productName: visit.share?.version.product.name,
    versionLabel: visit.share?.version.label,
  }
}

/**
 * Start a new visit
 * Called when user loads the experience page
 */
export async function startVisit(data: StartVisitInput): Promise<{ visitId: string }> {
  // Find the share by token
  const share = await sharesRepo.findByToken(data.shareToken)

  if (!share) {
    throw Errors.notFound('Share')
  }

  // Validate share is still valid
  validateShareAccess(share)

  // Create visit record
  const visit = await visitsRepo.create({
    companyId: share.companyId,
    shareId: share.id,
    device: data.device ?? null,
  })

  // Increment share visit count
  await sharesRepo.incrementVisitCount(share.id)

  return { visitId: visit.id }
}

/**
 * End a visit
 * Called when user leaves the experience page or closes the browser
 */
export async function endVisit(data: EndVisitInput): Promise<{ ok: boolean }> {
  // Find the visit
  const visit = await visitsRepo.findById(data.visitId)

  if (!visit) {
    throw Errors.notFound('Visit')
  }

  // Validate durationMs is non-negative
  if (data.durationMs < 0) {
    throw Errors.validation([
      { field: 'durationMs', message: 'Duration must be non-negative' },
    ])
  }

  // Update visit with end data
  await visitsRepo.updateVisitEnd(data.visitId, {
    endedAt: new Date(),
    durationMs: data.durationMs,
    usedAR: data.usedAR,
  })

  return { ok: true }
}

/**
 * List visits for admin (private endpoint)
 */
export async function listVisits(
  companyId: string,
  options?: {
    shareId?: string
    limit?: number
    offset?: number
  }
): Promise<{ visits: VisitDTO[]; total: number }> {
  const [visits, total] = await Promise.all([
    visitsRepo.findAllByCompany(companyId, options),
    visitsRepo.countByCompany(companyId, options?.shareId),
  ])

  return {
    visits: visits.map(toDTO),
    total,
  }
}

/**
 * Get a single visit (for admin)
 */
export async function getVisit(id: string, companyId: string): Promise<VisitDTO> {
  const visit = await visitsRepo.findById(id)

  if (!visit) {
    throw Errors.notFound('Visit')
  }

  validateTenantAccess(visit, companyId)

  // Fetch with relations for full DTO
  const visits = await visitsRepo.findAllByCompany(companyId, { shareId: visit.shareId })
  const fullVisit = visits.find((v) => v.id === id)

  return toDTO(fullVisit ?? visit)
}
