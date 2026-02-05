/**
 * Visits repository
 * Database operations for visit tracking with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface CreateVisitInput {
  companyId: string
  shareId: string
  device?: {
    ua: string
    os: string
    isMobile: boolean
  } | null
}

export interface UpdateVisitData {
  endedAt: Date
  durationMs: number
  usedAR: boolean
}

/**
 * Create a new visit record
 */
export async function create(data: CreateVisitInput) {
  return prisma.visit.create({
    data: {
      companyId: data.companyId,
      shareId: data.shareId,
      device: data.device ?? undefined,
    },
  })
}

/**
 * Find a visit by ID
 */
export async function findById(id: string) {
  return prisma.visit.findUnique({
    where: { id },
  })
}

/**
 * Update visit with end data
 */
export async function updateVisitEnd(id: string, data: UpdateVisitData) {
  return prisma.visit.update({
    where: { id },
    data: {
      endedAt: data.endedAt,
      durationMs: data.durationMs,
      usedAR: data.usedAR,
    },
  })
}

/**
 * Find all visits for a company, optionally filtered by shareId
 */
export async function findAllByCompany(
  companyId: string,
  options?: {
    shareId?: string
    limit?: number
    offset?: number
  }
) {
  return prisma.visit.findMany({
    where: {
      companyId,
      ...(options?.shareId && { shareId: options.shareId }),
    },
    include: {
      share: {
        include: {
          version: {
            include: {
              product: true,
            },
          },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: options?.limit ?? 100,
    skip: options?.offset ?? 0,
  })
}

/**
 * Count visits for a company
 */
export async function countByCompany(companyId: string, shareId?: string) {
  return prisma.visit.count({
    where: {
      companyId,
      ...(shareId && { shareId }),
    },
  })
}

/**
 * Delete a visit
 */
export async function remove(id: string) {
  return prisma.visit.delete({
    where: { id },
  })
}
