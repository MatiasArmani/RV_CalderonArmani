~~~md
# Fase 2 — Completo
Extiende el MVP manteniendo **KISS/YAGNI** y sin introducir arquitectura innecesaria.

---

## Objetivo Fase 2
1) Submodelos / Variantes (por Version)  
2) Analíticas avanzadas (dashboard + filtros)  
3) Hardening (seguridad + validaciones + performance UX)  
4) Mejoras de experiencia (usabilidad, estabilidad mobile)  

---

## Etapa 7 — Submodelos / Variantes

### Implementación
- Nueva entidad `Submodel`:
  - pertenece a `Version`
  - permite representar variantes (color, configuración) o componentes
- Relación con assets:
  - opción A (simple): Asset opcionalmente se asocia a `submodelId`
  - opción B (más compleja): overrides sobre asset base (evitar en Fase 2 si no es necesario)

### Entregables
- Admin puede crear/editar/eliminar submodelos
- Viewer muestra selector (dropdown/cards)
- Cambiar submodelo actualiza el asset cargado de forma estable

### Unit tests esenciales
- Submodel CRUD (tenant enforced)
- No permite crear Submodel en Version de otro tenant
- Public experience devuelve submodelos disponibles (si se habilita públicamente)

### QA Checklist
- Selector claro y sin confusión
- Swap de modelo no rompe viewer (fallback si falla carga)
- Estado de carga visible

### Implementación Completada ✅

- Tabla `Submodel` en Prisma schema con relación a `Version`
- API REST completa (GET, POST, PATCH, DELETE) en `/api/versions/:versionId/submodels` y `/api/submodels/:id`
- Upload de assets por submodelo (mismo flujo que Version, opcionalmente asociados a `submodelId`)
- Frontend admin: CRUD completo en panel de versión
- Public viewer: Selector horizontal de variantes con swap en vivo sin perder estado AR
- Preservación de posición y rotación al cambiar submodelo en AR
- Funciona en AR (WebXR) y Viewer-fallback (Babylon orbit)
- Re-fit automático de cámara en viewer al cambiar modelo
- Loading states durante swap de modelo

---

## Etapa 8 — Analíticas avanzadas (Dashboard)

### Implementación
- Dashboard por tenant:
  - visits por día
  - top products/versions
  - duración promedio
  - tasa AR (usedAR)
  - breakdown básico por device (mobile vs desktop)
- Filtros por rango de fechas
- Export CSV: solo si aporta valor real (YAGNI)

### Entregables
- Pantalla analytics usable en admin
- Endpoints agregados en `/api/analytics/*` (definirlos en `api-spec.md`)

### Unit tests esenciales
- Queries agregadas:
  - filtran por companyId
  - respetan rango de fechas
- Autorización:
  - sólo ADMIN (o rol habilitado)
- No leakage cross-tenant

### QA Checklist
- Performance OK con índices
- Resultados consistentes con tabla Visit

### Implementación Completada ✅

- Dashboard analytics en `/analytics` con interfaz completa
- Filtros de fecha con presets (7 días, 30 días, 90 días) y rango personalizado (date pickers)
- KPI Cards:
  - Total visitas
  - Links activos (shares con visitas)
  - Duración promedio (formato m:s)
  - Tasa AR (porcentaje de visitas que usaron AR)
