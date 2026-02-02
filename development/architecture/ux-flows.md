# UX Flows & Screens Specification

**Contrato de experiencia de usuario (Frontend).**
Define pantallas, flujos, estados UI, permisos y endpoints consumidos por cada pantalla.

---

## Principios UX (obligatorios)
- **Feedback inmediato**: Toda acción muestra loading → success/error.
- **Estados explícitos**: empty, loading, error, success en TODAS las pantallas con data.
- **Mensajes útiles**: Errores claros y accionables (no "algo salió mal").
- **Mobile-first**: AR es mobile, el admin debe ser responsive.
- **Consistencia**: Patrones de UI reutilizables (botones, modals, loaders).

---

## 1) Mapa de Pantallas

### Admin (Privado - Requiere Auth)
```
/login                                # Auth: Login
/register                             # Auth: Register Company
/
  ├─ /dashboard                       # [ADMIN/USER] Overview + quick actions
  ├─ /projects                        # [ADMIN/USER] Lista Projects
  │   ├─ /projects/new                # [ADMIN/USER] Crear Project
  │   ├─ /projects/:id                # [ADMIN/USER] Detalle + editar Project
  │   └─ /projects/:id/products       # [ADMIN/USER] Lista Products del Project
  │       ├─ /products/new            # [ADMIN/USER] Crear Product
  │       ├─ /products/:id            # [ADMIN/USER] Detalle + editar Product
  │       └─ /products/:id/versions   # [ADMIN/USER] Lista Versions del Product
  │           ├─ /versions/new        # [ADMIN/USER] Crear Version
  │           ├─ /versions/:id        # [ADMIN/USER] Detalle + editar Version
  │           ├─ /versions/:id/assets # [ADMIN/USER] Upload + ver Assets
  │           └─ /versions/:id/shares # [ADMIN/USER] Gestionar Shares
  ├─ /shares                          # [ADMIN] Lista global de Shares
  ├─ /analytics                       # [ADMIN] Dashboard analíticas (Fase 2)
  └─ /settings                        # [ADMIN] Configuración (usuarios, company) (Fase 2)
```

### Public (Sin Auth)
```
/experience/:token                    # Viewer 3D + AR público
```

---

## 2) Flujos por Pantalla (MVP)

### 2.1 Auth: Login (`/login`)

**Permisos**: Público (sin auth)
**Objetivo**: Autenticar usuario existente.

**Estados UI**:
- Idle: form vacío
- Loading: "Iniciando sesión..."
- Success: redirect a `/dashboard`
- Error: mensaje bajo el form (ej: "Email o contraseña incorrectos")

**Flujo**:
1. Usuario ingresa email + password
2. Click "Iniciar sesión"
3. Frontend valida campos (no vacíos, email válido)
4. `POST /api/auth/login` con `{ email, password }`
5. Si success (200):
   - Guarda `accessToken` en memoria (state/context)
   - Guarda `refreshToken` en httpOnly cookie (o localStorage según decisión final)
   - Redirect a `/dashboard`
6. Si error (401/400):
   - Muestra mensaje: "Email o contraseña incorrectos"
   - Permite reintento

**Endpoints**:
- `POST /api/auth/login`

**Componentes clave**:
- `LoginForm`: email, password, submit
- `ErrorAlert`: muestra errores
- `LoadingButton`: botón con spinner

---

### 2.2 Auth: Register (`/register`)

**Permisos**: Público (sin auth)
**Objetivo**: Crear nueva Company + User ADMIN.

**Estados UI**:
- Idle: form vacío
- Loading: "Creando cuenta..."
- Success: redirect a `/dashboard`
- Error: mensaje específico (ej: "Email ya registrado", "Contraseña muy corta")

**Flujo**:
1. Usuario ingresa:
   - Nombre de empresa (companyName)
   - Email
   - Contraseña (mínimo 8 caracteres, recomendado: validación strength)
   - Confirmar contraseña
2. Frontend valida:
   - campos no vacíos
   - email válido
   - contraseñas coinciden
   - contraseña >= 8 caracteres
