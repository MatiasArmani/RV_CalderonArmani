'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import Link from 'next/link'
import { projectsApi, productsApi, sharesApi, type Share } from '@/lib/api'

interface Stats {
  projects: number
  products: number
  activeShares: number
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats>({ projects: 0, products: 0, activeShares: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const [projects, products, shares] = await Promise.all([
          projectsApi.list(),
          productsApi.list(),
          sharesApi.list(),
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

      {/* Quick actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Ver Proyectos
          </Link>
        </div>
      </div>
    </div>
  )
}
