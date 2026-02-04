import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#030712' }}>
      {/* ─── Hero ─── */}
      <div className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Background: grid + gradient blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(51,65,85,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(51,65,85,0.3) 1px, transparent 1px)',
              backgroundSize: '72px 72px',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: '-180px',
              right: '-120px',
              width: '720px',
              height: '720px',
              background: '#0284c7',
              opacity: 0.14,
              filter: 'blur(120px)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              bottom: '-80px',
              left: '-60px',
              width: '480px',
              height: '480px',
              background: '#0369a1',
              opacity: 0.09,
              filter: 'blur(100px)',
            }}
          />
        </div>

        {/* Nav */}
        <header className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-6 max-w-6xl mx-auto w-full">
          <span className="text-xl font-bold text-white tracking-tight">
            Equip<span className="text-primary-400">AR</span>
          </span>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors"
            >
              Registrarse
            </Link>
          </nav>
        </header>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pb-20">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
            style={{
              border: '1px solid rgba(12,74,110,0.5)',
              backgroundColor: 'rgba(8,47,73,0.5)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: '#38bdf8' }}
            />
            <span className="text-xs font-semibold text-primary-300 uppercase tracking-widest">
              Plataforma Industrial 3D & AR
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight max-w-4xl"
            style={{ lineHeight: 1.1 }}
          >
            Tus equipos industriales,
            <br className="hidden sm:block" />
            <span className="text-primary-400">en otra dimensión.</span>
          </h1>

          {/* Description */}
          <p className="mt-6 sm:mt-8 text-base sm:text-lg text-gray-400 max-w-2xl leading-relaxed">
            Gestiona modelos 3D, crea experiencias de realidad aumentada y
            comparte con tu equipo. Una plataforma unificada pensada para la
            industria.
          </p>

          {/* CTAs */}
          <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row gap-4 items-center">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 px-7 py-3.5 text-base font-semibold text-white bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl hover:from-primary-500 hover:to-primary-600 transition-all active:scale-95"
              style={{ boxShadow: '0 4px 28px rgba(2,132,199,0.3)' }}
            >
              Comenzar gratis
              <svg
                className="w-4 h-4 transition-transform group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center px-7 py-3.5 text-base font-medium text-gray-300 border border-gray-700 rounded-xl hover:border-gray-500 hover:text-white transition-all"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>

        {/* Bottom fade into features */}
        <div
          className="absolute bottom-0 inset-x-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #030712, transparent)' }}
        />
      </div>

      {/* ─── Features ─── */}
      <section className="relative py-24 px-6" style={{ backgroundColor: '#030712' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Construida para la industria
            </h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto text-lg">
              Todas las herramientas que necesitas para llevar tu catálogo
              industrial al siguiente nivel.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Security */}
            <div
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(17,24,39,0.7)',
                border: '1px solid rgba(51,65,85,0.5)',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                style={{
                  background: 'rgba(8,47,73,0.5)',
                  border: '1px solid rgba(12,74,110,0.4)',
                }}
              >
                <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L4 6v5c0 5.5 3.8 10.3 8 11.5 4.2-1.2 8-6 8-11.5V6l-8-4z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Seguridad Multi-tenant</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Aislamiento completo de datos por empresa. Cada organización
                opera en un entorno independiente y protegido.
              </p>
            </div>

            {/* Projects */}
            <div
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(17,24,39,0.7)',
                border: '1px solid rgba(51,65,85,0.5)',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                style={{
                  background: 'rgba(8,47,73,0.5)',
                  border: '1px solid rgba(12,74,110,0.4)',
                }}
              >
                <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3L2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Proyectos & Versiones</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Estructura jerárquica completa: Proyectos → Productos →
                Versiones. Control granular del ciclo de vida de cada modelo.
              </p>
            </div>

            {/* 3D / AR */}
            <div
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(17,24,39,0.7)',
                border: '1px solid rgba(51,65,85,0.5)',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                style={{
                  background: 'rgba(8,47,73,0.5)',
                  border: '1px solid rgba(12,74,110,0.4)',
                }}
              >
                <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v18M4 7.5l8 4.5 8-4.5" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Viewer 3D & AR</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Visualización en tiempo real de modelos GLB. Experiencias de
                realidad aumentada directamente desde cualquier dispositivo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24 px-6" style={{ backgroundColor: '#030712' }}>
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl p-10 sm:p-16 text-center"
            style={{
              background: 'rgba(17,24,39,0.6)',
              border: '1px solid rgba(51,65,85,0.5)',
            }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              ¿Listo para ver tus equipos
              <br />
              <span className="text-primary-400">en otra dimensión?</span>
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              Registra tu empresa y comienza a aprovechar la visualización
              3D y AR industrial. Sin tarjeta de crédito.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 px-7 py-3.5 text-base font-semibold text-white bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl hover:from-primary-500 hover:to-primary-600 transition-all active:scale-95"
                style={{ boxShadow: '0 4px 28px rgba(2,132,199,0.3)' }}
              >
                Crear cuenta gratis
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center px-7 py-3.5 text-base font-medium text-gray-400 border border-gray-700 rounded-xl hover:border-gray-500 hover:text-white transition-all"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="py-8 px-6"
        style={{ backgroundColor: '#030712', borderTop: '1px solid rgba(51,65,85,0.4)' }}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold text-white tracking-tight">
            Equip<span className="text-primary-400">AR</span>
          </span>
          <p className="text-sm text-gray-600">
            © 2026 EquipAR. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
