'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getExperience, PublicApiError, type PublicExperience } from '@/lib/api/public'

type AppState = 'loading' | 'ready' | 'error' | 'ar-scanning' | 'ar-placed' | 'viewer-fallback'

export default function ExperiencePage() {
  const params = useParams()
  const token = params.token as string

  const [experience, setExperience] = useState<PublicExperience | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [appState, setAppState] = useState<AppState>('loading')
  const [isARSupported, setIsARSupported] = useState(false)
  const [isIOSDevice, setIsIOSDevice] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // AR editing controls
  const [rotation, setRotation] = useState(0)
  const [isMoving, setIsMoving] = useState(false)

  // Babylon.js refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<import('@babylonjs/core').Engine | null>(null)
  const sceneRef = useRef<import('@babylonjs/core').Scene | null>(null)
  const xrRef = useRef<import('@babylonjs/core/XR').WebXRDefaultExperience | null>(null)
  const modelRef = useRef<import('@babylonjs/core').AbstractMesh | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const reticleRef = useRef<import('@babylonjs/core').Mesh | null>(null)
  const anchorRef = useRef<XRAnchor | null>(null)
  const lastHitPoseRef = useRef<import('@babylonjs/core').Matrix | null>(null)

  // Load experience data
  useEffect(() => {
    async function loadExperience() {
      try {
        const data = await getExperience(token)
        setExperience(data)
        setAppState('ready')
      } catch (err) {
        if (err instanceof PublicApiError) {
          setError({ code: err.code, message: err.message })
        } else {
          setError({ code: 'UNKNOWN_ERROR', message: 'Error al cargar la experiencia' })
        }
        setAppState('error')
      }
    }
    loadExperience()
  }, [token])

  // Detect device capabilities
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOSDevice(isIOS)

    if ('xr' in navigator && !isIOS) {
      const xrNav = navigator as Navigator & { xr: XRSystem }
      xrNav.xr.isSessionSupported('immersive-ar').then((supported) => {
        setIsARSupported(supported)
      }).catch(() => setIsARSupported(false))
    }
  }, [])

  // Initialize 3D viewer (fallback mode)
  const initViewerFallback = useCallback(async () => {
    if (!experience || !canvasRef.current) return

    const canvas = canvasRef.current
    const { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, Color4 } = await import('@babylonjs/core')
    await import('@babylonjs/loaders/glTF')
    const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new Color4(0.95, 0.95, 0.95, 1)

    const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), scene)
    camera.attachControl(canvas, true)
    camera.lowerRadiusLimit = 0.5
    camera.upperRadiusLimit = 100
    camera.wheelDeltaPercentage = 0.01

    new HemisphericLight('light', new Vector3(0, 1, 0), scene).intensity = 1.2

    try {
      setStatusMessage('Cargando modelo 3D...')
      const result = await SceneLoader.ImportMeshAsync('', '', experience.assets.glbUrl, scene)

      if (result.meshes.length > 0) {
        // Frame the model
        let min = new Vector3(Infinity, Infinity, Infinity)
        let max = new Vector3(-Infinity, -Infinity, -Infinity)
        result.meshes.forEach((mesh) => {
          if (mesh.getBoundingInfo) {
            const bi = mesh.getBoundingInfo()
            min = Vector3.Minimize(min, bi.boundingBox.minimumWorld)
            max = Vector3.Maximize(max, bi.boundingBox.maximumWorld)
          }
        })
        const center = min.add(max).scale(0.5)
        const size = max.subtract(min)
        const maxDim = Math.max(size.x, size.y, size.z)
        camera.target = center
        camera.radius = maxDim * 2
      }

      setAppState('viewer-fallback')
      setStatusMessage('')
    } catch (err) {
      console.error('Error loading model:', err)
      setError({ code: 'LOAD_ERROR', message: `Error al cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}` })
      setAppState('error')
      return
    }

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
  }, [experience])

  // Start AR Session with hit-test
  const startARSession = useCallback(async () => {
    if (!experience || !canvasRef.current) return

    const canvas = canvasRef.current

    // Import Babylon modules
    const BABYLON = await import('@babylonjs/core')
    await import('@babylonjs/loaders/glTF')
    const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')
    await import('@babylonjs/core/XR/features/WebXRHitTest')
    await import('@babylonjs/core/XR/features/WebXRAnchorSystem')

    // Create engine and scene
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, xrCompatible: true })
    engineRef.current = engine

    const scene = new BABYLON.Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0) // Transparent for AR

    // Camera (will be replaced by XR camera)
    const camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 1.6, 0), scene)
    camera.attachControl(canvas, true)

    // Lighting for AR
    const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene)
    light.intensity = 1.0

    // Create reticle for placement preview
    const reticle = BABYLON.MeshBuilder.CreateTorus('reticle', {
      diameter: 0.15,
      thickness: 0.02,
      tessellation: 32,
    }, scene)
    const reticleMat = new BABYLON.StandardMaterial('reticleMat', scene)
    reticleMat.diffuseColor = new BABYLON.Color3(0, 0.8, 0.4)
    reticleMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.2)
    reticle.material = reticleMat
    reticle.isVisible = false
    reticleRef.current = reticle

    // Load the 3D model (hidden initially)
    setStatusMessage('Cargando modelo 3D...')

    try {
      const result = await SceneLoader.ImportMeshAsync('', '', experience.assets.glbUrl, scene)

      if (result.meshes.length > 0) {
        const modelRoot = result.meshes[0]
        modelRoot.setEnabled(false) // Hidden until placed

        // Ensure model is at origin and properly scaled (assuming meters)
        modelRoot.position = BABYLON.Vector3.Zero()
        modelRoot.rotationQuaternion = null
        modelRoot.rotation = BABYLON.Vector3.Zero()

        // Scale check - GLB should be in meters for 1:1 AR
        // If model seems too big/small, we can add metadata-based scaling later
        modelRef.current = modelRoot
      }
    } catch (err) {
      console.error('Error loading model for AR:', err)
      setError({ code: 'LOAD_ERROR', message: `Error al cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}` })
      setAppState('error')
      return
    }

    // Initialize WebXR
    try {
      const xr = await BABYLON.WebXRDefaultExperience.CreateAsync(scene, {
        uiOptions: { sessionMode: 'immersive-ar' },
        optionalFeatures: true,
      })
      xrRef.current = xr

      // Enable hit-test feature
      const hitTest = xr.baseExperience.featuresManager.enableFeature(
        BABYLON.WebXRFeatureName.HIT_TEST,
        'latest',
        { entityTypes: ['plane'] }
      ) as import('@babylonjs/core/XR/features/WebXRHitTest').WebXRHitTest

      // Enable anchor feature for stability
      const anchors = xr.baseExperience.featuresManager.enableFeature(
        BABYLON.WebXRFeatureName.ANCHOR_SYSTEM,
        'latest'
      ) as import('@babylonjs/core/XR/features/WebXRAnchorSystem').WebXRAnchorSystem

      // Track hit-test results to update reticle
      hitTest.onHitTestResultObservable.add((results) => {
        if (results.length > 0 && appState === 'ar-scanning') {
          const hit = results[0]
          const hitMatrix = hit.transformationMatrix

          // Update reticle position
          if (reticleRef.current) {
            reticleRef.current.isVisible = true
            hitMatrix.decompose(
              reticleRef.current.scaling,
              reticleRef.current.rotationQuaternion!,
              reticleRef.current.position
            )
            reticleRef.current.scaling.setAll(1)
          }

          // Store for placement
          lastHitPoseRef.current = hitMatrix.clone()
        } else if (reticleRef.current) {
          reticleRef.current.isVisible = false
        }
      })

      // Enter AR session
      await xr.baseExperience.enterXRAsync('immersive-ar', 'unbounded')

      setAppState('ar-scanning')
      setStatusMessage('Mueve el teléfono para detectar el piso')

      // Handle session end
      xr.baseExperience.onStateChangedObservable.add((state) => {
        if (state === BABYLON.WebXRState.NOT_IN_XR) {
          setAppState('ready')
          cleanup()
        }
      })

    } catch (err) {
      console.error('WebXR initialization error:', err)
      setError({ code: 'AR_ERROR', message: 'No se pudo iniciar AR. Usando visor 3D.' })
      initViewerFallback()
    }

    engine.runRenderLoop(() => scene.render())
  }, [experience, appState, initViewerFallback])

  // Place model at current reticle position
  const placeModel = useCallback(async () => {
    if (!modelRef.current || !lastHitPoseRef.current || !sceneRef.current) return

    const BABYLON = await import('@babylonjs/core')
    const model = modelRef.current

    // Decompose hit matrix to get position/rotation
    const position = new BABYLON.Vector3()
    const rotation = new BABYLON.Quaternion()
    const scale = new BABYLON.Vector3()
    lastHitPoseRef.current.decompose(scale, rotation, position)

    // Place model at hit position
    model.position = position.clone()
    model.rotationQuaternion = BABYLON.Quaternion.Identity()
    model.setEnabled(true)

    // Hide reticle
    if (reticleRef.current) {
      reticleRef.current.isVisible = false
    }

    // Note: Anchoring is handled automatically by the WebXR system
    // The model position is set relative to the tracked floor

    setAppState('ar-placed')
    setStatusMessage('')
    setRotation(0)
  }, [])

  // Move model (drag on floor)
  const moveModel = useCallback(async () => {
    if (!modelRef.current || !lastHitPoseRef.current) return

    const BABYLON = await import('@babylonjs/core')
    const position = new BABYLON.Vector3()
    const rotation = new BABYLON.Quaternion()
    const scale = new BABYLON.Vector3()
    lastHitPoseRef.current.decompose(scale, rotation, position)

    // Keep current rotation, update position
    modelRef.current.position.x = position.x
    modelRef.current.position.z = position.z
    // Y stays the same (floor level)
  }, [])

  // Rotate model
  const handleRotationChange = useCallback((newRotation: number) => {
    setRotation(newRotation)
    if (modelRef.current) {
      modelRef.current.rotation.y = (newRotation * Math.PI) / 180
    }
  }, [])

  // Reset placement
  const resetPlacement = useCallback(() => {
    if (modelRef.current) {
      modelRef.current.setEnabled(false)
    }
    if (reticleRef.current) {
      reticleRef.current.isVisible = true
    }
    anchorRef.current = null
    setAppState('ar-scanning')
    setStatusMessage('Mueve el teléfono para detectar el piso')
    setRotation(0)
  }, [])

  // Exit AR
  const exitAR = useCallback(async () => {
    if (xrRef.current) {
      await xrRef.current.baseExperience.exitXRAsync()
    }
    cleanup()
    setAppState('ready')
  }, [])

  // Cleanup
  const cleanup = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.dispose()
      sceneRef.current = null
    }
    if (engineRef.current) {
      engineRef.current.dispose()
      engineRef.current = null
    }
    xrRef.current = null
    modelRef.current = null
    reticleRef.current = null
    anchorRef.current = null
    lastHitPoseRef.current = null
    hitTestSourceRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  // Handle screen tap in AR mode
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleTap = () => {
      if (appState === 'ar-scanning' && lastHitPoseRef.current) {
        placeModel()
      }
    }

    canvas.addEventListener('click', handleTap)
    canvas.addEventListener('touchend', handleTap)

    return () => {
      canvas.removeEventListener('click', handleTap)
      canvas.removeEventListener('touchend', handleTap)
    }
  }, [appState, placeModel])

  // Render error states
  if (appState === 'error' && error) {
    const errorMessages: Record<string, { title: string; description: string; emoji: string }> = {
      SHARE_EXPIRED: { title: 'Enlace expirado', description: 'Este enlace ha expirado.', emoji: '⏰' },
      SHARE_REVOKED: { title: 'Enlace revocado', description: 'Este enlace fue revocado.', emoji: '🚫' },
      SHARE_LIMIT_REACHED: { title: 'Límite alcanzado', description: 'Máximo de visitas alcanzado.', emoji: '📊' },
      NOT_FOUND: { title: 'No encontrado', description: 'El enlace no existe.', emoji: '🔍' },
    }
    const info = errorMessages[error.code] || { title: 'Error', description: error.message, emoji: '❌' }

    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">{info.emoji}</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{info.title}</h1>
          <p className="text-gray-600">{info.description}</p>
        </div>
      </div>
    )
  }

  // Render loading state
  if (appState === 'loading' || !experience) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando experiencia...</p>
        </div>
      </div>
    )
  }

  // Render main experience
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 z-20 relative">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{experience.product.name}</h1>
            <p className="text-sm text-gray-500">{experience.product.versionLabel}</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {appState === 'ready' && (
              <>
                {/* WebXR AR button (Android/Desktop) */}
                {isARSupported && !isIOSDevice && (
                  <button
                    onClick={startARSession}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
                  >
                    <span>Iniciar AR</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                )}

                {/* iOS Quick Look */}
                {isIOSDevice && experience.assets.usdzUrl && (
                  <a
                    href={experience.assets.usdzUrl}
                    rel="ar"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
                  >
                    <span>Ver en AR</span>
                    {experience.assets.thumbUrl && (
                      <img src={experience.assets.thumbUrl} alt="" className="hidden" />
                    )}
                  </a>
                )}

                {/* Fallback viewer button */}
                {(!isARSupported || (isIOSDevice && !experience.assets.usdzUrl)) && (
                  <button
                    onClick={initViewerFallback}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
                  >
                    Ver en 3D
                  </button>
                )}
              </>
            )}

            {/* Exit AR button */}
            {(appState === 'ar-scanning' || appState === 'ar-placed') && (
              <button
                onClick={exitAR}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative">
        {/* Canvas for 3D/AR */}
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ minHeight: 'calc(100vh - 140px)' }}
        />

        {/* Status message overlay */}
        {statusMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg z-10">
            {statusMessage}
          </div>
        )}

        {/* AR Scanning instructions */}
        {appState === 'ar-scanning' && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-center z-10">
            <div className="bg-black/70 text-white px-6 py-3 rounded-lg">
              <p className="text-sm mb-2">Apunta al piso para detectar la superficie</p>
              <p className="text-xs text-gray-300">Toca la pantalla para colocar el modelo</p>
            </div>
          </div>
        )}

        {/* AR Placed controls */}
        {appState === 'ar-placed' && (
          <div className="absolute bottom-4 left-4 right-4 z-10">
            <div className="bg-white rounded-lg shadow-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-700">Modelo colocado</span>
                <button
                  onClick={resetPlacement}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Reposicionar
                </button>
              </div>

              {/* Rotation control */}
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Rotación: {rotation}°
                </label>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={rotation}
                  onChange={(e) => handleRotationChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Move toggle */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setIsMoving(!isMoving)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm ${
                    isMoving
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {isMoving ? 'Mover: ON' : 'Mover: OFF'}
                </button>
                <p className="text-xs text-gray-500">
                  {isMoving ? 'Apunta al piso y toca para mover' : 'Activa para reposicionar'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Viewer fallback controls */}
        {appState === 'viewer-fallback' && (
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-gray-600 z-10">
            <p>🖱️ Arrastrar para rotar • Scroll para zoom</p>
          </div>
        )}

        {/* Ready state - show preview and instructions */}
        {appState === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center p-8">
              {experience.assets.thumbUrl && (
                <img
                  src={experience.assets.thumbUrl}
                  alt={experience.product.name}
                  className="w-64 h-64 object-contain mx-auto mb-6 rounded-lg shadow-lg"
                />
              )}
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {experience.product.name}
              </h2>
              <p className="text-gray-600 mb-6">
                {isARSupported || (isIOSDevice && experience.assets.usdzUrl)
                  ? 'Coloca este modelo a escala real en tu espacio'
                  : 'Visualiza este modelo en 3D'}
              </p>

              {/* Device-specific instructions */}
              {isIOSDevice && !experience.assets.usdzUrl && (
                <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                  AR no disponible en iOS para este modelo. Usa el visor 3D.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer with share info */}
      <footer className="bg-white border-t px-4 py-2 z-20 relative">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {experience.share.remainingVisits !== null
              ? `${experience.share.remainingVisits} visitas restantes`
              : 'Visitas ilimitadas'}
          </span>
          <span>
            Expira: {new Date(experience.share.expiresAt).toLocaleDateString('es-AR')}
          </span>
        </div>
      </footer>
    </div>
  )
}
