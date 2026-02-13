/**
 * Assets API client
 * Handles asset upload, processing, and retrieval
 */

import { api } from './client'

export type AssetKind = 'SOURCE_GLB' | 'THUMB' | 'USDZ'
export type AssetStatus = 'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'

export interface Asset {
  id: string
  versionId: string
  submodelId: string | null
  kind: AssetKind
  status: AssetStatus
  contentType: string
  sizeBytes: number
  meta: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetWithUrls extends Asset {
  urls: {
    source?: string
    thumbnail?: string
  }
}

export interface UploadUrlRequest {
  versionId: string
  filename: string
  contentType: 'model/gltf-binary'
  sizeBytes: number
  submodelId?: string | null
}

export interface UploadUrlResponse {
  assetId: string
  uploadUrl: string
  method: 'PUT'
  headers: {
    'Content-Type': string
  }
}

/**
 * Upload a file to S3 using a presigned URL
 */
async function uploadToS3(
  uploadUrl: string,
  file: File,
  headers: { 'Content-Type': string },
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100)
        onProgress(progress)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'))
    })

    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', headers['Content-Type'])
    xhr.send(file)
  })
}

export const assetsApi = {
  /**
   * List all assets for a version
   */
  list: (versionId: string) =>
    api.get<Asset[]>(`/api/assets?versionId=${versionId}`),

  /**
   * Get a single asset with signed URLs
   */
  get: (id: string) => api.get<AssetWithUrls>(`/api/assets/${id}`),

  /**
   * Request a presigned upload URL
   */
  requestUploadUrl: (data: UploadUrlRequest) =>
    api.post<UploadUrlResponse>('/api/assets/upload-url', data),

  /**
   * Mark upload as complete and start processing
   */
  completeUpload: (id: string) =>
    api.post<Asset>(`/api/assets/${id}/complete`),

  /**
   * Delete an asset
   */
  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/assets/${id}`),

  /**
   * Upload a GLB file
   * Handles the full flow: request URL → upload to S3 → complete
   */
  uploadGlb: async (
    versionId: string,
    file: File,
    onProgress?: (progress: number) => void,
    submodelId?: string | null
  ): Promise<Asset> => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.glb')) {
      throw new Error('Only .glb files are supported')
    }

    // Request presigned URL
    const { assetId, uploadUrl, headers } = await assetsApi.requestUploadUrl({
      versionId,
      filename: file.name,
      contentType: 'model/gltf-binary',
      sizeBytes: file.size,
      submodelId: submodelId ?? undefined,
    })

    // Upload to S3
    await uploadToS3(uploadUrl, file, headers, onProgress)

    // Complete upload and start processing
    return assetsApi.completeUpload(assetId)
  },
}
