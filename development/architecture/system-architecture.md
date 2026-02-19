~~~md
# Arquitectura del Sistema (Frontend + Backend)

Esta arquitectura está diseñada para mantener el producto **simple**, **mantenible** y alineado con:
**SOLID / DRY / KISS / YAGNI**.

---

## 1) Componentes (solo 2)

### 1.1 Frontend — Next.js (`/frontend`)
- Panel privado (Admin):
  - Auth
  - CRUD Projects/Products/Versions
  - Upload de assets + estado
  - Gestión de Shares
  - (Fase 2) Analytics dashboard
- Experiencia pública:
  - `/experience/:token`
  - Viewer 3D (Babylon.js)
  - AR (WebXR / Quick Look si aplica)

### 1.2 Backend — Express (`/backend`)
- API REST
- Auth JWT (access + refresh)
- Multi-tenant enforcement
- CRUD de entidades
- Assets: upload + procesamiento simple
- Shares: expiración, maxVisits, revocación
- Tracking: visits start/end

Persistencia:
- PostgreSQL (dev y prod) + Prisma

Deploy:
- AWS Amplify + PostgreSQL en AWS (p.ej. RDS)

---

## 2) Principios SOLID aplicados

### Backend (capas recomendadas)
- **Controllers**: parsean request, validan, llaman services.
- **Services**: reglas de negocio (tenant, permisos, flujos).
- **Repositories**: acceso a Prisma/DB (sin lógica de negocio).
- **Adapters**: storage, signed URLs, utilidades externas.

Reglas:
- No mezclar reglas de negocio con HTTP.
- No duplicar validaciones: centralizarlas en validators/middlewares.
- Mantener interfaces pequeñas y cohesionadas.

### Frontend (separación)
- `app/` rutas y layouts
- `components/` UI reutilizable
- `lib/api/` cliente HTTP y tipos
- `lib/auth/` gestión de tokens y refresh
- `features/` (opcional) por dominio (projects, assets, shares)

---

## 3) Flujos críticos

### 3.1 Auth (privado)
1) `POST /api/auth/login` → access+refresh
2) Frontend guarda access (memoria) y refresh (httpOnly cookie recomendado o storage seguro según decisión)
3) Si access expira: `POST /api/auth/refresh`
4) Logout revoca refresh

> Decisión recomendada: refresh token vía cookie httpOnly por seguridad.
> Documentar decisión final en `api-spec.md` si se adopta.

### 3.2 CRUD Admin
Todas las requests privadas:
- requieren JWT access
- el backend deriva `companyId` del token
- filtra por `companyId` en DB

### 3.3 Upload y procesamiento
**Flujo implementado:** Signed URL + procesamiento síncrono con USDZ asíncrono

1) FE: `POST /api/assets/upload-url`
2) BE valida:
   - versión pertenece al tenant
   - tamaño (max 500 MB) y tipo (`model/gltf-binary`)
3) BE crea Asset (`PENDING_UPLOAD`) y retorna URL firmada (30 min TTL)
4) FE sube GLB directamente a S3 vía PUT
5) FE: `POST /api/assets/complete`
6) BE (síncrono, bloquea el HTTP response):
   - Descarga 12 bytes header del GLB vía S3 range request → valida magic bytes
   - Genera thumbnail placeholder (512×512 JPEG)
   - Sube thumbnail a S3
   - Marca GLB como `READY` → responde al FE
7) BE (fire-and-forget, no bloquea el HTTP response):
   - Descarga GLB completo de S3
   - Convierte GLB → USDZ via Three.js en Node.js (ver §3.5)
   - Sube USDZ a S3 con `Content-Type: model/vnd.usdz+zip`
   - Crea Asset `USDZ` con status `READY`

> El paso 7 puede tardar 10-60s dependiendo del tamaño del modelo.
> Si falla, el GLB ya está `READY` → el frontend puede seguir funcionando con conversión client-side de model-viewer como fallback.

### 3.4 Experiencia pública (share)
1) Usuario abre `/experience/:token`
2) FE solicita `GET /api/public/experience/:token`
3) BE valida:
   - existe share
   - no revocado
   - no expirado
   - no excede maxVisits
