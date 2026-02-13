/**
 * Shares repository
 * Database operations for shares with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface CreateShareInput {
  companyId: string
  versionId: string
  token: string
  expiresAt: Date
  maxVisits?: number | null
}

/**
 * Find all shares for a company, optionally filtered by version
 */
export async function findAllByCompany(companyId: string, versionId?: string) {
  return prisma.share.findMany({
    where: {
      companyId,
      ...(versionId && { versionId }),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Find a share by ID (no tenant filter - use service for tenant validation)
 */
export async function findById(id: string) {
  return prisma.share.findUnique({
    where: { id },
  })
}

/**
 * Find a share by token (for public access)
 */
export async function findByToken(token: string) {
  return prisma.share.findUnique({
    where: { token },
    include: {
      version: {
        include: {
          product: true,
          assets: true,
          submodels: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })
}

/**
 * Create a new share
 */
export async function create(data: CreateShareInput) {
  return prisma.share.create({
    data: {
      companyId: data.companyId,
      versionId: data.versionId,
      token: data.token,
      expiresAt: data.expiresAt,
      maxVisits: data.maxVisits ?? null,
    },
  })
}

/**
 * Revoke a share (set revokedAt)
 */
export async function revoke(id: string) {
  return prisma.share.update({
    where: { id },
    data: {
      revokedAt: new Date(),
    },
  })
}

/**
 * Increment visit count for a share
 */
export async function incrementVisitCount(id: string) {
  return prisma.share.update({
    where: { id },
    data: {
      visitCount: { increment: 1 },
    },
  })
}

/**
 * Delete a share
 */
export async function remove(id: string) {
  return prisma.share.delete({
    where: { id },
  })
}
