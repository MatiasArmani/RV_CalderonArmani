/**
 * Assets service
 * Business logic for asset upload, processing, and retrieval
 * Implements state machine: PENDING_UPLOAD → UPLOADED → PROCESSING → READY/FAILED
 */

import { AssetKind, AssetStatus } from '@prisma/client'
import { validateTenantAccess } from '../auth/auth.middleware'
import * as assetsRepo from './assets.repository'
import * as versionsRepo from '../versions/versions.repository'
import {
  buildStorageKey,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  getObjectMetadata,
  downloadObject,
  uploadObject,
} from '../../lib/storage'
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
    throw new Error(
      `Invalid status transition from ${currentStatus} to ${newStatus}`
    )
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
  sizeBytes: number
): Promise<UploadUrlResponse> {
  // Validate version access
  await validateVersionAccess(versionId, companyId)

  // Validate content type
  if (contentType !== ALLOWED_CONTENT_TYPE) {
    throw new Error(`Invalid content type: ${contentType}. Only ${ALLOWED_CONTENT_TYPE} is allowed`)
  }

  // Validate file size
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large: ${sizeBytes} bytes. Maximum is ${MAX_FILE_SIZE_BYTES} bytes (100MB)`
    )
  }

  // Check if version already has a SOURCE_GLB asset
  const existingAsset = await assetsRepo.findSourceGlbByVersion(versionId)
  if (existingAsset && existingAsset.status !== 'FAILED') {
    throw new Error('Version already has a source GLB asset. Delete it first to upload a new one.')
  }

  // Build storage key
  const storageKey = buildStorageKey(companyId, versionId, 'source', filename)

  // Create asset record
  const asset = await assetsRepo.create({
    companyId,
    versionId,
    kind: 'SOURCE_GLB',
    storageKey,
    contentType,
    sizeBytes,
    meta: { originalFilename: filename },
  })

  // Get presigned upload URL
  const presigned = await getPresignedUploadUrl(storageKey, contentType, sizeBytes)

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
    throw new Error('Asset not found')
  }
  validateTenantAccess(asset, companyId)

  // Validate current state
  if (asset.status !== 'PENDING_UPLOAD') {
    throw new Error(`Cannot complete upload: asset is in ${asset.status} state`)
  }

  // Verify the file exists in S3
  const metadata = await getObjectMetadata(asset.storageKey)
  if (!metadata.exists) {
    await assetsRepo.updateStatus(assetId, 'FAILED', {
      errorMessage: 'File not found in storage after upload',
    })
    throw new Error('File not found in storage. Upload may have failed.')
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
    throw new Error(sizeValidation.error)
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
    // Download file for validation
    const fileBuffer = await downloadObject(asset.storageKey)

    // Validate GLB format
    const glbValidation = validateGlbFormat(fileBuffer)
    if (!glbValidation.valid) {
      await assetsRepo.updateStatus(assetId, 'FAILED', {
        errorMessage: glbValidation.error,
      })
      throw new Error(glbValidation.error)
    }

    // Generate placeholder thumbnail
    const thumbnailBuffer = await generatePlaceholderThumbnail()

    // Build thumbnail storage key
    const thumbStorageKey = buildStorageKey(
      companyId,
      asset.versionId,
      'thumb',
      'thumbnail.jpg'
    )

    // Upload thumbnail
    await uploadObject(thumbStorageKey, thumbnailBuffer, 'image/jpeg')

    // Create thumbnail asset record
    await assetsRepo.create({
      companyId,
      versionId: asset.versionId,
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
    throw new Error('Asset not found')
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
    throw new Error('Asset not found')
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
