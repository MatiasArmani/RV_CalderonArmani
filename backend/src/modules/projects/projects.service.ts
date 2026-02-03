/**
 * Projects service
 * Business logic for project CRUD with tenant isolation
 */

import { validateTenantAccess } from '../auth/auth.middleware'
import * as projectsRepo from './projects.repository'

export interface ProjectDTO {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Transform project to DTO (excludes companyId)
 */
function toDTO(project: {
  id: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}): ProjectDTO {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

/**
 * List all projects for a company
 */
export async function listProjects(companyId: string): Promise<ProjectDTO[]> {
  const projects = await projectsRepo.findAllByCompany(companyId)
  return projects.map(toDTO)
}

/**
 * Get a project by ID with tenant validation
 */
export async function getProject(id: string, companyId: string): Promise<ProjectDTO> {
  const project = await projectsRepo.findById(id)
  const validatedProject = validateTenantAccess(project, companyId)
  return toDTO(validatedProject)
}

/**
 * Create a new project
 */
export async function createProject(
  companyId: string,
  data: { name: string; description?: string | null }
): Promise<ProjectDTO> {
  const project = await projectsRepo.create({
    companyId,
    name: data.name,
    description: data.description ?? null,
  })
  return toDTO(project)
}

/**
 * Update a project with tenant validation
 */
export async function updateProject(
  id: string,
  companyId: string,
  data: { name?: string; description?: string | null }
): Promise<ProjectDTO> {
  // Validate tenant access first
  const existing = await projectsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  const updated = await projectsRepo.update(id, data)
  return toDTO(updated)
}

/**
 * Delete a project with tenant validation
 */
export async function deleteProject(id: string, companyId: string): Promise<void> {
  // Validate tenant access first
  const existing = await projectsRepo.findById(id)
  validateTenantAccess(existing, companyId)

  await projectsRepo.remove(id)
}
