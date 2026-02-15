# Fase 1 — MVP
Implementación end-to-end con **frontend + backend** (sin complejidad extra).  
Esta fase debe cumplir obligatoriamente: **SOLID / DRY / KISS / YAGNI**.

---

## Objetivo MVP (qué debe quedar funcionando)
1) Multi-tenant (Company) + usuarios (ADMIN/USER)  
2) CRUD: Projects → Products → Versions  
3) Upload de modelo 3D (GLB) asociado a una Version  
4) Procesamiento **simple** dentro del backend:
   - Validación básica
   - (Opcional MVP) Optimización mínima
   - Thumbnail
   - (Decisión) USDZ en MVP **solo si es factible sin complejidad**; si no, pasa a Fase 2
5) Experiencia pública `/experience/:token`:
   - Viewer 3D (Babylon.js)
   - AR WebXR (si está disponible)
   - iOS Quick Look (si hay USDZ)
6) Shares temporales (expiración + maxVisits + revocación)  
7) Tracking mínimo (Visit start/end, duration, usedAR)

---

## Reglas de diseño (críticas para el MVP)
- **KISS:** El procesamiento ocurre en el backend con un flujo directo.
- **YAGNI:** Nada de colas, workers, microservicios, ni infraestructura adicional.
- **SOLID (en backend y frontend):**
  - Controller (HTTP) → Service (dominio) → Repository (DB) → StorageAdapter
  - Sin lógica de negocio en controllers
- **DRY:** Validaciones y reglas (tenant, permisos) centralizadas.

---

## Etapa 1 — Setup base (repo + estándares)

### Implementación
- `/backend`
  - Express + TypeScript
  - Prisma + PostgreSQL (dev y prod)
  - Estructura sugerida:
    - `src/modules/*` por dominio (auth, projects, products, versions, assets, shares, visits)
    - `src/common/*` (errors, middleware, validators, utils)
- `/frontend`
  - Next.js (App Router) + TS
  - Estructura sugerida:
    - `app/(auth)/*`, `app/(admin)/*`, `app/experience/[token]/*`
    - `lib/api/*` cliente API
    - `components/*` UI

### Entregables
- Backend y frontend corren local
- Conexión a PostgreSQL local
- Prisma migrate aplicado
- Convenciones de error definidas (ver `development/api/api-spec.md`)

### Unit tests esenciales (mínimos)
**Backend**
- `config validation`: falla si falta `DATABASE_URL` o `JWT_*`
- `GET /api/health`: 200
**Frontend**
- Smoke test: render de `LoginPage` sin crash

### QA Checklist
- Levanta con pasos claros
- Variables de entorno definidas y documentadas
- Migraciones aplican consistentemente

---

## Etapa 2 — Auth + Multi-tenant + Roles

### Implementación (obligatoria)
- Auth JWT:
  - Access token corto
  - Refresh token largo (almacenado hasheado)
- Tabla de sesiones (refresh):
  - refreshTokenHash + expiresAt + revokedAt
- Roles:
  - ADMIN: puede gestionar usuarios (opcional en MVP), shares, todo CRUD
  - USER: CRUD de Projects/Products/Versions, generar shares si se permite

### Entregables
- Register Company + Admin
- Login / Refresh / Logout
- Middleware `requireAuth` y `requireRole`
- Claims incluyen `companyId`

### Unit tests esenciales
- `register` crea Company + User ADMIN
- `login` OK y FAIL
- `refresh` devuelve nuevo access token (y rota refresh si así se decide)
- `logout` invalida refresh
- `tenant isolation`:
  - usuario de Company A no puede leer/editar recursos de Company B (403/404)

### QA Checklist
- Access expira
- Refresh revocable
- No endpoints devuelven data de otros tenants

---

## Etapa 3 — CRUD: Projects / Products / Versions

### Implementación
- Endpoints REST para CRUD (ver `api/api-spec.md`)
- Validaciones:
  - `Product.projectId` debe pertenecer al tenant
  - `Version.productId` debe pertenecer al tenant
