# Testing Strategy (MVP + Full)

**Normativa de testing para garantizar calidad sin over-engineering.**
Define tipos de tests, cobertura mínima, fixtures, y criterios blocking para merge.

---

## Principios de Testing (obligatorios)

1. **KISS**: Tests simples y legibles sobre tests complejos y "clever"
2. **DRY**: Reutilizar fixtures y helpers, pero no abstraer prematuramente
3. **YAGNI**: No testear "por si acaso"; testear casos reales y edge cases críticos
4. **Fast feedback**: Tests rápidos (unit < 100ms, integration < 5s por test)
5. **Deterministicos**: Tests deben pasar/fallar consistentemente (no flaky)

---

## 1) Tipos de Tests

### 1.1 Unit Tests

**Qué son**:
- Testean funciones/clases aisladas
- Mockan dependencias externas (DB, APIs, storage)
- Rápidos (< 100ms por test)

**Qué testear (obligatorio)**:
- **Services**: Lógica de negocio pura
  - Validaciones (ej: `validateShareExpiry`, `canUserAccessProject`)
  - Transformaciones (ej: `generateStorageKey`, `formatAssetMeta`)
  - Cálculos (ej: `calculateShareRemainingVisits`)
- **Validators**: Reglas de validación (express-validator o Zod)
- **Utils**: Funciones helpers (ej: `generateShareToken`, `hashRefreshToken`)

**Qué NO testear (YAGNI)**:
- Getters/setters triviales
- Código generado (Prisma client)
- Third-party libraries (confiar en sus propios tests)

**Frameworks**:
- Backend: **Jest** (o Vitest si se prefiere)
- Frontend: **Jest** + **React Testing Library**

**Mocking**:
- **DB (Prisma)**: Mock con `jest.mock()` o usar `prisma-mock`
- **Storage (S3)**: Mock AWS SDK con `aws-sdk-client-mock`
- **Tiempo**: Mock `Date.now()` para tests deterministas

**Ejemplo (backend)**:
```typescript
// src/modules/shares/services/share.service.test.ts
import { isShareValid } from './share.service'

describe('ShareService', () => {
  describe('isShareValid', () => {
    it('should return true if share is valid', () => {
      const share = {
        expiresAt: new Date(Date.now() + 1000),
        revokedAt: null,
        visitCount: 5,
        maxVisits: 10,
      }
      expect(isShareValid(share)).toBe(true)
    })

    it('should return false if share is expired', () => {
      const share = {
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        visitCount: 5,
        maxVisits: 10,
      }
      expect(isShareValid(share)).toBe(false)
    })

    it('should return false if share is revoked', () => {
      const share = {
        expiresAt: new Date(Date.now() + 1000),
        revokedAt: new Date(),
        visitCount: 5,
        maxVisits: 10,
      }
      expect(isShareValid(share)).toBe(false)
    })

    it('should return false if maxVisits reached', () => {
      const share = {
        expiresAt: new Date(Date.now() + 1000),
        revokedAt: null,
        visitCount: 10,
        maxVisits: 10,
      }
      expect(isShareValid(share)).toBe(false)
    })
  })
})
```

---

### 1.2 Integration Tests

**Qué son**:
- Testean flujos completos con dependencias reales (DB, storage)
- Más lentos que unit (< 5s por test es aceptable)
- Usan DB de test (PostgreSQL en Docker o in-memory)

**Qué testear (obligatorio)**:
- **Endpoints API** (request → response completo)
  - Happy paths (201/200 con data correcta)
  - Error paths (400/401/403/404 con error shape correcta)
  - Multi-tenant isolation (cross-tenant → 404)
- **Flujos críticos**:
  - Auth: register → login → refresh → logout
  - CRUD: create project → create product → create version
  - Upload: upload-url → complete → processing → status READY
  - Share: create share → validate token → expire/revoke

**Frameworks**:
- Backend: **Jest** + **Supertest** (para HTTP requests)
- DB: **PostgreSQL en Docker** (via docker-compose) o **SQLite in-memory** (más rápido, menos fiel)

**Setup/Teardown**:
- **BeforeAll**: Iniciar DB, aplicar migraciones, seedear fixtures
- **BeforeEach**: Limpiar DB (truncate tables) o usar transacciones (rollback)
- **AfterAll**: Cerrar conexiones, detener DB

