/**
 * Asset processing utilities
 * GLB validation, thumbnail generation
 */

import { createCanvas } from 'canvas'

// GLB file magic bytes: "glTF" (0x67, 0x6C, 0x54, 0x46)
const GLB_MAGIC = Buffer.from([0x67, 0x6C, 0x54, 0x46])

export interface GlbValidationResult {
  valid: boolean
  error?: string
  version?: number
  totalLength?: number
}

/**
 * Validate GLB file format by checking magic bytes and header
 * GLB Header Structure (12 bytes):
 * - magic: 4 bytes ("glTF")
 * - version: 4 bytes (uint32, little-endian)
 * - length: 4 bytes (uint32, little-endian, total file length)
 */
export function validateGlbFormat(buffer: Buffer, actualFileSize?: number): GlbValidationResult {
  // Minimum GLB size: 12 bytes header + at least some content
  if (buffer.length < 12) {
    return {
      valid: false,
      error: 'File too small to be a valid GLB',
    }
  }

  // Check magic bytes
  const magic = buffer.subarray(0, 4)
  if (!magic.equals(GLB_MAGIC)) {
    return {
      valid: false,
      error: 'Invalid GLB format: missing glTF magic bytes',
    }
  }

  // Read version (should be 2 for glTF 2.0)
  const version = buffer.readUInt32LE(4)
  if (version !== 2) {
    return {
      valid: false,
      error: `Unsupported glTF version: ${version}. Only version 2 is supported`,
    }
  }

  // Read total length
  const totalLength = buffer.readUInt32LE(8)

  // Verify length matches (with some tolerance for potential padding)
  // Use actualFileSize if provided (range-request scenarios), otherwise buffer.length
  const fileSize = actualFileSize ?? buffer.length
  const lengthDiff = Math.abs(fileSize - totalLength)
  const tolerance = Math.max(fileSize * 0.05, 100) // 5% or 100 bytes

  if (lengthDiff > tolerance) {
    return {
      valid: false,
      error: `GLB file size mismatch: header says ${totalLength} bytes, actual is ${fileSize} bytes`,
    }
  }

  return {
    valid: true,
    version,
    totalLength,
  }
}

/**
 * Validate file size matches reported size (with 5% tolerance per spec)
 */
export function validateFileSize(
  actualSize: number,
  reportedSize: number
): { valid: boolean; error?: string } {
  const tolerance = reportedSize * 0.05 // 5% tolerance
  const diff = Math.abs(actualSize - reportedSize)

  if (diff > tolerance) {
    return {
      valid: false,
      error: `File size mismatch: expected ~${reportedSize} bytes, got ${actualSize} bytes`,
    }
  }

  return { valid: true }
}

/**
 * Generate a placeholder thumbnail
 * Creates a simple 512x512 image with a 3D icon placeholder
 * Used as fallback when GLB rendering fails or for MVP simplicity
 */
export async function generatePlaceholderThumbnail(): Promise<Buffer> {
  const canvas = createCanvas(512, 512)
  const ctx = canvas.getContext('2d')

  // Background gradient (dark to match EquipAR branding)
  const gradient = ctx.createLinearGradient(0, 0, 512, 512)
  gradient.addColorStop(0, '#0f172a') // slate-900
  gradient.addColorStop(1, '#1e293b') // slate-800
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)

  // Draw a simple 3D cube icon
  ctx.strokeStyle = '#38bdf8' // primary-400
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Cube center and size
  const cx = 256
  const cy = 256
  const size = 120

  // Isometric cube vertices
  const front = [
    { x: cx - size, y: cy },
    { x: cx, y: cy + size * 0.6 },
    { x: cx + size, y: cy },
    { x: cx, y: cy - size * 0.6 },
  ]

  const top = [
    { x: cx, y: cy - size * 0.6 },
    { x: cx - size, y: cy - size * 1.2 },
    { x: cx, y: cy - size * 1.8 },
    { x: cx + size, y: cy - size * 1.2 },
  ]

  // Draw front face
  ctx.beginPath()
  ctx.moveTo(front[0]!.x, front[0]!.y)
  front.forEach((p) => ctx.lineTo(p.x, p.y))
  ctx.closePath()
  ctx.stroke()

  // Draw top face
  ctx.beginPath()
  ctx.moveTo(top[0]!.x, top[0]!.y)
  top.forEach((p) => ctx.lineTo(p.x, p.y))
  ctx.closePath()
  ctx.stroke()

  // Connect front to top
  ctx.beginPath()
  ctx.moveTo(front[0]!.x, front[0]!.y)
  ctx.lineTo(cx - size, cy - size * 1.2)
  ctx.moveTo(front[2]!.x, front[2]!.y)
  ctx.lineTo(cx + size, cy - size * 1.2)
  ctx.moveTo(front[3]!.x, front[3]!.y)
  ctx.lineTo(top[2]!.x, top[2]!.y)
  ctx.stroke()

  // Add "3D" text below the cube
  ctx.fillStyle = '#64748b' // slate-500
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Modelo 3D', cx, cy + size + 80)

  // Convert to JPEG buffer
  return canvas.toBuffer('image/jpeg', { quality: 0.85 })
}

/**
 * Constants for validation
 */
export const ALLOWED_CONTENT_TYPE = 'model/gltf-binary'
export const MAX_FILE_SIZE_BYTES = 524288000 // 500MB
export const LARGE_FILE_THRESHOLD = 52428800 // 50MB
export const PROCESSING_TIMEOUT_MS = 300000 // 5 minutes