- Respuestas paginadas (opcional MVP) solo si realmente se necesita (YAGNI)

### Entregables
- Admin panel lista/crea/edita/elimina Projects, Products, Versions
- En backend, todas las queries filtran por `companyId`

### Unit tests esenciales
- Project:
  - create/list/update/delete
- Product:
  - create requiere projectId válido del tenant
  - no permite projectId de otro tenant
- Version:
  - create requiere productId válido del tenant
  - no permite productId de otro tenant
- Negativos:
  - `GET /:id` de otro tenant → 404/403

### QA Checklist
- Validaciones claras (mensajes útiles)
- CRUD consistente y sin duplicación de lógica

---

## Etapa 4 — Assets: Upload + Processing simple (dentro del backend)

### Decisión de flujo (MVP recomendado por simplicidad)
**Signed URL** (storage privado) + confirmación `complete`:
1) FE solicita `POST /api/assets/upload-url`
2) BE valida permisos y devuelve URL firmada
3) FE sube GLB al storage
4) FE llama `POST /api/assets/complete`
5) BE procesa en el mismo backend (sin cola externa) y actualiza estados

> Alternativa KISS: upload multipart directo al BE.
> Solo elegir si Signed URL agrega fricción en Amplify/infra.

### Procesamiento MVP (definición exacta)

#### Validaciones GLB (checks mínimos obligatorios)
Estas validaciones ocurren en `POST /api/assets/upload-url` (pre-upload) y al inicio de procesamiento:

1. **Pre-upload (upload-url)**:
   - `contentType === "model/gltf-binary"` → si no: `VALIDATION_ERROR: "Only GLB files are supported"`
   - `sizeBytes > 0` → si no: `VALIDATION_ERROR: "File cannot be empty"`
   - `sizeBytes <= 500MB (524288000 bytes)` → si no: `VALIDATION_ERROR: "File size exceeds 500MB limit"`
   - `fileName` tiene extensión `.glb` → si no: `VALIDATION_ERROR: "File must have .glb extension"`

2. **Post-upload (procesamiento)**:
   - Archivo existe en storage → si no: `FAILED: "File not found in storage"`
   - Archivo size real coincide con `sizeBytes` reportado (±5% tolerancia) → si no: `FAILED: "File size mismatch"`
   - Archivo es un GLB válido (magic bytes check: inicia con `glTF`) → si no: `FAILED: "Invalid GLB format"`
   - **Opcional MVP**: validar estructura GLTF con parser ligero (ej: validar JSON chunk) → si falla: warning en logs pero NO falla processing (YAGNI)

#### Optimizaciones (decisión MVP: NINGUNA obligatoria)
Por **KISS** y **YAGNI**, en MVP no se aplican optimizaciones automáticas al GLB:
- **NO** Draco compression
- **NO** texture resizing
- **NO** mesh simplification
- **NO** LOD generation

Razón: El cliente ya debe subir un GLB optimizado. Si en producción se detecta necesidad real, se agrega en Fase 2 con análisis de impacto.

> **Excepción**: Si el GLB original es >50MB, se puede agregar un warning en meta: `"largeFile": true`, pero NO se bloquea.

#### Derivados Obligatorios MVP

##### 1. Thumbnail (obligatorio)
- **Input**: GLB original
- **Proceso**:
  1. Parsear GLB y extraer geometría + texturas
  2. Renderizar offscreen (headless) usando librería (ej: `node-gles` + `gltf-transform`, o `puppeteer` + Three.js si es más simple)
  3. Captura viewport: 512x512px (square, centrado)
  4. Formato output: **JPEG 85% quality** (balance calidad/tamaño)
  5. Filename: `thumb_{assetId}.jpg`
- **Fallback**: Si falla render (GLB muy complejo o sin geometría visible):
  - Generar placeholder image genérico (logo/ícono 3D)
  - Guardar en meta: `"thumbnailFallback": true`
