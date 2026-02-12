'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getExperience, startVisit, endVisit, PublicApiError, type PublicExperience } from '@/lib/api/public'

type AppState = 'loading' | 'ready' | 'error' | 'ar-scanning' | 'ar-placed' | 'viewer-fallback'

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

  // ── 3-D viewer fallback (orbit, no AR) ────────────────────
  const initViewerFallback = useCallback(async () => {
    if (!experience || !canvasRef.current) return
    const canvas = canvasRef.current

    const { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, Color4 } =
      await import('@babylonjs/core')
    await import('@babylonjs/loaders/glTF')
    const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new Color4(0.95, 0.95, 0.95, 1)

    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), scene)
    camera.attachControl(canvas, true)
    camera.lowerRadiusLimit = 0.5
    camera.upperRadiusLimit = 100
    camera.wheelDeltaPercentage = 0.01

    new HemisphericLight('light', new Vector3(0, 1, 0), scene).intensity = 1.2

    try {
      const { meshes } = await SceneLoader.ImportMeshAsync('', '', experience.assets.glbUrl, scene)
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
        camera.target = min.add(max).scale(0.5)
        camera.radius = Math.max(...[max.x - min.x, max.y - min.y, max.z - min.z]) * 2
      }
      setAppState('viewer-fallback')
    } catch (err) {
      setError({
        code: 'LOAD_ERROR',
        message: `Error al cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}`,
      })
      setAppState('error')
    }

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
  }, [experience])

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
    try {
      const xr = await BABYLON.WebXRDefaultExperience.CreateAsync(scene, {
        disableDefaultUI: true,
        uiOptions: { sessionMode: 'immersive-ar' },
        optionalFeatures: true,
      })
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

      // Enter AR
      await xr.baseExperience.enterXRAsync('immersive-ar', 'unbounded')
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
    // The user scans for surfaces while the model downloads.
    try {
      const { meshes } = await SceneLoader.ImportMeshAsync('', '', experience.assets.glbUrl, scene)
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
  }, [experience, cleanup, initViewerFallback])

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
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold text-base shadow-md active:bg-blue-700"
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

              {/* 3-D viewer (always available as secondary) */}
              <button
                onClick={initViewerFallback}
                className="w-full py-3.5 bg-white border border-gray-300 text-gray-700 rounded-2xl font-medium text-base active:bg-gray-50"
              >
                Ver en 3D
              </button>
            </div>
          </main>

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
          VIEWER FALLBACK — header/footer over the 3-D canvas
          ══════════════════════════════════════════════════════ */}
      {appState === 'viewer-fallback' && (
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <header className="bg-white/95 backdrop-blur-sm shadow-sm px-5 py-3 pointer-events-auto shrink-0">
            <h1 className="text-base font-semibold text-gray-900">{experience.product.name}</h1>
            <p className="text-xs text-gray-400">{experience.product.versionLabel}</p>
          </header>

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