3. Click "Registrar"
4. `POST /api/auth/register` con `{ companyName, email, password }`
5. Si success (201):
   - Guarda tokens (igual que login)
   - Redirect a `/dashboard`
6. Si error (400/409):
   - Muestra mensaje específico
   - Permite corrección

**Endpoints**:
- `POST /api/auth/register`

**Componentes clave**:
- `RegisterForm`: companyName, email, password, confirmPassword, submit
- `PasswordStrengthIndicator` (opcional MVP)
- `ErrorAlert`
- `LoadingButton`

---

### 2.3 Dashboard (`/dashboard`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Vista general rápida + acceso a secciones.

**Estados UI**:
- Loading: skeleton cards
- Success: stats + quick actions
- Empty: "No hay proyectos aún. Crea tu primer proyecto."
- Error: mensaje + botón retry

**Flujo**:
1. Usuario autenticado accede
2. Frontend solicita:
   - `GET /api/projects` (lista resumida)
   - `GET /api/shares?limit=5` (últimos shares) - opcional MVP
3. Muestra:
   - Conteo de Projects/Products/Versions
   - Botón "Crear Proyecto"
   - Lista últimos shares activos (opcional)
4. Click "Crear Proyecto" → redirect a `/projects/new`

**Endpoints**:
- `GET /api/projects`
- `GET /api/shares?limit=5` (opcional MVP)

**Componentes clave**:
- `StatCard`: muestra conteo + ícono
- `QuickActions`: botones principales
- `RecentSharesList` (opcional MVP)

---

### 2.4 Projects: List (`/projects`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Ver todos los Projects del tenant.

**Estados UI**:
- Loading: skeleton list
- Empty: "No hay proyectos. Crea el primero."
- Success: lista de cards/tabla
- Error: mensaje + retry

**Flujo**:
1. `GET /api/projects`
2. Muestra lista:
   - Nombre
   - Descripción (truncada)
   - Fecha creación
   - Botón "Ver" → `/projects/:id`
3. Botón "Nuevo Proyecto" → `/projects/new`

**Endpoints**:
- `GET /api/projects`

**Componentes clave**:
- `ProjectCard`: thumbnail + info + actions
- `EmptyState`: ilustración + CTA
- `LoadingList`: skeleton

---

### 2.5 Projects: Create (`/projects/new`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Crear nuevo Project.

**Estados UI**:
- Idle: form vacío
- Loading: "Creando proyecto..."
- Success: redirect a `/projects/:id`
- Error: mensaje específico

**Flujo**:
1. Usuario ingresa:
   - Nombre (requerido)
   - Descripción (opcional)
2. Click "Crear"
3. `POST /api/projects` con `{ name, description }`
4. Si success (201):
   - Redirect a `/projects/:newId`
5. Si error (400):
   - Muestra mensaje
   - Permite corrección

**Endpoints**:
- `POST /api/projects`

**Componentes clave**:
- `ProjectForm`: name, description, submit
- `ErrorAlert`
- `LoadingButton`

---

### 2.6 Projects: Detail (`/projects/:id`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Ver/editar Project + acceder a Products.

**Estados UI**:
- Loading: skeleton
- Success: info editable + lista Products
- Error: "Proyecto no encontrado" (404) o mensaje error

**Flujo**:
1. `GET /api/projects/:id`
2. `GET /api/products?projectId=:id`
3. Muestra:
   - Nombre (editable inline o en modal)
   - Descripción (editable)
   - Botón "Eliminar Proyecto" (con confirmación)
   - Lista de Products
   - Botón "Nuevo Producto" → `/products/new?projectId=:id`
4. Si edita:
   - `PATCH /api/projects/:id` con campos modificados
   - Feedback success/error
5. Si elimina:
   - Modal confirmación: "¿Seguro? Se eliminarán todos los productos y versiones."
   - `DELETE /api/projects/:id`
   - Redirect a `/projects`

