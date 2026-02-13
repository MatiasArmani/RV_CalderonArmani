/**
 * Submodels API client
 */

import { api } from './client'

export interface Submodel {
  id: string
  versionId: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateSubmodelInput {
  versionId: string
  name: string
  sortOrder?: number
}

export interface UpdateSubmodelInput {
  name?: string
  sortOrder?: number
}

export const submodelsApi = {
  list: (versionId: string) =>
    api.get<Submodel[]>(`/api/submodels?versionId=${versionId}`),

  get: (id: string) => api.get<Submodel>(`/api/submodels/${id}`),

  create: (data: CreateSubmodelInput) => api.post<Submodel>('/api/submodels', data),

  update: (id: string, data: UpdateSubmodelInput) =>
    api.patch<Submodel>(`/api/submodels/${id}`, data),

  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/submodels/${id}`),
}
