/**
 * GLB → USDZ converter using Three.js USDZExporter
 *
 * Runs server-side (Node.js 20+) with DOM polyfills from `canvas`.
 * Best-effort: returns null on any failure so GLB processing is never blocked.
 *
 * Three.js is ESM-only (v0.160+), so all imports use dynamic import().
 */

import { createCanvas, Image } from 'canvas'
import { logger } from '../../common/utils/logger'

// Max texture resolution for USDZ output (keeps file size manageable for iOS)
const MAX_TEXTURE_SIZE = 2048

// ── Polyfills for Three.js in Node.js ────────────────────────────────────────
// Three.js assumes browser globals. These stubs satisfy GLTFLoader +
// USDZExporter without pulling in a full browser environment.
let polyfillsApplied = false

// Store raw Blob data so URL.createObjectURL can return data URIs synchronously
const blobDataStore = new WeakMap<object, { buffer: Buffer; type: string }>()

function ensurePolyfills(): void {
  if (polyfillsApplied) return
  polyfillsApplied = true

  const g = globalThis as Record<string, unknown>

  // document.createElement is used by Three.js for canvas and image elements
  if (!g.document) {
    g.document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return createCanvas(1, 1)
        if (tag === 'img') return new Image()
        return {}
      },
      createElementNS: (_ns: string, _tag: string) => ({}),
    }
  }

  if (!g.self) g.self = globalThis
  if (!g.window) g.window = globalThis
  if (!g.navigator) g.navigator = { userAgent: 'node' }
  if (!g.Image) g.Image = Image
  if (!g.HTMLCanvasElement) g.HTMLCanvasElement = (createCanvas(0, 0) as unknown as { constructor: unknown }).constructor
  // OffscreenCanvas stub — USDZExporter might probe for it
  if (!g.OffscreenCanvas) g.OffscreenCanvas = class { constructor(public width = 1, public height = 1) {} }

  // ── Blob wrapper: capture raw data for synchronous createObjectURL ────────
  // GLTFLoader creates Blob([bufferView], {type}) for embedded images, then
  // calls URL.createObjectURL(blob). Node.js has Blob but not createObjectURL.
  // We patch Blob to capture the raw buffer, then return a data URI.
  const OrigBlob = globalThis.Blob
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Blob = class PatchedBlob extends OrigBlob {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(parts?: any[], options?: { type?: string }) {
      super(parts as any, options as any)
      if (parts?.[0] != null) {
        const part = parts[0]
        let buf: Buffer | null = null
        if (part instanceof ArrayBuffer) {
          buf = Buffer.from(part)
        } else if (part instanceof Uint8Array) {
          buf = Buffer.from(part.buffer, part.byteOffset, part.byteLength)
        } else if (Buffer.isBuffer(part)) {
          buf = part
        }
        if (buf) {
          blobDataStore.set(this, { buffer: buf, type: options?.type || 'application/octet-stream' })
        }
      }
    }
  }

  // ── URL.createObjectURL → data URI (for node-canvas Image) ────────────────
  // GLTFLoader calls URL.createObjectURL(blob) then sets image.src = url.
  // node-canvas Image supports data URIs, so we convert synchronously.
  if (!URL.createObjectURL) {
    URL.createObjectURL = (obj: Blob): string => {
      const data = blobDataStore.get(obj)
      if (data) {
        return `data:${data.type};base64,${data.buffer.toString('base64')}`
      }
      return 'blob:node-fallback'
    }
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = (): void => { /* no-op in Node.js */ }
  }

  // ── canvas.toBlob polyfill (node-canvas doesn't have it) ──────────────────
  // USDZExporter calls canvas.toBlob(callback, 'image/png', 1) to encode textures.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CanvasProto = (createCanvas(0, 0) as any).constructor.prototype
  if (!CanvasProto.toBlob) {
    CanvasProto.toBlob = function (
      callback: (blob: Blob) => void,
      type?: string,
      _quality?: number
    ): void {
      const mimeType = type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      const buffer: Buffer = this.toBuffer(mimeType)
      const blob = new Blob([buffer], { type: mimeType })
      callback(blob)
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a GLB buffer to USDZ.
 * Returns the USDZ as a Buffer, or null if conversion fails.
 */
export async function convertGlbToUsdz(glbBuffer: Buffer): Promise<Buffer | null> {
  try {
    ensurePolyfills()

    logger.info(`Starting GLB→USDZ conversion (${(glbBuffer.length / 1048576).toFixed(1)} MB)`)
    const t0 = Date.now()

    // Dynamic ESM imports (Three.js is ESM-only)
    const THREE = await import('three')
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')

    // Parse GLB from buffer
    const loader = new GLTFLoader()
    // Copy into a clean ArrayBuffer (Buffer.buffer may be SharedArrayBuffer)
    const arrayBuffer = new ArrayBuffer(glbBuffer.byteLength)
    new Uint8Array(arrayBuffer).set(glbBuffer)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.parse(arrayBuffer, '', resolve, reject)
    })

    // Wrap in a Scene if GLTFLoader returned a Group (common for multi-mesh models)
    let scene: InstanceType<typeof THREE.Scene>
    if (gltf.scene instanceof THREE.Scene) {
      scene = gltf.scene
    } else {
      scene = new THREE.Scene()
      scene.add(gltf.scene)
    }

    // Force FrontSide on all materials — USDZ doesn't support DoubleSide
    scene.traverse((obj: InstanceType<typeof THREE.Object3D>) => {
      const mesh = obj as InstanceType<typeof THREE.Mesh>
      if (mesh.material) {
        const mat = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>
        if (mat.side === THREE.DoubleSide) {
          mat.side = THREE.FrontSide
        }
      }
    })

    // Export scene to USDZ with capped texture resolution
    const exporter = new USDZExporter()
    const usdzArrayBuffer = await exporter.parseAsync(scene, {
      maxTextureSize: MAX_TEXTURE_SIZE,
    })
    const usdzBuffer = Buffer.from(usdzArrayBuffer)

    // Dispose Three.js objects to free memory
    gltf.scene.traverse((obj: InstanceType<typeof THREE.Object3D>) => {
      const mesh = obj as InstanceType<typeof THREE.Mesh>
      if (mesh.geometry) mesh.geometry.dispose()
      if (mesh.material) {
        const mat = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>
        if (mat.map) mat.map.dispose()
        if (mat.normalMap) mat.normalMap.dispose()
        if (mat.roughnessMap) mat.roughnessMap.dispose()
        if (mat.metalnessMap) mat.metalnessMap.dispose()
        mat.dispose()
      }
    })

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    logger.info(
      `USDZ conversion complete: ${(usdzBuffer.length / 1048576).toFixed(1)} MB in ${elapsed}s`
    )

    return usdzBuffer
  } catch (error) {
    logger.error('GLB→USDZ conversion failed (non-blocking):', error)
    return null
  }
}
