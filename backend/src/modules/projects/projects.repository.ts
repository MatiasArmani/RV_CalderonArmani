/**
 * Projects repository
 * Database operations for projects with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface CreateProjectInput {
  companyId: string
  name: string
  description?: string | null
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
}

/**
 * Find all projects for a company
 */
export async function findAllByCompany(companyId: string) {
  return prisma.project.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Find a project by ID (no tenant filter - use service for tenant validation)
 */
export async function findById(id: string) {
  return prisma.project.findUnique({
    where: { id },
  })
}

/**
 * Create a new project
 */
export async function create(data: CreateProjectInput) {
  return prisma.project.create({
    data: {
      companyId: data.companyId,
      name: data.name,
      description: data.description ?? null,
    },
  })
}

/**
 * Update a project
 */
export async function update(id: string, data: UpdateProjectInput) {
  return prisma.project.update({
    where: { id },
    data,
  })
}

/**
 * Delete a project
 */
export async function remove(id: string) {
  return prisma.project.delete({
    where: { id },
  })
}
