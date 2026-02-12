'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { projectsApi, productsApi, Project, ApiClientError } from '@/lib/api'

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      setIsLoading(true)
      setError(null)
      const data = await projectsApi.list()
      setProjects(data)

      // Load product counts for each project
      const counts: Record<string, number> = {}
      await Promise.all(
        data.map(async (project) => {
          try {
            const products = await productsApi.list(project.id)
            counts[project.id] = products.length
          } catch {
            counts[project.id] = 0
          }
        })
      )
      setProductCounts(counts)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Error al cargar proyectos')
      }
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateModal() {
    setEditingProject(null)
    setFormData({ name: '', description: '' })
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(project: Project) {
    setEditingProject(project)
    setFormData({
      name: project.name,
      description: project.description || '',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingProject(null)
    setFormData({ name: '', description: '' })
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      if (editingProject) {
        await projectsApi.update(editingProject.id, {
          name: formData.name,
          description: formData.description || null,
        })
      } else {
        await projectsApi.create({
          name: formData.name,
          description: formData.description || null,
        })
      }
      closeModal()
      loadProjects()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message)
      } else {
        setFormError('Error al guardar proyecto')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await projectsApi.delete(id)
      setDeletingId(null)
      loadProjects()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Error al eliminar proyecto')
      }
    }
  }

  if (isLoading) {
    return (
      <div>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
            <p className="mt-1 text-sm text-gray-600">
              Gestiona los proyectos de tu empresa
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                </div>
              </div>
              <div className="h-4 bg-gray-100 rounded w-full mb-2" />
              <div className="h-4 bg-gray-100 rounded w-2/3 mb-4" />
              <div className="flex justify-between items-center">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestiona los proyectos de tu empresa
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Crear Proyecto
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-gray-200">
          <svg
            className="mx-auto h-16 w-16 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No hay proyectos</h3>
          <p className="mt-2 text-sm text-gray-500">
            Comienza creando tu primer proyecto para organizar tus productos.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Crear tu primer proyecto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}/products`)}
              className="group bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-primary-300 transition-all duration-200 cursor-pointer overflow-hidden"
            >
              <div className="p-6">
                {/* Header: icon + name + arrow */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-primary-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 truncate">
                      {project.name}
                    </h3>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-300 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-500 line-clamp-2 mb-4 min-h-[2.5rem]">
                  {project.description || 'Sin descripción'}
                </p>

                {/* Footer: date + product count */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>
                    {new Date(project.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                    </svg>
                    {productCounts[project.id] ?? 0} productos
                  </span>
                </div>
              </div>

              {/* Action bar */}
              <div className="border-t border-gray-100 px-6 py-3 bg-gray-50/50 flex justify-end gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditModal(project)
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  Editar
                </button>
                {deletingId === project.id ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(project.id)
                      }}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 font-medium transition-colors"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingId(null)
                      }}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingId(project.id)
                    }}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={closeModal}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                {editingProject ? 'Editar Proyecto' : 'Crear Proyecto'}
              </h2>

              {formError && (
                <div className="mb-4 rounded-md bg-red-50 p-4">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Nombre
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Descripción (opcional)
                  </label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                  >
                    {isSubmitting
                      ? 'Guardando...'
                      : editingProject
                      ? 'Guardar'
                      : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
