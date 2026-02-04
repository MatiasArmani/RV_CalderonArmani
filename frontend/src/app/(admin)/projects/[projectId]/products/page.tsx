'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { projectsApi, productsApi, Project, Product, ApiClientError } from '@/lib/api'

export default function ProductsPage() {
  const params = useParams()
  const projectId = params.projectId as string

  const [project, setProject] = useState<Project | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    try {
      setIsLoading(true)
      setError(null)
      const [projectData, productsData] = await Promise.all([
        projectsApi.get(projectId),
        productsApi.list(projectId),
      ])
      setProject(projectData)
      setProducts(productsData)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Error al cargar datos')
      }
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateModal() {
    setEditingProduct(null)
    setFormData({ name: '', description: '' })
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(product: Product) {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      description: product.description || '',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingProduct(null)
    setFormData({ name: '', description: '' })
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      if (editingProduct) {
        await productsApi.update(editingProduct.id, {
          name: formData.name,
          description: formData.description || null,
        })
      } else {
        await productsApi.create({
          projectId,
          name: formData.name,
          description: formData.description || null,
        })
      }
      closeModal()
      loadData()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message)
      } else {
        setFormError('Error al guardar producto')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await productsApi.delete(id)
      setDeletingId(null)
      loadData()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Error al eliminar producto')
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Cargando productos...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/projects" className="text-primary-600 hover:text-primary-700">
          Proyectos
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{project?.name}</span>
      </nav>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Productos del proyecto: {project?.name}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Crear Producto
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-500">No hay productos en este proyecto</p>
          <button
            onClick={openCreateModal}
            className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
          >
            Crear tu primer producto
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
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/projects/${projectId}/products/${product.id}/versions`}
                      className="text-sm font-medium text-gray-900 hover:text-primary-600"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {product.description || '-'}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(product.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openEditModal(product)}
                      className="text-primary-600 hover:text-primary-900 mr-4"
                    >
                      Editar
                    </button>
                    {deletingId === product.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(product.id)}
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
                        onClick={() => setDeletingId(product.id)}
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
                {editingProduct ? 'Editar Producto' : 'Crear Producto'}
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
                      : editingProduct
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