**Ejemplo (backend)**:
```typescript
// src/modules/projects/projects.integration.test.ts
import request from 'supertest'
import { app } from '../../app'
import { prisma } from '../../db'
import { createTestUser, createTestCompany } from '../../../test/fixtures'

describe('Projects API', () => {
  let authToken: string
  let companyId: string

  beforeAll(async () => {
    // Setup DB (migrations ya aplicadas en docker-compose)
  })

  beforeEach(async () => {
    // Limpiar DB
    await prisma.project.deleteMany()
    await prisma.user.deleteMany()
    await prisma.company.deleteMany()

    // Crear tenant de test
    const company = await createTestCompany()
    companyId = company.id
    const user = await createTestUser(companyId, 'ADMIN')
    authToken = generateAccessToken(user)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('POST /api/projects', () => {
    it('should create a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Project', description: 'Test' })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        id: expect.any(String),
        name: 'Test Project',
        description: 'Test',
        companyId,
      })
    })

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('GET /api/projects/:id (cross-tenant)', () => {
    it('should return 404 if project belongs to another tenant', async () => {
      // Crear otro tenant
      const otherCompany = await createTestCompany()
      const otherProject = await prisma.project.create({
        data: { name: 'Other', companyId: otherCompany.id }
      })

      const res = await request(app)
        .get(`/api/projects/${otherProject.id}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(404)
    })
  })
})
```

---

### 1.3 E2E Tests (End-to-End)

**Qué son**:
- Testean flujos completos desde frontend (simulando usuario real)
- Más lentos (10-30s por test)
- Usan browser real (headless)

**Qué testear (mínimo MVP)**:
- **Flujo crítico happy path**:
  1. Register company
  2. Login
  3. Crear project → product → version
  4. Upload GLB → esperar READY
  5. Crear share
  6. Abrir `/experience/:token` → ver 3D
- **Errores críticos**:
  - Login con credenciales inválidas → error visible
  - Share expirado → mensaje claro

**Frameworks**:
- **Playwright** (recomendado) o **Cypress**

**Cuándo correr**:
- **NO en cada commit** (muy lento)
- **Pre-release** o **nightly** (CI)
- **Opcional en MVP** (prioridad baja si integration tests son sólidos)

**Decisión MVP**: E2E tests son **opcionales**. Si el equipo es pequeño, enfocar en unit + integration. Agregar E2E en Fase 2 si se detecta necesidad.

---

## 2) Cobertura Mínima (Blocking para Merge)

### Backend

**Unit tests**:
- Services: **80% coverage** mínimo
- Utils: **90% coverage** mínimo
- Validators: **100% coverage** (son críticos para seguridad)

**Integration tests**:
- Endpoints críticos: **100% cobertura** (todos los endpoints listados en `api-spec.md`)
- Edge cases obligatorios:
  - Auth: login OK/FAIL, refresh OK/FAIL, logout
  - CRUD: create/read/update/delete por entidad
  - Multi-tenant: al menos 1 test negativo por entidad (cross-tenant → 404)
  - Shares: valid/expired/revoked/limit-reached
  - Assets: upload-url → complete → processing (mock S3)

**Criterio blocking**:
- **Todos los tests pasan** (0 fallos)
- **Coverage >= 70% global** (backend)
- **No tests skipped** (`.skip()` no permitido en main branch)

### Frontend

**Unit tests**:
- Utils/hooks custom: **80% coverage**
- Componentes complejos (con lógica): **70% coverage**
- Componentes UI simples: **opcional** (YAGNI)

**Integration tests** (opcional MVP):
- Flujos críticos con mock API
- Ejemplo: form submit → loading → success/error

**Criterio blocking**:
- **Todos los tests pasan**
- **Coverage >= 60% global** (frontend, menos estricto que backend)

---

## 3) Fixtures & Dataset Mínimo

### Backend (integration tests)

Crear fixtures reutilizables en `test/fixtures/`:

```typescript
// test/fixtures/company.fixture.ts
export async function createTestCompany(name = 'Test Company') {
  return await prisma.company.create({
    data: { name }
  })
}

// test/fixtures/user.fixture.ts
export async function createTestUser(companyId: string, role: Role = 'USER') {
  return await prisma.user.create({
    data: {
      companyId,
      email: `user-${Date.now()}@test.com`, // único
      passwordHash: await bcrypt.hash('password123', 10),
      role,
      status: 'ACTIVE',
    }
  })
}

