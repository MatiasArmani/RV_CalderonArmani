/**
 * Versions API client
 */

import { api } from './client'

export interface Version {
  id: string
  productId: string
  label: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateVersionInput {
  productId: string
  label: string
  notes?: string | null
}

export interface UpdateVersionInput {
  label?: string
  notes?: string | null
}

export const versionsApi = {
  list: (productId?: string) => {
    const query = productId ? `?productId=${productId}` : ''
    return api.get<Version[]>(`/api/versions${query}`)
  },

  get: (id: string) => api.get<Version>(`/api/versions/${id}`),

  create: (data: CreateVersionInput) => api.post<Version>('/api/versions', data),

  update: (id: string, data: UpdateVersionInput) =>
    api.patch<Version>(`/api/versions/${id}`, data),

  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/versions/${id}`),
}
