/**
 * Assets repository
 * Database operations for assets with tenant isolation
 */

import { AssetKind, AssetStatus, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export interface CreateAssetInput {
  companyId: string
  versionId: string
  kind: AssetKind
  storageKey: string
  contentType: string
  sizeBytes: number
  meta?: Prisma.InputJsonValue
}

export interface UpdateAssetInput {
  status?: AssetStatus
  sizeBytes?: number
  meta?: Prisma.InputJsonValue
  errorMessage?: string | null
}

/**
 * Find all assets for a company, optionally filtered by version
 */
export async function findAllByCompany(companyId: string, versionId?: string) {
  return prisma.asset.findMany({
    where: {
      companyId,
      ...(versionId && { versionId }),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Find an asset by ID (no tenant filter - use service for tenant validation)
 */
export async function findById(id: string) {
  return prisma.asset.findUnique({
    where: { id },
  })
}

/**
 * Find SOURCE_GLB assets for a version
 */
export async function findSourceGlbByVersion(versionId: string) {
  return prisma.asset.findFirst({
    where: {
      versionId,
      kind: 'SOURCE_GLB',
    },
  })
}

/**
 * Create a new asset
 */
export async function create(data: CreateAssetInput) {
  return prisma.asset.create({
    data: {
      companyId: data.companyId,
      versionId: data.versionId,
      kind: data.kind,
      status: 'PENDING_UPLOAD',
      storageKey: data.storageKey,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      meta: data.meta ?? Prisma.JsonNull,
    },
  })
}

/**
 * Update an asset
 */
export async function update(id: string, data: UpdateAssetInput) {
  return prisma.asset.update({
    where: { id },
    data,
  })
}

/**
 * Update asset status with validation
 * This is used for state machine transitions
 */
export async function updateStatus(
  id: string,
  status: AssetStatus,
  additionalData?: Partial<UpdateAssetInput>
) {
  return prisma.asset.update({
    where: { id },
    data: {
      status,
      ...additionalData,
    },
  })
}

/**
 * Delete an asset
 */
export async function remove(id: string) {
  return prisma.asset.delete({
    where: { id },
  })
}

/**
 * Find all derived assets (THUMB, USDZ) for a source asset
 */
export async function findDerivedAssets(sourceAssetId: string) {
  return prisma.asset.findMany({
    where: {
      meta: {
        path: ['sourceAssetId'],
        equals: sourceAssetId,
      },
    },
  })
}
