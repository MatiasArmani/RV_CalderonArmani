'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  analyticsApi,
  type AnalyticsDashboard,
} from '@/lib/api'
import Link from 'next/link'

// ─── Date helpers ────────────────────────────────────────────────────────────

function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function today(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

type PresetKey = '7d' | '30d' | '90d' | 'custom'

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'custom', label: 'Personalizado' },
]

function presetToRange(key: PresetKey): { from: Date; to: Date } | null {
  switch (key) {
    case '7d':
      return { from: daysAgo(7), to: today() }
    case '30d':
      return { from: daysAgo(30), to: today() }
    case '90d':
      return { from: daysAgo(90), to: today() }
    default:
      return null
  }
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`
  return `${seconds}s`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// ─── Bar Chart Component (Pure SVG) ──────────────────────────────────────────

function BarChart({
  data,
  height = 220,
}: {
  data: { date: string; count: number }[]
  height?: number
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
      >
        Sin datos para el periodo seleccionado
      </div>
    )
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)
  const paddingTop = 20
  const paddingBottom = 40
  const paddingLeft = 40
  const paddingRight = 16
  const chartHeight = height - paddingTop - paddingBottom
  const barGap = 2

  // Calculate how many labels to show to avoid overlap
  const maxLabels = Math.min(data.length, 12)
  const labelInterval = Math.max(1, Math.ceil(data.length / maxLabels))

  // Y-axis steps
  const ySteps = 4
  const yLines = Array.from({ length: ySteps + 1 }, (_, i) =>
    Math.round((maxCount / ySteps) * i)
  )

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 800 ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="select-none"
    >
      {/* Grid lines */}
      {yLines.map((val, i) => {
        const y = paddingTop + chartHeight - (val / maxCount) * chartHeight
        return (
          <g key={i}>
            <line
              x1={paddingLeft}
              y1={y}
              x2={800 - paddingRight}
              y2={y}
              stroke="#f3f4f6"
              strokeWidth="1"
            />
            <text
              x={paddingLeft - 6}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-400"
              fontSize="11"
            >
              {val}
            </text>
          </g>
        )
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const totalBarArea = 800 - paddingLeft - paddingRight
        const barWidth = Math.max(
          4,
          totalBarArea / data.length - barGap
        )
        const x =
          paddingLeft +
          (totalBarArea / data.length) * i +
          (totalBarArea / data.length - barWidth) / 2
        const barHeight = (d.count / maxCount) * chartHeight
        const y = paddingTop + chartHeight - barHeight

        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx={2}
              className="fill-primary-500 hover:fill-primary-600 transition-colors"
            />
            {/* Tooltip on hover */}
            <title>{`${d.date}: ${d.count} visitas`}</title>

            {/* X-axis labels */}
            {i % labelInterval === 0 && (
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize="10"
              >
                {formatShortDate(d.date)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string
  value: string
  sublabel?: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500">{label}</h3>
        <div className="text-gray-400">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sublabel && <p className="mt-1 text-sm text-gray-500">{sublabel}</p>}
    </div>
  )
}

// ─── Device Breakdown Bar ────────────────────────────────────────────────────

function DeviceBar({
  mobile,
  desktop,
}: {
  mobile: number
  desktop: number
}) {
  const total = mobile + desktop
  if (total === 0) {
    return (
      <div className="text-sm text-gray-400">Sin datos de dispositivos</div>
    )
  }
  const mobilePercent = Math.round((mobile / total) * 100)
  const desktopPercent = 100 - mobilePercent

  return (
    <div>
      <div className="flex gap-4 mb-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-primary-500 inline-block" />
          <span className="text-gray-700">
            Movil: {mobile} ({mobilePercent}%)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
          <span className="text-gray-700">
            Desktop: {desktop} ({desktopPercent}%)
          </span>
        </div>
      </div>
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden flex">
        {mobilePercent > 0 && (
          <div
            className="bg-primary-500 h-full transition-all duration-300"
            style={{ width: `${mobilePercent}%` }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Top Products Table ──────────────────────────────────────────────────────

function TopProductsTable({
  products,
}: {
  products: AnalyticsDashboard['topProducts']
}) {
  if (products.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        Sin datos de productos
      </div>
    )
  }

  const maxVisits = Math.max(...products.map((p) => p.visitCount), 1)

  return (
    <div className="divide-y divide-gray-100">
      {products.map((product, idx) => (
        <div key={product.versionId} className="flex items-center gap-4 py-3">
          <span className="text-sm font-medium text-gray-400 w-6 text-right">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {product.productName}
            </p>
            <p className="text-xs text-gray-500">{product.versionLabel}</p>
          </div>
          <div className="flex items-center gap-3 w-40">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(product.visitCount / maxVisits) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 w-10 text-right">
              {product.visitCount}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function IconEye() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconLink() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.56-3.061a4.5 4.5 0 00-6.364-6.364L4.5 8.621" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconCube() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Date range state
  const [activePreset, setActivePreset] = useState<PresetKey>('30d')
  const [customFrom, setCustomFrom] = useState(formatDateInput(daysAgo(30)))
  const [customTo, setCustomTo] = useState(formatDateInput(today()))

  const loadData = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await analyticsApi.dashboard({ from, to })
      setData(result)
    } catch {
      setError('Error al cargar las analiticas')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount and when preset changes
  useEffect(() => {
    if (activePreset === 'custom') {
      loadData(customFrom, customTo)
    } else {
      const range = presetToRange(activePreset)
      if (range) {
        loadData(formatDateInput(range.from), formatDateInput(range.to))
      }
    }
  }, [activePreset, loadData]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePresetClick = (key: PresetKey) => {
    setActivePreset(key)
    if (key !== 'custom') {
      const range = presetToRange(key)
      if (range) {
        setCustomFrom(formatDateInput(range.from))
        setCustomTo(formatDateInput(range.to))
      }
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      loadData(customFrom, customTo)
    }
  }

  const overview = data?.overview

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analiticas</h1>
        <p className="mt-1 text-sm text-gray-600">
          Metricas de uso y rendimiento de tus experiencias
        </p>
      </div>

      {/* Date range filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Periodo:</span>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePresetClick(p.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activePreset === p.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {activePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-0 sm:ml-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
              <span className="text-gray-400 text-sm">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                onClick={handleCustomApply}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 animate-pulse"
              >
                <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                <div className="h-8 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse">
            <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
            <div className="h-56 bg-gray-100 rounded" />
          </div>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="Total visitas"
              value={overview!.totalVisits.toLocaleString('es-AR')}
              sublabel="En el periodo"
              icon={<IconEye />}
            />
            <KpiCard
              label="Links activos"
              value={overview!.uniqueShares.toLocaleString('es-AR')}
              sublabel="Con visitas"
              icon={<IconLink />}
            />
            <KpiCard
              label="Duracion promedio"
              value={formatDuration(overview!.avgDurationMs)}
              sublabel="Por visita"
              icon={<IconClock />}
            />
            <KpiCard
              label="Tasa de AR"
              value={formatPercent(overview!.arRate)}
              sublabel="Usaron realidad aumentada"
              icon={<IconCube />}
            />
          </div>

          {/* Chart + Side panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Visits per day chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Visitas por dia
              </h2>
              <BarChart data={data.visitsPerDay} />
            </div>

            {/* Device breakdown */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Dispositivos
              </h2>
              <DeviceBar
                mobile={overview!.deviceBreakdown.mobile}
                desktop={overview!.deviceBreakdown.desktop}
              />

              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Resumen
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Total dispositivos</dt>
                    <dd className="font-medium text-gray-900">
                      {(
                        overview!.deviceBreakdown.mobile +
                        overview!.deviceBreakdown.desktop
                      ).toLocaleString('es-AR')}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Tasa AR</dt>
                    <dd className="font-medium text-gray-900">
                      {formatPercent(overview!.arRate)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Dur. promedio</dt>
                    <dd className="font-medium text-gray-900">
                      {formatDuration(overview!.avgDurationMs)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                Top productos
              </h2>
              <Link
                href="/visits"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Ver todas las visitas
              </Link>
            </div>
            <TopProductsTable products={data.topProducts} />
          </div>
        </>
      ) : null}
    </div>
  )
}
