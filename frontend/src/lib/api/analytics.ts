/**
 * Analytics API client (private/admin)
 * Handles analytics dashboard endpoints (requires authentication)
 */

import { api } from './client'

export interface DeviceBreakdown {
  mobile: number
  desktop: number
}

export interface AnalyticsOverview {
  totalVisits: number
  uniqueShares: number
  avgDurationMs: number | null
  arRate: number
  deviceBreakdown: DeviceBreakdown
}

export interface VisitsPerDay {
  date: string
  count: number
}

export interface TopProduct {
  productId: string
  productName: string
  versionLabel: string
  versionId: string
  visitCount: number
}

export interface AnalyticsDashboard {
  overview: AnalyticsOverview
  visitsPerDay: VisitsPerDay[]
  topProducts: TopProduct[]
  dateRange: {
    from: string
    to: string
  }
}

export interface AnalyticsFilters {
  from?: string
  to?: string
}

export const analyticsApi = {
  /**
   * Get full analytics dashboard data
   */
  dashboard: (filters?: AnalyticsFilters) => {
    const params = new URLSearchParams()
    if (filters?.from) params.set('from', filters.from)
    if (filters?.to) params.set('to', filters.to)
    const queryString = params.toString()
    return api.get<AnalyticsDashboard>(
      `/api/analytics/dashboard${queryString ? `?${queryString}` : ''}`
    )
  },
}