- **Storage**: Mismo bucket, path según convención (ver `storage.md`)
- **Asset record**: Crear Asset separado:
  - `kind: "THUMB"`
  - `status: "READY"`
  - `storageKey: "..."`
  - Link en `meta` del Asset principal: `{ "thumbAssetId": "..." }`

##### 2. USDZ (decisión MVP: OPCIONAL, solo si factible sin complejidad)
- **Condición**: Si existe herramienta CLI estable y ligera (ej: `gltf2usdz` de Pixar o similar)
- **Proceso**:
  1. Convertir GLB → USDZ usando CLI
  2. Validar output size razonable (< 150% del GLB original)
  3. Filename: `model_{assetId}.usdz`
- **Si no es factible en MVP**:
  - NO bloquear implementación
  - Documentar en `meta`: `{ "usdzAvailable": false }`
  - Pasa a Fase 2
- **Asset record** (si se genera):
  - `kind: "USDZ"`
  - `status: "READY"`
  - Link en meta del principal: `{ "usdzAssetId": "..." }`

##### 3. Optimized GLB (decisión MVP: NO se genera)
En MVP, el GLB original se sirve directamente. No se crea `OPTIMIZED_GLB` (YAGNI).
Si en producción se requiere, se agrega en Fase 2.

#### State Machine de Asset (transiciones permitidas)

Estados posibles: `PENDING_UPLOAD | UPLOADED | PROCESSING | READY | FAILED`

**Transiciones válidas**:
```
PENDING_UPLOAD → UPLOADED       (cuando FE completa upload)
UPLOADED       → PROCESSING     (cuando BE inicia procesamiento)
PROCESSING     → READY          (cuando procesamiento exitoso)
PROCESSING     → FAILED         (cuando procesamiento falla)
FAILED         → PENDING_UPLOAD (si se permite retry manual; decisión: SÍ en MVP)
```

**Transiciones PROHIBIDAS** (deben lanzar error en backend):
```
READY → PROCESSING  (no re-procesar automáticamente)
READY → UPLOADED    (no retroceder)
FAILED → PROCESSING (solo vía retry explícito que vuelve a PENDING_UPLOAD)
```

#### Qué guardar en `meta` (campo JSON)

**Asset principal (SOURCE_GLB)**:
```json
{
  "originalFileName": "model.glb",
  "thumbAssetId": "uuid-del-thumb",
  "usdzAssetId": "uuid-del-usdz" | null,
  "usdzAvailable": true | false,
  "largeFile": true | false,
  "processingTimeMs": 12345,
  "warnings": ["message1", "message2"] | []
}
```

**NO guardar en meta** (mantener privado):
- IPs, tokens, keys
- Paths internos completos de storage
- Datos sensibles del tenant

**Asset derivado (THUMB, USDZ)**:
```json
{
  "sourceAssetId": "uuid-del-source-glb",
  "thumbnailFallback": true | false
}
```

#### Manejo de Errores en Procesamiento

Cuando el procesamiento falla:
1. Estado → `FAILED`
2. Campo `errorMessage` en Asset:
   - Mensaje claro para usuario (ej: "El archivo GLB no es válido")
   - NO exponer stack traces ni paths internos
3. Ejemplos:
   - `"Invalid GLB format"`
   - `"File too large to process"`
   - `"Thumbnail generation failed"`
4. Frontend muestra `errorMessage` + botón "Reintentar"

#### Timeouts y Límites

- **Upload timeout** (signed URL TTL): 30 minutos (1800 segundos) para archivos grandes hasta 500MB (ver `storage.md`)
- **Processing timeout**: 2 minutos máximo por GLB
  - Si excede: marca `FAILED` con `errorMessage: "Processing timeout exceeded"`
- **Retry policy**: Usuario puede reintentar manualmente (botón en UI)
- **Cleanup**: Assets en `PENDING_UPLOAD` por >24h se marcan `FAILED` automáticamente (job opcional, Fase 2)

