'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { projectsApi, Project, ApiClientError } from '@/lib/api'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
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
        // Update existing
        await projectsApi.update(editingProject.id, {
          name: formData.name,
          description: formData.description || null,
        })
      } else {
        // Create new
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
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Cargando proyectos...</p>
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
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Crear Proyecto
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-500">No hay proyectos aún</p>
          <button
            onClick={openCreateModal}
            className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
          >
            Crear tu primer proyecto
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Creado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/projects/${project.id}/products`}
                      className="text-sm font-medium text-gray-900 hover:text-primary-600"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {project.description || '-'}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(project.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openEditModal(project)}
                      className="text-primary-600 hover:text-primary-900 mr-4"
                    >
                      Editar
                    </button>
                    {deletingId === project.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="text-red-600 hover:text-red-900 mr-2"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeletingId(project.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
