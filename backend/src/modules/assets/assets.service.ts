/**
 * Assets service
 * Business logic for asset upload, processing, and retrieval
 * Implements state machine: PENDING_UPLOAD → UPLOADED → PROCESSING → READY/FAILED
 */

import { AssetKind, AssetStatus } from '@prisma/client'
import { validateTenantAccess } from '../auth/auth.middleware'
import { Errors } from '../../common/errors/index'
import * as assetsRepo from './assets.repository'
import * as versionsRepo from '../versions/versions.repository'
import {
  buildStorageKey,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  getObjectMetadata,
  downloadObjectRange,
  uploadObject,
} from '../../lib/storage'
import * as submodelsRepo from '../submodels/submodels.repository'
import {
  validateGlbFormat,
  validateFileSize,
  generatePlaceholderThumbnail,
  ALLOWED_CONTENT_TYPE,
  MAX_FILE_SIZE_BYTES,
} from './processing'

export interface AssetDTO {
  id: string
  versionId: string
  submodelId: string | null
  kind: AssetKind
  status: AssetStatus
  contentType: string
  sizeBytes: number
  meta: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface UploadUrlResponse {
  assetId: string
  uploadUrl: string
  method: 'PUT'
  headers: {
    'Content-Type': string
  }
}

export interface AssetWithUrls extends AssetDTO {
  urls: {
    source?: string
    thumbnail?: string
  }
}

/**
 * Valid state transitions for the asset state machine
 */
const VALID_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  PENDING_UPLOAD: ['UPLOADED', 'FAILED'],
  UPLOADED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['READY', 'FAILED'],
  READY: [],
  FAILED: ['PENDING_UPLOAD'], // Allow retry
}

/**
 * Transform asset to DTO
 */
