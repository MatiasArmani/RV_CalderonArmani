/**
 * Submodels repository
 * Database operations for submodels with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface CreateSubmodelInput {
  companyId: string
  versionId: string
  name: string
  sortOrder?: number
}

export interface UpdateSubmodelInput {
  name?: string
  sortOrder?: number
}

/**
 * Find all submodels for a version (tenant-filtered)
 */
export async function findAllByVersion(companyId: string, versionId: string) {
  return prisma.submodel.findMany({
    where: {
      companyId,
      versionId,
    },
    orderBy: { sortOrder: 'asc' },
  })
}

/**
 * Find a submodel by ID (no tenant filter - use service for tenant validation)
 */
export async function findById(id: string) {
  return prisma.submodel.findUnique({
    where: { id },
  })
}

/**
 * Create a new submodel
 */
export async function create(data: CreateSubmodelInput) {
  return prisma.submodel.create({
    data: {
      companyId: data.companyId,
      versionId: data.versionId,
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
    },
  })
}

/**
 * Update a submodel
 */
export async function update(id: string, data: UpdateSubmodelInput) {
  return prisma.submodel.update({
    where: { id },
    data,
  })
}

/**
 * Delete a submodel
 */
export async function remove(id: string) {
  return prisma.submodel.delete({
    where: { id },
  })
}
