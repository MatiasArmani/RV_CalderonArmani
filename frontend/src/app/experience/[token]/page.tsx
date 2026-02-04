'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getExperience, PublicApiError, type PublicExperience } from '@/lib/api/public'

type ViewerState = 'loading' | 'ready' | 'error'

export default function ExperiencePage() {
  const params = useParams()
  const token = params.token as string

  const [experience, setExperience] = useState<PublicExperience | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [viewerState, setViewerState] = useState<ViewerState>('loading')
  const [isARSupported, setIsARSupported] = useState(false)
  const [isIOSDevice, setIsIOSDevice] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<import('@babylonjs/core').Engine | null>(null)
  const sceneRef = useRef<import('@babylonjs/core').Scene | null>(null)

  // Load experience data
  useEffect(() => {
    async function loadExperience() {
      try {
        const data = await getExperience(token)
        setExperience(data)
      } catch (err) {
        if (err instanceof PublicApiError) {
          setError({ code: err.code, message: err.message })
        } else {
          setError({ code: 'UNKNOWN_ERROR', message: 'Error al cargar la experiencia' })
        }
        setViewerState('error')
      }
    }

    loadExperience()
  }, [token])

  // Detect device capabilities
  useEffect(() => {
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOSDevice(isIOS)

    // Check WebXR support for AR
    if ('xr' in navigator) {
      (navigator as Navigator & { xr: { isSessionSupported: (type: string) => Promise<boolean> } }).xr
        .isSessionSupported('immersive-ar')
        .then((supported) => setIsARSupported(supported))
        .catch(() => setIsARSupported(false))
    }
  }, [])

  // Initialize Babylon.js scene
  useEffect(() => {
    if (!experience || !canvasRef.current) return

    let disposed = false

    async function initScene() {
      const canvas = canvasRef.current!

      // Dynamic import of Babylon.js (reduces initial bundle)
      const { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3 } = await import('@babylonjs/core')
      await import('@babylonjs/loaders/glTF')
      const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader')

      if (disposed) return

      // Create engine and scene
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      })
      engineRef.current = engine

      const scene = new Scene(engine)
      sceneRef.current = scene
      scene.clearColor = new (await import('@babylonjs/core')).Color4(0.95, 0.95, 0.95, 1)

      // Create camera
      const camera = new ArcRotateCamera(
        'camera',
        Math.PI / 2,
        Math.PI / 3,
        10,
        Vector3.Zero(),
        scene
      )
      camera.attachControl(canvas, true)
      camera.lowerRadiusLimit = 1
      camera.upperRadiusLimit = 50
      camera.wheelDeltaPercentage = 0.01
      camera.pinchDeltaPercentage = 0.01

      // Create lighting
      const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
      light.intensity = 1.2

      // Load the GLB model
      try {
        const result = await SceneLoader.ImportMeshAsync(
          '',
          '',
          experience!.assets.glbUrl,
          scene
        )

        if (disposed) {
          scene.dispose()
          engine.dispose()
          return
        }

        // Auto-frame the model
        if (result.meshes.length > 0) {
          scene.createDefaultCameraOrLight(true, true, true)

          // Get bounding info for all meshes
          let min = new Vector3(Infinity, Infinity, Infinity)
          let max = new Vector3(-Infinity, -Infinity, -Infinity)

          result.meshes.forEach((mesh) => {
            if (mesh.getBoundingInfo) {
              const boundingInfo = mesh.getBoundingInfo()
              min = Vector3.Minimize(min, boundingInfo.boundingBox.minimumWorld)
              max = Vector3.Maximize(max, boundingInfo.boundingBox.maximumWorld)
            }
          })

          const center = min.add(max).scale(0.5)
          const size = max.subtract(min)
          const maxDimension = Math.max(size.x, size.y, size.z)

          // Re-setup camera to frame the model
          camera.target = center
          camera.radius = maxDimension * 2
          camera.alpha = Math.PI / 2
          camera.beta = Math.PI / 3
        }

        setViewerState('ready')
      } catch (loadError) {
        console.error('Error loading GLB:', loadError)
        setViewerState('error')
        setError({ code: 'LOAD_ERROR', message: 'Error al cargar el modelo 3D' })
        return
      }

      // Render loop
      engine.runRenderLoop(() => {
        scene.render()
      })

      // Handle resize
      const handleResize = () => engine.resize()
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }

    initScene()

    return () => {
      disposed = true
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
      if (engineRef.current) {
        engineRef.current.dispose()
        engineRef.current = null
      }
    }
  }, [experience])

  // Handle WebXR AR session
  async function startARSession() {
    if (!sceneRef.current || !engineRef.current) return

    try {
      const { WebXRDefaultExperience } = await import('@babylonjs/core/XR')
      const xr = await WebXRDefaultExperience.CreateAsync(sceneRef.current, {
        uiOptions: {
          sessionMode: 'immersive-ar',
        },
        optionalFeatures: true,
      })

      await xr.baseExperience.enterXRAsync('immersive-ar', 'unbounded')
    } catch (err) {
      console.error('AR session error:', err)
      setError({ code: 'AR_ERROR', message: 'No se pudo iniciar la experiencia AR' })
    }
  }

  // Render error states
  if (error) {
    const errorMessages: Record<string, { title: string; description: string }> = {
      SHARE_EXPIRED: {
        title: 'Enlace expirado',
        description: 'Este enlace ha expirado y ya no está disponible.',
      },
      SHARE_REVOKED: {
        title: 'Enlace revocado',
        description: 'Este enlace fue revocado por el propietario.',
      },
      SHARE_LIMIT_REACHED: {
        title: 'Límite alcanzado',
        description: 'Se alcanzó el número máximo de visitas para este enlace.',
      },
      NOT_FOUND: {
        title: 'No encontrado',
        description: 'El enlace no existe o no es válido.',
      },
    }

    const errorInfo = errorMessages[error.code] || {
      title: 'Error',
      description: error.message,
    }

    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">
            {error.code === 'SHARE_EXPIRED' ? '⏰' : error.code === 'SHARE_REVOKED' ? '🚫' : '❌'}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{errorInfo.title}</h1>
          <p className="text-gray-600">{errorInfo.description}</p>
        </div>
      </div>
    )
  }

  // Render loading state
  if (!experience) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando experiencia...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {experience.product.name}
            </h1>
            <p className="text-sm text-gray-500">{experience.product.versionLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* WebXR AR button for Android/Desktop */}
            {isARSupported && !isIOSDevice && (
              <button
                onClick={startARSession}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <span>Ver en AR</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}

            {/* iOS Quick Look button */}
            {isIOSDevice && experience.assets.usdzUrl && (
              <a
                href={experience.assets.usdzUrl}
                rel="ar"
                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <span>Ver en AR</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {/* Hidden image required for iOS AR Quick Look */}
                {experience.assets.thumbUrl && (
                  <img src={experience.assets.thumbUrl} alt="" style={{ display: 'none' }} />
                )}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* 3D Viewer */}
      <main className="flex-1 relative">
        {viewerState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
              <p className="text-gray-600">Cargando modelo 3D...</p>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ minHeight: 'calc(100vh - 120px)' }}
        />

        {/* Controls hint */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-gray-600">
          <p>🖱️ Arrastrar para rotar • Scroll para zoom</p>
        </div>
      </main>

      {/* Footer with share info */}
      <footer className="bg-white border-t px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-gray-500">
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
