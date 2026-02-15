/**
 * Analytics service
 * Business logic for dashboard analytics
 */

import * as analyticsRepo from './analytics.repository'

export interface AnalyticsOverviewDTO {
  totalVisits: number
  uniqueShares: number
  avgDurationMs: number | null
  arRate: number
  deviceBreakdown: {
    mobile: number
    desktop: number
  }
}

export interface VisitsPerDayDTO {
  date: string
  count: number
}

export interface TopProductDTO {
  productId: string
  productName: string
  versionLabel: string
  versionId: string
  visitCount: number
}

export interface AnalyticsDashboardDTO {
  overview: AnalyticsOverviewDTO
  visitsPerDay: VisitsPerDayDTO[]
  topProducts: TopProductDTO[]
  dateRange: {
    from: string
    to: string
  }
}

/**
 * Parse and validate date range from query params.
 * Defaults to last 30 days if not provided.
 */
export function parseDateRange(from?: string, to?: string): analyticsRepo.DateRange {
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  defaultFrom.setHours(0, 0, 0, 0)

  const defaultTo = new Date(now)
  defaultTo.setHours(23, 59, 59, 999)

  let fromDate = defaultFrom
  let toDate = defaultTo

  if (from) {
    fromDate = new Date(from)
    fromDate.setHours(0, 0, 0, 0)
  }

  if (to) {
    toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
  }

  return { from: fromDate, to: toDate }
}

/**
 * Get the full analytics dashboard data
 */
export async function getDashboard(
  companyId: string,
  options?: { from?: string; to?: string }
): Promise<AnalyticsDashboardDTO> {
  const range = parseDateRange(options?.from, options?.to)

  const [overview, visitsPerDay, topProducts] = await Promise.all([
    analyticsRepo.getOverviewStats(companyId, range),
    analyticsRepo.getVisitsPerDay(companyId, range),
    analyticsRepo.getTopProducts(companyId, range),
  ])

  return {
    overview,
    visitsPerDay,
    topProducts,
    dateRange: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  }
}