// test/fixtures/project.fixture.ts
export async function createTestProject(companyId: string, name = 'Test Project') {
  return await prisma.project.create({
    data: { companyId, name }
  })
}

// ... fixtures para Product, Version, Asset, Share, Visit
```

### Dataset Mínimo (seed para tests)

**Scenario típico**:
- 2 Companies (para testear multi-tenant)
- Company A:
  - 1 ADMIN, 1 USER
  - 2 Projects
    - Project 1 → 2 Products → Product 1 → 2 Versions → Version 1 → 1 Asset (READY)
- Company B:
  - 1 ADMIN
  - 1 Project → 1 Product → 1 Version

**Implementación**:
```typescript
// test/seed.ts
export async function seedTestData() {
  const companyA = await createTestCompany('Company A')
  const adminA = await createTestUser(companyA.id, 'ADMIN')
  const userA = await createTestUser(companyA.id, 'USER')

  const projectA1 = await createTestProject(companyA.id, 'Project A1')
  const productA1 = await createTestProduct(companyA.id, projectA1.id, 'Product A1')
  const versionA1 = await createTestVersion(companyA.id, productA1.id, 'v1.0')
  const assetA1 = await createTestAsset(companyA.id, versionA1.id, 'SOURCE_GLB', 'READY')

  const companyB = await createTestCompany('Company B')
  const adminB = await createTestUser(companyB.id, 'ADMIN')
  const projectB1 = await createTestProject(companyB.id, 'Project B1')

  return { companyA, adminA, userA, companyB, adminB, projectA1, versionA1, assetA1 }
}
```

---

## 4) Qué Mockear y Qué No

### Mockear SIEMPRE (unit tests):
- **Database (Prisma)**: Mock para aislar lógica
- **Storage (S3)**: Mock AWS SDK (no queremos subir archivos reales en tests)
- **External APIs**: Cualquier servicio externo (si aplica)
- **Tiempo (`Date.now()`)**: Para tests deterministas

### NO Mockear (integration tests):
- **Database**: Usar DB real de test (PostgreSQL/SQLite)
- **Prisma**: Usar cliente real conectado a DB test
- **Backend interno**: No mockear controllers/services/repos (testear stack completo)

### Gray area (decidir caso por caso):
- **Storage en integration tests**:
  - Opción A: Mock S3 (más rápido, menos fiel)
  - Opción B: Usar LocalStack (S3 local, más fiel, más setup)
  - **Decisión MVP**: Mock S3 (KISS)
- **Processing (thumbnail, USDZ)**:
  - Mock en integration tests (no queremos ejecutar Puppeteer en cada test)
  - Test real en E2E o manual QA

---

## 5) Tests Blocking para Merge (CI/CD)

**Regla absoluta**: Pull Request NO se puede mergear si:

1. **Cualquier test falla** (unit o integration)
2. **Coverage cae por debajo del mínimo**:
   - Backend: < 70%
   - Frontend: < 60%
3. **Linter falla** (ESLint/Prettier)
4. **Type check falla** (TypeScript)

**CI Pipeline (GitHub Actions / GitLab CI)**:
```yaml
# .github/workflows/ci.yml (ejemplo)
name: CI

on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Install deps
        run: npm ci
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - name: Run tests
        run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - name: Check coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 70%"
            exit 1
          fi
