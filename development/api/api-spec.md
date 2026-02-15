~~~md
# API Spec (REST) — v1
**Fuente única de verdad del contrato API.**

---

## 0) Convenciones generales

### Base URL
- Base: `/api`

### Auth
- Header: `Authorization: Bearer <access_token>`

### Content-Type
- JSON: `Content-Type: application/json`

### Error shape (obligatorio)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload",
    "details": [{ "field": "email", "issue": "invalid" }]
  }
}
```

### Códigos de error sugeridos
- Auth:
  - `UNAUTHORIZED`, `FORBIDDEN`
  - `TOKEN_EXPIRED`, `REFRESH_REVOKED`
- Validación / negocio:
  - `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`
  - `RATE_LIMITED`
- Shares:
  - `SHARE_EXPIRED`, `SHARE_REVOKED`, `SHARE_LIMIT_REACHED`

### Regla de cambios
Si cambia cualquier request/response, permisos, o lógica pública/privada:
- actualizar este archivo en el mismo PR.

---

## 0.1) Seguridad & Políticas

### Refresh Token Storage (decisión MVP)
- **Método**: httpOnly cookie
- **Cookie name**: `refreshToken`
- **Flags**: `httpOnly; Secure; SameSite=Strict; Path=/api/auth`
- **TTL**: 30 días

**Implicaciones**:
- `POST /api/auth/login` y `POST /api/auth/register` setean cookie en response
- `POST /api/auth/refresh` y `POST /api/auth/logout` leen cookie automáticamente (no en body)
- Frontend NO tiene acceso al refreshToken (protección XSS)

**Request/Response ajustado**:
```typescript
// Login/Register response
Set-Cookie: refreshToken={token}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=2592000

// Refresh request (cookie enviada automáticamente por browser)
Cookie: refreshToken={token}

// Logout request (idem)
Cookie: refreshToken={token}
```

### Rate Limiting por Endpoint

Ver tabla completa en `development/architecture/system-architecture.md` (sección 4.2).

Endpoints con límite (resumen):
- `POST /api/auth/login`: 5 req / 15 min
- `POST /api/auth/register`: 3 req / 1 hora
- `POST /api/auth/refresh`: 10 req / 15 min
- `POST /api/shares`: 20 req / 1 hora
- `GET /api/public/experience/:token`: 100 req / 15 min
- `POST /api/assets/upload-url`: 50 req / 1 hora

**Response cuando se alcanza límite**:
```json
HTTP 429 Too Many Requests
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, please try again later"
  }
}
```

### CORS Policy

**Allowed Origins** (configurar en backend):
- `http://localhost:3000` (dev)
- `https://<frontend-domain>.amplifyapp.com` (prod)
- `https://<custom-domain>` (prod custom)

**Methods**: GET, POST, PATCH, DELETE
**Headers**: Content-Type, Authorization
**Credentials**: true (permite cookies)

**Rechazo CORS**:
Si origen no permitido → browser bloquea request (el servidor responde con error CORS).

### Cross-Tenant Protection (404 vs 403)

**Política MVP: Retornar 404 para recursos de otros tenants.**

Ejemplo:
- Usuario de Company A intenta `GET /api/projects/{id-de-company-B}`
- Backend filtra por `companyId` del JWT → no encuentra → `404 NOT_FOUND`
- NO retornar `403 FORBIDDEN` (evita revelar existencia del recurso)

**Consistencia obligatoria** en todos los endpoints CRUD.

---

## 1) Health

### GET /api/health
Response 200:
```json
{ "status": "ok" }
```

---

## 2) Auth

