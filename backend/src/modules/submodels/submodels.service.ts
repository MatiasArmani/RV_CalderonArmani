/**
 * Submodels service
 * Business logic for submodel CRUD with tenant isolation
 */

import { validateTenantAccess } from '../auth/auth.middleware'
import * as submodelsRepo from './submodels.repository'
import * as versionsRepo from '../versions/versions.repository'

export interface SubmodelDTO {
  id: string
  versionId: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Transform submodel to DTO (excludes companyId)
 */
function toDTO(submodel: {
  id: string
  versionId: string
  name: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}): SubmodelDTO {
  return {
    id: submodel.id,
    versionId: submodel.versionId,
    name: submodel.name,
    sortOrder: submodel.sortOrder,
    createdAt: submodel.createdAt.toISOString(),
    updatedAt: submodel.updatedAt.toISOString(),
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
 * List all submodels for a version
 */
export async function listSubmodels(companyId: string, versionId: string): Promise<SubmodelDTO[]> {
  await validateVersionAccess(versionId, companyId)
  const submodels = await submodelsRepo.findAllByVersion(companyId, versionId)
  return submodels.map(toDTO)
}

/**
 * Get a submodel by ID with tenant validation
 */
export async function getSubmodel(id: string, companyId: string): Promise<SubmodelDTO> {
  const submodel = await submodelsRepo.findById(id)
  const validated = validateTenantAccess(submodel, companyId)
  return toDTO(validated)
}

/**
 * Create a new submodel
 * Validates that versionId belongs to the tenant
 */
export async function createSubmodel(
  companyId: string,
  data: { versionId: string; name: string; sortOrder?: number }
): Promise<SubmodelDTO> {
  await validateVersionAccess(data.versionId, companyId)

  const submodel = await submodelsRepo.create({
    companyId,
    versionId: data.versionId,
    name: data.name,
    sortOrder: data.sortOrder,
  })
  return toDTO(submodel)
}

/**
 * Update a submodel with tenant validation
 */
export async function updateSubmodel(
  id: string,
  companyId: string,
  data: { name?: string; sortOrder?: number }
): Promise<SubmodelDTO> {
  const existing = await submodelsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  const updated = await submodelsRepo.update(id, data)
  return toDTO(updated)
}

/**
 * Delete a submodel with tenant validation
 */
export async function deleteSubmodel(id: string, companyId: string): Promise<void> {
  const existing = await submodelsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  await submodelsRepo.remove(id)
}
