/**
 * Public experience service
 * Handles public access to shared versions
 */

import { Errors } from '../../common/errors/index'
import * as sharesRepo from '../shares/shares.repository'
import { validateShareAccess } from '../shares/shares.service'
import { getPresignedDownloadUrl } from '../../lib/storage'

export interface PublicSubmodelDTO {
  id: string
  name: string
  sortOrder: number
  assets: {
    glbUrl: string
    thumbUrl: string | null
  }
}

export interface PublicExperienceDTO {
  product: {
    name: string
    versionLabel: string
  }
  assets: {
    glbUrl: string
    thumbUrl: string | null
    usdzUrl: string | null
  }
  submodels: PublicSubmodelDTO[]
  share: {
    expiresAt: string
    remainingVisits: number | null
  }
}

/**
 * Get public experience data by share token
 * Validates share is active and has required assets
 */
export async function getExperience(token: string): Promise<PublicExperienceDTO> {
  // Find share with version and assets
  const share = await sharesRepo.findByToken(token)

  if (!share) {
    throw Errors.notFound('Share')
  }

  // Validate share is still valid (not expired, revoked, or limit reached)
  validateShareAccess(share)

  // Find the READY base SOURCE_GLB asset (no submodelId)
  const sourceGlb = share.version.assets.find(
    (a) => a.kind === 'SOURCE_GLB' && a.status === 'READY' && !a.submodelId
  )

  if (!sourceGlb) {
    throw Errors.notFound('Asset', 'No hay modelo 3D disponible para esta versión')
  }

  // Find the base thumbnail asset (no submodelId)
  const thumbAsset = share.version.assets.find(
    (a) => a.kind === 'THUMB' && a.status === 'READY' && !a.submodelId
  )

  // Find the USDZ asset (for iOS AR)
  const usdzAsset = share.version.assets.find(
    (a) => a.kind === 'USDZ' && a.status === 'READY' && !a.submodelId
  )

  // Generate presigned URLs (1 hour TTL)
  const glbUrl = await getPresignedDownloadUrl(sourceGlb.storageKey, 3600)
  const thumbUrl = thumbAsset
    ? await getPresignedDownloadUrl(thumbAsset.storageKey, 3600)
    : null
  const usdzUrl = usdzAsset
    ? await getPresignedDownloadUrl(usdzAsset.storageKey, 3600)
    : null

  // Build submodels with their assets
  const submodels: PublicSubmodelDTO[] = []
  for (const submodel of share.version.submodels) {
    const subGlb = share.version.assets.find(
      (a) => a.kind === 'SOURCE_GLB' && a.status === 'READY' && a.submodelId === submodel.id
    )
    // Only include submodels that have a READY GLB
    if (subGlb) {
      const subThumb = share.version.assets.find(
        (a) => a.kind === 'THUMB' && a.status === 'READY' && a.submodelId === submodel.id
      )
      submodels.push({
        id: submodel.id,
        name: submodel.name,
        sortOrder: submodel.sortOrder,
        assets: {
          glbUrl: await getPresignedDownloadUrl(subGlb.storageKey, 3600),
          thumbUrl: subThumb
            ? await getPresignedDownloadUrl(subThumb.storageKey, 3600)
            : null,
        },
      })
    }
  }

  // Calculate remaining visits
  const remainingVisits = share.maxVisits !== null
    ? Math.max(0, share.maxVisits - share.visitCount)
    : null

  return {
    product: {
      name: share.version.product.name,
      versionLabel: share.version.label,
    },
    assets: {
      glbUrl,
      thumbUrl,
      usdzUrl,
    },
    submodels,
    share: {
      expiresAt: share.expiresAt.toISOString(),
      remainingVisits,
    },
  }
}

/**
 * Increment visit count for a share (called when experience loads)
 * This is a fire-and-forget operation - we don't want to block the experience load
 */
export async function recordVisit(token: string): Promise<void> {
  const share = await sharesRepo.findByToken(token)
  if (share) {
    await sharesRepo.incrementVisitCount(share.id)
  }
}
