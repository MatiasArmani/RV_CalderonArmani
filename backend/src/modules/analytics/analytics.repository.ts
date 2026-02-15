/**
 * Analytics repository
 * Aggregate queries for dashboard analytics with tenant isolation
 */

import { prisma } from '../../lib/prisma'

export interface DateRange {
  from: Date
  to: Date
}

export interface VisitsPerDay {
  date: string // YYYY-MM-DD
  count: number
}

export interface TopProduct {
  productId: string
  productName: string
  versionLabel: string
  versionId: string
  visitCount: number
}

export interface DeviceBreakdown {
  mobile: number
  desktop: number
}

export interface OverviewStats {
  totalVisits: number
  uniqueShares: number
  avgDurationMs: number | null
  arRate: number // 0-1
  deviceBreakdown: DeviceBreakdown
}

/**
 * Get total visits count for a company within date range
 */
export async function countVisits(companyId: string, range: DateRange): Promise<number> {
  return prisma.visit.count({
    where: {
      companyId,
      startedAt: { gte: range.from, lte: range.to },
    },
  })
}

/**
 * Get visits grouped by day for a company within date range
 */
export async function getVisitsPerDay(
  companyId: string,
  range: DateRange
): Promise<VisitsPerDay[]> {
  const results = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
    SELECT DATE("startedAt") as date, COUNT(*)::bigint as count
    FROM visits
    WHERE "companyId" = ${companyId}
      AND "startedAt" >= ${range.from}
      AND "startedAt" <= ${range.to}
    GROUP BY DATE("startedAt")
    ORDER BY date ASC
  `

  return results.map((r) => ({
    date: r.date.toISOString().split('T')[0] as string,
    count: Number(r.count),
  }))
}

/**
 * Get top products/versions by visit count
 */
export async function getTopProducts(
  companyId: string,
  range: DateRange,
  limit = 5
): Promise<TopProduct[]> {
  const results = await prisma.$queryRaw<
    Array<{
      productId: string
      productName: string
      versionLabel: string
      versionId: string
      visitCount: bigint
    }>
  >`
    SELECT
      p.id as "productId",
      p.name as "productName",
      v.label as "versionLabel",
      v.id as "versionId",
      COUNT(vis.id)::bigint as "visitCount"
    FROM visits vis
    JOIN shares s ON vis."shareId" = s.id
    JOIN versions v ON s."versionId" = v.id
    JOIN products p ON v."productId" = p.id
    WHERE vis."companyId" = ${companyId}
      AND vis."startedAt" >= ${range.from}
      AND vis."startedAt" <= ${range.to}
    GROUP BY p.id, p.name, v.label, v.id
    ORDER BY "visitCount" DESC
    LIMIT ${limit}
  `

  return results.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    versionLabel: r.versionLabel,
    versionId: r.versionId,
    visitCount: Number(r.visitCount),
  }))
}

/**
 * Get average visit duration in milliseconds
 */
export async function getAvgDuration(
  companyId: string,
  range: DateRange
): Promise<number | null> {
  const result = await prisma.visit.aggregate({
    where: {
      companyId,
      startedAt: { gte: range.from, lte: range.to },
      durationMs: { not: null },
    },
    _avg: {
      durationMs: true,
    },
  })

  return result._avg.durationMs ? Math.round(result._avg.durationMs) : null
}

/**
 * Get AR usage rate (proportion of visits that used AR)
 */
export async function getArRate(companyId: string, range: DateRange): Promise<number> {
  const [total, arCount] = await Promise.all([
    prisma.visit.count({
      where: {
        companyId,
        startedAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.visit.count({
      where: {
        companyId,
        startedAt: { gte: range.from, lte: range.to },
        usedAR: true,
      },
    }),
  ])

  if (total === 0) return 0
  return arCount / total
}

/**
 * Get device breakdown (mobile vs desktop)
 */
export async function getDeviceBreakdown(
  companyId: string,
  range: DateRange
): Promise<DeviceBreakdown> {
  // Use raw query to check JSON field for isMobile
  const results = await prisma.$queryRaw<Array<{ is_mobile: boolean; count: bigint }>>`
    SELECT
      COALESCE((device->>'isMobile')::boolean, false) as is_mobile,
      COUNT(*)::bigint as count
    FROM visits
    WHERE "companyId" = ${companyId}
      AND "startedAt" >= ${range.from}
      AND "startedAt" <= ${range.to}
    GROUP BY is_mobile
  `

  let mobile = 0
  let desktop = 0

  for (const r of results) {
    if (r.is_mobile) {
      mobile = Number(r.count)
    } else {
      desktop = Number(r.count)
    }
  }

  return { mobile, desktop }
}

/**
 * Get unique shares that received visits in the period
 */
export async function countUniqueShares(companyId: string, range: DateRange): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT "shareId")::bigint as count
    FROM visits
    WHERE "companyId" = ${companyId}
      AND "startedAt" >= ${range.from}
      AND "startedAt" <= ${range.to}
  `

  return Number(result[0]?.count ?? 0)
}

/**
 * Get overview stats combining multiple aggregations
 */
export async function getOverviewStats(
  companyId: string,
  range: DateRange
): Promise<OverviewStats> {
  const [totalVisits, uniqueShares, avgDurationMs, arRate, deviceBreakdown] = await Promise.all([
    countVisits(companyId, range),
    countUniqueShares(companyId, range),
    getAvgDuration(companyId, range),
    getArRate(companyId, range),
    getDeviceBreakdown(companyId, range),
  ])

  return {
    totalVisits,
    uniqueShares,
    avgDurationMs,
    arRate,
    deviceBreakdown,
  }
}