**Endpoints**:
- `GET /api/projects/:id`
- `GET /api/products?projectId=:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

**Componentes clave**:
- `ProjectHeader`: nombre, descripción, actions (edit/delete)
- `ProductsList`: cards de productos
- `ConfirmDialog`: modal de confirmación

---

### 2.7 Products: Create (`/products/new?projectId=:id`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Crear Product dentro de un Project.

**Estados UI**:
- Idle: form con projectId pre-seleccionado
- Loading: "Creando producto..."
- Success: redirect a `/products/:newId`
- Error: mensaje específico

**Flujo**:
1. Query param `projectId` pre-selecciona Project
2. Usuario ingresa:
   - Nombre (requerido)
   - Descripción (opcional)
3. Click "Crear"
4. `POST /api/products` con `{ projectId, name, description }`
5. Si success (201):
   - Redirect a `/products/:newId`
6. Si error (400/404):
   - Muestra mensaje

**Endpoints**:
- `POST /api/products`

**Componentes clave**:
- `ProductForm`: name, description, submit
- `ErrorAlert`
- `LoadingButton`

---

### 2.8 Products: Detail (`/products/:id`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Ver/editar Product + acceder a Versions.

**Estados UI**:
- Loading: skeleton
- Success: info editable + lista Versions
- Error: "Producto no encontrado"

**Flujo**:
1. `GET /api/products/:id`
2. `GET /api/versions?productId=:id`
3. Muestra:
   - Nombre (editable)
   - Descripción (editable)
   - Botón "Eliminar Producto" (con confirmación)
   - Lista de Versions
   - Botón "Nueva Versión" → `/versions/new?productId=:id`
4. Si edita:
   - `PATCH /api/products/:id`
5. Si elimina:
   - Confirmación
   - `DELETE /api/products/:id`
   - Redirect a parent project

**Endpoints**:
- `GET /api/products/:id`
- `GET /api/versions?productId=:id`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`

**Componentes clave**:
- `ProductHeader`: nombre, descripción, actions
- `VersionsList`: cards de versiones
- `ConfirmDialog`

---

### 2.9 Versions: Create (`/versions/new?productId=:id`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Crear Version dentro de un Product.

**Estados UI**:
- Idle: form
- Loading: "Creando versión..."
- Success: redirect a `/versions/:newId`
- Error: mensaje específico

**Flujo**:
1. Query param `productId` pre-selecciona Product
2. Usuario ingresa:
   - Label (requerido, ej: "v1.0", "v2.0-beta")
   - Notes (opcional)
3. Click "Crear"
4. `POST /api/versions` con `{ productId, label, notes }`
5. Si success (201):
   - Redirect a `/versions/:newId`
6. Si error (400/404):
   - Muestra mensaje

**Endpoints**:
- `POST /api/versions`

**Componentes clave**:
- `VersionForm`: label, notes, submit
- `ErrorAlert`
- `LoadingButton`

---

### 2.10 Versions: Detail + Assets (`/versions/:id/assets`)

**Permisos**: [ADMIN/USER]
**Objetivo**: Ver/editar Version + gestionar Assets (upload).

**Estados UI**:
- Loading: skeleton
- Success: info + lista assets + upload UI
- Error: "Versión no encontrada"

**Asset states**:
- `PENDING_UPLOAD`: "Esperando archivo..."
- `UPLOADED`: "Subido, procesando..."
- `PROCESSING`: "Procesando modelo..." (con progress si disponible)
- `READY`: "Listo" + preview thumbnail
- `FAILED`: "Error al procesar" + mensaje error + botón retry

**Flujo Upload**:
1. `GET /api/versions/:id`
2. `GET /api/assets?versionId=:id`
3. Usuario click "Subir Modelo 3D"
4. Selecciona archivo GLB (validación client-side: extension, size < 100MB)
5. `POST /api/assets/upload-url` con `{ versionId, fileName, contentType, sizeBytes }`
6. Backend retorna `{ assetId, upload: { url, method, headers } }`
7. Frontend:
   - Muestra progress bar (si disponible en upload)
   - `PUT upload.url` con el GLB
8. Al completar upload:
   - `POST /api/assets/complete` con `{ assetId, etag }`