#### Librería Recomendada para Procesamiento (backend Node.js)

- **Parsing GLB**: `gltf-transform` (ligero, estable)
- **Thumbnail**:
  - Opción A: `puppeteer` + Three.js (headless browser, fácil pero pesado)
  - Opción B: `node-gles` + custom render (más eficiente, más complejo)
  - **Decisión MVP**: usar opción más simple que funcione (probablemente Puppeteer)
- **USDZ** (si aplica): CLI externo (ej: `gltf2usdz` de USD o herramienta de Pixar)

### Entregables
- Upload de GLB asociado a Version
- Asset con status `READY`
- Backend expone URL firmada de lectura para viewer (o endpoint proxy si se decide)

### Unit tests esenciales
- `upload-url`:
  - rechaza versionId de otro tenant
  - rechaza size excedido
  - rechaza contentType inválido
- `complete`:
  - cambia a PROCESSING
  - si no pertenece al tenant → 404/403
- `processing state`:
  - no permite transiciones inválidas (ej. READY → PROCESSING)
- `public url`:
  - sólo se retorna lo necesario (no filtra storageKey interno)

### QA Checklist
- Modelo grande: no rompe la API (timeouts controlados)
- `FAILED` guarda `errorMessage` útil
- Frontend muestra progreso/estado y reintento manual (si se define)

---

## Etapa 5 — Experiencia pública: Viewer 3D + AR + Shares

### Implementación
- Public route: `/experience/:token`
- Backend endpoint: `GET /api/public/experience/:token`
- Viewer 3D:
  - Babylon.js, orbit controls, loader, manejo de error
- AR:
  - WebXR (feature detect)
  - iOS Quick Look si existe USDZ (si no, ocultar CTA o mostrar fallback)

### Shares (seguridad)
- `token` largo aleatorio (no incremental)
- Expira por `expiresAt`
- Límite por `maxVisits`
- Revocable

### Entregables
- Link público muestra 3D
- AR disponible en dispositivos compatibles
- Share respeta expiración y maxVisits

### Unit tests esenciales (Backend)
- Share:
  - crear share válido
  - expirado → `SHARE_EXPIRED`
  - revocado → `SHARE_REVOKED`
  - maxVisits alcanzado → `SHARE_LIMIT_REACHED`
- Public experience:
  - token inválido → `NOT_FOUND` o `UNAUTHORIZED` según criterio
  - token válido → devuelve assets firmados (sin campos internos)

### QA Checklist
- Navegación desde mobile correcta
- Loader visible + error state amigable
- No se expone data interna del tenant

---

## Etapa 6 — Tracking mínimo (Visits)

### Implementación
- `POST /api/public/visits/start` crea Visit
- `POST /api/public/visits/end` completa duración + usedAR
- Guardar device info (UA, os, isMobile) en JSON

### Entregables
- Visitas registradas por share/version
- Admin puede ver visitas (mínimo: lista simple)

### Unit tests esenciales
- start crea visit con share válido
- end actualiza durationMs y usedAR
- end no permite visit inexistente
- start no permite share inválido/expirado

### QA Checklist
- Datos consistentes (durationMs >= 0)
- usedAR sólo boolean
- No se guardan datos sensibles innecesarios (KISS)

---

## Criterios de aceptación MVP (definitivos)
- CRUD completo Projects/Products/Versions
- Upload GLB → status READY
- Viewer público renderiza 3D
- Shares temporales seguros (expira + maxVisits + revoke)
- Tracking mínimo funcional
- Suite de unit tests esenciales pasa en CI

---

## Estado de Implementación MVP

✅ **Etapa 1** - Setup base
✅ **Etapa 2** - Auth + Multi-tenant
✅ **Etapa 3** - CRUD Projects/Products/Versions
✅ **Etapa 4** - Assets Upload + Processing
✅ **Etapa 5** - Experiencia pública: Viewer 3D + AR
✅ **Etapa 6** - Tracking mínimo (Visits)
```