```

---

## 6) QA Checklist Manual (por Etapa)

Además de tests automatizados, cada etapa requiere validación manual antes de considerar "Done".

### Etapa 1 (Setup):
- [ ] Backend levanta sin errores
- [ ] Frontend levanta sin errores
- [ ] DB conecta correctamente
- [ ] Migraciones aplican sin conflictos
- [ ] Health endpoint responde `200 OK`

### Etapa 2 (Auth):
- [ ] Register crea Company + User ADMIN
- [ ] Login exitoso retorna tokens
- [ ] Login fallido muestra error claro
- [ ] Access token expira (validar después de 15 min)
- [ ] Refresh renueva access token
- [ ] Logout invalida refresh
- [ ] Endpoint privado sin token → 401
- [ ] Endpoint privado con token expirado → 401

### Etapa 3 (CRUD):
- [ ] Crear Project desde UI admin
- [ ] Editar Project guarda cambios
- [ ] Eliminar Project requiere confirmación
- [ ] Crear Product bajo Project
- [ ] Crear Version bajo Product
- [ ] Lista vacía muestra EmptyState
- [ ] Errores muestran mensajes claros (no stack traces)

### Etapa 4 (Assets):
- [ ] Upload GLB: progress visible
- [ ] Upload GLB >100MB rechazado con mensaje claro
- [ ] Asset pasa de PENDING_UPLOAD → UPLOADED → PROCESSING → READY
- [ ] Thumbnail se genera y muestra
- [ ] USDZ se genera (si aplica en MVP)
- [ ] Upload fallido muestra error específico
- [ ] Asset READY permite descargar/visualizar

### Etapa 5 (Shares + Viewer):
- [ ] Crear share genera link copiable
- [ ] Abrir link muestra viewer 3D
- [ ] Viewer carga modelo correctamente
- [ ] Controles orbit funcionan (mouse/touch)
- [ ] Botón AR visible en mobile compatible
- [ ] AR funciona (iOS Quick Look o Android WebXR)
- [ ] Share expirado muestra error claro
- [ ] Share revocado muestra error claro
- [ ] Share con maxVisits alcanzado muestra error claro

### Etapa 6 (Tracking):
- [ ] Visit se registra al abrir share
- [ ] Visit se completa al cerrar (durationMs > 0)
- [ ] usedAR se marca si usuario usa AR
- [ ] Admin puede ver lista de visits (mínimo)

---

## 7) Performance Testing (fuera de alcance MVP)

**MVP**: No se requiere performance testing formal (YAGNI).

**Fase 2** (si se detecta necesidad):
- Load testing (ej: Artillery, k6)
- Stress testing de upload/procesamiento
- Métricas de response time (p50, p95, p99)

---

## 8) Security Testing (mínimo MVP)

**Manual (antes de producción)**:
- [ ] Intentar SQL injection en inputs → rechazado
- [ ] Intentar XSS en inputs → escapado/sanitizado
- [ ] Intentar acceder a recursos cross-tenant → 404
- [ ] Verificar que passwords NO se loguean
- [ ] Verificar que tokens NO se loguean completos
- [ ] Verificar HTTPS en producción

**Automatizado** (opcional Fase 2):
- OWASP ZAP o similar (vulnerability scanning)
- Dependency scanning (npm audit, Snyk)

---

## 9) Test Naming Conventions

### Backend (Jest)
```typescript
describe('EntityName / ServiceName', () => {
  describe('methodName', () => {
    it('should do X when Y', () => { ... })
    it('should throw error when Z', () => { ... })
  })
})
```

### Frontend (React Testing Library)
```typescript
describe('ComponentName', () => {
  it('should render correctly', () => { ... })
  it('should call onSubmit when form is submitted', () => { ... })
  it('should show error message when API fails', () => { ... })
})
```

**Reglas**:
- Usar `describe` para agrupar tests relacionados
- Usar `it` (no `test`) para consistencia
- Nombres descriptivos en presente: "should X when Y"
- Evitar nombres ambiguos: "works correctly" ❌ vs "creates project with valid data" ✓

---

## 10) Tools & Libraries (stack recomendado)

### Backend
```json
{
  "devDependencies": {
    "jest": "^29.x",
    "ts-jest": "^29.x",
    "supertest": "^6.x",
    "@types/jest": "^29.x",
    "@types/supertest": "^2.x",
    "prisma-mock": "^1.x" // opcional para unit tests
  }
}
```

### Frontend
```json
{
  "devDependencies": {
    "jest": "^29.x",
    "@testing-library/react": "^14.x",
    "@testing-library/jest-dom": "^6.x",
    "@testing-library/user-event": "^14.x"
  }
}
```

### E2E (opcional MVP)
```json
{
  "devDependencies": {
    "@playwright/test": "^1.x"
  }
}
```

---

## 11) Regla de Cambios (consistencia)

Si cambia:
- Un flujo crítico → agregar/actualizar integration tests
- Una validación → agregar/actualizar unit tests
- Un endpoint → agregar tests en suite de integration
- Criterios de cobertura → actualizar este documento + CI config

**Importante**: Tests son documentación ejecutable. Mantenerlos actualizados es tan crítico como mantener la documentación.
