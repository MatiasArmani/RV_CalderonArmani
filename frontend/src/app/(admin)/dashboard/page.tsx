'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import Link from 'next/link'
import {
  projectsApi,
  productsApi,
  sharesApi,
  analyticsApi,
  type Share,
  type AnalyticsOverview,
} from '@/lib/api'

interface Stats {
  projects: number
  products: number
  activeShares: number
}

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

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats>({ projects: 0, products: 0, activeShares: 0 })
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const [projects, products, shares, dashboard] = await Promise.all([
          projectsApi.list(),
          productsApi.list(),
          sharesApi.list(),
          analyticsApi.dashboard().catch(() => null),
        ])
        const now = new Date()
        const active = shares.filter(
          (s: Share) =>
            !s.revokedAt &&
            new Date(s.expiresAt) > now &&
            (s.maxVisits === null || s.visitCount < s.maxVisits)
        )
        setStats({
          projects: projects.length,
          products: products.length,
          activeShares: active.length,
        })
        if (dashboard) {
          setAnalytics(dashboard.overview)
        }
      } catch {
        // silently fail — stats stay at 0
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Bienvenido, {user?.email}</p>
      </div>

      {/* Resource stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Proyectos</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {loading ? '—' : stats.projects}
          </p>
          <p className="mt-1 text-sm text-gray-500">Total</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Productos</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {loading ? '—' : stats.products}
          </p>
          <p className="mt-1 text-sm text-gray-500">Total</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Links Activos</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {loading ? '—' : stats.activeShares}
          </p>
          <p className="mt-1 text-sm text-gray-500">Compartidos</p>
        </div>
      </div>

      {/* Analytics summary (last 30 days) */}
      {analytics && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-gray-900">Ultimos 30 dias</h2>
            <Link
              href="/analytics"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Ver analiticas completas
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Visitas</h3>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {analytics.totalVisits.toLocaleString('es-AR')}
              </p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Duracion prom.</h3>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatDuration(analytics.avgDurationMs)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Tasa AR</h3>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatPercent(analytics.arRate)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Movil vs Desktop</h3>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {analytics.deviceBreakdown.mobile} / {analytics.deviceBreakdown.desktop}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Acciones rapidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Ver Proyectos
          </Link>
          <Link
            href="/analytics"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Ver Analiticas
          </Link>
        </div>
      </div>
    </div>
  )
}
