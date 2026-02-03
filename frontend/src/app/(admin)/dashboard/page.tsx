'use client'

import { useAuth } from '@/lib/auth'
import Link from 'next/link'

export default function DashboardPage() {
  const { user, company } = useAuth()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Bienvenido, {user?.email}
        </p>
      </div>

      {/* Quick stats - placeholder for future implementation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Proyectos</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
          <p className="mt-1 text-sm text-gray-500">Total</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Productos</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
          <p className="mt-1 text-sm text-gray-500">Total</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Links Activos</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
          <p className="mt-1 text-sm text-gray-500">Compartidos</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/projects"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Ver Proyectos
          </Link>
          <Link
            href="/projects/new"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Crear Proyecto
          </Link>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-sm font-medium text-blue-800">Próximos pasos</h3>
        <p className="mt-2 text-sm text-blue-700">
          Los módulos de Proyectos, Productos y Versiones estarán disponibles en la Etapa 3.
          Por ahora, el sistema de autenticación está completamente funcional.
        </p>
      </div>
    </div>
  )
}
