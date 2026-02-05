'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  projectsApi,
  productsApi,
  versionsApi,
  assetsApi,
  sharesApi,
  Project,
  Product,
  Version,
  Asset,
  Share,
  ApiClientError,
} from '@/lib/api'

interface VersionWithAssets extends Version {
  assets: Asset[]
}

export default function VersionsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const productId = params.productId as string

  const [project, setProject] = useState<Project | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [versions, setVersions] = useState<VersionWithAssets[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingVersion, setEditingVersion] = useState<Version | null>(null)
  const [formData, setFormData] = useState({ label: '', notes: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Upload state
  const [uploadingVersionId, setUploadingVersionId] = useState<string | null>(null)
  const uploadingVersionIdRef = useRef<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [sharingVersionId, setSharingVersionId] = useState<string | null>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [isLoadingShares, setIsLoadingShares] = useState(false)
  const [shareFormData, setShareFormData] = useState({
    expiresInDays: 7,
    maxVisits: '',
  })
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isCreatingShare, setIsCreatingShare] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [projectId, productId])

  async function loadData() {
    try {
      setIsLoading(true)
      setError(null)
      const [projectData, productData, versionsData] = await Promise.all([
        projectsApi.get(projectId),
        productsApi.get(productId),
        versionsApi.list(productId),
      ])
      setProject(projectData)
      setProduct(productData)

      // Load assets for each version
      const versionsWithAssets = await Promise.all(
        versionsData.map(async (version) => {
          try {
            const assets = await assetsApi.list(version.id)
            return { ...version, assets }
          } catch {
            return { ...version, assets: [] }
          }
        })
      )
      setVersions(versionsWithAssets)
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
    setEditingVersion(null)
    setFormData({ label: '', notes: '' })
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(version: Version) {
    setEditingVersion(version)
    setFormData({
      label: version.label,
      notes: version.notes || '',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingVersion(null)
    setFormData({ label: '', notes: '' })
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      if (editingVersion) {
        await versionsApi.update(editingVersion.id, {
          label: formData.label,
          notes: formData.notes || null,
        })
      } else {
        await versionsApi.create({
          productId,
          label: formData.label,
          notes: formData.notes || null,
        })
      }
      closeModal()
      loadData()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message)
      } else {
        setFormError('Error al guardar versión')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await versionsApi.delete(id)
      setDeletingId(null)
      loadData()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Error al eliminar versión')
      }
    }
  }

  function triggerFileInput(versionId: string) {
    uploadingVersionIdRef.current = versionId
    setUploadingVersionId(versionId)
    setUploadError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const versionId = uploadingVersionIdRef.current
    if (!file || !versionId) return

    // Reset file input
    e.target.value = ''

    // Validate file locally
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setUploadError('Solo se permiten archivos .glb')
      setUploadingVersionId(null)
      uploadingVersionIdRef.current = null
      return
    }

    if (file.size === 0) {
      setUploadError('El archivo está vacío')
      setUploadingVersionId(null)
      uploadingVersionIdRef.current = null
      return
    }

    if (file.size > 104857600) {
      setUploadError('El archivo es demasiado grande (máx. 100MB)')
      setUploadingVersionId(null)
      uploadingVersionIdRef.current = null
      return
    }

    setUploadProgress(0)

    try {
      await assetsApi.uploadGlb(versionId, file, (progress) => {
        setUploadProgress(progress)
      })
      setUploadingVersionId(null)
      uploadingVersionIdRef.current = null
      setUploadProgress(0)
      loadData()
    } catch (err) {
      if (err instanceof ApiClientError) {
        // Show details if available (e.g. which field failed validation)
        const detail = err.details?.[0]?.message
        setUploadError(detail ?? err.message)
      } else if (err instanceof Error) {
        setUploadError(err.message)
      } else {
        setUploadError('Error al subir el archivo')
      }
      setUploadingVersionId(null)
      uploadingVersionIdRef.current = null
      setUploadProgress(0)
    }
  }

  function getAssetStatus(version: VersionWithAssets) {
    const sourceAsset = version.assets.find((a) => a.kind === 'SOURCE_GLB')
    if (!sourceAsset) return null
    return sourceAsset
  }

  // Share management functions
  async function openShareModal(versionId: string) {
    setSharingVersionId(versionId)
    setIsShareModalOpen(true)
    setCreatedShareUrl(null)
    setShareError(null)
    setShareFormData({ expiresInDays: 7, maxVisits: '' })

    try {
      setIsLoadingShares(true)
      const sharesData = await sharesApi.list(versionId)
      setShares(sharesData)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setShareError(err.message)
      }
    } finally {
      setIsLoadingShares(false)
    }
  }

  function closeShareModal() {
    setIsShareModalOpen(false)
    setSharingVersionId(null)
    setShares([])
    setCreatedShareUrl(null)
    setShareError(null)
  }

  async function handleCreateShare(e: React.FormEvent) {
    e.preventDefault()
    if (!sharingVersionId) return

    setIsCreatingShare(true)
    setShareError(null)

    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + shareFormData.expiresInDays)

      const result = await sharesApi.create({
        versionId: sharingVersionId,
        expiresAt: expiresAt.toISOString(),
        maxVisits: shareFormData.maxVisits ? parseInt(shareFormData.maxVisits) : null,
      })

      setCreatedShareUrl(`${window.location.origin}/experience/${result.token}`)
      // Refresh shares list
      const sharesData = await sharesApi.list(sharingVersionId)
      setShares(sharesData)
    } catch (err) {
      if (err instanceof ApiClientError) {
        const detail = err.details?.[0]?.message
        setShareError(detail ?? err.message)
      } else {
        setShareError('Error al crear enlace')
      }
    } finally {
      setIsCreatingShare(false)
    }
  }

  async function handleRevokeShare(shareId: string) {
    if (!sharingVersionId) return

    try {
      await sharesApi.revoke(shareId)
      const sharesData = await sharesApi.list(sharingVersionId)
      setShares(sharesData)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setShareError(err.message)
      }
    }
  }

  async function handleDeleteShare(shareId: string) {
    if (!sharingVersionId) return

    try {
      await sharesApi.delete(shareId)
      const sharesData = await sharesApi.list(sharingVersionId)
      setShares(sharesData)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setShareError(err.message)
      }
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback para contextos no-secure
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function canShare(version: VersionWithAssets) {
    const asset = getAssetStatus(version)
    return asset?.status === 'READY'
  }

  function renderAssetStatus(version: VersionWithAssets) {
    const asset = getAssetStatus(version)

    if (uploadingVersionId === version.id) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{uploadProgress}%</span>
        </div>
      )
    }

    if (!asset) {
      return (
        <button
          onClick={() => triggerFileInput(version.id)}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Subir modelo 3D
        </button>
      )
    }

    const statusStyles: Record<string, string> = {
      PENDING_UPLOAD: 'bg-yellow-100 text-yellow-800',
      UPLOADED: 'bg-blue-100 text-blue-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      READY: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
    }

    const statusLabels: Record<string, string> = {
      PENDING_UPLOAD: 'Pendiente',
      UPLOADED: 'Subido',
      PROCESSING: 'Procesando...',
      READY: 'Listo',
      FAILED: 'Error',
    }

    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            statusStyles[asset.status]
          }`}
        >
          {statusLabels[asset.status]}
        </span>
        {asset.status === 'FAILED' && (
          <button
            onClick={() => triggerFileInput(version.id)}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            Reintentar
          </button>
        )}
        {asset.status === 'READY' && (
          <button
            onClick={() => triggerFileInput(version.id)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Reemplazar
          </button>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Cargando versiones...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/projects" className="text-primary-600 hover:text-primary-700">
          Proyectos
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link
          href={`/projects/${projectId}/products`}
          className="text-primary-600 hover:text-primary-700"
        >
          {project?.name}
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{product?.name}</span>
      </nav>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Versiones</h1>
          <p className="mt-1 text-sm text-gray-600">
            Versiones del producto: {product?.name}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Crear Versión
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {uploadError && (
        <div className="mb-4 rounded-md bg-red-50 p-4 flex justify-between items-center">
          <p className="text-sm text-red-700">{uploadError}</p>
          <button
            onClick={() => setUploadError(null)}
            className="text-red-700 hover:text-red-900"
          >
            ×
          </button>
        </div>
      )}

      {versions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-500">No hay versiones de este producto</p>
          <button
            onClick={openCreateModal}
            className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
          >
            Crear tu primera versión
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Etiqueta
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Modelo 3D
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Compartir
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
              {versions.map((version) => (
                <tr key={version.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {version.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {renderAssetStatus(version)}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {version.notes || '-'}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {canShare(version) ? (
                      <button
                        onClick={() => openShareModal(version.id)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Generar enlace
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(version.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openEditModal(version)}
                      className="text-primary-600 hover:text-primary-900 mr-4"
                    >
                      Editar
                    </button>
                    {deletingId === version.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(version.id)}
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
                        onClick={() => setDeletingId(version.id)}
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

      {/* Version Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={closeModal}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                {editingVersion ? 'Editar Versión' : 'Crear Versión'}
              </h2>

              {formError && (
                <div className="mb-4 rounded-md bg-red-50 p-4">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label
                    htmlFor="label"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Etiqueta
                  </label>
                  <input
                    type="text"
                    id="label"
                    value={formData.label}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, label: e.target.value }))
                    }
                    required
                    placeholder="ej: v1.0, v2.0-beta"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Notas (opcional)
                  </label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
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
                      : editingVersion
                      ? 'Guardar'
                      : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={closeShareModal}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Compartir Versión
              </h2>

              {shareError && (
                <div className="mb-4 rounded-md bg-red-50 p-4">
                  <p className="text-sm text-red-700">{shareError}</p>
                </div>
              )}

              {/* Created share URL */}
              {createdShareUrl && (
                <div className="mb-4 rounded-md bg-green-50 p-4">
                  <p className="text-sm font-medium text-green-800 mb-2">
                    Enlace creado:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={createdShareUrl}
                      readOnly
                      className="flex-1 text-sm bg-white border border-green-300 rounded px-2 py-1"
                    />
                    <button
                      onClick={() => copyToClipboard(createdShareUrl)}
                      className={`px-3 py-1 text-sm text-white rounded transition-colors ${copied ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Create new share form */}
              <form onSubmit={handleCreateShare} className="mb-6">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expira en
                    </label>
                    <select
                      value={shareFormData.expiresInDays}
                      onChange={(e) =>
                        setShareFormData((prev) => ({
                          ...prev,
                          expiresInDays: parseInt(e.target.value),
                        }))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
                    >
                      <option value={1}>1 día</option>
                      <option value={7}>7 días</option>
                      <option value={14}>14 días</option>
                      <option value={30}>30 días</option>
                      <option value={90}>90 días</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Máx. visitas (opcional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Sin límite"
                      value={shareFormData.maxVisits}
                      onChange={(e) =>
                        setShareFormData((prev) => ({
                          ...prev,
                          maxVisits: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isCreatingShare}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  {isCreatingShare ? 'Creando...' : 'Crear nuevo enlace'}
                </button>
              </form>

              {/* Existing shares list */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Enlaces existentes
                </h3>
                {isLoadingShares ? (
                  <p className="text-sm text-gray-500">Cargando...</p>
                ) : shares.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay enlaces creados</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {shares.map((share) => (
                      <div
                        key={share.id}
                        className={`flex items-center justify-between p-2 rounded border ${
                          share.revokedAt
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500">
                            {share.token}
                          </p>
                          <p className="text-xs text-gray-400">
                            Expira: {new Date(share.expiresAt).toLocaleDateString('es-AR')}
                            {share.maxVisits && ` • Máx: ${share.maxVisits}`}
                            {' • '}Visitas: {share.visitCount}
                          </p>
                          {share.revokedAt && (
                            <span className="text-xs text-red-600">Revocado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {!share.revokedAt && (
                            <button
                              onClick={() => handleRevokeShare(share.id)}
                              className="px-2 py-1 text-xs text-yellow-600 hover:text-yellow-800"
                            >
                              Revocar
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteShare(share.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={closeShareModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