9. Backend procesa (estados cambian: UPLOADED → PROCESSING → READY/FAILED)
10. Frontend polling (cada 2-3 segundos) o WebSocket (Fase 2):
    - `GET /api/assets/:assetId` hasta `status === 'READY' || 'FAILED'`
11. Si `READY`:
    - Muestra thumbnail
    - Habilita "Ver en 3D" (preview) y "Compartir"
12. Si `FAILED`:
    - Muestra `errorMessage`
    - Botón "Reintentar" (permite re-upload)

**Flujo Editar Version**:
1. Click "Editar"
2. Modal/inline edit: label, notes
3. `PATCH /api/versions/:id`

**Flujo Eliminar Version**:
1. Click "Eliminar"
2. Confirmación: "¿Seguro? Se eliminarán assets y shares."
3. `DELETE /api/versions/:id`
4. Redirect a parent product

**Endpoints**:
- `GET /api/versions/:id`
- `GET /api/assets?versionId=:id`
- `POST /api/assets/upload-url`
- `PUT <signed-url>` (storage directo)
- `POST /api/assets/complete`
- `GET /api/assets/:id` (polling status)
- `PATCH /api/versions/:id`
- `DELETE /api/versions/:id`

**Componentes clave**:
- `VersionHeader`: label, notes, actions
- `AssetUploader`: drag&drop + file input + progress
- `AssetCard`: thumbnail, status badge, actions
- `AssetStatusBadge`: visual por estado
- `ThreeDPreview` (modal/iframe): preview rápido del GLB

---

### 2.11 Versions: Shares (`/versions/:id/shares`)

**Permisos**: [ADMIN/USER] (USER si se permite; definir en Fase 1)
**Objetivo**: Crear y gestionar Shares para la Version.

**Estados UI**:
- Loading: skeleton
- Empty: "No hay enlaces compartidos aún"
- Success: lista de shares + botón crear nuevo
- Error: mensaje + retry

**Flujo Crear Share**:
1. Click "Crear Link Compartido"
2. Modal/form:
   - Expiración (date picker, requerido)
   - Max Visitas (number input, opcional o requerido según decisión)
3. `POST /api/shares` con `{ versionId, expiresAt, maxVisits }`
4. Backend retorna `{ token, url }`
5. Frontend muestra:
   - URL completa: `https://<frontend>/experience/:token`
   - Botón "Copiar Link" (clipboard API)
   - QR code (opcional MVP)

**Flujo Lista Shares**:
1. `GET /api/shares?versionId=:id`
2. Muestra tabla/cards:
   - Token (truncado, ej: "abc123...")
   - Estado: Activo / Expirado / Revocado / Límite alcanzado
   - Visitas: `visitCount / maxVisits`
   - Fecha expiración
   - Acciones:
     - "Copiar Link"
     - "Ver Analíticas" (visits) → opcional MVP
     - "Revocar" (si activo)

**Flujo Revocar Share**:
1. Click "Revocar"
2. Confirmación: "Este enlace dejará de funcionar."
3. `DELETE /api/shares/:shareId`
4. Actualiza lista (marca como "Revocado")

**Endpoints**:
- `GET /api/shares?versionId=:id`
- `POST /api/shares`
- `DELETE /api/shares/:id`

**Componentes clave**:
- `ShareList`: tabla/cards de shares
- `CreateShareModal`: form expiración + maxVisits
- `ShareCard`: info + actions (copy, revoke)
- `CopyButton`: copia al clipboard + feedback "Copiado!"
- `QRCodeDisplay` (opcional MVP)

---

### 2.12 Experience: Public Viewer (`/experience/:token`)

**Permisos**: Público (sin auth)
**Objetivo**: Renderizar modelo 3D + AR para usuario final.

**Estados UI**:
- Loading: "Cargando experiencia..." (con logo/branding)
- Success: viewer 3D + controles + CTA AR
- Error:
  - `SHARE_EXPIRED`: "Este enlace ha expirado."
  - `SHARE_REVOKED`: "Este enlace ha sido revocado."
  - `SHARE_LIMIT_REACHED`: "Este enlace alcanzó el límite de visitas."
  - `NOT_FOUND`: "Enlace no válido."
  - (Todos con botón "Contactar" o info de contacto si disponible)

