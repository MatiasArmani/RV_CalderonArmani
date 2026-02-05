/**
 * Visits API client (private/admin)
 * Handles visit analytics endpoints (requires authentication)
 */

import { api } from './client'

export interface DeviceInfo {
  ua: string
  os: string
  isMobile: boolean
}

export interface Visit {
  id: string
  shareId: string
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  usedAR: boolean
  device: DeviceInfo | null
  createdAt: string
  productName?: string
  versionLabel?: string
}

export interface VisitsListResponse {
  visits: Visit[]
  total: number
}

export interface VisitsListOptions {
  shareId?: string
  limit?: number
  offset?: number
}

export const visitsApi = {
  /**
   * List all visits for the authenticated company
   */
  list: (options?: VisitsListOptions) => {
    const params = new URLSearchParams()
    if (options?.shareId) params.set('shareId', options.shareId)
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())
    const queryString = params.toString()
    return api.get<VisitsListResponse>(`/api/visits${queryString ? `?${queryString}` : ''}`)
  },

  /**
   * Get a single visit by ID
   */
  get: (id: string) => api.get<Visit>(`/api/visits/${id}`),
}
