'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getExperience, startVisit, endVisit, PublicApiError, type PublicExperience, type PublicSubmodel } from '@/lib/api/public'

type AppState = 'loading' | 'ready' | 'error' | 'ar-scanning' | 'ar-placed' | 'viewer-fallback'

// ── IndexedDB GLB cache ──────────────────────────────────────────────────────
// Persists downloaded GLB blobs across page reloads, keyed by share token.
// The token is stable for the life of the share link, so it makes a safe cache key.
const GLB_DB_NAME = 'rv-glb-cache'
const GLB_STORE = 'glbs'
const GLB_TTL_MS = 7 * 24 * 3600 * 1000 // 7 days

function openGlbDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GLB_DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(GLB_STORE)) {
        db.createObjectStore(GLB_STORE, { keyPath: 'token' })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

async function getCachedGlb(token: string): Promise<Blob | null> {
  try {
    const db = await openGlbDb()
    return new Promise((resolve) => {
      const tx = db.transaction(GLB_STORE, 'readonly')
      const req = tx.objectStore(GLB_STORE).get(token)
      req.onsuccess = () => {
        const record = req.result as { token: string; blob: Blob; cachedAt: number } | undefined
        if (!record || Date.now() - record.cachedAt > GLB_TTL_MS) { resolve(null); return }
        resolve(record.blob)
      }
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function cacheGlb(token: string, blob: Blob): Promise<void> {
  try {
    const db = await openGlbDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(GLB_STORE, 'readwrite')
      tx.objectStore(GLB_STORE).put({ token, blob, cachedAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch { /* fail silently — cache is best-effort */ }
}

export default function ExperiencePage() {
  const params = useParams()
  const token = params.token as string

  const [experience, setExperience] = useState<PublicExperience | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [appState, setAppState] = useState<AppState>('loading')
  const [isARSupported, setIsARSupported] = useState(false)
  const [isIOSDevice, setIsIOSDevice] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [isMoving, setIsMoving] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [isStartingAR, setIsStartingAR] = useState(false)
  const [isSheetMinimized, setIsSheetMinimized] = useState(false)
  const [isLoading3D, setIsLoading3D] = useState(false)
  const [isLoadingMinimized, setIsLoadingMinimized] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{
    phase: 'downloading' | 'parsing'
    percent: number
    loadedMB: number
    totalMB: number
    speedMBs: number
    etaSeconds: number
  } | null>(null)

  // Submodel selector state
  const [selectedSubmodel, setSelectedSubmodel] = useState<string | null>(null) // null = base model
  const [isSwappingModel, setIsSwappingModel] = useState(false)

  // Joystick visual state
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 })

  // ── Visit tracking ──────────────────────────────────────────
  const [visitId, setVisitId] = useState<string | null>(null)
  const visitStartTimeRef = useRef<number | null>(null)
  const usedARRef = useRef(false)

  // ── Babylon refs ──────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<import('@babylonjs/core').Engine | null>(null)
  const sceneRef = useRef<import('@babylonjs/core').Scene | null>(null)
  const xrRef = useRef<import('@babylonjs/core/XR').WebXRDefaultExperience | null>(null)
  const modelRef = useRef<import('@babylonjs/core').AbstractMesh | null>(null)
  const reticleRef = useRef<import('@babylonjs/core').Mesh | null>(null)
  const lastHitPoseRef = useRef<import('@babylonjs/core').Matrix | null>(null)
  const placedPositionRef = useRef<{ x: number; y: number; z: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── Download tracking refs ────────────────────────────────
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // ── Joystick refs ──────────────────────────────────────────
  const joystickContainerRef = useRef<HTMLDivElement>(null)
  const joystickDeltaRef = useRef({ x: 0, z: 0 })
  const joystickActiveRef = useRef(false)
  const joystickAnimFrameRef = useRef<number | null>(null)
  const lastJoystickTimeRef = useRef(0)

  // ── State refs: lets WebXR/Babylon callbacks read current
  //    React state without stale closures ─────────────────────
  const appStateRef = useRef<AppState>('loading')
  const isMovingRef = useRef(false)
  useEffect(() => { appStateRef.current = appState }, [appState])
  useEffect(() => { isMovingRef.current = isMoving }, [isMoving])

  // ── Load experience ───────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const data = await getExperience(token)
        setExperience(data)
        setAppState('ready')

        // Start visit tracking after experience loads
        try {
          const { visitId: vId } = await startVisit(token)
          setVisitId(vId)
          visitStartTimeRef.current = Date.now()
        } catch {
          // Silently ignore visit tracking errors
          console.warn('Failed to start visit tracking')
        }
      } catch (err) {
        if (err instanceof PublicApiError) {
          setError({ code: err.code, message: err.message })
        } else {
          setError({ code: 'UNKNOWN_ERROR', message: 'Error al cargar la experiencia' })
        }
        setAppState('error')
      }
    }
    load()
  }, [token])

  // ── Track AR usage ────────────────────────────────────────
  useEffect(() => {
    if (appState === 'ar-placed') {
      usedARRef.current = true
    }
  }, [appState])

  // ── End visit on unmount or page close ─────────────────────
  useEffect(() => {
    const handleEndVisit = () => {
      if (visitId && visitStartTimeRef.current) {
        const durationMs = Date.now() - visitStartTimeRef.current
        // Use sendBeacon for reliable delivery on page close
        const data = JSON.stringify({
          visitId,
          durationMs,
          usedAR: usedARRef.current,
        })
        const blob = new Blob([data], { type: 'application/json' })
        navigator.sendBeacon('/api/public/visits/end', blob)
      }
    }

    const handleBeforeUnload = () => {
      handleEndVisit()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
      // Also try async call on component unmount (SPA navigation)
      if (visitId && visitStartTimeRef.current) {
        const durationMs = Date.now() - visitStartTimeRef.current
        endVisit(visitId, durationMs, usedARRef.current).catch(() => {
          // Silently ignore
        })
      }
    }
  }, [visitId])

  // ── Device / AR detection ─────────────────────────────────
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOSDevice(isIOS)
    if ('xr' in navigator && !isIOS) {
      ;(navigator as Navigator & { xr: XRSystem }).xr
        .isSessionSupported('immersive-ar')
        .then((s) => setIsARSupported(s))
        .catch(() => setIsARSupported(false))
    }
  }, [])

  // ── Cleanup ───────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (joystickAnimFrameRef.current) {
      cancelAnimationFrame(joystickAnimFrameRef.current)
      joystickAnimFrameRef.current = null
    }
    sceneRef.current?.dispose()
    engineRef.current?.dispose()
    sceneRef.current = null
    engineRef.current = null
    xrRef.current = null
    modelRef.current = null
    reticleRef.current = null
    lastHitPoseRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  // ── Download helpers ──────────────────────────────────────
  function formatETA(seconds: number): string {
    if (!isFinite(seconds) || seconds > 3600) return 'calculando...'
    if (seconds < 60) return `${Math.round(seconds)} seg`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins} min${secs > 0 ? ` ${secs} seg` : ''}`
  }

  function formatSpeed(mbps: number): string {
    if (mbps < 0.1) return `${Math.round(mbps * 1024)} KB/s`
    return `${mbps.toFixed(1)} MB/s`
  }

  // Downloads the GLB via XHR so we can track progress.
  // Returns the raw Blob so the caller can cache it and create a blob URL.
  const downloadWithProgress = useCallback((url: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      const startTime = Date.now()

      xhr.open('GET', url)
      xhr.responseType = 'blob'

      xhr.onprogress = (e) => {
        const elapsed = (Date.now() - startTime) / 1000
        const speedBytesPerSec = elapsed > 0 ? e.loaded / elapsed : 0
        const total = e.total > 0 ? e.total : 0
        const remaining = (speedBytesPerSec > 0 && total > 0)
          ? (total - e.loaded) / speedBytesPerSec
          : Infinity

        setDownloadProgress({
          phase: 'downloading',
          percent: total > 0 ? Math.min(99, Math.round((e.loaded / total) * 100)) : 0,
          loadedMB: e.loaded / 1048576,
          totalMB: total / 1048576,
          speedMBs: speedBytesPerSec / 1048576,
          etaSeconds: remaining,
        })
      }

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 0) {
          xhrRef.current = null
          resolve(xhr.response as Blob)
        } else {
          reject(new Error(`Error HTTP ${xhr.status} al descargar el modelo`))
        }
      }

      xhr.onerror = () => reject(new Error('Error de red al descargar el modelo'))
      xhr.onabort = () => reject(new Error('ABORTED'))

      xhr.send()
    })
  }, [])

  const cancelDownload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setDownloadProgress(null)
    setIsLoading3D(false)
    setIsLoadingMinimized(false)
    cleanup()
  }, [cleanup])

  // ── 3-D viewer fallback (orbit, no AR) ────────────────────
  const initViewerFallback = useCallback(async () => {
    if (!experience || !canvasRef.current) return

    setIsLoading3D(true)
    setIsLoadingMinimized(false)

    // Dispose any existing Babylon engine/scene before creating a new one.
    cleanup()

    const canvas = canvasRef.current

    try {
      const { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, Color4 } =
        await import('@babylonjs/core')
      await import('@babylonjs/loaders/glTF')
      const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')

      // ── Phase 1: Check IndexedDB cache, download only if needed ──
      let blob = await getCachedGlb(token)
      if (blob) {
        // Cache hit — skip download UI, go straight to parsing
        setDownloadProgress({ phase: 'parsing', percent: 0, loadedMB: 0, totalMB: 0, speedMBs: 0, etaSeconds: 0 })
      } else {
        // Cache miss — show download progress
        setDownloadProgress({ phase: 'downloading', percent: 0, loadedMB: 0, totalMB: 0, speedMBs: 0, etaSeconds: Infinity })
        blob = await downloadWithProgress(experience.assets.glbUrl)
        // Store in IndexedDB for future reloads (fire-and-forget)
        cacheGlb(token, blob)
        // ── Phase 2: Babylon parsing ──
        setDownloadProgress({ phase: 'parsing', percent: 0, loadedMB: 0, totalMB: 0, speedMBs: 0, etaSeconds: 0 })
      }

      const blobUrl = URL.createObjectURL(blob)
      blobUrlRef.current = blobUrl

      const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
      engineRef.current = engine

      const scene = new Scene(engine)
      sceneRef.current = scene
      scene.clearColor = new Color4(0.95, 0.95, 0.95, 1)

      const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), scene)
      camera.attachControl(canvas, true)
      camera.inertia = 0.75

      new HemisphericLight('light', new Vector3(0, 1, 0), scene).intensity = 1.2

      const { meshes } = await SceneLoader.ImportMeshAsync('', '', blobUrl, scene, undefined, '.glb')

      // Release the blob URL — model is now in GPU memory
      URL.revokeObjectURL(blobUrl)
      blobUrlRef.current = null

      if (meshes.length > 0) {
        let min = new Vector3(Infinity, Infinity, Infinity)
        let max = new Vector3(-Infinity, -Infinity, -Infinity)
        meshes.forEach((m) => {
          if (m.getBoundingInfo) {
            const bi = m.getBoundingInfo()
            min = Vector3.Minimize(min, bi.boundingBox.minimumWorld)
            max = Vector3.Maximize(max, bi.boundingBox.maximumWorld)
          }
        })

        // ── Normalize camera to model size ──────────────────────────────
        // Industrial CAD models can be exported in m, cm, or mm, giving
        // wildly different unit scales. All limits and speeds are derived
        // from the model's bounding-box diagonal so the UX feels identical
        // regardless of unit system.
        const sizeX = max.x - min.x
        const sizeY = max.y - min.y
        const sizeZ = max.z - min.z
        const modelSize = Math.max(sizeX, sizeY, sizeZ)

        camera.target = min.add(max).scale(0.5)
        camera.radius = modelSize * 2.5 // initial frame: model fills ~40% of viewport

        // Zoom limits: from very close-up (5%) to overview (15×)
        camera.lowerRadiusLimit = modelSize * 0.05
        camera.upperRadiusLimit = modelSize * 15

        // Zoom speed: percentage of current radius per step (auto-scales with zoom level).
        camera.wheelDeltaPercentage = 0.05
        camera.pinchDeltaPercentage = 0.05

        // Pan speed: panningSensibility = pixels required to pan 1 world unit.
        // Formula: sensibility = 1200 / modelSize → a ~1200px swipe pans ≈ one model width.
        // Clamped so tiny models don't feel too slow and huge models don't feel too jittery.
        camera.panningSensibility = Math.min(Math.max(1, 1200 / modelSize), 1200)
      }

      setDownloadProgress(null)
      setIsLoading3D(false)
      setIsLoadingMinimized(false)
      setAppState('viewer-fallback')
      engine.runRenderLoop(() => scene.render())
      window.addEventListener('resize', () => engine.resize())
    } catch (err) {
      // Clean up any partial blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setDownloadProgress(null)
      setIsLoading3D(false)
      setIsLoadingMinimized(false)

      // User cancelled — silently return to ready screen
      if (err instanceof Error && err.message === 'ABORTED') return

      setError({
        code: 'LOAD_ERROR',
        message: `Error al cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}`,
      })
      setAppState('error')
    }
  }, [experience, token, cleanup, downloadWithProgress])

  // ── AR session ────────────────────────────────────────────
  const startARSession = useCallback(async () => {
    if (!experience || !canvasRef.current) return
    setIsStartingAR(true)
    const canvas = canvasRef.current

    const BABYLON = await import('@babylonjs/core')
    await import('@babylonjs/loaders/glTF')
    const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')
    await import('@babylonjs/core/XR/features/WebXRHitTest')
    await import('@babylonjs/core/XR/features/WebXRDOMOverlay')

    // Engine + scene
    const engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      xrCompatible: true,
    })
    engineRef.current = engine

    const scene = new BABYLON.Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0)

    // Placeholder camera — NO attachControl (would steal touch events from tap handler)
    new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 1.6, 0), scene)

    // Lighting
    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.0

    // Reticle: torus ring, flat on floor
    const reticle = BABYLON.MeshBuilder.CreateTorus(
      'reticle',
      { diameter: 0.45, thickness: 0.025, tessellation: 48 },
      scene
    )
    reticle.rotation.x = -Math.PI / 2
    const rMat = new BABYLON.StandardMaterial('rMat', scene)
    rMat.diffuseColor = new BABYLON.Color3(0.2, 0.85, 0.3)
    rMat.emissiveColor = new BABYLON.Color3(0.1, 0.55, 0.15)
    reticle.material = rMat
    reticle.isVisible = false
    reticleRef.current = reticle

    // Start render loop early (needed for WebXR)
    engine.runRenderLoop(() => scene.render())

    // WebXR — enter AR BEFORE loading the model so the browser's
    // user-gesture window (from the "Iniciar AR" tap) is still active.
    // Loading a large GLB first can exceed the gesture timeout (~5 s),
    // causing enterXRAsync to be silently rejected → fallback to 3D.
    setModelReady(false)

    // Helper: rejects after ms milliseconds to prevent indefinite hangs
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tiempo de espera agotado (${ms / 1000}s)`)), ms)
        ),
      ])

    try {
      const xr = await withTimeout(
        BABYLON.WebXRDefaultExperience.CreateAsync(scene, {
          disableDefaultUI: true,
          uiOptions: { sessionMode: 'immersive-ar' },
          optionalFeatures: true,
        }),
        20000
      )
      xrRef.current = xr

      const hitTest = xr.baseExperience.featuresManager.enableFeature(
        BABYLON.WebXRFeatureName.HIT_TEST,
        'latest',
        { entityTypes: ['plane'] }
      ) as import('@babylonjs/core/XR/features/WebXRHitTest').WebXRHitTest

      // ── Hit-test callback ─────────────────────────────────
      // Uses refs (appStateRef / isMovingRef) so it always reads
      // the *current* React state, not the stale closure value.
      hitTest.onHitTestResultObservable.add((results) => {
        if (results.length === 0) {
          if (reticleRef.current) reticleRef.current.isVisible = false
          return
        }

        const hitMatrix = results[0].transformationMatrix
        const state = appStateRef.current
        const moving = isMovingRef.current

        if (state === 'ar-scanning' || (state === 'ar-placed' && moving)) {
          const pos = new BABYLON.Vector3()
          const _r = new BABYLON.Quaternion()
          const _s = new BABYLON.Vector3()
          hitMatrix.decompose(_s, _r, pos)

          if (reticleRef.current) {
            reticleRef.current.isVisible = true
            reticleRef.current.position = pos
          }

          lastHitPoseRef.current = hitMatrix.clone()

          if (state === 'ar-placed' && moving && modelRef.current) {
            modelRef.current.position = pos.clone()
          }
        } else {
          if (reticleRef.current) reticleRef.current.isVisible = false
        }
      })

      // dom-overlay: permite que los HTML overlays se compositen encima de la vista AR
      if (overlayRef.current) {
        xr.baseExperience.featuresManager.enableFeature(
          BABYLON.WebXRFeatureName.DOM_OVERLAY,
          'latest',
          { element: overlayRef.current }
        )
      }

      // Enter AR — with timeout to avoid hanging indefinitely on unsupported devices
      await withTimeout(xr.baseExperience.enterXRAsync('immersive-ar', 'unbounded'), 15000)
      setIsStartingAR(false)
      setAppState('ar-scanning')

      // Session end (system back / gesture)
      xr.baseExperience.onStateChangedObservable.add((s) => {
        if (s === BABYLON.WebXRState.NOT_IN_XR) {
          setAppState('ready')
          cleanup()
        }
      })
    } catch (err) {
      console.error('WebXR init error:', err)
      setIsStartingAR(false)
      initViewerFallback()
      return
    }

    // Load model in background — AR camera is already rendering.
    // Check IndexedDB cache first to avoid re-downloading large files.
    try {
      const cachedBlob = await getCachedGlb(token)
      let arBlob: Blob
      if (cachedBlob) {
        arBlob = cachedBlob
      } else {
        const resp = await fetch(experience.assets.glbUrl)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        arBlob = await resp.blob()
        cacheGlb(token, arBlob) // fire-and-forget
      }
      const arBlobUrl = URL.createObjectURL(arBlob)
      const { meshes: arMeshes } = await SceneLoader.ImportMeshAsync('', '', arBlobUrl, scene, undefined, '.glb')
      URL.revokeObjectURL(arBlobUrl)
      const meshes = arMeshes
      if (meshes.length > 0) {
        const root = meshes[0]
        root.setEnabled(false)
        root.position = BABYLON.Vector3.Zero()
        root.rotationQuaternion = null   // use Euler so rotation slider works
        root.rotation = BABYLON.Vector3.Zero()
        modelRef.current = root
      }
      setModelReady(true)
    } catch (err) {
      console.error('Failed to load 3D model in AR:', err)
      if (xrRef.current) {
        try { await xrRef.current.baseExperience.exitXRAsync() } catch {}
      }
      cleanup()
      setError({
        code: 'LOAD_ERROR',
        message: `Error al cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}`,
      })
      setAppState('error')
    }
  }, [experience, token, cleanup, initViewerFallback])

  // ── Place model at last hit position ──────────────────────
  const placeModel = useCallback(async () => {
    if (!modelRef.current || !lastHitPoseRef.current) return
    const BABYLON = await import('@babylonjs/core')

    const pos = new BABYLON.Vector3()
    const _r = new BABYLON.Quaternion()
    const _s = new BABYLON.Vector3()
    lastHitPoseRef.current.decompose(_s, _r, pos)

    const model = modelRef.current
    model.position = pos.clone()
    model.rotationQuaternion = null   // ensure Euler is active
    model.rotation = BABYLON.Vector3.Zero()
    model.setEnabled(true)

    // Store placed position for joystick offset
    placedPositionRef.current = { x: pos.x, y: pos.y, z: pos.z }

    if (reticleRef.current) reticleRef.current.isVisible = false

    setAppState('ar-placed')
    setRotation(0)
    setIsMoving(false)
    setIsSheetMinimized(false)
  }, [])

  // ── Rotation slider ───────────────────────────────────────
  const handleRotationChange = useCallback((deg: number) => {
    setRotation(deg)
    if (modelRef.current) {
      modelRef.current.rotation.y = (deg * Math.PI) / 180
    }
  }, [])

  // ── Swap submodel (viewer-fallback + AR) ──────────────────
  const swapModel = useCallback(async (submodelId: string | null) => {
    if (!experience || !sceneRef.current || !engineRef.current) return
    if (submodelId === selectedSubmodel) return

    setIsSwappingModel(true)

    // Determine the GLB URL for the selected variant
    let glbUrl: string
    if (submodelId === null) {
      glbUrl = experience.assets.glbUrl
    } else {
      const sub = experience.submodels.find((s) => s.id === submodelId)
      if (!sub) {
        setIsSwappingModel(false)
        return
      }
      glbUrl = sub.assets.glbUrl
    }

    const scene = sceneRef.current
    const currentState = appStateRef.current
    const isInAR = currentState === 'ar-scanning' || currentState === 'ar-placed'

    try {
      const BABYLON = await import('@babylonjs/core')
      const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')

      if (isInAR) {
        // AR mode: preserve position/rotation, only dispose model meshes
        let savedPosition: import('@babylonjs/core').Vector3 | null = null
        let savedRotation: import('@babylonjs/core').Vector3 | null = null
        let wasEnabled = false

        if (modelRef.current) {
          savedPosition = modelRef.current.position.clone()
          savedRotation = modelRef.current.rotation.clone()
          wasEnabled = modelRef.current.isEnabled()
          // Dispose model root + all children
          modelRef.current.getChildMeshes().forEach((m) => m.dispose())
          modelRef.current.dispose()
          modelRef.current = null
        }

        // Load new model
        const { meshes } = await SceneLoader.ImportMeshAsync('', '', glbUrl, scene)

        if (meshes.length > 0) {
          const root = meshes[0]
          root.rotationQuaternion = null // use Euler for rotation slider

          if (currentState === 'ar-placed' && savedPosition) {
            root.position = savedPosition
            root.rotation = savedRotation || BABYLON.Vector3.Zero()
            root.setEnabled(wasEnabled)
          } else {
            // Scanning: keep model hidden until placed
            root.position = BABYLON.Vector3.Zero()
            root.rotation = BABYLON.Vector3.Zero()
            root.setEnabled(false)
          }

          modelRef.current = root
        }
        setModelReady(true)
      } else {
        // Viewer-fallback mode: dispose all meshes, refit camera
        const meshesToDispose = [...scene.meshes]
        meshesToDispose.forEach((m) => m.dispose())

        const { meshes } = await SceneLoader.ImportMeshAsync('', '', glbUrl, scene)

        const camera = scene.activeCamera as import('@babylonjs/core').ArcRotateCamera
        if (camera && meshes.length > 0) {
          let min = new BABYLON.Vector3(Infinity, Infinity, Infinity)
          let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity)
          meshes.forEach((m) => {
            if (m.getBoundingInfo) {
              const bi = m.getBoundingInfo()
              min = BABYLON.Vector3.Minimize(min, bi.boundingBox.minimumWorld)
              max = BABYLON.Vector3.Maximize(max, bi.boundingBox.maximumWorld)
            }
          })
          camera.target = min.add(max).scale(0.5)
          camera.radius = Math.max(...[max.x - min.x, max.y - min.y, max.z - min.z]) * 2
        }
      }

      setSelectedSubmodel(submodelId)
    } catch (err) {
      console.error('Failed to swap model:', err)
      // Don't crash — user stays on current model
    } finally {
      setIsSwappingModel(false)
    }
  }, [experience, selectedSubmodel])

  // ── Joystick movement loop ────────────────────────────────
  const joystickLoop = useCallback(() => {
    if (!joystickActiveRef.current) return

    const now = performance.now()
    const dt = (now - lastJoystickTimeRef.current) / 1000 // seconds
    lastJoystickTimeRef.current = now

    const model = modelRef.current
    const placed = placedPositionRef.current
    if (model && placed) {
      const speed = 0.8 // meters per second at full displacement
      const dx = joystickDeltaRef.current.x * speed * dt
      const dz = joystickDeltaRef.current.z * speed * dt

      // Update stored position
      placed.x += dx
      placed.z += dz

      // Apply to model
      model.position.x = placed.x
      model.position.z = placed.z
    }

    joystickAnimFrameRef.current = requestAnimationFrame(joystickLoop)
  }, [])

  // ── Joystick touch handlers ───────────────────────────────
  const JOYSTICK_RADIUS = 52 // outer radius in px
  const KNOB_RADIUS = 22     // knob radius in px
  const MAX_TRAVEL = JOYSTICK_RADIUS - KNOB_RADIUS // max knob center offset

  const getJoystickCenter = useCallback(() => {
    const el = joystickContainerRef.current
    if (!el) return { cx: 0, cy: 0 }
    const rect = el.getBoundingClientRect()
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
  }, [])

  const handleJoystickStart = useCallback((clientX: number, clientY: number) => {
    joystickActiveRef.current = true
    lastJoystickTimeRef.current = performance.now()

    const { cx, cy } = getJoystickCenter()
    let dx = clientX - cx
    let dy = clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > MAX_TRAVEL) {
      dx = (dx / dist) * MAX_TRAVEL
      dy = (dy / dist) * MAX_TRAVEL
    }

    setKnobPos({ x: dx, y: dy })
    const normalized = dist > 0 ? Math.min(dist / MAX_TRAVEL, 1) : 0
    joystickDeltaRef.current = {
      x: dist > 0 ? (dx / MAX_TRAVEL) * normalized : 0,
      z: dist > 0 ? (-dy / MAX_TRAVEL) * normalized : 0,
    }

    // Start animation loop
    if (joystickAnimFrameRef.current) cancelAnimationFrame(joystickAnimFrameRef.current)
    joystickAnimFrameRef.current = requestAnimationFrame(joystickLoop)
  }, [getJoystickCenter, MAX_TRAVEL, joystickLoop])

  const handleJoystickMove = useCallback((clientX: number, clientY: number) => {
    if (!joystickActiveRef.current) return

    const { cx, cy } = getJoystickCenter()
    let dx = clientX - cx
    let dy = clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > MAX_TRAVEL) {
      dx = (dx / dist) * MAX_TRAVEL
      dy = (dy / dist) * MAX_TRAVEL
    }

    setKnobPos({ x: dx, y: dy })
    const normalized = dist > 0 ? Math.min(dist / MAX_TRAVEL, 1) : 0
    joystickDeltaRef.current = {
      x: dist > 0 ? (dx / MAX_TRAVEL) * normalized : 0,
      z: dist > 0 ? (-dy / MAX_TRAVEL) * normalized : 0,
    }
  }, [getJoystickCenter, MAX_TRAVEL])

  const handleJoystickEnd = useCallback(() => {
    joystickActiveRef.current = false
    joystickDeltaRef.current = { x: 0, z: 0 }
    setKnobPos({ x: 0, y: 0 })
    if (joystickAnimFrameRef.current) {
      cancelAnimationFrame(joystickAnimFrameRef.current)
      joystickAnimFrameRef.current = null
    }
  }, [])

  // ── Reset → scanning ──────────────────────────────────────
  const resetPlacement = useCallback(() => {
    if (modelRef.current) modelRef.current.setEnabled(false)
    placedPositionRef.current = null
    setIsMoving(false)
    setAppState('ar-scanning')
    setRotation(0)
    setIsSheetMinimized(false)
    handleJoystickEnd()
  }, [handleJoystickEnd])

  // ── Exit AR ───────────────────────────────────────────────
  const exitAR = useCallback(async () => {
    handleJoystickEnd()
    if (xrRef.current) {
      try { await xrRef.current.baseExperience.exitXRAsync() } catch {}
    }
    cleanup()
    setAppState('ready')
  }, [cleanup, handleJoystickEnd])

  // ── Tap to place / confirm ────────────────────────────────
  // En immersive-ar + dom-overlay los taps no llegan al canvas.
  // Se usa un div tap-catcher con pointer-events-auto (ver JSX abajo).
  const handleTapToPlace = useCallback(() => {
    const state = appStateRef.current
    if (state === 'ar-scanning' && lastHitPoseRef.current) {
      placeModel()
    } else if (state === 'ar-placed' && isMovingRef.current) {
      setIsMoving(false)
      if (reticleRef.current) reticleRef.current.isVisible = false
    }
  }, [placeModel])

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  // ── Error ─────────────────────────────────────────────────
  if (appState === 'error' && error) {
    const msgs: Record<string, { title: string; desc: string }> = {
      SHARE_EXPIRED:       { title: 'Enlace expirado',  desc: 'Este enlace ha expirado.' },
      SHARE_REVOKED:       { title: 'Enlace revocado',  desc: 'Este enlace fue revocado.' },
      SHARE_LIMIT_REACHED: { title: 'Límite alcanzado', desc: 'Se alcanzó el máximo de visitas.' },
      NOT_FOUND:           { title: 'No encontrado',    desc: 'El enlace no existe.' },
    }
    const { title, desc } = msgs[error.code] ?? { title: 'Error', desc: error.message }

    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v3.75m-9.303 3.376a12 12 0 1021.593 0M12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────
  if (appState === 'loading' || !experience) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Cargando experiencia...</p>
        </div>
      </div>
    )
  }

  // ── Helpers ───────────────────────────────────────────────
  const isAR = appState === 'ar-scanning' || appState === 'ar-placed'

  // ── Main render ───────────────────────────────────────────
  // Canvas is ALWAYS rendered at the same DOM position so Babylon
  // never loses its context across state transitions.
  // Non-AR states cover it with an opaque layer; AR states show
  // semi-transparent overlays on top.
  return (
    <div className="h-screen overflow-hidden relative bg-black">

      {/* ── Canvas (always mounted, full-screen) ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* ══════════════════════════════════════════════════════
          READY STATE — opaque cover with preview + buttons
          ══════════════════════════════════════════════════════ */}
      {appState === 'ready' && (
        <div className="absolute inset-0 z-10 flex flex-col bg-gray-100">
          {/* Header */}
          <header className="bg-white shadow-sm px-5 py-4 shrink-0">
            <h1 className="text-lg font-semibold text-gray-900">{experience.product.name}</h1>
            <p className="text-sm text-gray-400">{experience.product.versionLabel}</p>
          </header>

          {/* Preview */}
          <main className="flex-1 flex flex-col items-center justify-center p-6">
            {experience.assets.thumbUrl && (
              <img
                src={experience.assets.thumbUrl}
                alt={experience.product.name}
                className="w-56 h-56 object-contain mb-6 rounded-xl shadow-md"
              />
            )}
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              {experience.product.name}
            </h2>
            <p className="text-gray-500 text-sm text-center mb-8 max-w-xs">
              {isARSupported || (isIOSDevice && experience.assets.usdzUrl)
                ? 'Coloca este modelo a escala real en tu entorno'
                : 'Visualiza este modelo en 3D'}
            </p>

            <div className="w-full max-w-xs flex flex-col gap-3">
              {/* AR primary */}
              {isARSupported && !isIOSDevice && (
                <button
                  onClick={startARSession}
                  disabled={isLoading3D}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold text-base shadow-md active:bg-blue-700 disabled:opacity-60"
                >
                  Iniciar AR
                </button>
              )}
              {isIOSDevice && experience.assets.usdzUrl && (
                <a
                  href={experience.assets.usdzUrl}
                  rel="ar"
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold text-base text-center shadow-md"
                >
                  Ver en AR
                </a>
              )}

              {/* 3-D viewer */}
              {isLoading3D && isLoadingMinimized ? (
                // While downloading in background: show expand button
                <button
                  onClick={() => setIsLoadingMinimized(false)}
                  className="w-full py-3.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl font-medium text-base flex items-center justify-center gap-2"
                >
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                  {downloadProgress ? `Descargando... ${downloadProgress.percent}%` : 'Procesando...'}
                </button>
              ) : (
                <button
                  onClick={initViewerFallback}
                  disabled={isLoading3D}
                  className="w-full py-3.5 bg-white border border-gray-300 text-gray-700 rounded-2xl font-medium text-base active:bg-gray-50 disabled:opacity-60"
                >
                  Ver en 3D
                </button>
              )}
            </div>
          </main>

          {/* ── Minimized download banner (background mode) ── */}
          {isLoading3D && isLoadingMinimized && downloadProgress && (
            <div className="shrink-0 bg-blue-50 border-t border-blue-100 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {downloadProgress.phase === 'downloading' ? (
                    <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  ) : (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent shrink-0" />
                  )}
                  <span className="text-sm font-medium text-blue-900 truncate">
                    {downloadProgress.phase === 'downloading'
                      ? `Descargando modelo... ${downloadProgress.percent}%`
                      : 'Procesando modelo 3D...'}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  {downloadProgress.phase === 'downloading' && isFinite(downloadProgress.etaSeconds) && downloadProgress.etaSeconds > 0 && (
                    <span className="text-xs text-blue-600 whitespace-nowrap">~{formatETA(downloadProgress.etaSeconds)}</span>
                  )}
                  <button
                    onClick={() => setIsLoadingMinimized(false)}
                    className="text-xs text-blue-700 font-semibold"
                  >
                    Ver
                  </button>
                  <button
                    onClick={cancelDownload}
                    className="text-xs text-red-500 font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <footer className="bg-white border-t px-5 py-3 shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>
                {experience.share.remainingVisits !== null
                  ? `${experience.share.remainingVisits} visitas restantes`
                  : 'Visitas ilimitadas'}
              </span>
              <span>Expira: {new Date(experience.share.expiresAt).toLocaleDateString('es-AR')}</span>
            </div>
          </footer>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          AR LOADING — fullscreen overlay while initializing AR
          ══════════════════════════════════════════════════════ */}
      {isStartingAR && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-900">
          <div className="relative mb-8">
            {/* Outer pulsing ring */}
            <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-blue-400/30 animate-ping" />
            {/* Spinner */}
            <div className="w-24 h-24 rounded-full border-4 border-gray-700 border-t-blue-500 animate-spin" />
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Iniciando cámara AR</h2>
          <p className="text-gray-400 text-sm text-center max-w-xs leading-relaxed">
            Preparando la experiencia de realidad aumentada...
          </p>
          <div className="mt-6 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          3D LOADING — full-screen overlay while downloading model
          Only shows when NOT minimized to background.
          ══════════════════════════════════════════════════════ */}
      {isLoading3D && !isLoadingMinimized && downloadProgress && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-950 px-6">
          {/* Icon */}
          <div className="mb-8 relative flex items-center justify-center">
            <div className="absolute w-28 h-28 rounded-full border border-blue-500/20 animate-ping" />
            <div className="w-24 h-24 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shadow-xl">
              {downloadProgress.phase === 'downloading' ? (
                <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
          </div>

          {/* Title */}
          <h2 className="text-white text-xl font-bold mb-1 text-center">
            {downloadProgress.phase === 'downloading' ? 'Descargando modelo 3D' : 'Procesando modelo'}
          </h2>

          {/* Context message */}
          <p className="text-gray-400 text-sm text-center mb-6 max-w-xs leading-relaxed">
            {downloadProgress.phase === 'downloading'
              ? 'El modelo contiene geometría de alta resolución. La descarga puede tardar varios minutos según la velocidad de la red.'
              : 'Procesando geometría del modelo...'}
          </p>

          {/* Progress bar */}
          {downloadProgress.phase === 'downloading' ? (
            <>
              <div className="w-full max-w-xs mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span className="font-medium text-white text-base">{downloadProgress.percent}%</span>
                  <span>
                    {downloadProgress.totalMB > 0
                      ? `${downloadProgress.loadedMB.toFixed(0)} / ${downloadProgress.totalMB.toFixed(0)} MB`
                      : `${downloadProgress.loadedMB.toFixed(1)} MB`}
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
              </div>
              {/* Speed + ETA */}
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-8">
                {downloadProgress.speedMBs > 0 && (
                  <span>{formatSpeed(downloadProgress.speedMBs)}</span>
                )}
                {isFinite(downloadProgress.etaSeconds) && downloadProgress.etaSeconds > 0 && (
                  <span>Faltan ~{formatETA(downloadProgress.etaSeconds)}</span>
                )}
              </div>
            </>
          ) : (
            <div className="mb-8 flex items-center gap-2 text-gray-400 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-blue-400" />
              <span>Esto puede tardar unos segundos...</span>
            </div>
          )}

          {/* Actions */}
          <div className="w-full max-w-xs flex flex-col gap-3">
            {downloadProgress.phase === 'downloading' && (
              <button
                onClick={() => setIsLoadingMinimized(true)}
                className="w-full py-3 bg-blue-600 text-white rounded-2xl font-semibold text-sm active:bg-blue-700"
              >
                Continuar en segundo plano
              </button>
            )}
            <button
              onClick={cancelDownload}
              className="w-full py-3 bg-gray-800 text-gray-400 rounded-2xl font-medium text-sm active:bg-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          VIEWER FALLBACK — header/footer over the 3-D canvas
          ══════════════════════════════════════════════════════ */}
      {appState === 'viewer-fallback' && (
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <header className="bg-white/95 backdrop-blur-sm shadow-sm px-5 py-3 pointer-events-auto shrink-0">
            <h1 className="text-base font-semibold text-gray-900">{experience.product.name}</h1>
            <p className="text-xs text-gray-400">{experience.product.versionLabel}</p>
          </header>

          {/* Submodel selector */}
          {experience.submodels.length > 0 && (
            <div className="px-3 py-2 pointer-events-auto shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => swapModel(null)}
                  disabled={isSwappingModel}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedSubmodel === null
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white/90 text-gray-700 border border-gray-300 active:bg-gray-100'
                  } disabled:opacity-50`}
                >
                  {experience.product.name}
                </button>
                {experience.submodels.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => swapModel(sub.id)}
                    disabled={isSwappingModel}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedSubmodel === sub.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white/90 text-gray-700 border border-gray-300 active:bg-gray-100'
                    } disabled:opacity-50`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
              {isSwappingModel && (
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                  <span className="text-xs text-gray-500">Cargando variante...</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Gesture hint */}
          <div className="flex justify-center pb-4">
            <div className="bg-black/55 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full">
              Arrastrar para rotar · Pellizcar para zoom
            </div>
          </div>

          <footer className="bg-white/95 backdrop-blur-sm border-t px-5 py-2 pointer-events-auto shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>
                {experience.share.remainingVisits !== null
                  ? `${experience.share.remainingVisits} visitas restantes`
                  : 'Visitas ilimitadas'}
              </span>
              <span>Expira: {new Date(experience.share.expiresAt).toLocaleDateString('es-AR')}</span>
            </div>
          </footer>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          AR STATES — overlays encima de la vista AR.
          Div siempre montado para que WebXR dom-overlay lo referencie.
          pointer-events-none en el wrapper; el tap-catcher hijo tiene
          pointer-events-auto y captura los taps de placement.
          ══════════════════════════════════════════════════════ */}
      <div ref={overlayRef} className="absolute inset-0 z-20 pointer-events-none">
        {isAR && (
          <>

          {/* Tap-catcher: captura taps durante scanning / movimiento.
              Primer hijo → los botones (siblings siguientes) apilan encima. */}
          {(appState === 'ar-scanning' || (appState === 'ar-placed' && isMoving)) && (
            <div
              className="absolute inset-0 pointer-events-auto"
              style={{ touchAction: 'manipulation' }}
              onClick={handleTapToPlace}
            />
          )}

          {/* ── Top gradient bar ── */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent pt-10 pb-10 px-5 pointer-events-auto">
            <div className="flex items-center justify-between">
              {/* Exit */}
              <button
                onClick={exitAR}
                className="w-11 h-11 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-black/75"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Product name */}
              <span className="text-white text-sm font-semibold drop-shadow-md">
                {experience.product.name}
              </span>

              {/* Spacer */}
              <div className="w-11" />
            </div>
          </div>

          {/* ── AR Submodel selector (scanning) ── */}
          {appState === 'ar-scanning' && experience.submodels.length > 0 && (
            <div className="absolute top-24 left-0 right-0 px-3 pointer-events-auto" style={{ zIndex: 5 }}>
              <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
                <button
                  onClick={() => swapModel(null)}
                  disabled={isSwappingModel || !modelReady}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm transition-colors ${
                    selectedSubmodel === null
                      ? 'bg-white text-gray-900 shadow-md'
                      : 'bg-black/40 text-white border border-white/25 active:bg-black/60'
                  } disabled:opacity-50`}
                >
                  {experience.product.name}
                </button>
                {experience.submodels.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => swapModel(sub.id)}
                    disabled={isSwappingModel || !modelReady}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm transition-colors ${
                      selectedSubmodel === sub.id
                        ? 'bg-white text-gray-900 shadow-md'
                        : 'bg-black/40 text-white border border-white/25 active:bg-black/60'
                    } disabled:opacity-50`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
              {isSwappingModel && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span className="text-xs text-white/80">Cargando variante...</span>
                </div>
              )}
            </div>
          )}

          {/* ── SCANNING: animated target + instructions ── */}
          {appState === 'ar-scanning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 px-5">
              {/* Animated target rings */}
              <div className="mb-8 relative flex items-center justify-center w-28 h-28">
                <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping" />
                <div className="w-22 h-22 rounded-full border-2 border-white/50 flex items-center justify-center"
                  style={{ width: '5.5rem', height: '5.5rem' }}>
                  <div className="w-14 h-14 rounded-full border-2 border-white/70 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white shadow-lg" />
                  </div>
                </div>
              </div>

              {/* Model loading indicator */}
              {!modelReady && (
                <div className="bg-blue-600/80 backdrop-blur-sm rounded-full px-4 py-2 mb-3 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span className="text-white text-sm font-medium">Cargando modelo...</span>
                </div>
              )}

              {/* Instruction card */}
              <div className="bg-black/75 backdrop-blur-md rounded-2xl px-5 py-5 text-center max-w-xs w-full">
                <p className="text-white font-semibold text-base mb-2">
                  Busca una superficie plana
                </p>
                <p className="text-white/55 text-sm leading-relaxed">
                  {modelReady
                    ? 'Apunta al piso y mueve el teléfono despacio. Cuando aparezca el círculo verde, toca la pantalla para colocar el modelo.'
                    : 'Apunta al piso y mueve el teléfono despacio mientras se descarga el modelo.'}
                </p>
              </div>
            </div>
          )}

          {/* ── PLACED + MINIMIZED: floating expand button ── */}
          {appState === 'ar-placed' && !isMoving && isSheetMinimized && (
            <div className="absolute bottom-6 right-5 pointer-events-auto">
              <button
                onClick={() => setIsSheetMinimized(false)}
                className="w-14 h-14 bg-white/95 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center active:bg-gray-100 border border-gray-200"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
              </button>
            </div>
          )}

          {/* ── PLACED (not moving, not minimized): bottom-sheet controls ── */}
          {appState === 'ar-placed' && !isMoving && !isSheetMinimized && (
            <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
              <div className="bg-white/95 backdrop-blur-lg rounded-t-3xl shadow-2xl px-5 pt-3 pb-8">
                {/* Drag handle — tap to minimize */}
                <button
                  onClick={() => setIsSheetMinimized(true)}
                  className="w-full flex flex-col items-center py-1 mb-2 group"
                >
                  <div className="w-10 h-1 bg-gray-300 rounded-full group-active:bg-gray-400" />
                  <span className="text-[10px] text-gray-400 mt-1">Toca para minimizar</span>
                </button>

                {/* Title row */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 text-base">Modelo colocado</h3>
                  <button
                    onClick={resetPlacement}
                    className="flex items-center gap-1.5 text-blue-600 text-sm font-semibold active:text-blue-800"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reposicionar
                  </button>
                </div>

                {/* Submodel selector in bottom sheet */}
                {experience.submodels.length > 0 && (
                  <div className="mb-3">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <button
                        onClick={() => swapModel(null)}
                        disabled={isSwappingModel}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          selectedSubmodel === null
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 border border-gray-300 active:bg-gray-200'
                        } disabled:opacity-50`}
                      >
                        {experience.product.name}
                      </button>
                      {experience.submodels.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => swapModel(sub.id)}
                          disabled={isSwappingModel}
                          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                            selectedSubmodel === sub.id
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'bg-gray-100 text-gray-700 border border-gray-300 active:bg-gray-200'
                          } disabled:opacity-50`}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                    {isSwappingModel && (
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                        <span className="text-xs text-gray-500">Cargando variante...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Controls: rotation slider + joystick side by side */}
                <div className="flex gap-4 items-start">

                  {/* Left: Rotation slider */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-600">Rotación</span>
                      <span className="text-sm font-bold text-gray-900">{rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={rotation}
                      onChange={(e) => handleRotationChange(parseInt(e.target.value))}
                      className="w-full h-2.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span>
                    </div>

                    {/* Move button */}
                    <button
                      onClick={() => setIsMoving(true)}
                      className="w-full mt-3 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm shadow-md active:bg-blue-700"
                    >
                      Mover modelo
                    </button>
                  </div>

                  {/* Right: Joystick */}
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-medium text-gray-600 mb-2">Posición</span>
                    <div
                      ref={joystickContainerRef}
                      className="relative rounded-full bg-gray-100 border-2 border-gray-200 select-none"
                      style={{
                        width: JOYSTICK_RADIUS * 2,
                        height: JOYSTICK_RADIUS * 2,
                        touchAction: 'none',
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        const t = e.touches[0]
                        handleJoystickStart(t.clientX, t.clientY)
                      }}
                      onTouchMove={(e) => {
                        e.preventDefault()
                        const t = e.touches[0]
                        handleJoystickMove(t.clientX, t.clientY)
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault()
                        handleJoystickEnd()
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleJoystickStart(e.clientX, e.clientY)
                        const onMove = (ev: MouseEvent) => handleJoystickMove(ev.clientX, ev.clientY)
                        const onUp = () => {
                          handleJoystickEnd()
                          window.removeEventListener('mousemove', onMove)
                          window.removeEventListener('mouseup', onUp)
                        }
                        window.addEventListener('mousemove', onMove)
                        window.addEventListener('mouseup', onUp)
                      }}
                    >
                      {/* Crosshair lines */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="absolute w-full h-px bg-gray-200" />
                        <div className="absolute h-full w-px bg-gray-200" />
                      </div>

                      {/* Direction arrows */}
                      <svg className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-3 text-gray-300 pointer-events-none" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd" />
                      </svg>
                      <svg className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 text-gray-300 pointer-events-none rotate-180" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd" />
                      </svg>
                      <svg className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300 pointer-events-none -rotate-90" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd" />
                      </svg>
                      <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300 pointer-events-none rotate-90" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd" />
                      </svg>

                      {/* Knob */}
                      <div
                        className="absolute rounded-full bg-blue-600 shadow-lg border-2 border-white pointer-events-none"
                        style={{
                          width: KNOB_RADIUS * 2,
                          height: KNOB_RADIUS * 2,
                          left: `calc(50% - ${KNOB_RADIUS}px + ${knobPos.x}px)`,
                          top: `calc(50% - ${KNOB_RADIUS}px + ${knobPos.y}px)`,
                          transition: joystickActiveRef.current ? 'none' : 'all 0.2s ease-out',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PLACED + moving: reposition instructions ── */}
          {appState === 'ar-placed' && isMoving && (
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 px-5">
              <div className="bg-black/75 backdrop-blur-md rounded-2xl px-5 py-5 text-center max-w-xs w-full">
                <p className="text-white font-semibold text-base mb-2">
                  Reposicionando
                </p>
                <p className="text-white/55 text-sm leading-relaxed">
                  Apunta al nuevo lugar y toca la pantalla para confirmar la posición.
                </p>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