**Flujo**:
1. Usuario abre URL `/experience/:token`
2. Frontend:
   - Muestra loader
   - `GET /api/public/experience/:token`
3. Si error (expired/revoked/limit/not found):
   - Muestra mensaje específico + estado final
4. Si success:
   - `POST /api/public/visits/start` con `{ shareToken, device: { ua, os, isMobile } }`
   - Guarda `visitId` en state
   - Descarga GLB desde `assets.glbUrl` (signed URL)
   - Inicializa Babylon.js viewer:
     - Orbit controls (touch-friendly)
     - Loading progress bar
     - Error fallback si falla carga
   - Muestra info básica:
     - Nombre producto + versión
     - Botón "Ver en AR" (si disponible)
5. Detección AR:
   - **Mobile iOS + Safari**: si existe `assets.usdzUrl` → muestra botón "Ver en AR" (Quick Look)
   - **Mobile Android + Chrome**: si WebXR disponible → muestra botón "Ver en AR" (WebXR)
   - **Desktop o no compatible**: oculta botón AR
6. Click "Ver en AR":
   - Si iOS: `<a rel="ar" href="usdzUrl">` (Quick Look nativo)
   - Si Android: inicia sesión WebXR
   - Marca `usedAR = true` en state
7. Usuario cierra/sale:
   - `beforeunload` o `visibilitychange`:
   - Calcula `durationMs` (timestamp end - start)
   - `POST /api/public/visits/end` con `{ visitId, durationMs, usedAR }`

**Endpoints**:
- `GET /api/public/experience/:token`
- `POST /api/public/visits/start`
- `POST /api/public/visits/end`

**Componentes clave**:
- `PublicLayout`: sin nav, solo logo + info mínima
- `BabylonViewer`: canvas 3D + controls
- `ARButton`: detección + CTA adaptado (iOS/Android)
- `LoadingOverlay`: progress + branding
- `ErrorScreen`: mensajes específicos por tipo de error
- `ProductInfo`: nombre + versión (minimal)

---

## 3) Navegación Recomendada (Breadcrumbs)

Para mejorar UX en admin, incluir breadcrumbs:

```
Dashboard
Projects > "Proyecto X"
Projects > "Proyecto X" > Products > "Producto A"
Projects > "Proyecto X" > Products > "Producto A" > Versions > "v1.0"
Projects > "Proyecto X" > Products > "Producto A" > Versions > "v1.0" > Assets
Projects > "Proyecto X" > Products > "Producto A" > Versions > "v1.0" > Shares
```

Cada nivel es clickeable y navega hacia atrás.

---

## 4) Permisos por Pantalla (resumen)

| Pantalla | ADMIN | USER | Public |
|----------|-------|------|--------|
| `/login`, `/register` | ✓ | ✓ | ✓ |
| `/dashboard` | ✓ | ✓ | ✗ |
| `/projects/*` | ✓ | ✓ | ✗ |
| `/products/*` | ✓ | ✓ | ✗ |
| `/versions/*` | ✓ | ✓ | ✗ |
| `/shares/*` (global) | ✓ | ✗* | ✗ |
| `/analytics` (Fase 2) | ✓ | ✗ | ✗ |
| `/settings` (Fase 2) | ✓ | ✗ | ✗ |
| `/experience/:token` | ✓ | ✓ | ✓ |

\* Decisión MVP: USER puede crear shares en `/versions/:id/shares` pero no ver lista global.

---

## 5) Endpoints por Pantalla (tabla completa)

