/**
 * Products repository
 * Database operations for products with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface CreateProductInput {
  companyId: string
  projectId: string
  name: string
  description?: string | null
}

export interface UpdateProductInput {
  name?: string
  description?: string | null
}

/**
 * Find all products for a company, optionally filtered by project
 */
export async function findAllByCompany(companyId: string, projectId?: string) {
  return prisma.product.findMany({
    where: {
      companyId,
      ...(projectId && { projectId }),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Find a product by ID (no tenant filter - use service for tenant validation)
 */
export async function findById(id: string) {
  return prisma.product.findUnique({
    where: { id },
  })
}

/**
 * Create a new product
 */
export async function create(data: CreateProductInput) {
  return prisma.product.create({
    data: {
      companyId: data.companyId,
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
    },
  })
}

/**
 * Update a product
 */
export async function update(id: string, data: UpdateProductInput) {
  return prisma.product.update({
    where: { id },
    data,
  })
}

/**
 * Delete a product
 */
export async function remove(id: string) {
  return prisma.product.delete({
    where: { id },
  })
}