- Gráfico de barras SVG mostrando visitas por día
- Device breakdown: Mobile vs Desktop con porcentaje y barras visuales
- Top productos: Lista ordenada por visitCount con barras de progreso
- Backend endpoint `GET /api/analytics/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Agregaciones SQL eficientes con filtrado por `companyId`
- Link a `/visits` para ver detalle completo de visitas

---

## Etapa 9 — Hardening de seguridad y calidad

### Implementación
- Seguridad:
  - headers (helmet)
  - CORS restrictivo
  - rate limit afinado en endpoints críticos (auth, shares, public)
  - validación estricta de payloads
  - opcional: anti-bot si hay abuso real
- Calidad:
  - estandarizar errores y códigos
  - auditoría mínima (opcional): log de acciones ADMIN

### Entregables
- Sistema más resistente a abuso
- Contratos API más estrictos y consistentes

### Unit tests esenciales
- Rate limiting activa en endpoints definidos
- Validación payload:
  - rechaza campos extra si se define strict mode
- Seguridad:
  - endpoints privados requieren auth siempre
  - public experience no expone datos internos

### QA Checklist
- No regresa funcionalidad MVP
- Errores se muestran correctamente en frontend
- No rompe AR / viewer

---

## Etapa 10 — Performance UX (Viewer y assets)

### Implementación
- Mejoras viewer:
  - optimizaciones Babylon (settings, lower post-processing)
  - manejo de dispositivos de baja gama (fallback quality)
- Límites y feedback:
  - tamaño máximo de asset
  - warnings si excede thresholds
- Si USDZ no entró en MVP:
  - incorporarlo aquí con el mínimo de complejidad posible

### Entregables
- Experiencia más fluida en mobile
- Feedback al usuario cuando el modelo es demasiado pesado

### Unit tests esenciales
- (Backend) límites de tamaño aplican consistentemente
- (Frontend) fallback quality no rompe render

### QA Checklist
- Tiempo de carga razonable
- Sin crashes en mobile
- UI de carga/error clara

---

## Criterios de aceptación Full
- Submodelos funcionales y estables
- Dashboard analytics completo para decisiones
- Seguridad reforzada sin fricción excesiva
- Viewer más estable y rápido
- Documentación actualizada (API/Datos/Flujos) por cada cambio

---

## Estado de Implementación Fase 2

✅ **Etapa 7** - Submodelos/Variantes (COMPLETADA)
✅ **Etapa 8** - Analytics Dashboard (COMPLETADA)
🔄 **Etapa 9** - Hardening de Seguridad (EN PROGRESO)
  - Rate limiting implementado en todos los endpoints
  - CORS restrictivo configurado
  - Helmet headers aplicados
  - Validaciones de payload estrictas
  - Pendiente: Auditoría completa de logs

✅ **Etapa 10** - Performance UX (COMPLETADA)
  - Conversión GLB→USDZ server-side implementada y funcional
  - Viewer 3D con cámara adaptativa al tamaño real del modelo
  - Caché IndexedDB para GLB (7 días TTL)
  - Descarga con progreso en tiempo real (XHR + velocidad + ETA)
  - iOS Quick Look AR completamente funcional
  - Bug fixes críticos de estabilidad

---

## Mejoras Adicionales Implementadas (No Planificadas)

Durante el desarrollo se implementaron features adicionales para mejorar la experiencia AR:

✅ **Joystick de movimiento en AR**
  - Velocidad: 0.8 m/s a máximo desplazamiento
  - Control táctil y mouse
  - Loop requestAnimationFrame para movimiento suave
  - Restricción a plano XZ (altura fija)

✅ **Control de rotación con slider**
  - Rango: 0-360°
  - Actualización en tiempo real del modelo
  - Indicador visual del ángulo actual

✅ **Bottom sheet minimizable en AR**
  - Drag handle para minimizar/expandir
  - Floating button cuando está minimizado
  - Animaciones suaves slide-up/slide-down

✅ **Swap de submodelos preservando estado AR**
  - Mantiene posición (x, y, z) al cambiar modelo
  - Mantiene rotación (y-axis)
  - Loading state durante descarga
  - Fallback silencioso en caso de error

✅ **Loading states mejorados en AR**
  - Modelo descarga en background mientras usuario escanea
  - Instrucciones contextuales adaptativas
  - Feedback visual durante procesamiento
  - Timeout handling robusto

---

## Sesión 2025-02 — iOS AR + Estabilidad (Cambios Completados)

### iOS Quick Look AR (Apple) ✅

**Problema raíz:** iOS Safari no soporta WebXR. La librería model-viewer convierte GLB→USDZ vía WebAssembly en el cliente, pero genera `blob:` URLs sin extensión `.usdz`. iOS 17+ Safari interpreta ese click como navegación → la página se recargaba.

**Solución implementada:**

1. **Conversión server-side GLB→USDZ** (`backend/src/modules/assets/usdz-converter.ts`):
   - Three.js `GLTFLoader` + `USDZExporter` corriendo en Node.js 20
   - Polyfills DOM completos: `document.createElement`, `Blob` (con captura de buffer), `URL.createObjectURL` (retorna data URI para node-canvas), `URL.revokeObjectURL`, `canvas.toBlob` (via `canvas.toBuffer()`)
   - `maxTextureSize: 2048` para limitar tamaño del USDZ resultante
   - Fuerza `material.side = FrontSide` en todos los materiales (USDZ no soporta DoubleSide)
   - Patrón **fire-and-forget**: se ejecuta DESPUÉS de que el GLB está marcado `READY`, sin bloquear el HTTP response
   - En caso de fallo, el GLB sigue disponible (best-effort)

2. **Asset kind `USDZ`** ya existente en Prisma schema — ahora completamente funcional:
   - Stored en S3: `{companyId}/versions/{versionId}/usdz/model_{assetId}.usdz`
   - Content-Type: `model/vnd.usdz+zip`
   - Presigned URL con `Content-Disposition: inline; filename="model.usdz"` (ayuda a Quick Look a identificar el archivo)

3. **Frontend model-viewer** (`frontend/src/app/experience/[token]/page.tsx`):
   - Atributo `ios-src={usdzUrl}` → Quick Look usa la URL real de S3, no un blob
   - `reveal="manual"` → GLB carga e inicia USDZ convert inmediatamente, pero canvas 3D NO se renderiza (no cubre el botón)
   - `slot="ar-button"` transparente sobre el botón visual — el tap del usuario llega directamente al anchor `<a rel="ar">` interno de model-viewer
   - `mvReady` state: botón muestra "Preparando..." con spinner hasta que model-viewer dispara `load`, luego "Iniciar AR"
   - Poster 1×1 GIF transparente + `--poster-color: transparent` para que no se vea nada del canvas

### Bug Fixes Críticos ✅

**Bug 1 — "Ver en 3D" sin feedback visual:**
- Causa: `initViewerFallback()` era async pero no mostraba ningún indicador de carga
- Fix: El botón se deshabilita y muestra spinner inmediatamente al hacer click

**Bug 2 — AR fallback a 3D causaba engine conflict:**
- Causa: Al fallar WebXR, `initViewerFallback()` se llamaba sin limpiar el engine de AR. El engine de AR seguía activo en el canvas con su render loop, y crear un segundo Babylon engine fallaba silenciosamente
- Fix: `initViewerFallback()` llama `cleanup()` al inicio, descartando el engine anterior antes de crear el nuevo

**Bug 3 — "Iniciar AR" se quedaba cargando indefinidamente:**
- Causa: `WebXRDefaultExperience.CreateAsync()` y `enterXRAsync()` podían quedar en estado indefinido (sin resolve ni reject) en dispositivos sin HTTPS o sin soporte real de WebXR
- Fix: Se agregó `withTimeout()` de 20s para `CreateAsync` y 15s para `enterXRAsync`. Si el timeout se supera, cae al catch y llama `initViewerFallback()`

### Mejoras al Viewer 3D ✅

**Problema raíz:** Modelos industriales se exportan desde CAD (SolidWorks, Fusion) en centímetros o milímetros. Los valores fijos de cámara eran completamente desproporcionados.

**Solución:** Todos los parámetros de cámara se calculan en función de `modelSize` (dimensión máxima del bounding box):

| Parámetro | Antes | Ahora |
|-----------|-------|-------|
| `upperRadiusLimit` | 100 (fijo) | `modelSize × 15` |
| `lowerRadiusLimit` | (no definido) | `modelSize × 0.05` |
| `panningSensibility` | 1000 (default) | `max(1, 1200 / modelSize)` |
| `wheelDeltaPercentage` | 0.01 | `0.08` |
| `pinchDeltaPercentage` | (no definido) | `0.08` |
| `camera.inertia` | 0.9 (default) | `0.75` |

### Caché IndexedDB para GLB ✅

**Implementación:**
- Base de datos: `rv-glb-cache`, object store `glbs`, keyPath `token`
- TTL: 7 días (604800 segundos)
- Primera carga: descarga con progreso (XHR) → guarda blob en IndexedDB
- Cargas siguientes: detecta blob en caché → salta directamente a "parseando modelo"
- Fallo silencioso: si IndexedDB no está disponible (modo incógnito, etc.), descarga normal

**Descarga con progreso real:**
- XHR en lugar de fetch para acceso a `onprogress`
- Muestra: porcentaje, MB descargados/totales, velocidad (MB/s), ETA
- Botón "Continuar en segundo plano" → minimiza a banner en footer
- Botón "Cancelar" → abort del XHR + revoke de blob URL
```