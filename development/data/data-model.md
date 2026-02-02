~~~md
# Modelo de Datos (PostgreSQL + Prisma)
**Fuente única de verdad** para entidades y relaciones.

---

## 1) Principios (obligatorios)
- **Multi-tenant**: toda entidad “tenant-owned” incluye `companyId`.
- Nunca confiar en IDs del cliente: siempre validar pertenencia al tenant.
- JWT incluye `companyId` y el backend impone filtros en todas las queries.
- **PostgreSQL** en dev y prod.

---

## 2) Entidades MVP

### Company
- `id` (uuid)
- `name`
- `createdAt`, `updatedAt`

### User
- `id` (uuid)
- `companyId` (fk)
- `email` (unique por company)
- `passwordHash`
- `role` (`ADMIN` | `USER`)
- `status` (`ACTIVE` | `DISABLED`)
- `createdAt`, `updatedAt`

### RefreshSession
- `id` (uuid)
- `companyId` (fk)
- `userId` (fk)
- `refreshTokenHash`
- `expiresAt`
- `revokedAt` (nullable)
- `createdAt`

### Project
- `id`
- `companyId` (fk)
- `name`
- `description` (nullable)
- `createdAt`, `updatedAt`

### Product
- `id`
- `companyId` (fk)
- `projectId` (fk)
- `name`
- `description` (nullable)
- `createdAt`, `updatedAt`

### Version
- `id`
- `companyId` (fk)
- `productId` (fk)
- `label` (ej: v1.0)
- `notes` (nullable)
- `createdAt`, `updatedAt`

### Asset
- `id`
- `companyId` (fk)
- `versionId` (fk)
- `kind` (`SOURCE_GLB` | `OPTIMIZED_GLB` | `USDZ` | `THUMB`)
- `status` (`PENDING_UPLOAD` | `UPLOADED` | `PROCESSING` | `READY` | `FAILED`)
- `storageKey` (ruta privada en storage)
- `contentType`
- `sizeBytes`
- `meta` (jsonb nullable)
- `errorMessage` (nullable)
- `createdAt`, `updatedAt`

> Nota: aunque el cliente no vea `storageKey`, se guarda para ubicar el objeto en storage.

### Share
- `id`
- `companyId` (fk)
- `versionId` (fk)
- `token` (unique)
- `expiresAt`
- `maxVisits` (int nullable o requerido: definir criterio en API)
- `visitCount` (int)
- `revokedAt` (nullable)
- `createdAt`

### Visit
- `id`
- `companyId` (fk)
- `shareId` (fk)
- `startedAt`
- `endedAt` (nullable)
- `durationMs` (nullable)
- `usedAR` (boolean, default false)
- `device` (jsonb)
- `createdAt`

---

## 3) Entidades Fase 2

### Submodel
- `id`
- `companyId` (fk)
- `versionId` (fk)
- `name`
- `sortOrder` (int)
- `metadata` (jsonb nullable)

### (Opcional) AnalyticsAggregate
Solo si el volumen obliga. Si no, se hace query directo sobre `Visit`.
- `id`
- `companyId`
- `date` (YYYY-MM-DD)
- `metrics` (jsonb)

---

## 4) Índices recomendados (mínimos)
- User:
  - unique `(companyId, email)`
  - index `(companyId)`
- Project:
  - index `(companyId)`
- Product:
  - index `(companyId, projectId)`
- Version:
  - index `(companyId, productId)`
- Asset:
  - index `(companyId, versionId, kind, status)`
- Share:
  - unique `(token)`
  - index `(companyId, versionId)`
- Visit:
  - index `(companyId, shareId, startedAt desc)`

---

## 5) Reglas de integridad (obligatorias)
- Un `Product` debe pertenecer a un `Project` del mismo `companyId`.
- Una `Version` debe pertenecer a un `Product` del mismo `companyId`.
- Un `Asset` debe pertenecer a una `Version` del mismo `companyId`.
- Un `Share` debe pertenecer a una `Version` del mismo `companyId`.
- Un `Visit` debe pertenecer a un `Share` del mismo `companyId`.

---

## 6) Prisma schema (borrador MVP)
```prisma
model Company {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     User[]
  projects  Project[]
}

model User {
  id           String      @id @default(uuid())
  companyId    String
  company      Company     @relation(fields: [companyId], references: [id])
  email        String
  passwordHash String
  role         Role        @default(USER)
  status       UserStatus  @default(ACTIVE)
  sessions     RefreshSession[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@unique([companyId, email])
  @@index([companyId])
}

model RefreshSession {
  id               String   @id @default(uuid())
  companyId         String
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  refreshTokenHash String
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime @default(now())

  @@index([companyId])
  @@index([userId])
}

model Project {
  id          String   @id @default(uuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id])
  name        String
  description String?
  products    Product[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([companyId])
}

model Product {
  id          String   @id @default(uuid())
  companyId   String
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  name        String
  description String?
  versions    Version[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([companyId, projectId])
}

model Version {
  id        String   @id @default(uuid())
  companyId String
  productId String
  product   Product  @relation(fields: [productId], references: [id])
  label     String
  notes     String?
  assets    Asset[]
  shares    Share[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId, productId])
}

model Asset {
  id          String      @id @default(uuid())
  companyId   String
  versionId   String
  version     Version     @relation(fields: [versionId], references: [id])
  kind        AssetKind
  status      AssetStatus @default(PENDING_UPLOAD)
  storageKey  String
  contentType String
  sizeBytes   Int
  meta        Json?
  errorMessage String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([companyId, versionId, kind, status])
}

model Share {
  id         String   @id @default(uuid())
  companyId  String
  versionId  String
  version    Version  @relation(fields: [versionId], references: [id])
  token      String   @unique
  expiresAt  DateTime
  maxVisits  Int?
  visitCount Int      @default(0)
  revokedAt  DateTime?
  visits     Visit[]
  createdAt  DateTime @default(now())

  @@index([companyId, versionId])
}

model Visit {
  id        String   @id @default(uuid())
  companyId String
  shareId   String
  share     Share    @relation(fields: [shareId], references: [id])
  startedAt DateTime @default(now())
  endedAt   DateTime?
  durationMs Int?
  usedAR    Boolean  @default(false)
  device    Json
  createdAt DateTime @default(now())

  @@index([companyId, shareId, startedAt])
}

enum Role { ADMIN USER }
enum UserStatus { ACTIVE DISABLED }
enum AssetKind { SOURCE_GLB OPTIMIZED_GLB USDZ THUMB }
enum AssetStatus { PENDING_UPLOAD UPLOADED PROCESSING READY FAILED }
```

---

## 7) Regla de cambios (obligatoria)
Si cambia una relación, campo o índice:
- actualizar este archivo
- actualizar `api/api-spec.md` si afecta responses/requests
- actualizar diagramas si cambia el flujo o ER
```