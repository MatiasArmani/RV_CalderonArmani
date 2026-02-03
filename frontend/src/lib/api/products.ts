/**
 * Products API client
 */

import { api } from './client'

export interface Product {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProductInput {
  projectId: string
  name: string
  description?: string | null
}

export interface UpdateProductInput {
  name?: string
  description?: string | null
}

export const productsApi = {
  list: (projectId?: string) => {
    const query = projectId ? `?projectId=${projectId}` : ''
    return api.get<Product[]>(`/api/products${query}`)
  },

  get: (id: string) => api.get<Product>(`/api/products/${id}`),

  create: (data: CreateProductInput) => api.post<Product>('/api/products', data),

  update: (id: string, data: UpdateProductInput) =>
    api.patch<Product>(`/api/products/${id}`, data),

  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/products/${id}`),
}
