/**
 * Storage adapter for S3 operations
 * Handles presigned URLs, uploads, downloads, and deletions
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getConfig } from '../common/config/index'

// Lazy initialization of S3 client
let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!_s3Client) {
    const config = getConfig()
    _s3Client = new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return _s3Client
}

// Storage key conventions
export function buildStorageKey(
  companyId: string,
  versionId: string,
  kind: 'source' | 'thumb' | 'usdz',
  filename: string
): string {
  return `${companyId}/versions/${versionId}/${kind}/${filename}`
}

export interface PresignedUploadResult {
  url: string
  method: 'PUT'
  headers: {
    'Content-Type': string
  }
}

/**
 * Generate a presigned URL for uploading a file
 * TTL: 15 minutes (per spec)
 */
export async function getPresignedUploadUrl(
  storageKey: string,
  contentType: string
): Promise<PresignedUploadResult> {
  const config = getConfig()
  const client = getS3Client()

  const command = new PutObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: storageKey,
    ContentType: contentType,
    // ContentLength intentionally omitted: browsers cannot set Content-Length
    // manually (it's a forbidden XMLHttpRequest header), so signing it would
    // cause S3 to reject the upload with 403.
  })

  const url = await getSignedUrl(client, command, {
    expiresIn: 1800, // 30 minutes (large files up to 500MB)
  })

  return {
    url,
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
  }
}

/**
 * Generate a presigned URL for reading/downloading a file
 * TTL: 1 hour (for viewer URLs)
 */
export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const config = getConfig()
  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: storageKey,
  })

  return getSignedUrl(client, command, { expiresIn })
}

/**
 * Check if an object exists in S3 and return its metadata
 */
export async function getObjectMetadata(
  storageKey: string
): Promise<{ exists: boolean; sizeBytes?: number; etag?: string }> {
  const config = getConfig()
  const client = getS3Client()

  try {
    const command = new HeadObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: storageKey,
    })

    const response = await client.send(command)

    return {
      exists: true,
      sizeBytes: response.ContentLength,
      etag: response.ETag,
    }
  } catch (error: unknown) {
    // NotFound error means object doesn't exist
    if (error instanceof Error && error.name === 'NotFound') {
      return { exists: false }
    }
    throw error
  }
}

/**
 * Download an object from S3
 * Returns the file content as a Buffer
 */
export async function downloadObject(storageKey: string): Promise<Buffer> {
  const config = getConfig()
  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: storageKey,
  })

  const response = await client.send(command)

  if (!response.Body) {
    throw new Error('Empty response body from S3')
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = []
  const stream = response.Body as AsyncIterable<Uint8Array>

  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

/**
 * Upload a buffer to S3
 */
export async function uploadObject(
  storageKey: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const config = getConfig()
  const client = getS3Client()

  const command = new PutObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: storageKey,
    Body: data,
    ContentType: contentType,
  })

  await client.send(command)
}

/**
 * Download a byte range from an S3 object
 * Uses HTTP Range header for efficient partial reads (e.g. GLB header validation)
 */
export async function downloadObjectRange(
  storageKey: string,
  start: number,
  end: number
): Promise<Buffer> {
  const config = getConfig()
  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: storageKey,
    Range: `bytes=${start}-${end}`,
  })

  const response = await client.send(command)

  if (!response.Body) {
    throw new Error('Empty response body from S3 range request')
  }

  const chunks: Uint8Array[] = []
  const stream = response.Body as AsyncIterable<Uint8Array>

  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

/**
 * Delete an object from S3
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const config = getConfig()
  const client = getS3Client()

  const command = new DeleteObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: storageKey,
  })

  await client.send(command)
}

// For testing: reset S3 client
export function resetS3Client(): void {
  _s3Client = null
}
