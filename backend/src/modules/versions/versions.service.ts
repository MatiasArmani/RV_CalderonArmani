/**
 * Versions service
 * Business logic for version CRUD with tenant isolation
 */

import { validateTenantAccess } from '../auth/auth.middleware'
import * as versionsRepo from './versions.repository'
import * as productsRepo from '../products/products.repository'

export interface VersionDTO {
  id: string
  productId: string
  label: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Transform version to DTO (excludes companyId)
 */
function toDTO(version: {
  id: string
  productId: string
  label: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}): VersionDTO {
  return {
    id: version.id,
    productId: version.productId,
    label: version.label,
    notes: version.notes,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  }
}

/**
 * Validate that a product belongs to the tenant
 */
async function validateProductAccess(productId: string, companyId: string): Promise<void> {
  const product = await productsRepo.findById(productId)
  validateTenantAccess(product, companyId)
}

/**
 * List all versions for a company, optionally filtered by product
 */
export async function listVersions(companyId: string, productId?: string): Promise<VersionDTO[]> {
  // If productId is provided, validate it belongs to the tenant
  if (productId) {
    await validateProductAccess(productId, companyId)
  }

  const versions = await versionsRepo.findAllByCompany(companyId, productId)
  return versions.map(toDTO)
}

/**
 * Get a version by ID with tenant validation
 */
export async function getVersion(id: string, companyId: string): Promise<VersionDTO> {
  const version = await versionsRepo.findById(id)
  const validatedVersion = validateTenantAccess(version, companyId)
  return toDTO(validatedVersion)
}

/**
 * Create a new version
 * Validates that productId belongs to the tenant
 */
export async function createVersion(
  companyId: string,
  data: { productId: string; label: string; notes?: string | null }
): Promise<VersionDTO> {
  // Validate product belongs to tenant
  await validateProductAccess(data.productId, companyId)

  const version = await versionsRepo.create({
    companyId,
    productId: data.productId,
    label: data.label,
    notes: data.notes ?? null,
  })
  return toDTO(version)
}

/**
 * Update a version with tenant validation
 */
export async function updateVersion(
  id: string,
  companyId: string,
  data: { label?: string; notes?: string | null }
): Promise<VersionDTO> {
  // Validate tenant access first
  const existing = await versionsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  const updated = await versionsRepo.update(id, data)
  return toDTO(updated)
}

/**
 * Delete a version with tenant validation
 */
export async function deleteVersion(id: string, companyId: string): Promise<void> {
  // Validate tenant access first
  const existing = await versionsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  await versionsRepo.remove(id)
}
