/**
 * Versions repository
 * Database operations for versions with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface CreateVersionInput {
  companyId: string
  productId: string
  label: string
  notes?: string | null
}

export interface UpdateVersionInput {
  label?: string
  notes?: string | null
}

/**
 * Find all versions for a company, optionally filtered by product
 */
export async function findAllByCompany(companyId: string, productId?: string) {
  return prisma.version.findMany({
    where: {
      companyId,
      ...(productId && { productId }),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Find a version by ID (no tenant filter - use service for tenant validation)
 */
export async function findById(id: string) {
  return prisma.version.findUnique({
    where: { id },
  })
}

/**
 * Create a new version
 */
export async function create(data: CreateVersionInput) {
  return prisma.version.create({
    data: {
      companyId: data.companyId,
      productId: data.productId,
      label: data.label,
      notes: data.notes ?? null,
    },
  })
}

/**
 * Update a version
 */
export async function update(id: string, data: UpdateVersionInput) {
  return prisma.version.update({
    where: { id },
    data,
  })
}

/**
 * Delete a version
 */
export async function remove(id: string) {
  return prisma.version.delete({
    where: { id },
  })
}