function toDTO(asset: {
  id: string
  versionId: string
  submodelId: string | null
  kind: AssetKind
  status: AssetStatus
  storageKey: string
  contentType: string
  sizeBytes: number
  meta: unknown
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}): AssetDTO {
  return {
    id: asset.id,
    versionId: asset.versionId,
    submodelId: asset.submodelId,
    kind: asset.kind,
    status: asset.status,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    meta: asset.meta as Record<string, unknown> | null,
    errorMessage: asset.errorMessage,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
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
 * Validate state machine transition
 */
function validateTransition(currentStatus: AssetStatus, newStatus: AssetStatus): void {
  const allowed = VALID_TRANSITIONS[currentStatus]
  if (!allowed.includes(newStatus)) {
    throw Errors.invalidStateTransition(currentStatus, newStatus)
  }
}

/**
 * Request a presigned upload URL for a new asset
 * Creates asset in PENDING_UPLOAD state
 */
export async function requestUploadUrl(
  companyId: string,
  versionId: string,
  filename: string,
  contentType: string,
  sizeBytes: number,
  submodelId?: string | null
): Promise<UploadUrlResponse> {
  // Validate version access
  await validateVersionAccess(versionId, companyId)

  // Validate content type
  if (contentType !== ALLOWED_CONTENT_TYPE) {
    throw Errors.validation(
      [{ field: 'contentType', message: `Must be ${ALLOWED_CONTENT_TYPE}` }]
    )
  }

  // Validate file size
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw Errors.validation(
      [{ field: 'sizeBytes', message: 'File too large. Maximum is 500MB' }]
    )
  }

  // If submodelId provided, validate it belongs to this version and tenant
  if (submodelId) {
    const submodel = await submodelsRepo.findById(submodelId)
    if (!submodel || submodel.companyId !== companyId || submodel.versionId !== versionId) {
      throw Errors.notFound('Submodel')
    }
  }

  // Check if already has a SOURCE_GLB (filtered by submodelId)
  const existingAsset = await assetsRepo.findSourceGlbByVersion(versionId, submodelId)
  if (existingAsset && existingAsset.status !== 'FAILED') {
    throw Errors.conflict('Esta versión ya tiene un modelo 3D. Elimínelo primero para subir uno nuevo.')
  }

  // Sanitize filename for S3 key (keep alphanumeric, hyphens, underscores, dots)
  const safeFilename = filename.replace(/[^a-zA-Z0-9\-_.]/g, '_')
  const submodelPrefix = submodelId ? `sub_${submodelId}/` : ''
  const storageKey = buildStorageKey(companyId, versionId, 'source', `${submodelPrefix}${safeFilename}`)

  // Create asset record
  const asset = await assetsRepo.create({
    companyId,
    versionId,
    submodelId: submodelId ?? null,
    kind: 'SOURCE_GLB',
    storageKey,
    contentType,
    sizeBytes,
    meta: { originalFilename: filename },
  })

  // Get presigned upload URL
  const presigned = await getPresignedUploadUrl(storageKey, contentType)

  return {
    assetId: asset.id,
    uploadUrl: presigned.url,
    method: presigned.method,
    headers: presigned.headers,
  }
}

/**
 * Complete the upload and start processing
 * Transitions: PENDING_UPLOAD → UPLOADED → PROCESSING → READY/FAILED
 */
export async function completeUpload(
  assetId: string,
  companyId: string
): Promise<AssetDTO> {
  // Get asset and validate tenant access
  const asset = await assetsRepo.findById(assetId)
  if (!asset) {
    throw Errors.notFound('Asset')
  }
  validateTenantAccess(asset, companyId)

  // Validate current state
  if (asset.status !== 'PENDING_UPLOAD') {
    throw Errors.invalidStateTransition(asset.status, 'UPLOADED')
  }

  // Verify the file exists in S3
  const metadata = await getObjectMetadata(asset.storageKey)
  if (!metadata.exists) {
    await assetsRepo.updateStatus(assetId, 'FAILED', {
      errorMessage: 'File not found in storage after upload',
    })
    throw Errors.assetProcessingFailed('El archivo no se encontró en almacenamiento. La subida puede haber fallado.')
  }

  // Validate file size matches (with 5% tolerance)
  const sizeValidation = validateFileSize(
    metadata.sizeBytes ?? 0,
    asset.sizeBytes
  )
  if (!sizeValidation.valid) {
    await assetsRepo.updateStatus(assetId, 'FAILED', {
      errorMessage: sizeValidation.error,
    })
    throw Errors.assetProcessingFailed(sizeValidation.error ?? 'File size mismatch')
  }

  // Transition to UPLOADED
  await assetsRepo.updateStatus(assetId, 'UPLOADED', {
    sizeBytes: metadata.sizeBytes,
  })

  // Start processing (sync for MVP, could be async queue later)
  return processAsset(assetId, companyId)
}

/**
 * Process an uploaded asset
 * Validates GLB format and generates thumbnail
 */
async function processAsset(
  assetId: string,
  companyId: string
): Promise<AssetDTO> {
  // Get asset
  const asset = await assetsRepo.findById(assetId)
  if (!asset) {
    throw new Error('Asset not found')
  }

  // Transition to PROCESSING
  validateTransition(asset.status, 'PROCESSING')
  await assetsRepo.updateStatus(assetId, 'PROCESSING')

  try {
    // Download only the GLB header (12 bytes) via S3 range request
    const headerBuffer = await downloadObjectRange(asset.storageKey, 0, 11)

    // Validate GLB format using header bytes and the known file size
    const glbValidation = validateGlbFormat(headerBuffer, asset.sizeBytes)
    if (!glbValidation.valid) {
      await assetsRepo.updateStatus(assetId, 'FAILED', {
        errorMessage: glbValidation.error,
      })
      throw Errors.assetProcessingFailed(glbValidation.error ?? 'Invalid GLB format')
    }

    // Generate placeholder thumbnail
    const thumbnailBuffer = await generatePlaceholderThumbnail()

    // Build thumbnail storage key (include submodel prefix to avoid collision)
    const thumbSubPrefix = asset.submodelId ? `sub_${asset.submodelId}/` : ''
    const thumbStorageKey = buildStorageKey(
      companyId,
      asset.versionId,
      'thumb',
      `${thumbSubPrefix}thumbnail.jpg`
    )

    // Upload thumbnail
    await uploadObject(thumbStorageKey, thumbnailBuffer, 'image/jpeg')

    // Create thumbnail asset record
    await assetsRepo.create({
      companyId,
      versionId: asset.versionId,
      submodelId: asset.submodelId,
      kind: 'THUMB',
      storageKey: thumbStorageKey,
      contentType: 'image/jpeg',
      sizeBytes: thumbnailBuffer.length,
      meta: {
        sourceAssetId: assetId,
        width: 512,
        height: 512,
      },
    })

    // Update thumbnail asset to READY immediately (it's already uploaded)
    const thumbAsset = await assetsRepo.findAllByCompany(companyId, asset.versionId)
    const thumb = thumbAsset.find((a) => a.kind === 'THUMB' && a.versionId === asset.versionId)
    if (thumb) {
      await assetsRepo.updateStatus(thumb.id, 'READY')
    }

    // Transition source asset to READY
    const updated = await assetsRepo.updateStatus(assetId, 'READY', {
      meta: {
        ...((asset.meta as Record<string, unknown>) ?? {}),
        glbVersion: glbValidation.version,
        glbLength: glbValidation.totalLength,
        thumbnailAssetId: thumb?.id,
      },
    })

    return toDTO(updated)
  } catch (error) {
    // If processing fails, mark as FAILED
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error'

    // Only update if not already FAILED (error might have been thrown after marking FAILED)
    const currentAsset = await assetsRepo.findById(assetId)
    if (currentAsset && currentAsset.status !== 'FAILED') {
      await assetsRepo.updateStatus(assetId, 'FAILED', {
        errorMessage,
      })
    }

    throw error
  }
}

/**
 * Get a single asset with signed URLs
 */
export async function getAsset(
  assetId: string,
  companyId: string
): Promise<AssetWithUrls> {
  const asset = await assetsRepo.findById(assetId)
  if (!asset) {
    throw Errors.notFound('Asset')
  }
  validateTenantAccess(asset, companyId)

  const dto = toDTO(asset)
  const urls: AssetWithUrls['urls'] = {}

  // Generate signed URLs only for READY assets
  if (asset.status === 'READY') {
    urls.source = await getPresignedDownloadUrl(asset.storageKey)

    // Find thumbnail if this is a SOURCE_GLB
    if (asset.kind === 'SOURCE_GLB') {
      const meta = asset.meta as Record<string, unknown> | null
      if (meta?.thumbnailAssetId) {
        const thumbAsset = await assetsRepo.findById(meta.thumbnailAssetId as string)
        if (thumbAsset && thumbAsset.status === 'READY') {
          urls.thumbnail = await getPresignedDownloadUrl(thumbAsset.storageKey)
        }
      }
    }
  }

  return { ...dto, urls }
}

/**
 * List all assets for a version
 */
export async function listAssets(
  companyId: string,
  versionId: string
): Promise<AssetDTO[]> {
  // Validate version access
  await validateVersionAccess(versionId, companyId)

  const assets = await assetsRepo.findAllByCompany(companyId, versionId)
  return assets.map(toDTO)
}

/**
 * Delete an asset and its derived assets (thumbnails, USDZ)
 */
export async function deleteAsset(
  assetId: string,
  companyId: string
): Promise<void> {
  const asset = await assetsRepo.findById(assetId)
  if (!asset) {
    throw Errors.notFound('Asset')
  }
  validateTenantAccess(asset, companyId)

  // Find and delete derived assets
  const derivedAssets = await assetsRepo.findDerivedAssets(assetId)
  for (const derived of derivedAssets) {
    await assetsRepo.remove(derived.id)
  }

  // Delete the main asset
  await assetsRepo.remove(assetId)
}