4) BE retorna:
   - metadata mínima (nombre producto, versión)
   - URLs firmadas (1h TTL): `glbUrl`, `thumbUrl`, `usdzUrl` (null si USDZ aún no listo)
   - `usdzUrl` incluye `Content-Disposition: inline; filename="model.usdz"` para Quick Look
5) FE renderiza viewer y registra Visit start/end

### 3.5 Pipeline GLB→USDZ (Node.js Server-side)

**Módulo:** `backend/src/modules/assets/usdz-converter.ts`

**Por qué server-side:** iOS 17+ Safari rechaza `blob:` URLs como trigger de Apple Quick Look (las trata como navegación normal → recarga la página). Se necesita una URL real con extensión `.usdz` en el path.

**Stack:**
- `three` (npm): `GLTFLoader` + `USDZExporter`
- `canvas` (npm): node-canvas para operaciones de imagen sin browser real

**Polyfills DOM necesarios en Node.js:**

| API del browser | Polyfill en Node.js |
|-----------------|---------------------|
| `document.createElement('canvas')` | `createCanvas()` de node-canvas |
| `document.createElement('img')` | `new Image()` de node-canvas |
| `globalThis.Image` | `Image` de node-canvas |
| `globalThis.HTMLCanvasElement` | constructor de node-canvas |
| `globalThis.Blob` (wrapeado) | Node.js 20 Blob + wrapper que captura buffer raw |
| `URL.createObjectURL(blob)` | Retorna `data:{type};base64,{b64}` (node-canvas lo entiende) |
| `URL.revokeObjectURL()` | no-op |
| `canvas.toBlob(cb, type)` | `cb(new Blob([canvas.toBuffer(type)], {type}))` |
| `globalThis.OffscreenCanvas` | stub vacío |

**Optimizaciones aplicadas:**
- `maxTextureSize: 2048` → limita resolución de texturas en el USDZ
- Fuerza `material.side = FrontSide` en toda la escena (USDZ no soporta DoubleSide)
- Dispose de geometrías, materiales y texturas al finalizar (evita memory leaks)

**Patrón fire-and-forget:**
```typescript
void (async () => {
  // descarga GLB, convierte, sube USDZ
  // si falla: solo logging, GLB sigue READY
})()
return toDTO(updated) // respuesta HTTP inmediata
```


---

## 4) Seguridad (especificación completa MVP)

### 4.1 Autenticación JWT

**Access Token**:
- Algoritmo: `HS256` (HMAC SHA-256) con secret fuerte (mínimo 32 bytes aleatorios)
- TTL: **15 minutos** (900 segundos)
- Claims obligatorios:
  ```json
  {
    "sub": "userId",
    "companyId": "companyId",
    "role": "ADMIN" | "USER",
    "iat": 1234567890,
    "exp": 1234568790
  }
  ```
- Almacenamiento frontend: **Memoria** (state/context, NO localStorage/sessionStorage por XSS)

**Refresh Token**:
- Algoritmo: Random string (64 bytes → hex = 128 caracteres)
- Hash: `bcrypt` con salt rounds 10 antes de guardar en DB
- TTL: **30 días** (2592000 segundos)
- Almacenamiento frontend: **httpOnly cookie** (decisión final MVP)
  - Name: `refreshToken`
  - Flags: `httpOnly; Secure; SameSite=Strict`
  - Path: `/api/auth`
- Revocación: Campo `revokedAt` en tabla `RefreshSession`

**Middleware `requireAuth`**:
```typescript
// Pseudo-código
1. Extraer token de header: Authorization: Bearer {token}
2. Verificar firma y expiración
3. Si inválido/expirado → 401 UNAUTHORIZED
4. Si válido → adjuntar claims a request.user
```

**Middleware `requireRole(roles: Role[])`**:
```typescript
// Pseudo-código
1. Verificar request.user.role in roles
2. Si no → 403 FORBIDDEN
3. Si sí → next()
```

### 4.2 Rate Limiting (por endpoint)

Librería recomendada: `express-rate-limit` + store en memoria (MVP) o Redis (Fase 2).

**Endpoints con rate limit obligatorio**:

