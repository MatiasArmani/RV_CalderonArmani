/**
 * Projects API client
 */

import { api } from './client'

export interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description?: string | null
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
}

export const projectsApi = {
  list: () => api.get<Project[]>('/api/projects'),

  get: (id: string) => api.get<Project>(`/api/projects/${id}`),

  create: (data: CreateProjectInput) => api.post<Project>('/api/projects', data),

  update: (id: string, data: UpdateProjectInput) =>
    api.patch<Project>(`/api/projects/${id}`, data),

  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/projects/${id}`),
}
