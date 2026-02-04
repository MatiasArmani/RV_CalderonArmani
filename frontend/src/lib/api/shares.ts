/**
 * Shares API client
 * Handles share creation, management, and listing
 */

import { api } from './client'

export interface Share {
  id: string
  versionId: string
  token: string
  expiresAt: string
  maxVisits: number | null
  visitCount: number
  revokedAt: string | null
  createdAt: string
}

export interface CreateShareRequest {
  versionId: string
  expiresAt: string
  maxVisits?: number | null
}

export interface CreateShareResponse extends Share {
  url: string
}

export const sharesApi = {
  /**
   * List all shares, optionally filtered by versionId
   */
  list: (versionId?: string) => {
    const params = versionId ? `?versionId=${versionId}` : ''
    return api.get<Share[]>(`/api/shares${params}`)
  },

  /**
   * Get a single share
   */
  get: (id: string) => api.get<Share>(`/api/shares/${id}`),

  /**
   * Create a new share for a version
   */
  create: (data: CreateShareRequest) =>
    api.post<CreateShareResponse>('/api/shares', data),

  /**
   * Revoke a share (marks it as revoked but keeps the record)
   */
  revoke: (id: string) =>
    api.post<{ ok: boolean }>(`/api/shares/${id}/revoke`),

  /**
   * Delete a share
   */
  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/shares/${id}`),
}
