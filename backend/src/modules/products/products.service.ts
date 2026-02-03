/**
 * Products service
 * Business logic for product CRUD with tenant isolation
 */

import { validateTenantAccess } from '../auth/auth.middleware'
import { Errors } from '../../common/errors/index'
import * as productsRepo from './products.repository'
import * as projectsRepo from '../projects/projects.repository'

export interface ProductDTO {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Transform product to DTO (excludes companyId)
 */
function toDTO(product: {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}): ProductDTO {
  return {
    id: product.id,
    projectId: product.projectId,
    name: product.name,
    description: product.description,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

/**
 * Validate that a project belongs to the tenant
 */
async function validateProjectAccess(projectId: string, companyId: string): Promise<void> {
  const project = await projectsRepo.findById(projectId)
  validateTenantAccess(project, companyId)
}

/**
 * List all products for a company, optionally filtered by project
 */
export async function listProducts(companyId: string, projectId?: string): Promise<ProductDTO[]> {
  // If projectId is provided, validate it belongs to the tenant
  if (projectId) {
    await validateProjectAccess(projectId, companyId)
  }

  const products = await productsRepo.findAllByCompany(companyId, projectId)
  return products.map(toDTO)
}

/**
 * Get a product by ID with tenant validation
 */
export async function getProduct(id: string, companyId: string): Promise<ProductDTO> {
  const product = await productsRepo.findById(id)
  const validatedProduct = validateTenantAccess(product, companyId)
  return toDTO(validatedProduct)
}

/**
 * Create a new product
 * Validates that projectId belongs to the tenant
 */
export async function createProduct(
  companyId: string,
  data: { projectId: string; name: string; description?: string | null }
): Promise<ProductDTO> {
  // Validate project belongs to tenant
  await validateProjectAccess(data.projectId, companyId)

  const product = await productsRepo.create({
    companyId,
    projectId: data.projectId,
    name: data.name,
    description: data.description ?? null,
  })
  return toDTO(product)
}

/**
 * Update a product with tenant validation
 */
export async function updateProduct(
  id: string,
  companyId: string,
  data: { name?: string; description?: string | null }
): Promise<ProductDTO> {
  // Validate tenant access first
  const existing = await productsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  const updated = await productsRepo.update(id, data)
  return toDTO(updated)
}

/**
 * Delete a product with tenant validation
 */
export async function deleteProduct(id: string, companyId: string): Promise<void> {
  // Validate tenant access first
  const existing = await productsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  await productsRepo.remove(id)
}
