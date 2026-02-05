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
  const overlayRef = useRef<HTMLDivElement>(null)

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

    // Load model (hidden until placed)
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
    } catch (err) {
      setError({
        code: 'LOAD_ERROR',
        message: `Error al cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}`,
      })
      setAppState('error')
      return
    }

    // WebXR
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
          // Extract position only — keep reticle rotation fixed (flat)
          const pos = new BABYLON.Vector3()
          const _r = new BABYLON.Quaternion()
          const _s = new BABYLON.Vector3()
          hitMatrix.decompose(_s, _r, pos)

          // Show & position reticle
          if (reticleRef.current) {
            reticleRef.current.isVisible = true
            reticleRef.current.position = pos
          }

          // Always store latest hit for tap-to-place / tap-to-confirm
          lastHitPoseRef.current = hitMatrix.clone()

          // Live-move model while "Mover" is active
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
      initViewerFallback()
    }

    engine.runRenderLoop(() => scene.render())
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

    if (reticleRef.current) reticleRef.current.isVisible = false

    setAppState('ar-placed')
    setRotation(0)
    setIsMoving(false)
  }, [])

  // ── Rotation slider ───────────────────────────────────────
  const handleRotationChange = useCallback((deg: number) => {
    setRotation(deg)
    if (modelRef.current) {
      modelRef.current.rotation.y = (deg * Math.PI) / 180
    }
  }, [])

  // ── Reset → scanning ──────────────────────────────────────
  const resetPlacement = useCallback(() => {
    if (modelRef.current) modelRef.current.setEnabled(false)
    setIsMoving(false)
    setAppState('ar-scanning')
    setRotation(0)
  }, [])

  // ── Exit AR ───────────────────────────────────────────────
  const exitAR = useCallback(async () => {
    if (xrRef.current) {
      try { await xrRef.current.baseExperience.exitXRAsync() } catch {}
    }
    cleanup()
    setAppState('ready')
  }, [cleanup])

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

              {/* Instruction card */}
              <div className="bg-black/75 backdrop-blur-md rounded-2xl px-5 py-5 text-center max-w-xs w-full">
                <p className="text-white font-semibold text-base mb-2">
                  Busca una superficie plana
                </p>
                <p className="text-white/55 text-sm leading-relaxed">
                  Apunta al piso y mueve el teléfono despacio. Cuando aparezca
                  el círculo verde, toca la pantalla para colocar el modelo.
                </p>
              </div>
            </div>
          )}

          {/* ── PLACED (not moving): bottom-sheet controls ── */}
          {appState === 'ar-placed' && !isMoving && (
            <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
              <div className="bg-white/95 backdrop-blur-lg rounded-t-3xl shadow-2xl px-5 pt-3 pb-8">
                {/* Drag handle */}
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

                {/* Title row */}
                <div className="flex items-center justify-between mb-5">
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

                {/* Rotation slider */}
                <div className="mb-5">
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
                  <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                    <span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span>
                  </div>
                </div>

                {/* Move button */}
                <button
                  onClick={() => setIsMoving(true)}
                  className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-semibold text-base shadow-md active:bg-blue-700"
                >
                  Mover modelo
                </button>
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