| Endpoint | Límite | Window | Razón |
|----------|--------|--------|-------|
| `POST /api/auth/login` | 5 req | 15 min | Prevenir brute-force |
| `POST /api/auth/register` | 3 req | 1 hora | Prevenir spam de cuentas |
| `POST /api/auth/refresh` | 10 req | 15 min | Prevenir abuso de refresh |
| `POST /api/shares` | 20 req | 1 hora | Prevenir generación masiva de links |
| `GET /api/public/experience/:token` | 100 req | 15 min | Prevenir scraping/DDoS |
| `POST /api/public/visits/start` | 100 req | 15 min | Idem |
| `POST /api/assets/upload-url` | 50 req | 1 hora | Prevenir abuso de storage |

**Implementación ejemplo**:
```typescript
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
  standardHeaders: true,
  legacyHeaders: false,
})

app.post('/api/auth/login', loginLimiter, loginController)
```

**Identificación**:
- Endpoints privados (con auth): por `userId` (más preciso)
- Endpoints públicos: por IP (menos preciso, puede afectar NAT, pero suficiente MVP)

### 4.3 CORS (Cross-Origin Resource Sharing)

**Configuración obligatoria**:
```typescript
import cors from 'cors'

const allowedOrigins = [
  'http://localhost:3000', // dev
  'https://<frontend-domain>.amplifyapp.com', // prod
  'https://<custom-domain>', // prod custom
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true, // permite cookies (refreshToken)
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
```

**Importante**:
- NO usar `origin: '*'` en producción
- `credentials: true` necesario para httpOnly cookies

### 4.4 Headers de Seguridad (helmet)

Librería: `helmet` (middleware Express)

```typescript
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind necesita unsafe-inline
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'], // S3 signed URLs
      connectSrc: ["'self'", 'https://*.amazonaws.com'], // API + S3
    },
  },
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true,
  },
}))
```

**Headers aplicados**:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### 4.5 Validación de Inputs (todos los endpoints)

Librería: `express-validator` (o `Zod`, elegir 1 y mantener consistencia)

**Reglas obligatorias**:
1. **Validar todos los inputs** (body, query, params)
2. **Sanitizar strings** (trim, escape)
3. **Validar tipos** (email válido, UUID válido, etc.)
4. **Límites de longitud** (evitar payloads enormes)
5. **Rechazo explícito** si validación falla → `400 VALIDATION_ERROR`

**Ejemplo**:
```typescript
import { body, validationResult } from 'express-validator'

app.post('/api/projects',
  requireAuth,
  body('name').isString().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: errors.array() } })
    }
    // ...
  }
)
```

### 4.6 Share Tokens (generación segura)

**Requisitos**:
- **Longitud**: 32 bytes (64 caracteres hex) mínimo
- **Aleatorio criptográfico**: usar `crypto.randomBytes` (NO `Math.random`)
- **Único**: validar unicidad en DB antes de guardar
- **No secuencial**: no IDs incrementales ni predecibles

**Implementación**:
```typescript
import crypto from 'crypto'

function generateShareToken(): string {
  return crypto.randomBytes(32).toString('hex') // 64 caracteres
}

// Con unicidad:
async function createUniqueShareToken(): Promise<string> {
  let token: string
  let exists = true

  while (exists) {
    token = generateShareToken()
    const existing = await prisma.share.findUnique({ where: { token } })
    exists = !!existing
  }

  return token!
}
```

### 4.7 Política de Errores (404 vs 403 para cross-tenant)

**Decisión MVP: 404 para recursos de otros tenants**

Razón: No revelar existencia de recursos que el usuario no posee (información leak mínima).

**Implementación consistente**:
```typescript
// Ejemplo: GET /api/projects/:id
const project = await prisma.project.findFirst({
  where: {
    id: params.id,
    companyId: req.user.companyId, // filtro obligatorio
  }
})

if (!project) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
}
```

**Alternativa (menos preferida)**: `403 FORBIDDEN` con mensaje "No tienes permisos".
Elegir 1 criterio y aplicarlo consistentemente en TODOS los endpoints.

### 4.8 Auditoría Mínima (logs)

**Eventos críticos que DEBEN loguearse**:

1. **Auth**:
   - Login exitoso: `[INFO] User {userId} logged in from {ip}`
   - Login fallido: `[WARN] Failed login attempt for {email} from {ip}`
   - Logout: `[INFO] User {userId} logged out`
   - Refresh token revocado: `[INFO] Refresh token revoked for user {userId}`