### POST /api/auth/register
Crea Company + User ADMIN.
Request:
```json
{ "companyName": "ACME", "email": "admin@acme.com", "password": "..." }
```
Response:
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "company": { "id": "...", "name": "ACME" },
  "user": { "id": "...", "email": "admin@acme.com", "role": "ADMIN" }
}
```

### POST /api/auth/login
Request:
```json
{ "email": "admin@acme.com", "password": "..." }
```
Response:
```json
{ "accessToken": "...", "refreshToken": "..." }
```

### POST /api/auth/refresh
Request:
```json
{ "refreshToken": "..." }
```
Response:
```json
{ "accessToken": "...", "refreshToken": "..." }
```

### POST /api/auth/logout
Request:
```json
{ "refreshToken": "..." }
```
Response:
```json
{ "ok": true }
```

---

## 3) Companies

### GET /api/companies/me
Response:
```json
{ "id": "...", "name": "...", "createdAt": "..." }
```

---

## 4) Projects (privado)

### GET /api/projects
Response:
```json
[{ "id": "...", "name": "...", "description": null, "createdAt": "...", "updatedAt": "..." }]
```

### POST /api/projects
Request:
```json
{ "name": "Linea X", "description": "..." }
```
Response:
```json
{ "id": "...", "name": "Linea X", "description": "...", "createdAt": "...", "updatedAt": "..." }
```

### GET /api/projects/:id
### PATCH /api/projects/:id
Request:
```json
{ "name": "Nuevo nombre", "description": "..." }
```
### DELETE /api/projects/:id
Response:
```json
{ "ok": true }
```

Reglas:
- siempre filtrar por `companyId`
- si no pertenece → `NOT_FOUND` o `FORBIDDEN` (elegir 1 y mantenerlo consistente)

---

## 5) Products (privado)

### GET /api/products?projectId=...
Response:
```json
[{ "id": "...", "projectId": "...", "name": "...", "description": null }]
```

### POST /api/products
Request:
```json
{ "projectId": "...", "name": "Maquinaria A", "description": "..." }
```

### GET /api/products/:id
### PATCH /api/products/:id
### DELETE /api/products/:id

Reglas:
- `projectId` debe pertenecer al tenant, si no → `VALIDATION_ERROR` o `NOT_FOUND`

---

## 6) Versions (privado)

### GET /api/versions?productId=...
Response:
```json
[{ "id": "...", "productId": "...", "label": "v1.0", "notes": null }]
```

### POST /api/versions
Request:
```json
{ "productId": "...", "label": "v1.0", "notes": "..." }
```

### GET /api/versions/:id
### PATCH /api/versions/:id
### DELETE /api/versions/:id

Reglas:
- `productId` debe pertenecer al tenant

---

## 6.5) Submodels (privado - Fase 2)

Los submodelos son variantes de una Version (por ejemplo, diferentes colores o configuraciones del mismo producto).

### GET /api/versions/:versionId/submodels
Obtiene todos los submodelos de una versión.

Response:
```json
{
  "submodels": [
    {
      "id": "submodel-uuid",
      "versionId": "version-uuid",
      "name": "Variante Roja",
      "description": "Modelo con acabado rojo",
      "createdAt": "2024-01-15T10:00:00Z",
      "assets": [
        {
          "id": "asset-uuid",
          "kind": "SOURCE_GLB",
          "status": "READY",
          "meta": {
            "glbUrl": "https://...signed...",
            "thumbUrl": "https://...signed..."
          }
        }
      ]
    }
  ]
}
```

### POST /api/versions/:versionId/submodels
Crea un nuevo submodelo.

Request:
```json
{
  "name": "Variante Azul",
  "description": "Modelo con acabado azul"
}
```

Response:
```json
{
  "id": "submodel-uuid",
  "versionId": "version-uuid",
  "name": "Variante Azul",
  "description": "Modelo con acabado azul",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

### PATCH /api/submodels/:id
Actualiza nombre o descripción del submodelo.

Request:
```json
{
  "name": "Nuevo nombre",
  "description": "Nueva descripción"
}
```

Response:
```json
{
  "id": "submodel-uuid",
  "versionId": "version-uuid",
  "name": "Nuevo nombre",
  "description": "Nueva descripción",
  "updatedAt": "2024-01-15T11:00:00Z"
}
```

### DELETE /api/submodels/:id
Elimina el submodelo y sus assets asociados.

Response: 204 No Content

Reglas:
- `versionId` debe pertenecer al tenant
- Assets se asocian opcionalmente a `submodelId` (mismo flujo que Version)
- En endpoint público, los submodelos se incluyen en `GET /api/public/experience/:token`

---

## 7) Assets (privado)

### GET /api/assets?versionId=...
Response:
```json
[
  {
    "id": "...",
    "versionId": "...",
    "kind": "SOURCE_GLB",
    "status": "READY",
    "sizeBytes": 12345,
    "meta": {},
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### POST /api/assets/upload-url
Crea registro Asset en `PENDING_UPLOAD` y retorna URL firmada.
Request:
```json
{ "versionId": "...", "fileName": "model.glb", "contentType": "model/gltf-binary", "sizeBytes": 123456 }
```
Response:
```json
{
  "assetId": "...",
  "upload": {
    "url": "https://...",
    "method": "PUT",
    "headers": { "Content-Type": "model/gltf-binary" }
  }
}
```

### POST /api/assets/complete
Marca `UPLOADED` e inicia procesamiento dentro del backend.
Request:
```json
{ "assetId": "...", "etag": "\"...\"" }
```
Response:
```json
{ "assetId": "...", "status": "PROCESSING" }
```

### GET /api/assets/:id
Devuelve detalle del asset (sin exponer storageKey).
Response:
```json
{
  "id": "...",
  "versionId": "...",
  "kind": "OPTIMIZED_GLB",
  "status": "READY",
  "sizeBytes": 123,
  "meta": { "thumbUrl": "...signed...", "glbUrl": "...signed..." }
}
```

Reglas:
- No exponer `storageKey` interno al cliente
- Validar `contentType` y sizeBytes
- Multi-tenant enforced por version/asset

---

## 8) Shares (privado)

### GET /api/shares?versionId=...
Response:
```json
[
  {
    "id": "...",
    "versionId": "...",
    "token": "....",
    "expiresAt": "...",
    "maxVisits": 50,
    "visitCount": 3,
    "revokedAt": null,
    "createdAt": "..."
  }
]
```

### POST /api/shares
Request:
```json
{ "versionId": "...", "expiresAt": "2026-02-10T00:00:00Z", "maxVisits": 50 }
```
Response:
```json
{ "token": "abc123...", "url": "https://<frontend>/experience/abc123..." }
```

### DELETE /api/shares/:id
Response:
```json
{ "ok": true }
```

Reglas:
- token aleatorio largo (mínimo 32 bytes)
- expiración obligatoria (evitar links eternos)
- `maxVisits` opcional (si null → ilimitado) o requerido (definir 1 criterio)

---

## 9) Public Experience (público)

### GET /api/public/experience/:token
Valida token y devuelve lo mínimo para renderizar.
Response:
```json
{
  "product": { "name": "...", "versionLabel": "v1.0" },
  "assets": {
    "glbUrl": "...signed...",
    "thumbUrl": "...signed...",
    "usdzUrl": null
  },
  "share": { "expiresAt": "...", "remainingVisits": 12 }
}
```

Errores:
- `SHARE_EXPIRED`, `SHARE_REVOKED`, `SHARE_LIMIT_REACHED`

---

## 10) Visits (público)

### POST /api/public/visits/start
Request:
```json
{ "shareToken": "...", "device": { "ua": "...", "os": "...", "isMobile": true } }
```
Response:
```json
{ "visitId": "..." }
```

### POST /api/public/visits/end
Request:
```json
{ "visitId": "...", "durationMs": 123456, "usedAR": true }
```
Response:
```json
{ "ok": true }
```

Reglas:
- `durationMs >= 0`
- `usedAR` boolean
- No guardar info sensible innecesaria

---

## 11) Analytics (privado - Fase 2 IMPLEMENTADO)

### GET /api/analytics/dashboard
Obtiene métricas agregadas de visitas y shares para el dashboard de analytics.

Query params:
- `from`: YYYY-MM-DD (required) - Fecha inicio del rango
- `to`: YYYY-MM-DD (required) - Fecha fin del rango

Response:
```json
{
  "overview": {
    "totalVisits": 1250,
    "uniqueShares": 45,
    "avgDurationMs": 125000,
    "arRate": 0.68,
    "deviceBreakdown": {
      "mobile": 850,
      "desktop": 400
    }
  },
  "visitsPerDay": [
    { "date": "2024-01-15", "count": 42 },
    { "date": "2024-01-16", "count": 38 }
  ],
  "topProducts": [
    {
      "versionId": "version-uuid",
      "productName": "Excavadora XL",
      "versionLabel": "v2.0",
      "visitCount": 145
    }
  ]
}
```

Detalles de campos:
- `totalVisits`: Total de visitas en el rango de fechas
- `uniqueShares`: Cantidad de shares que tuvieron al menos 1 visita
- `avgDurationMs`: Duración promedio de visitas en milisegundos
- `arRate`: Porcentaje de visitas que usaron AR (0.0 a 1.0)
- `deviceBreakdown`: Cantidad de visitas por tipo de dispositivo
- `visitsPerDay`: Array con conteo de visitas por día
- `topProducts`: Productos más visitados (ordenados por visitCount descendente)

Reglas:
- Todo filtrado por `companyId` del usuario autenticado
- Solo ADMIN puede acceder
- Fechas en formato YYYY-MM-DD
- Si `from > to`, retorna error 400
- Máximo rango: 1 año

---

## 12) DTOs Completos (Data Transfer Objects)

Esta sección define **qué campos salen** en cada response y **qué campos NUNCA salen** (privados).

### Reglas generales (obligatorias):
1. **NUNCA exponer** al cliente (frontend o público):
   - `passwordHash`, `refreshTokenHash`
   - `storageKey` (paths internos de S3)
   - `companyId` en endpoints públicos
   - Campos internos de auditoría no relevantes para el usuario
2. **Timestamps**: Formato ISO8601 (ej: `"2026-02-02T12:34:56.789Z"`)
3. **IDs**: UUIDs como strings
4. **Campos opcionales**: `null` explícito (no omitir del JSON)
5. **Enums**: Strings uppercase (ej: `"ADMIN"`, `"READY"`)

---

### DTO: CompanyDTO (privado)

**Usado en**: `GET /api/companies/me`, `POST /api/auth/register`

```typescript
interface CompanyDTO {
  id: string                 // UUID
  name: string
  createdAt: string          // ISO8601
  updatedAt: string          // ISO8601
}
```

**Campos que NUNCA salen**:
- (ninguno adicional en Company)

**Ejemplo completo**:
```json
{
  "id": "c1a2b3c4-d5e6-7f8g-9h0i-1j2k3l4m5n6o",
  "name": "ACME Corporation",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

---

### DTO: UserDTO (privado)

**Usado en**: `POST /api/auth/register`, `POST /api/auth/login` (opcional)

```typescript
interface UserDTO {
  id: string                 // UUID
  email: string
  role: 'ADMIN' | 'USER'
  status: 'ACTIVE' | 'DISABLED'
  createdAt: string          // ISO8601
  updatedAt: string          // ISO8601
}
```

**Campos que NUNCA salen**:
- `passwordHash`
- `companyId` (implícito en JWT)

**Ejemplo completo**:
```json
{
  "id": "u1a2b3c4-d5e6-7f8g-9h0i-1j2k3l4m5n6o",
  "email": "admin@acme.com",
  "role": "ADMIN",
  "status": "ACTIVE",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

---

### DTO: ProjectDTO (privado)

**Usado en**: `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects`, `PATCH /api/projects/:id`

```typescript
interface ProjectDTO {
  id: string                 // UUID
  name: string
  description: string | null
  createdAt: string          // ISO8601
  updatedAt: string          // ISO8601
}
```

**Campos que NUNCA salen**:
- `companyId` (implícito en JWT, ya está filtrado)

**Ejemplo completo**:
```json
{
  "id": "p1a2b3c4-d5e6-7f8g-9h0i-1j2k3l4m5n6o",
  "name": "Línea Industrial X",
  "description": "Maquinaria pesada para construcción",
  "createdAt": "2026-01-20T14:30:00.000Z",
  "updatedAt": "2026-01-25T09:15:00.000Z"
}
```

---

### DTO: ProductDTO (privado)

**Usado en**: `GET /api/products`, `GET /api/products/:id`, `POST /api/products`, `PATCH /api/products/:id`

```typescript
interface ProductDTO {
  id: string                 // UUID
  projectId: string          // UUID
  name: string
  description: string | null
  createdAt: string          // ISO8601
  updatedAt: string          // ISO8601
}
```

**Campos que NUNCA salen**:
- `companyId`

**Ejemplo completo**:
```json
{
  "id": "prod-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "projectId": "p1a2b3c4-d5e6-7f8g-9h0i-1j2k3l4m5n6o",
  "name": "Excavadora XL-500",
  "description": "Modelo para terrenos difíciles",
  "createdAt": "2026-01-22T11:00:00.000Z",
  "updatedAt": "2026-01-22T11:00:00.000Z"
}
```

---

### DTO: VersionDTO (privado)

**Usado en**: `GET /api/versions`, `GET /api/versions/:id`, `POST /api/versions`, `PATCH /api/versions/:id`

```typescript
interface VersionDTO {
  id: string                 // UUID
  productId: string          // UUID
  label: string              // ej: "v1.0", "v2.0-beta"
  notes: string | null
  createdAt: string          // ISO8601
  updatedAt: string          // ISO8601
}
```

**Campos que NUNCA salen**:
- `companyId`

**Ejemplo completo**:
```json
{
  "id": "ver-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "productId": "prod-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "label": "v1.0",
  "notes": "Versión inicial de producción",
  "createdAt": "2026-01-23T16:45:00.000Z",
  "updatedAt": "2026-01-23T16:45:00.000Z"
}
```

---

### DTO: AssetDTO (privado)

**Usado en**: `GET /api/assets`, `GET /api/assets/:id`, `POST /api/assets/complete`

```typescript
interface AssetDTO {
  id: string                                      // UUID
  versionId: string                               // UUID
  kind: 'SOURCE_GLB' | 'OPTIMIZED_GLB' | 'USDZ' | 'THUMB'
  status: 'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
  sizeBytes: number
  contentType: string                             // MIME type
  meta: Record<string, any> | null                // JSON con URLs firmadas, warnings, etc.
  errorMessage: string | null                     // Solo si status === 'FAILED'
  createdAt: string                               // ISO8601
  updatedAt: string                               // ISO8601
}
```

**Campos que NUNCA salen**:
- `storageKey` (path interno en S3)
- `companyId`

**Campo `meta` (estructura recomendada para SOURCE_GLB READY)**:
```json
{
  "originalFileName": "model.glb",
  "glbUrl": "https://s3.amazonaws.com/bucket/path?X-Amz-Signature=...",
  "thumbUrl": "https://s3.amazonaws.com/bucket/thumb?X-Amz-Signature=...",
  "thumbAssetId": "asset-thumb-uuid",
  "usdzUrl": "https://s3.amazonaws.com/bucket/usdz?X-Amz-Signature=..." | null,
  "usdzAssetId": "asset-usdz-uuid" | null,
  "usdzAvailable": true | false,
  "largeFile": false,
  "processingTimeMs": 12450,
  "warnings": []
}
```

**Ejemplo completo (SOURCE_GLB READY)**:
```json
{
  "id": "asset-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "versionId": "ver-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "kind": "SOURCE_GLB",
  "status": "READY",
  "sizeBytes": 5242880,
  "contentType": "model/gltf-binary",
  "meta": {
    "originalFileName": "excavadora_xl500.glb",
    "glbUrl": "https://s3.amazonaws.com/my-bucket/c1a2.../source/model_original.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
    "thumbUrl": "https://s3.amazonaws.com/my-bucket/c1a2.../thumb/thumb_asset-xyz.jpg?X-Amz-Algorithm=...",
    "thumbAssetId": "asset-thumb-abc123",
    "usdzUrl": "https://s3.amazonaws.com/my-bucket/c1a2.../usdz/model_asset-xyz.usdz?X-Amz-Algorithm=...",
    "usdzAssetId": "asset-usdz-def456",
    "usdzAvailable": true,
    "largeFile": false,
    "processingTimeMs": 12450,
    "warnings": []
  },
  "errorMessage": null,
  "createdAt": "2026-01-24T10:00:00.000Z",
  "updatedAt": "2026-01-24T10:00:15.000Z"
}
```

**Ejemplo completo (FAILED)**:
```json
{
  "id": "asset-failed-xyz",
  "versionId": "ver-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "kind": "SOURCE_GLB",
  "status": "FAILED",
  "sizeBytes": 0,
  "contentType": "model/gltf-binary",
  "meta": null,
  "errorMessage": "Invalid GLB format: file is corrupted",
  "createdAt": "2026-01-24T10:00:00.000Z",
  "updatedAt": "2026-01-24T10:00:05.000Z"
}
```

---

### DTO: ShareDTO (privado)

**Usado en**: `GET /api/shares`, `POST /api/shares`

```typescript
interface ShareDTO {
  id: string                 // UUID
  versionId: string          // UUID
  token: string              // 64 caracteres hex (NO exponer en listas, solo en create)
  expiresAt: string          // ISO8601
  maxVisits: number | null   // null = ilimitado
  visitCount: number
  revokedAt: string | null   // ISO8601 o null
  createdAt: string          // ISO8601
}
```

**Campos que NUNCA salen**:
- `companyId`

**Nota sobre `token`**:
- En `POST /api/shares` response: exponer token completo + URL (usuario necesita copiarlo)
- En `GET /api/shares` list: truncar token (ej: primeros 8 caracteres + "...") para UI (seguridad)

**Ejemplo completo (POST create response)**:
```json
{
  "id": "share-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "versionId": "ver-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
  "expiresAt": "2026-03-01T00:00:00.000Z",
  "maxVisits": 100,
  "visitCount": 0,
  "revokedAt": null,
  "createdAt": "2026-02-02T12:00:00.000Z"
}
```

**Ejemplo en GET list (token truncado)**:
```json
{
  "id": "share-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "versionId": "ver-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "token": "a1b2c3d4...",
  "expiresAt": "2026-03-01T00:00:00.000Z",
  "maxVisits": 100,
  "visitCount": 23,
  "revokedAt": null,
  "createdAt": "2026-02-02T12:00:00.000Z"
}
```

---

### DTO: PublicExperienceDTO (público)

**Usado en**: `GET /api/public/experience/:token`

```typescript
interface PublicExperienceDTO {
  product: {
    name: string             // Nombre del producto (NO id ni companyId)
    versionLabel: string     // Label de la versión (ej: "v1.0")
  }
  assets: {
    glbUrl: string           // Signed GET URL al GLB (TTL 1h)
    thumbUrl: string | null  // Signed GET URL al thumbnail
    usdzUrl: string | null   // Signed GET URL al USDZ (si existe)
  }
  share: {
    expiresAt: string        // ISO8601 (para mostrar countdown en UI)
    remainingVisits: number | null  // null = ilimitado
  }
}
```

**Campos que NUNCA salen**:
- `companyId`, `projectId`, `productId`, `versionId` (no exponer estructura interna)
- `token`, `shareId`
- `storageKey`, `assetId`
- Cualquier metadata interna

**Ejemplo completo**:
```json
{
  "product": {
    "name": "Excavadora XL-500",
    "versionLabel": "v1.0"
  },
  "assets": {
    "glbUrl": "https://s3.amazonaws.com/my-bucket/.../model_original.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=...&X-Amz-Expires=3600&X-Amz-Signature=...",
    "thumbUrl": "https://s3.amazonaws.com/my-bucket/.../thumb_xyz.jpg?X-Amz-Algorithm=...",
    "usdzUrl": "https://s3.amazonaws.com/my-bucket/.../model_xyz.usdz?X-Amz-Algorithm=..."
  },
  "share": {
    "expiresAt": "2026-03-01T00:00:00.000Z",
    "remainingVisits": 77
  }
}
```

---

### DTO: VisitDTO (privado, analytics)

**Usado en**: `GET /api/visits` (admin analytics, Fase 2)

```typescript
interface VisitDTO {
  id: string                 // UUID
  shareId: string            // UUID (opcional: exponer para drill-down)
  startedAt: string          // ISO8601
  endedAt: string | null     // ISO8601 o null si no completó
  durationMs: number | null  // null si no completó
  usedAR: boolean
  device: {
    ua: string               // User-Agent
    os: string               // ej: "iOS", "Android", "Windows"
    isMobile: boolean
  }
  createdAt: string          // ISO8601
}
```

**Campos que NUNCA salen en público**:
- Todo (visits son solo accesibles por admin del tenant)

**Ejemplo completo**:
```json
{
  "id": "visit-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "shareId": "share-1a2b-3c4d-5e6f-7g8h9i0j1k2l",
  "startedAt": "2026-02-02T14:30:00.000Z",
  "endedAt": "2026-02-02T14:35:45.000Z",
  "durationMs": 345000,
  "usedAR": true,
  "device": {
    "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "os": "iOS",
    "isMobile": true
  },
  "createdAt": "2026-02-02T14:30:00.000Z"
}
```

---

### DTO: ErrorDTO (obligatorio para todos los errores)

**Usado en**: Todos los endpoints cuando hay error

```typescript
interface ErrorDTO {
  error: {
    code: string             // Error code (uppercase snake_case)
    message: string          // Mensaje legible para usuario
    details?: any            // Opcional: detalles adicionales (ej: validación)
  }
}
```

**Campos que NUNCA salen**:
- Stack traces
- Paths internos de archivos
- Variables de entorno
- Queries SQL
- IDs internos no relevantes

**Ejemplo validación**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      { "field": "email", "message": "Must be a valid email" },
      { "field": "password", "message": "Must be at least 8 characters" }
    ]
  }
}
```

**Ejemplo auth**:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

**Ejemplo share**:
```json
{
  "error": {
    "code": "SHARE_EXPIRED",
    "message": "This link has expired"
  }
}
```

---

## 13) Versionado y Compatibilidad (MVP)

**Política MVP**: Sin versionado de API (v1 implícito).

**Breaking changes** (evitar en MVP):
- Cambiar tipos de campos existentes
- Eliminar campos de responses
- Cambiar códigos de error establecidos

**Non-breaking changes** (permitidos):
- Agregar nuevos campos a responses (clientes deben ignorar campos desconocidos)
- Agregar nuevos endpoints
- Agregar nuevos códigos de error (con fallback genérico en cliente)

**Fase 2** (si se requiere versionado):
- Implementar versionado en URL: `/api/v2/...`
- O versionado en header: `Accept: application/vnd.myapp.v2+json`
- Mantener v1 por período de deprecación (ej: 6 meses)
```