| Pantalla | Endpoints Consumidos |
|----------|---------------------|
| `/login` | `POST /api/auth/login` |
| `/register` | `POST /api/auth/register` |
| `/dashboard` | `GET /api/projects`, `GET /api/shares?limit=5` |
| `/projects` | `GET /api/projects` |
| `/projects/new` | `POST /api/projects` |
| `/projects/:id` | `GET /api/projects/:id`, `GET /api/products?projectId=:id`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id` |
| `/products/new` | `POST /api/products` |
| `/products/:id` | `GET /api/products/:id`, `GET /api/versions?productId=:id`, `PATCH /api/products/:id`, `DELETE /api/products/:id` |
| `/versions/new` | `POST /api/versions` |
| `/versions/:id/assets` | `GET /api/versions/:id`, `GET /api/assets?versionId=:id`, `POST /api/assets/upload-url`, `PUT <signed-url>`, `POST /api/assets/complete`, `GET /api/assets/:id`, `PATCH /api/versions/:id`, `DELETE /api/versions/:id` |
| `/versions/:id/shares` | `GET /api/shares?versionId=:id`, `POST /api/shares`, `DELETE /api/shares/:id` |
| `/experience/:token` | `GET /api/public/experience/:token`, `POST /api/public/visits/start`, `POST /api/public/visits/end` |

---

## 6) Componentes UI Reutilizables (library sugerida)

Para mantener **DRY** y **consistencia**:

### Layout
- `AppLayout`: nav + sidebar (admin)
- `PublicLayout`: minimal (solo logo)

### Forms
- `Input`: text, email, password con validación
- `Textarea`: multiline
- `Select`: dropdown
- `DatePicker`: fecha/hora
- `FileInput`: drag&drop + browse
- `LoadingButton`: botón con spinner
- `Form`: wrapper con validación (react-hook-form recomendado)

### Feedback
- `ErrorAlert`: mensaje error con ícono
- `SuccessToast`: notificación temporal success
- `ConfirmDialog`: modal de confirmación (destructive actions)
- `LoadingOverlay`: fullscreen loader
- `LoadingSpinner`: inline spinner
- `Skeleton`: placeholder loading

### Data Display
- `Card`: contenedor estándar
- `Table`: tabla responsive
- `Badge`: status badge (color coded)
- `EmptyState`: mensaje + ilustración + CTA
- `Breadcrumbs`: navegación jerárquica

### 3D/AR
- `BabylonViewer`: wrapper Babylon.js canvas
- `ARButton`: detección + CTA AR
- `ThreeDPreview`: modal preview

---

## 7) Reglas de Loading States (obligatorias)

Toda request HTTP debe manejar:

1. **Inicio**: mostrar loader inmediato
2. **Success**: ocultar loader + mostrar data
3. **Error**: ocultar loader + mostrar mensaje error + botón retry
4. **Empty**: caso especial success sin data → `EmptyState`

Ejemplo patrón:
```typescript
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
  fetchData()
    .then(setData)
    .catch(setError)
    .finally(() => setLoading(false))
}, [])

if (loading) return <LoadingSkeleton />
if (error) return <ErrorAlert message={error.message} onRetry={refetch} />
if (!data || data.length === 0) return <EmptyState />
return <DataDisplay data={data} />
```

---

## 8) Responsive Breakpoints (recomendados)

- **Mobile**: < 768px (single column, stack everything)
- **Tablet**: 768px - 1024px (adaptive layout)
- **Desktop**: > 1024px (multi-column, sidebars)

Admin debe ser usable en tablet. Public experience DEBE ser mobile-optimized (target principal).

---

## 9) Accesibilidad Mínima (WCAG 2.1 Level A)

- Contraste suficiente (text/background)
- Keyboard navigation (tab order lógico)
- Focus visible
- Labels en inputs (no solo placeholders)
- Error messages asociados a inputs (aria-describedby)
- Botones con text/aria-label (no solo íconos)

---

## 10) Regla de Cambios (consistencia)

Si cambia:
- Un flujo de pantalla → actualizar este archivo
- Un endpoint → actualizar `/api/api-spec.md` + este archivo (sección 5)
- Un permiso → actualizar tabla sección 4

---

**Próximos pasos**: Usar esta especificación como **contrato** para implementar frontend sin ambigüedad.
Agentes y desarrolladores deben referenciar este documento para saber qué hacer en cada pantalla.