2. **CRUD crítico**:
   - Creación de Company: `[INFO] Company {companyId} created by {userId}`
   - Eliminación de Project/Product/Version: `[WARN] {entity} {id} deleted by {userId}`
   - Creación de Share: `[INFO] Share {token} created for version {versionId} by {userId}`
   - Revocación de Share: `[INFO] Share {token} revoked by {userId}`

3. **Assets**:
   - Upload iniciado: `[INFO] Asset upload started: {assetId} by {userId}`
   - Procesamiento completado: `[INFO] Asset {assetId} processing completed: {status}`
   - Procesamiento fallido: `[ERROR] Asset {assetId} processing failed: {errorMessage}`

4. **Seguridad**:
   - Rate limit alcanzado: `[WARN] Rate limit hit on {endpoint} by {ip/userId}`
   - CORS rechazado: `[WARN] CORS rejected request from origin {origin}`
   - Intento de acceso cross-tenant: `[WARN] User {userId} attempted to access {entity} {id} of company {otherCompanyId}`

**Formato de logs**:
- Timestamp ISO8601
- Level: INFO, WARN, ERROR
- Message estructurado (JSON preferido para parsing)
- NO loguear contraseñas, tokens completos, ni datos sensibles

**Librería recomendada**: `winston` o `pino` (JSON structured logging)

### 4.9 Secrets Management

**Variables de entorno obligatorias** (`.env`):
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# JWT
JWT_SECRET=<64+ caracteres aleatorios>
JWT_ACCESS_TTL=900  # 15 min en segundos
JWT_REFRESH_TTL=2592000  # 30 días

# AWS S3
AWS_REGION=us-east-1
AWS_S3_BUCKET=my-app-assets-private
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>

# App
NODE_ENV=development | production
PORT=4000
FRONTEND_URL=http://localhost:3000

# (Opcional) Rate limiting store
REDIS_URL=redis://localhost:6379
```

**Reglas**:
- `.env` en `.gitignore` (NUNCA commitear)
- `.env.example` con valores placeholder (commitear)
- En producción: usar AWS Secrets Manager o similar (Fase 2)
- Validar existencia de secrets críticos al inicio de la app:
  ```typescript
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters')
  }
  ```

### 4.10 HTTPS Obligatorio (producción)

- **Desarrollo**: HTTP OK (localhost)
- **Producción**: Solo HTTPS
- AWS Amplify maneja certificados automáticamente (Let's Encrypt/ACM)
- Backend debe confiar en `X-Forwarded-Proto` header (proxy trust):
  ```typescript
  app.set('trust proxy', 1) // trust first proxy
  ```

### 4.11 Protección contra Ataques Comunes

#### SQL Injection
- **Mitigación**: Usar Prisma (ORM con queries parametrizadas)
- **PROHIBIDO**: Nunca concatenar strings en queries
- Prisma previene SQL injection por diseño

#### XSS (Cross-Site Scripting)
- **Mitigación**:
  - Next.js escapa outputs por defecto (React)
  - Validar y sanitizar inputs
  - CSP headers (helmet)
- **Frontend**: NO usar `dangerouslySetInnerHTML` sin sanitizar

#### CSRF (Cross-Site Request Forgery)
- **Mitigación**:
  - `SameSite=Strict` en cookies (refreshToken)
  - Endpoints públicos (visits) no mutan data crítica (solo logs)
  - CORS restrictivo

#### Path Traversal
- **Mitigación**:
  - NO usar user input directamente en paths de storage
  - `storageKey` generado por backend (ver `storage.md`)
  - Validar `fileName` (sin `../`, sin caracteres especiales)

### 4.12 Resumen de Librerías de Seguridad (backend)

```json
{
  "dependencies": {
    "helmet": "^7.x",
    "cors": "^2.x",
    "express-rate-limit": "^6.x",
    "express-validator": "^7.x",
    "bcrypt": "^5.x",
    "jsonwebtoken": "^9.x",
    "winston": "^3.x"
  }
}
```

---

## 5) Multi-tenant enforcement (regla absoluta)
- Toda entidad “tenant-owned” lleva `companyId`.
- Ninguna query se ejecuta sin filtrar por `companyId`.
- Tests negativos obligatorios para evitar data leaks.

Referencia: `development/data/data-model.md`